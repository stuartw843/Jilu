import { marked } from "marked";
import DOMPurify from "dompurify";
import { getCurrentMeeting, updateMeetingInList } from "./state";
import { elements } from "./dom";
import { aiService } from "./ai-service";
import { db } from "./database";
import { renderEnhancedNotes, hasTranscriptContent, transcriptTurnsToText, normalizeMarkdown } from "./utils";
import { openSettings } from "./ui/settings";
import { switchTab } from "./ui/tabs";
import { exportMeeting } from "./file-export";
import { getDefaultTemplateId } from "./prompt-templates";
import { loadTemplateOptions } from "./ui/template-manager";
import { Meeting } from "./types";
import { showToast } from "./ui/interactions";
import { getOpenAIApiKey } from "./secure-storage";
import { STORAGE_KEY_OPENAI_ENDPOINT } from "./constants";

let activeEnhancementMeetingId: string | null = null;
let copyEnhancedButton: HTMLButtonElement | null = null;

export async function enhanceNotes(templateId?: string) {
  const currentMeeting = getCurrentMeeting();
  
  if (!currentMeeting || !hasTranscriptContent(currentMeeting.transcript)) {
    showToast("Please record a meeting first.", { type: "warning" });
    return;
  }

  if (!(await hasAIProvider())) {
    showToast("Add your OpenAI API key or a local LLM endpoint in Settings to enhance notes.", { type: "warning" });
    openSettings();
    return;
  }

  try {
    await performEnhancement(currentMeeting, templateId);
  } catch (error) {
    console.error("Error enhancing notes:", error);
    showToast(`Failed to enhance notes: ${error}`, { type: "error" });
  }
}

export async function autoEnhanceNotesForMeeting(meetingId: string, templateId?: string) {
  if (!meetingId) return;

  const currentMeeting = getCurrentMeeting();
  const isCurrentMeeting = currentMeeting?.id === meetingId;
  const targetMeeting = isCurrentMeeting ? currentMeeting : await db.getMeeting(meetingId);

  if (!targetMeeting || !hasTranscriptContent(targetMeeting.transcript)) {
    return;
  }

  if (!(await hasAIProvider())) {
    if (isCurrentMeeting) {
      showToast("Add your OpenAI API key or a local LLM endpoint in Settings to auto-generate enhanced notes.", { type: "info" });
      openSettings();
    } else {
      console.warn("Skipping auto-enhance: OpenAI API key/endpoint is missing.");
    }
    return;
  }

  try {
    await performEnhancement(targetMeeting, templateId, { autoTriggered: true });
  } catch (error) {
    console.error("Auto-enhance failed:", error);
  }
}

function ensureEnhancedActionsInitialized(): void {
  if (!copyEnhancedButton || !copyEnhancedButton.isConnected) {
    copyEnhancedButton = elements.copyEnhancedBtn;
  }

  if (copyEnhancedButton && !copyEnhancedButton.dataset.initialized) {
    copyEnhancedButton.addEventListener("click", () => {
      void handleCopyEnhancedNotes();
    });
    copyEnhancedButton.dataset.initialized = "true";
  }
}

function getEnhancedCopyPayload(): { html: string; text: string } | null {
  const notes = getCurrentMeeting()?.enhancedNotes?.trim();
  if (!notes) {
    return null;
  }

  const normalized = normalizeMarkdown(notes);
  const isHTML = normalized.trim().startsWith("<");
  const rawHtml = isHTML ? normalized : (marked.parse(normalized) as string);
  const html = DOMPurify.sanitize(rawHtml);

  const container = document.createElement("div");
  container.innerHTML = html;
  const text = container.textContent?.trim() ?? "";
  container.remove();
  return { html, text };
}

async function copyEnhancedToClipboard(payload: { html: string; text: string }): Promise<void> {
  if (navigator.clipboard?.write && "ClipboardItem" in window && payload.html) {
    const item = new ClipboardItem({
      "text/html": new Blob([payload.html], { type: "text/html" }),
      "text/plain": new Blob([payload.text], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload.text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = payload.text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  const success = document.execCommand("copy");
  textarea.remove();
  if (!success) {
    throw new Error("Clipboard copy command was blocked");
  }
}

export function updateEnhancedCopyButtonState(): void {
  ensureEnhancedActionsInitialized();
  if (!copyEnhancedButton) {
    return;
  }

  const hasCopyableSummary = Boolean(getCurrentMeeting()?.enhancedNotes?.trim());
  copyEnhancedButton.disabled = !hasCopyableSummary;
  copyEnhancedButton.setAttribute("aria-disabled", String(!hasCopyableSummary));
}

async function handleCopyEnhancedNotes(): Promise<void> {
  const payload = getEnhancedCopyPayload();
  if (!payload?.text) {
    showToast("No summary to copy yet.", { type: "warning" });
    return;
  }

  try {
    await copyEnhancedToClipboard(payload);
    showToast("Summary copied to clipboard.", { type: "success" });
  } catch (error) {
    console.error("Failed to copy enhanced summary:", error);
    showToast("Unable to copy summary.", { type: "error" });
  }
}

export async function regenerateWithTemplate() {
  if (!elements.templateSelector) return;
  
  const selectedTemplateId = elements.templateSelector.value;
  if (!selectedTemplateId) {
    showToast("Please select a template.", { type: "warning" });
    return;
  }

  const currentMeeting = getCurrentMeeting();
  const hasExistingEnhancedNotes = Boolean(currentMeeting?.enhancedNotes?.trim());

  if (hasExistingEnhancedNotes) {
    const userConfirmed = await Promise.resolve(
      confirm("Regenerate enhanced notes with the selected template? This will replace the current enhanced notes.")
    );
    if (!userConfirmed) {
      return;
    }
  }

  await enhanceNotes(selectedTemplateId);
}

export function initializeTemplateSelector() {
  if (!elements.templateSelector) return;
  
  // Load template options into selector
  loadTemplateOptions(elements.templateSelector);
  
  // Set to current meeting's template or default
  const currentMeeting = getCurrentMeeting();
  if (currentMeeting?.promptTemplateId) {
    elements.templateSelector.value = currentMeeting.promptTemplateId;
  } else {
    elements.templateSelector.value = getDefaultTemplateId();
  }
}

export async function clearEnhancedNotes() {
  const currentMeeting = getCurrentMeeting();
  
  if (!currentMeeting) {
    return;
  }

  // Check if there are actually notes to clear
  if (!currentMeeting.enhancedNotes || currentMeeting.enhancedNotes.trim() === "") {
    showToast("No enhanced notes to clear.", { type: "info" });
    return;
  }

  const userConfirmed = await Promise.resolve(confirm("Are you sure you want to clear the AI Enhanced notes? This cannot be undone."));
  if (!userConfirmed) {
    return;
  }

  try {
    // Clear the enhanced notes
    currentMeeting.enhancedNotes = "";
    currentMeeting.updatedAt = new Date();
    
    // Save to database
    await db.saveMeeting(currentMeeting);

    // Update the in-memory list
    updateMeetingInList(currentMeeting);

    // Update UI - show placeholder text
    if (elements.enhancedContent) {
      elements.enhancedContent.innerHTML =
        '<p class="placeholder-text">Click "Enhance with AI" to generate enhanced notes from your transcript and personal notes.</p>';
    }

    // Hide edit and clear buttons
    const editBtn = document.getElementById('edit-enhanced-btn');
    const clearBtn = document.getElementById('clear-enhanced-btn');
    if (editBtn) editBtn.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';

    updateEnhancedCopyButtonState();

    if (import.meta.env.DEV) {
      console.log("Enhanced notes cleared successfully for meeting:", currentMeeting.id);
    }
  } catch (error) {
    console.error("Error clearing enhanced notes:", error);
    showToast(`Failed to clear enhanced notes: ${error}`, { type: "error" });
  }
}

export function setupAIListeners() {
  ensureEnhancedActionsInitialized();
  updateEnhancedCopyButtonState();

  elements.enhanceNotesBtn?.addEventListener("click", () => enhanceNotes());
  
  const clearBtn = document.getElementById('clear-enhanced-btn');
  if (clearBtn) {
    clearBtn.addEventListener("click", clearEnhancedNotes);
    if (import.meta.env.DEV) {
      console.log("Clear enhanced notes button listener attached");
    }
  } else {
    console.error("Clear enhanced notes button not found!");
  }

  // Regenerate with template button
  elements.refreshTemplateBtn?.addEventListener("click", regenerateWithTemplate);
}

export function syncEnhancementUIState() {
  refreshEnhancementUIState();
}

interface EnhancementOptions {
  autoTriggered?: boolean;
}

async function performEnhancement(
  meeting: Meeting,
  templateId?: string,
  options?: EnhancementOptions
) {
  const isCurrentMeeting = getCurrentMeeting()?.id === meeting.id;
  const selectedTemplateId = templateId || meeting.promptTemplateId || getDefaultTemplateId();

  setEnhancementInProgress(true, meeting.id);
  if (isCurrentMeeting) {
    await waitForNextFrame();
  }

  try {
    // Determine what to pass as transcript based on template and available data
    const transcriptInput = transcriptTurnsToText(meeting.transcript);

    const enhanced = await aiService.enhanceNotes(
      transcriptInput,
      meeting.personalNotes,
      selectedTemplateId,
      meeting.transcript
    );

    const normalizedEnhanced = normalizeMarkdown(enhanced);

    meeting.enhancedNotes = normalizedEnhanced;
    meeting.promptTemplateId = selectedTemplateId;
    meeting.updatedAt = new Date();
    await db.saveMeeting(meeting);

    updateMeetingInList(meeting);

    if (isCurrentMeeting) {
      if (elements.enhancedContent) {
        renderEnhancedNotes(normalizedEnhanced, elements.enhancedContent);
      }

      if (elements.templateSelector) {
        elements.templateSelector.value = selectedTemplateId;
      }

      const editBtn = document.getElementById('edit-enhanced-btn');
      const clearBtn = document.getElementById('clear-enhanced-btn');
      if (editBtn) editBtn.style.display = 'inline-block';
      if (clearBtn) clearBtn.style.display = 'inline-block';

      switchTab("enhanced");
      updateEnhancedCopyButtonState();
    }

    try {
      await exportMeeting(meeting);
      await db.saveMeeting(meeting);
    } catch (exportError) {
      console.error("Failed to export meeting after enhancement:", exportError);
    }
  } catch (error) {
    if (!options?.autoTriggered || isCurrentMeeting) {
      throw error;
    }
    console.error("Suppressed auto-enhance error for non-current meeting:", error);
  } finally {
    setEnhancementInProgress(false, meeting.id);
  }
}

function setEnhancementInProgress(isInProgress: boolean, meetingId: string) {
  if (isInProgress) {
    activeEnhancementMeetingId = meetingId;
  } else if (activeEnhancementMeetingId === meetingId) {
    activeEnhancementMeetingId = null;
  }

  refreshEnhancementUIState();
}

function refreshEnhancementUIState() {
  const currentMeetingId = getCurrentMeeting()?.id ?? null;
  const hasActiveEnhancement = Boolean(activeEnhancementMeetingId);
  const isEnhancingCurrentMeeting =
    hasActiveEnhancement && activeEnhancementMeetingId === currentMeetingId;

  updateEnhanceButtonState(hasActiveEnhancement);
  updateEnhancementViewerState(isEnhancingCurrentMeeting);
  updateEnhancedCopyButtonState();
}

function updateEnhanceButtonState(hasActiveEnhancement: boolean) {
  const button = elements.enhanceNotesBtn;
  if (!button) return;

  if (hasActiveEnhancement) {
    if (!button.dataset.originalTitle) {
      button.dataset.originalTitle = button.title ?? "";
    }
    if (!button.dataset.originalAriaLabel) {
      button.dataset.originalAriaLabel = button.getAttribute("aria-label") ?? "";
    }
    if (!button.dataset.preEnhanceDisabled) {
      button.dataset.preEnhanceDisabled = button.disabled ? "true" : "false";
    }
    button.disabled = true;
    button.classList.add("is-loading");
    button.title = "Enhancing notes…";
    button.setAttribute("aria-label", "Enhancing notes in progress");
  } else {
    if ("preEnhanceDisabled" in button.dataset) {
      const wasDisabled = button.dataset.preEnhanceDisabled === "true";
      button.disabled = wasDisabled;
      delete button.dataset.preEnhanceDisabled;
    }
    button.classList.remove("is-loading");
    const originalTitle = button.dataset.originalTitle ?? "";
    button.title = originalTitle || "Enhance with AI";
    const originalAriaLabel = button.dataset.originalAriaLabel ?? "";
    if (originalAriaLabel) {
      button.setAttribute("aria-label", originalAriaLabel);
    } else {
      button.setAttribute("aria-label", "Enhance with AI");
    }
  }
}

function updateEnhancementViewerState(isEnhancingCurrentMeeting: boolean) {
  if (elements.enhancedViewer) {
    elements.enhancedViewer.classList.toggle("is-enhancing", isEnhancingCurrentMeeting);
  }

  if (elements.enhancedContent) {
    elements.enhancedContent.classList.toggle("is-dimmed", isEnhancingCurrentMeeting);
  }

  if (elements.enhancedProgress) {
    if (isEnhancingCurrentMeeting) {
      elements.enhancedProgress.classList.remove("is-hidden");
      elements.enhancedProgress.setAttribute("aria-hidden", "false");
    } else {
      elements.enhancedProgress.classList.add("is-hidden");
      elements.enhancedProgress.setAttribute("aria-hidden", "true");
    }
  }
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function hasAIProvider(): Promise<boolean> {
  const openaiKey = await getOpenAIApiKey();
  return Boolean(openaiKey || localStorage.getItem(STORAGE_KEY_OPENAI_ENDPOINT));
}

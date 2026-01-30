import { elements } from "../dom";
import { getCurrentMeeting } from "../state";
import { TranscriptTurn } from "../types";
import { transcriptTurnsToText, hasTranscriptContent } from "../utils";
import { showToast } from "./interactions";

const SCROLL_THRESHOLD = 48;

let autoScrollEnabled = true;
let isProgrammaticScroll = false;
let listenersAttached = false;

let transcriptScrollContainer: HTMLElement | null = null;
let autoScrollButton: HTMLButtonElement | null = null;
let copyTranscriptButton: HTMLButtonElement | null = null;

function ensureTranscriptElements(): void {
  if (!transcriptScrollContainer || !transcriptScrollContainer.isConnected) {
    transcriptScrollContainer = elements.transcriptViewer ?? elements.transcriptContent?.parentElement ?? null;
  }

  if (!autoScrollButton || !autoScrollButton.isConnected) {
    autoScrollButton = elements.transcriptAutoScrollBtn;
  }

  if (!copyTranscriptButton || !copyTranscriptButton.isConnected) {
    copyTranscriptButton = elements.copyTranscriptBtn;
  }

  if (transcriptScrollContainer && !listenersAttached) {
    transcriptScrollContainer.addEventListener("scroll", handleTranscriptScroll, { passive: true });
    listenersAttached = true;
  }

  if (autoScrollButton && !autoScrollButton.dataset.initialized) {
    autoScrollButton.addEventListener("click", handleAutoScrollButtonClick);
    autoScrollButton.dataset.initialized = "true";
  }

  if (copyTranscriptButton && !copyTranscriptButton.dataset.initialized) {
    copyTranscriptButton.addEventListener("click", () => {
      void handleCopyTranscript();
    });
    copyTranscriptButton.dataset.initialized = "true";
  }
}

function handleAutoScrollButtonClick(): void {
  autoScrollEnabled = true;
  hideAutoScrollButton();
  maintainAutoScroll({ smooth: true });
}

function handleTranscriptScroll(): void {
  if (isProgrammaticScroll || !autoScrollEnabled || !transcriptScrollContainer) {
    return;
  }

  if (!isNearBottom(transcriptScrollContainer)) {
    autoScrollEnabled = false;
    showAutoScrollButton();
  }
}

function isNearBottom(container: HTMLElement): boolean {
  const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
  return distanceFromBottom <= SCROLL_THRESHOLD;
}

function showAutoScrollButton(): void {
  ensureTranscriptElements();
  autoScrollButton?.classList.add("is-visible");
}

function hideAutoScrollButton(): void {
  ensureTranscriptElements();
  autoScrollButton?.classList.remove("is-visible");
}

function scrollTranscriptToBottom(behavior: ScrollBehavior = "auto"): void {
  ensureTranscriptElements();
  const container = transcriptScrollContainer;
  if (!container) {
    return;
  }

  isProgrammaticScroll = true;

  const performScroll = () => {
    const target = container.scrollHeight;
    if (typeof container.scrollTo === "function") {
      container.scrollTo({ top: target, behavior });
    } else {
      container.scrollTop = target;
    }

    const releaseFlag = () => {
      isProgrammaticScroll = false;
    };

    if (behavior === "smooth") {
      window.setTimeout(releaseFlag, 320);
    } else {
      requestAnimationFrame(releaseFlag);
    }
  };

  requestAnimationFrame(performScroll);
}

function maintainAutoScroll(options?: { smooth?: boolean }): void {
  if (!autoScrollEnabled) {
    return;
  }
  scrollTranscriptToBottom(options?.smooth ? "smooth" : "auto");
}

function getTranscriptCopyPayload(): { html: string; text: string } | null {
  const meeting = getCurrentMeeting();
  if (!meeting) {
    return null;
  }

  const transcriptText = transcriptTurnsToText(meeting.transcript);
  const partialText = elements.partialTranscript?.textContent?.trim() ?? "";

  const text = partialText ? (transcriptText ? `${transcriptText}\n\n${partialText}` : partialText) : transcriptText;

  if (!text) {
    return null;
  }

  const container = document.createElement("div");

  meeting.transcript.forEach((turn) => {
    const line = turn.text?.trim();
    if (!line) {
      return;
    }

    const paragraph = document.createElement("p");
    const speakerLabel = turn.speaker?.trim() || "Speaker";
    const speakerStrong = document.createElement("strong");
    speakerStrong.textContent = `${speakerLabel}: `;
    paragraph.appendChild(speakerStrong);
    paragraph.appendChild(document.createTextNode(line));
    container.appendChild(paragraph);
  });

  if (partialText) {
    const paragraph = document.createElement("p");
    paragraph.textContent = partialText;
    container.appendChild(paragraph);
  }

  const html = container.innerHTML.trim();
  container.remove();

  return { html, text };
}

async function copyTranscriptToClipboard(payload: { html: string; text: string }): Promise<void> {
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

function updateTranscriptActions(): void {
  ensureTranscriptElements();
  if (!copyTranscriptButton) {
    return;
  }

  const hasCopyableTranscript = Boolean(getTranscriptCopyPayload()?.text);
  copyTranscriptButton.disabled = !hasCopyableTranscript;
  copyTranscriptButton.setAttribute("aria-disabled", String(!hasCopyableTranscript));
}

async function handleCopyTranscript(): Promise<void> {
  const payload = getTranscriptCopyPayload();
  if (!payload?.text) {
    showToast("No transcript to copy yet.", { type: "warning" });
    return;
  }

  try {
    await copyTranscriptToClipboard(payload);
    showToast("Transcript copied to clipboard.", { type: "success" });
  } catch (error) {
    console.error("Failed to copy transcript:", error);
    showToast("Unable to copy transcript.", { type: "error" });
  }
}

export function initializeTranscriptUI(): void {
  ensureTranscriptElements();
  autoScrollEnabled = true;
  hideAutoScrollButton();
  maintainAutoScroll();
  updateTranscriptActions();
}

export function resetTranscriptAutoScroll(options?: { scrollToBottom?: boolean }): void {
  autoScrollEnabled = true;
  hideAutoScrollButton();
  if (options?.scrollToBottom) {
    maintainAutoScroll({ smooth: true });
  }
}

export function handlePartialTranscriptUpdate(): void {
  maintainAutoScroll({ smooth: true });
  updateTranscriptActions();
}

export function renderTranscript(container: HTMLElement, transcript: TranscriptTurn[]): void {
  ensureTranscriptElements();
  container.innerHTML = "";

  if (!hasTranscriptContent(transcript)) {
    container.innerHTML =
      '<p class="placeholder-text">Transcript will appear here when you start recording...</p>';
    updateTranscriptActions();
    return;
  }

  const fragment = document.createDocumentFragment();

  transcript.forEach((turn, index) => {
    const text = turn.text?.trim();
    if (!text) {
      return;
    }

    const row = document.createElement("div");
    row.className = "transcript-turn";
    row.dataset.index = index.toString();

    const speakerSpan = document.createElement("span");
    speakerSpan.className = "transcript-speaker";
    const speakerLabel = turn.speaker?.trim();
    speakerSpan.textContent = speakerLabel || "Speaker";
    if (!speakerLabel) {
      speakerSpan.classList.add("transcript-speaker--unknown");
    }

    const textSpan = document.createElement("span");
    textSpan.className = "transcript-text";
    textSpan.textContent = text;

    row.appendChild(speakerSpan);
    row.appendChild(textSpan);
    fragment.appendChild(row);
  });

  if (!fragment.hasChildNodes()) {
    container.innerHTML =
      '<p class="placeholder-text">Transcript will appear here when you start recording...</p>';
    updateTranscriptActions();
    return;
  }

  container.appendChild(fragment);
  maintainAutoScroll();
  updateTranscriptActions();
}

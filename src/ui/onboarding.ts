import { open } from "@tauri-apps/plugin-dialog";
import { aiService } from "../ai-service";
import {
  DEFAULT_SPEECHMATICS_URL,
  STORAGE_KEY_OPENAI_ENDPOINT,
  STORAGE_KEY_OPENAI_MODEL,
  STORAGE_KEY_SPEECHMATICS_URL,
} from "../constants";
import { elements } from "../dom";
import { calendarService } from "../calendar-service";
import { getExportSettings, saveExportSettings, initializeDefaultExportPath } from "../file-export";
import { refreshAudioDeviceOptions } from "../audio-devices";
import {
  VoiceSample,
  enrollSpeakerFromSamples,
  getStoredSpeakerProfile,
  getVoiceSampleScript,
  loadStoredVoiceSamples,
  persistVoiceSamples,
  updateSpeakerProfileMetadata,
} from "../speaker-id";
import type { Calendar } from "../types";
import { showToast } from "./interactions";
import { openSettings } from "./settings";
import {
  getOpenAIApiKey,
  getSpeechmaticsApiKey,
  migrateLegacyApiKeys,
  setOpenAIApiKey,
  setSpeechmaticsApiKey,
} from "../secure-storage";

const funFacts = [
  "Give your mic a quick level check before recording to avoid clipping or whispers.",
  "Keep your mic a hand-span away for warm, consistent capture.",
  "You can switch microphones mid-meeting. We'll keep streaming to Speechmatics.",
  "Add a custom dictionary for project names so they show up perfectly from the jump.",
];

let onboardingRoot: HTMLElement | null = null;
let steps: HTMLElement[] = [];
let currentStep = 0;
let backBtn: HTMLButtonElement | null = null;
let nextBtn: HTMLButtonElement | null = null;
let finishBtn: HTMLButtonElement | null = null;
let skipBtn: HTMLButtonElement | null = null;
let initialized = false;
let calendarToggle: HTMLInputElement | null = null;
let calendarPermissionBtn: HTMLButtonElement | null = null;
let exportToggle: HTMLInputElement | null = null;
let exportPathInput: HTMLInputElement | null = null;
let exportDefaultBtn: HTMLButtonElement | null = null;
let exportBrowseBtn: HTMLButtonElement | null = null;
let voiceBtn: HTMLButtonElement | null = null;
let voiceLaterBtn: HTMLButtonElement | null = null;
let useLocalLlmToggle: HTMLInputElement | null = null;
let localLlmFields: HTMLElement | null = null;
let voiceNameInput: HTMLInputElement | null = null;
let voiceEmailInput: HTMLInputElement | null = null;
let voiceDeviceSelect: HTMLSelectElement | null = null;
let voiceScriptText: HTMLElement | null = null;
let voiceRecordBtn: HTMLButtonElement | null = null;
let voiceEnrollBtn: HTMLButtonElement | null = null;
let voiceSamplesList: HTMLElement | null = null;
let voiceStatus: HTMLElement | null = null;
let voiceClearBtn: HTMLButtonElement | null = null;
let calendarListContainer: HTMLElement | null = null;
let calendarSettingsPanel: HTMLElement | null = null;
let calendarSyncIntervalInput: HTMLInputElement | null = null;
let calendarReminderInput: HTMLInputElement | null = null;
let calendarAutoStopToggle: HTMLInputElement | null = null;
let calendarNotificationsToggle: HTMLInputElement | null = null;
let voiceSamples: VoiceSample[] = [];
let isRecordingVoiceSample = false;
let voiceRecordTimer: number | null = null;
let voiceRecorder: MediaRecorder | null = null;
let voiceStream: MediaStream | null = null;
let calendarsLoaded = false;

function clampStep(target: number) {
  if (!steps.length) return 0;
  return Math.min(Math.max(target, 0), steps.length - 1);
}

function setFunFact() {
  const target = onboardingRoot?.querySelector<HTMLElement>("#onboarding-fun-fact");
  if (!target || !funFacts.length) return;
  const fact = funFacts[Math.floor(Math.random() * funFacts.length)];
  target.textContent = fact;
}

function setVoiceStatus(message: string, isError = false) {
  if (!voiceStatus) return;
  voiceStatus.textContent = message;
  voiceStatus.classList.toggle("error", isError);
}

function updateVoiceScriptText() {
  if (!voiceScriptText) return;
  const name = voiceNameInput?.value;
  voiceScriptText.textContent = getVoiceSampleScript(name);
}

function renderVoiceSamples() {
  const list = voiceSamplesList;
  if (!list) return;
  list.innerHTML = "";

  if (!voiceSamples.length) {
    const empty = document.createElement("p");
    empty.className = "small-text";
    empty.textContent = "No samples yet. Record a 15s clip with the mic you'll use.";
    list.appendChild(empty);
    return;
  }

  voiceSamples.forEach((sample) => {
    const row = document.createElement("div");
    row.className = "voice-sample";

    const meta = document.createElement("div");
    meta.className = "voice-sample-meta";
    const title = document.createElement("strong");
    title.textContent = sample.deviceLabel || "Microphone";
    const detail = document.createElement("span");
    detail.className = "small-text";
    const durationSeconds = Math.round(sample.durationMs / 1000);
    detail.textContent = `${durationSeconds}s · ${(sample.blob.size / 1024).toFixed(0)} KB`;
    meta.appendChild(title);
    meta.appendChild(detail);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-secondary btn-small ghost-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      voiceSamples = voiceSamples.filter((s) => s.id !== sample.id);
      void persistVoiceSamples(voiceSamples);
      renderVoiceSamples();
    });

    row.appendChild(meta);
    row.appendChild(removeBtn);
    list.appendChild(row);
  });
}

async function recordVoiceSampleOnboarding() {
  if (isRecordingVoiceSample) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Microphone access is not available in this browser.", { type: "error" });
    return;
  }

  const deviceId = voiceDeviceSelect?.value || "";
  const constraints: MediaStreamConstraints = {
    audio: deviceId
      ? { deviceId: { exact: deviceId }, channelCount: 1, sampleRate: 48_000 }
      : { channelCount: 1, sampleRate: 48_000 },
  };

  voiceStream = null;
  voiceRecorder = null;

  try {
    voiceStream = await navigator.mediaDevices.getUserMedia(constraints);
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : undefined;
    voiceRecorder = new MediaRecorder(voiceStream, mimeType ? { mimeType } : undefined);

    const chunks: BlobPart[] = [];
    voiceRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    isRecordingVoiceSample = true;
    const startedAt = Date.now();

    if (voiceRecordBtn) {
      voiceRecordBtn.disabled = true;
      voiceRecordBtn.textContent = "Recording… 15s";
    }

    voiceRecorder.start();
    voiceRecordTimer = window.setInterval(() => {
      if (!voiceRecordBtn) return;
      const elapsed = Math.min(15, Math.round((Date.now() - startedAt) / 1000));
      const remaining = 15 - elapsed;
      voiceRecordBtn.textContent = remaining > 0 ? `Recording… ${remaining}s` : "Processing…";
    }, 500);

    await new Promise<void>((resolve) => {
      voiceRecorder?.addEventListener("stop", () => resolve());
      window.setTimeout(() => voiceRecorder?.stop(), 15_000);
    });

    const blob = new Blob(chunks, { type: voiceRecorder?.mimeType });
    const track = voiceStream.getAudioTracks()[0];
    const label = track?.label || "Microphone sample";

    voiceSamples.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      blob,
      durationMs: Date.now() - startedAt,
      deviceId,
      deviceLabel: label,
      mimeType: voiceRecorder?.mimeType,
    });

    await persistVoiceSamples(voiceSamples);
    renderVoiceSamples();
    setVoiceStatus("Sample recorded. Add another for a better match.");
  } catch (error) {
    console.error("Failed to record voice sample", error);
    showToast(`Unable to record sample: ${error}`, { type: "error", duration: 5000 });
  } finally {
    if (voiceRecordTimer) {
      clearInterval(voiceRecordTimer);
      voiceRecordTimer = null;
    }
    if (voiceRecorder && voiceRecorder.state === "recording") {
      try {
        voiceRecorder.stop();
      } catch {
        // ignore
      }
    }
    voiceStream?.getTracks().forEach((track) => track.stop());
    isRecordingVoiceSample = false;
    if (voiceRecordBtn) {
      voiceRecordBtn.disabled = false;
      voiceRecordBtn.textContent = "Record 15s sample";
    }
  }
}

async function handleVoiceEnroll() {
  if (!voiceSamples.length) {
    showToast("Record at least one 15 second sample first.", { type: "warning" });
    return;
  }
  const onboardingKeyInput = onboardingRoot?.querySelector<HTMLInputElement>("#onboarding-speechmatics-key");
  const typedKey = (onboardingKeyInput?.value || "").trim();
  const apiKey = typedKey || (await getSpeechmaticsApiKey());
  if (!apiKey) {
    showToast("Add your Speechmatics API key first.", { type: "warning" });
    return;
  }
  if (typedKey) {
    await setSpeechmaticsApiKey(typedKey);
  }

  try {
    setVoiceStatus("Enrolling samples…");
    const profile = await enrollSpeakerFromSamples(voiceSamples, apiKey, {
      name: voiceNameInput?.value,
      email: voiceEmailInput?.value,
      onProgress: (message) => setVoiceStatus(message),
    });
    updateSpeakerProfileMetadata(voiceNameInput?.value, voiceEmailInput?.value);
    setVoiceStatus(`Enrolled ${profile.identifiers.length} identifier${profile.identifiers.length === 1 ? "" : "s"} for ${profile.name}`);
  } catch (error) {
    console.error("Voice enrollment failed", error);
    showToast(`Voice enrollment failed: ${error}`, { type: "error", duration: 6000 });
    setVoiceStatus(String(error), true);
  }
}

async function refreshVoiceDevices() {
  await refreshAudioDeviceOptions([voiceDeviceSelect]);
}

function setVoiceFromStoredProfile() {
  const storedProfile = getStoredSpeakerProfile();
  if (storedProfile) {
    if (voiceNameInput) {
      voiceNameInput.value = storedProfile.name ?? "";
    }
    if (voiceEmailInput) {
      voiceEmailInput.value = storedProfile.email ?? "";
    }
  }
  updateVoiceScriptText();
}

function toggleCalendarSettingsVisibility(enabled: boolean) {
  if (!calendarSettingsPanel) return;
  calendarSettingsPanel.classList.toggle("hidden", !enabled);
  const inputs = calendarSettingsPanel.querySelectorAll<HTMLInputElement>("input, select");
  inputs.forEach((input) => {
    input.disabled = !enabled;
  });
}

function renderCalendarList(calendars: Calendar[], selectedIds: string[]) {
  const list = calendarListContainer;
  if (!list) return;
  list.innerHTML = "";
  if (!calendars.length) {
    const msg = document.createElement("p");
    msg.className = "small-text";
    msg.textContent = "No calendars found. Ensure accounts are added in Apple Calendar.";
    list.appendChild(msg);
    return;
  }

  calendars.forEach((calendar) => {
    const row = document.createElement("label");
    row.className = "calendar-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.calendarId = calendar.id;
    checkbox.checked = selectedIds.includes(calendar.id);
    const name = document.createElement("span");
    name.textContent = calendar.title;
    row.appendChild(checkbox);
    row.appendChild(name);
    list.appendChild(row);
  });
}

async function loadCalendarsIfAllowed(selectedIds: string[]) {
  try {
    const permission = await calendarService.checkCalendarPermission();
    if (!permission) {
      calendarsLoaded = false;
      if (calendarListContainer) {
        calendarListContainer.innerHTML = '<p class="small-text">Grant permission to load calendars.</p>';
      }
      return;
    }
    const calendars = await calendarService.listCalendars();
    renderCalendarList(calendars, selectedIds);
    calendarsLoaded = true;
  } catch (error) {
    console.error("Failed to load calendars for onboarding", error);
    if (calendarListContainer) {
      calendarListContainer.innerHTML = '<p class="small-text">Unable to load calendars. Try again after granting access.</p>';
    }
  }
}

async function hydrateFields() {
  if (!onboardingRoot) return;
  const urlInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-speechmatics-url");
  const keyInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-speechmatics-key");
  const openaiKeyInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-openai-key");
  const openaiEndpointInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-openai-endpoint");
  const openaiModelInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-openai-model");
  useLocalLlmToggle = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-use-local-llm");
  localLlmFields = onboardingRoot.querySelector<HTMLElement>("#onboarding-local-llm-fields");
  voiceNameInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-voice-name");
  voiceEmailInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-voice-email");
  voiceDeviceSelect = onboardingRoot.querySelector<HTMLSelectElement>("#onboarding-voice-device");
  voiceScriptText = onboardingRoot.querySelector<HTMLElement>("#onboarding-voice-script");
  voiceRecordBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-voice-record");
  voiceEnrollBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-voice-enroll");
  voiceSamplesList = onboardingRoot.querySelector<HTMLElement>("#onboarding-voice-samples");
  voiceStatus = onboardingRoot.querySelector<HTMLElement>("#onboarding-voice-status");
  voiceClearBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-voice-clear");
  calendarListContainer = onboardingRoot.querySelector<HTMLElement>("#onboarding-calendar-list");
  calendarSettingsPanel = onboardingRoot.querySelector<HTMLElement>("#onboarding-calendar-settings");
  calendarSyncIntervalInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-sync-interval");
  calendarReminderInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-reminder-minutes");
  calendarAutoStopToggle = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-auto-stop-reminder");
  calendarNotificationsToggle = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-notifications-toggle");

  if (urlInput) {
    const savedUrl = localStorage.getItem(STORAGE_KEY_SPEECHMATICS_URL);
    urlInput.placeholder = DEFAULT_SPEECHMATICS_URL;
    urlInput.value = savedUrl && savedUrl.trim().length > 0 ? savedUrl : DEFAULT_SPEECHMATICS_URL;
  }

  voiceSamples = loadStoredVoiceSamples();
  renderVoiceSamples();
  setVoiceFromStoredProfile();
  updateVoiceScriptText();
  await refreshVoiceDevices();
  await migrateLegacyApiKeys();

  const storedSpeechmaticsKey = await getSpeechmaticsApiKey();
  const storedOpenaiKey = await getOpenAIApiKey();

  if (keyInput) {
    keyInput.value = storedSpeechmaticsKey || "";
  }

  if (openaiKeyInput) {
    openaiKeyInput.value = storedOpenaiKey || "";
  }

  const storedEndpoint = localStorage.getItem(STORAGE_KEY_OPENAI_ENDPOINT) || "";
  const storedModel = localStorage.getItem(STORAGE_KEY_OPENAI_MODEL) || "";

  if (openaiEndpointInput) {
    openaiEndpointInput.value = storedEndpoint;
  }

  if (openaiModelInput) {
    openaiModelInput.value = storedModel;
  }

  if (useLocalLlmToggle) {
    const usingLocal = Boolean(storedEndpoint || storedModel);
    useLocalLlmToggle.checked = usingLocal;
  }
  updateLocalLlmVisibility();

  const exportSettings = getExportSettings();
  if (exportToggle) {
    exportToggle.checked = exportSettings.enabled;
  }
  if (exportPathInput) {
    let path = exportSettings.exportPath;
    if (!path) {
      path = await initializeDefaultExportPath();
    }
    exportPathInput.value = path;
    exportPathInput.placeholder = exportPathInput.placeholder || path;
  }

  const calendarSettings = calendarService.getSettings();
  if (calendarToggle) {
    calendarToggle.checked = calendarSettings.enabled;
  }
  if (calendarSyncIntervalInput) {
    calendarSyncIntervalInput.value = String(calendarSettings.syncIntervalMinutes);
  }
  if (calendarReminderInput) {
    calendarReminderInput.value = String(calendarSettings.reminderMinutesBefore);
  }
  if (calendarAutoStopToggle) {
    calendarAutoStopToggle.checked = calendarSettings.autoStopReminder;
  }
  if (calendarNotificationsToggle) {
    calendarNotificationsToggle.checked = calendarSettings.notificationsEnabled;
  }
  toggleCalendarSettingsVisibility(calendarSettings.enabled);
  await loadCalendarsIfAllowed(calendarSettings.selectedCalendarIds);
}

function updateStepUI() {
  if (!onboardingRoot) return;
  const safeStep = clampStep(currentStep);
  currentStep = safeStep;

  steps.forEach((step, index) => {
    step.classList.toggle("active", index === safeStep);
  });

  const pill = onboardingRoot.querySelector<HTMLElement>("#onboarding-step-pill");
  if (pill) {
    pill.textContent = `Step ${safeStep + 1} of ${steps.length}`;
  }

  const dots = onboardingRoot.querySelectorAll<HTMLElement>(".onboarding-dot");
  dots.forEach((dot, index) => dot.classList.toggle("active", index === safeStep));

  const progressFill = onboardingRoot.querySelector<HTMLElement>("#onboarding-progress-fill");
  if (progressFill) {
    const widthPercent = ((safeStep + 1) / steps.length) * 100;
    progressFill.style.width = `${widthPercent}%`;
  }

  if (backBtn) {
    backBtn.disabled = safeStep === 0;
  }

  const isLastStep = safeStep === steps.length - 1;
  if (nextBtn) {
    nextBtn.style.display = isLastStep ? "none" : "inline-flex";
  }
  if (finishBtn) {
    finishBtn.style.display = isLastStep ? "inline-flex" : "none";
  }
}

function updateLocalLlmVisibility() {
  if (!localLlmFields) return;
  const show = useLocalLlmToggle?.checked ?? false;
  localLlmFields.classList.toggle("hidden", !show);
}

async function openOnboardingInternal() {
  if (!onboardingRoot) return;
  onboardingRoot.classList.add("active");
  onboardingRoot.setAttribute("aria-hidden", "false");
  currentStep = 0;
  await hydrateFields();
  setFunFact();
  updateStepUI();
}

function closeOnboarding() {
  if (!onboardingRoot) return;
  onboardingRoot.classList.remove("active");
  onboardingRoot.setAttribute("aria-hidden", "true");
}

function handleSkip() {
  localStorage.setItem(STORAGE_KEY_SPEECHMATICS_URL, DEFAULT_SPEECHMATICS_URL);
  if (elements.speechmaticsUrlInput) {
    elements.speechmaticsUrlInput.value = DEFAULT_SPEECHMATICS_URL;
  }
  closeOnboarding();
  showToast("Skipped for now. You can adjust settings anytime.", { type: "info" });
}

async function ensureExportPath(): Promise<string> {
  const settings = getExportSettings();
  if (settings.exportPath) return settings.exportPath;
  const path = await initializeDefaultExportPath();
  saveExportSettings({ enabled: settings.enabled, exportPath: path });
  return path;
}

async function persistValues(): Promise<boolean> {
  if (!onboardingRoot) return false;
  const urlInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-speechmatics-url");
  const keyInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-speechmatics-key");
  const openaiKeyInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-openai-key");
  const openaiEndpointInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-openai-endpoint");
  const openaiModelInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-openai-model");
  const useLocalLlm = useLocalLlmToggle?.checked ?? false;

  const speechmaticsUrl = (urlInput?.value || "").trim() || DEFAULT_SPEECHMATICS_URL;
  if (!speechmaticsUrl.startsWith("ws")) {
    showToast("Speechmatics URL should start with ws:// or wss://", { type: "warning" });
    urlInput?.focus();
    return false;
  }

  localStorage.setItem(STORAGE_KEY_SPEECHMATICS_URL, speechmaticsUrl);
  if (elements.speechmaticsUrlInput) {
    elements.speechmaticsUrlInput.value = speechmaticsUrl;
  }

  const speechmaticsKey = (keyInput?.value || "").trim();
  await setSpeechmaticsApiKey(speechmaticsKey);
  if (speechmaticsKey && elements.speechmaticsKeyInput) {
    elements.speechmaticsKeyInput.value = speechmaticsKey;
  }

  const openaiKey = (openaiKeyInput?.value || "").trim();
  const openaiEndpoint = useLocalLlm ? (openaiEndpointInput?.value || "").trim() : "";
  const openaiModel = useLocalLlm ? (openaiModelInput?.value || "").trim() : "";

  await setOpenAIApiKey(openaiKey);

  if (openaiEndpoint) {
    localStorage.setItem(STORAGE_KEY_OPENAI_ENDPOINT, openaiEndpoint);
  } else {
    localStorage.removeItem(STORAGE_KEY_OPENAI_ENDPOINT);
  }

  if (openaiModel) {
    localStorage.setItem(STORAGE_KEY_OPENAI_MODEL, openaiModel);
  } else {
    localStorage.removeItem(STORAGE_KEY_OPENAI_MODEL);
  }

  if (openaiKey || openaiEndpoint) {
    const apiKeyForClient = openaiKey || "local-llm";
    aiService.setApiKey(apiKeyForClient, openaiEndpoint || undefined, openaiModel || undefined);

    if (elements.openaiKeyInput) {
      elements.openaiKeyInput.value = openaiKey;
    }
    if (elements.openaiEndpointInput) {
      elements.openaiEndpointInput.value = openaiEndpoint;
    }
    if (elements.openaiModelInput) {
      elements.openaiModelInput.value = openaiModel;
    }
  } else if (!useLocalLlm) {
    if (elements.openaiEndpointInput) {
      elements.openaiEndpointInput.value = "";
    }
    if (elements.openaiModelInput) {
      elements.openaiModelInput.value = "";
    }
  }

  const calendarEnabled = calendarToggle?.checked ?? false;
  const hasCalendarPermission = calendarEnabled ? await calendarService.checkCalendarPermission() : false;
  const syncInterval = parseInt(calendarSyncIntervalInput?.value || "5", 10) || 5;
  const reminderMinutes = parseInt(calendarReminderInput?.value || "5", 10) || 5;
  const autoStopReminder = calendarAutoStopToggle?.checked ?? true;
  const notificationsEnabled = calendarNotificationsToggle?.checked ?? false;
  const selectedCalendarIds: string[] = [];
  if (calendarListContainer) {
    const checked = calendarListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-calendar-id]:checked');
    checked.forEach((box) => {
      const id = box.dataset.calendarId;
      if (id) selectedCalendarIds.push(id);
    });
  }

  calendarService.updateSettings({
    enabled: calendarEnabled,
    selectedCalendarIds,
    syncIntervalMinutes: syncInterval,
    reminderMinutesBefore: reminderMinutes,
    autoStopReminder,
    notificationsEnabled,
  });

  if (calendarEnabled && !hasCalendarPermission) {
    showToast("Grant calendar permission to finish turning sync on.", { type: "info" });
  }

  const exportEnabled = exportToggle?.checked ?? false;
  let exportPath = (exportPathInput?.value || "").trim();
  if (exportEnabled && !exportPath) {
    exportPath = await ensureExportPath();
    if (exportPathInput) {
      exportPathInput.value = exportPath;
    }
  }

  saveExportSettings({
    enabled: exportEnabled,
    exportPath,
  });

  if (elements.exportEnabledCheckbox) {
    elements.exportEnabledCheckbox.checked = exportEnabled;
  }
  if (elements.exportPathInput && exportPath) {
    elements.exportPathInput.value = exportPath;
  }

  return true;
}

async function handleFinish() {
  const ok = await persistValues();
  if (!ok) return;
  closeOnboarding();
  showToast("Onboarding saved. You're ready to record!", { type: "success" });
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeOnboarding();
  }
}

export function initializeOnboarding(): void {
  if (initialized) return;
  onboardingRoot = document.getElementById("onboarding");
  if (!onboardingRoot) return;

  steps = Array.from(onboardingRoot.querySelectorAll<HTMLElement>("[data-onboarding-step]"));
  backBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-back");
  nextBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-next");
  finishBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-finish");
  skipBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-skip");
  useLocalLlmToggle = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-use-local-llm");
  localLlmFields = onboardingRoot.querySelector<HTMLElement>("#onboarding-local-llm-fields");
  calendarToggle = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-calendar-toggle");
  calendarPermissionBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-calendar-permission");
  exportToggle = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-export-toggle");
  exportPathInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-export-path");
  exportDefaultBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-export-default");
  exportBrowseBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-export-browse");
  voiceBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-voice-btn");
  voiceLaterBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-voice-later");
  voiceNameInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-voice-name");
  voiceEmailInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-voice-email");
  voiceDeviceSelect = onboardingRoot.querySelector<HTMLSelectElement>("#onboarding-voice-device");
  voiceScriptText = onboardingRoot.querySelector<HTMLElement>("#onboarding-voice-script");
  voiceRecordBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-voice-record");
  voiceEnrollBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-voice-enroll");
  voiceSamplesList = onboardingRoot.querySelector<HTMLElement>("#onboarding-voice-samples");
  voiceStatus = onboardingRoot.querySelector<HTMLElement>("#onboarding-voice-status");
  voiceClearBtn = onboardingRoot.querySelector<HTMLButtonElement>("#onboarding-voice-clear");
  calendarListContainer = onboardingRoot.querySelector<HTMLElement>("#onboarding-calendar-list");
  calendarSettingsPanel = onboardingRoot.querySelector<HTMLElement>("#onboarding-calendar-settings");
  calendarSyncIntervalInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-sync-interval");
  calendarReminderInput = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-reminder-minutes");
  calendarAutoStopToggle = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-auto-stop-reminder");
  calendarNotificationsToggle = onboardingRoot.querySelector<HTMLInputElement>("#onboarding-notifications-toggle");

  backBtn?.addEventListener("click", () => {
    currentStep = clampStep(currentStep - 1);
    updateStepUI();
  });

  nextBtn?.addEventListener("click", () => {
    currentStep = clampStep(currentStep + 1);
    updateStepUI();
  });

  finishBtn?.addEventListener("click", () => {
    void handleFinish();
  });
  skipBtn?.addEventListener("click", handleSkip);
  calendarPermissionBtn?.addEventListener("click", async () => {
    try {
      const granted = await calendarService.requestCalendarPermission();
      if (granted) {
        showToast("Calendar access granted! Enable sync to start pulling events.", { type: "success" });
        if (calendarToggle) {
          calendarToggle.checked = true;
        }
        calendarService.updateSettings({ enabled: true });
        const settings = calendarService.getSettings();
        await loadCalendarsIfAllowed(settings.selectedCalendarIds);
      } else {
        showToast("Calendar access was denied. You can try again in Settings.", { type: "warning" });
      }
    } catch (error) {
      console.error("Calendar permission failed", error);
      showToast(`Calendar permission failed: ${error}`, { type: "error", duration: 5000 });
    }
  });

  exportDefaultBtn?.addEventListener("click", async () => {
    const path = await ensureExportPath();
    if (exportPathInput) {
      exportPathInput.value = path;
    }
    showToast(`Export folder set to ${path}`, { type: "success" });
  });
  exportBrowseBtn?.addEventListener("click", async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Export Folder",
      });
      if (selected && typeof selected === "string" && exportPathInput) {
        exportPathInput.value = selected;
      }
    } catch (error) {
      console.error("Failed to select export folder during onboarding", error);
      showToast("Unable to open folder picker. Try setting the path manually.", { type: "error" });
    }
  });

  voiceBtn?.addEventListener("click", () => {
    closeOnboarding();
    openSettings();
    setTimeout(() => {
      document.getElementById("voice-id-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  });

  voiceLaterBtn?.addEventListener("click", () => {
    currentStep = clampStep(currentStep + 1);
    updateStepUI();
  });
  useLocalLlmToggle?.addEventListener("change", () => {
    updateLocalLlmVisibility();
    if (!useLocalLlmToggle?.checked) {
      const endpointInput = onboardingRoot?.querySelector<HTMLInputElement>("#onboarding-openai-endpoint");
      const modelInput = onboardingRoot?.querySelector<HTMLInputElement>("#onboarding-openai-model");
      if (endpointInput) endpointInput.value = "";
      if (modelInput) modelInput.value = "";
    }
  });
  voiceNameInput?.addEventListener("input", updateVoiceScriptText);
  voiceRecordBtn?.addEventListener("click", () => {
    void recordVoiceSampleOnboarding();
  });
  voiceEnrollBtn?.addEventListener("click", () => {
    void handleVoiceEnroll();
  });
  voiceClearBtn?.addEventListener("click", () => {
    voiceSamples = [];
    void persistVoiceSamples(voiceSamples);
    renderVoiceSamples();
    setVoiceStatus("Cleared recorded samples.");
  });
  calendarToggle?.addEventListener("change", async () => {
    const enabled = calendarToggle?.checked ?? false;
    toggleCalendarSettingsVisibility(enabled);
    if (enabled && !calendarsLoaded) {
      const settings = calendarService.getSettings();
      await loadCalendarsIfAllowed(settings.selectedCalendarIds);
    }
  });

  onboardingRoot.addEventListener("keydown", handleKeydown);

  initialized = true;

  void (async () => {
    await migrateLegacyApiKeys();
    const existingKey = await getSpeechmaticsApiKey();
    if (!existingKey) {
      await openOnboardingInternal();
    }
  })();
}

export function openOnboarding(): void {
  if (!initialized) {
    initializeOnboarding();
  }
  void openOnboardingInternal();
}

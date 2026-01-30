import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { db } from "./database";
import { TranscriptData } from "./types";
import { initializeElements, elements } from "./dom";
import { loadApiKeys, setupSettingsListeners, initializeExportSettings } from "./ui/settings";
import { setupSidebarListeners } from "./ui/sidebar";
import { setupTabListeners } from "./ui/tabs";
import { setupChatListeners } from "./ui/chat";
import { loadMeetings, createNewMeeting, setupMeetingListeners } from "./meeting-operations";
import { setupRecordingListeners, updateTranscript, handleRecordingError, onRecordingEnded, handleAudioLevel, updateRecordingUI, toggleMute } from "./recording";
import { setupAIListeners } from "./ai-operations";
import { initializeTags } from "./ui/tags";
import { initializeTemplates } from "./prompt-templates";
import { initializeNotificationActionHandlers } from "./notification-actions";
import { initializeCustomDictionaryUI } from "./ui/custom-dictionary";
import { setupTemplateManagerListeners } from "./ui/template-manager";
import { initializeTasks, setupTasksListeners, setupModeToggleListeners, restoreAppMode, renderTasks } from "./ui/tasks";
import { calendarService } from "./calendar-service";
import { initializeCalendarUI } from "./ui/calendar";
import { initializeSpeakerIdUI } from "./ui/settings/speaker-id";
import { initializePeoplePanel } from "./ui/people";
import { initializeTranscriptUI } from "./ui/transcript";
import { initializeTranscriptContextMenu } from "./ui/transcript-context-menu";
import { setupTabFind } from "./ui/find";
import { refreshAudioDeviceOptions } from "./audio-devices";
import { initializeSidebarToggle } from "./ui/interactions";
import { initializeIcons } from "./init-icons";
import { initializeOnboarding } from "./ui/onboarding";
import { loadTasks } from "./tasks";

async function init() {
  await db.init();
  initializeElements();
  initializeIcons();
  initializeSidebarToggle();
  initializeOnboarding();
  await refreshAudioDeviceOptions([elements.inlineAudioDeviceSelect, elements.audioDeviceSelect]);
  initializeTranscriptUI();
  initializeTranscriptContextMenu();
  await initializeCustomDictionaryUI();
  initializeTemplates();
  await initializeSpeakerIdUI();
  await loadApiKeys();
  await initializeExportSettings();
  await loadMeetings();
  await initializeTasks();
  await initializeTags();
  await calendarService.initialize();
  await initializeCalendarUI();
  setupEventListeners();
  await initializeNotificationActionHandlers();
  restoreAppMode();
  
  // Initialize recording UI state
  await updateRecordingUI();

  await listen<TranscriptData>("transcript-update", (event) => {
    updateTranscript(event.payload);
  });

  await listen<string>("recording-error", (event) => {
    handleRecordingError(event.payload);
  });

  await listen("recording-ended", () => {
    onRecordingEnded();
  });

  await listen<boolean>("mute-status-changed", (event) => {
    updateMuteStatus(event.payload);
  });

  await listen<number>("audio-level", (event) => {
    handleAudioLevel(event.payload ?? 0);
  });

  // Listen for task updates from other windows
  await listen("tasks-updated", async () => {
    await loadTasks();
    renderTasks();
  });

  // Debounce mute shortcut to prevent double-firing
  let muteDebounceTimer: number | null = null;
  await listen("mute-shortcut-triggered", async () => {
    if (muteDebounceTimer !== null) {
      clearTimeout(muteDebounceTimer);
    }
    muteDebounceTimer = window.setTimeout(async () => {
      if (import.meta.env.DEV) {
        console.log("Mute shortcut triggered - toggling mute");
      }
      await toggleMute();
      muteDebounceTimer = null;
    }, 100);
  });

  // Debounce global shortcut to prevent double-firing
  let shortcutDebounceTimer: number | null = null;
  await listen("global-shortcut-triggered", () => {
    if (shortcutDebounceTimer !== null) {
      clearTimeout(shortcutDebounceTimer);
    }
    shortcutDebounceTimer = window.setTimeout(() => {
      if (import.meta.env.DEV) {
        console.log("Global shortcut triggered - creating new meeting");
      }
      createNewMeeting();
      shortcutDebounceTimer = null;
    }, 100);
  });

  await registerGlobalShortcutOnStartup();
  await registerMuteShortcutOnStartup();
}

async function registerGlobalShortcutOnStartup() {
  const savedShortcut = localStorage.getItem("global_shortcut");
  const shortcut = savedShortcut || "CommandOrControl+Shift+M";
  
  try {
    await invoke("register_global_shortcut", { shortcut });
    if (import.meta.env.DEV) {
      console.log("Global shortcut registered on startup:", shortcut);
    }
  } catch (error) {
    console.error("Failed to register global shortcut on startup:", error);
  }
}

async function registerMuteShortcutOnStartup() {
  const savedShortcut = localStorage.getItem("mute_shortcut");
  if (savedShortcut) {
    try {
      await invoke("register_mute_shortcut", { shortcut: savedShortcut });
      if (import.meta.env.DEV) {
        console.log("Mute shortcut registered on startup:", savedShortcut);
      }
    } catch (error) {
      console.error("Failed to register mute shortcut on startup:", error);
    }
  }
}

function setupEventListeners() {
  setupSettingsListeners();
  setupTemplateManagerListeners();
  setupSidebarListeners(createNewMeeting);
  setupTabListeners();
  setupTabFind();
  setupRecordingListeners();
  setupAIListeners();
  setupMeetingListeners();
  setupChatListeners();
  setupModeToggleListeners();
  setupTasksListeners();
  initializePeoplePanel();
}

function updateMuteStatus(isMuted: boolean) {
  const muteBtn = document.getElementById("mute-btn") as HTMLButtonElement;
  if (muteBtn) {
    muteBtn.classList.toggle("muted", isMuted);
    muteBtn.setAttribute("aria-pressed", String(isMuted));
    const srLabel = muteBtn.querySelector(".sr-only");
    if (srLabel) {
      srLabel.textContent = isMuted ? "Unmute microphone" : "Mute microphone";
    }
  }
}

window.addEventListener("DOMContentLoaded", init);

import { elements } from "../../dom";
import {
  clearMuteShortcut,
  registerGlobalShortcut,
  registerMuteShortcut,
} from "./shortcuts";
import { applyAudioSettingsFromUi } from "./audio";
import { saveApiSettingsFromUi } from "./api";
import { persistExportSettingsFromUi } from "./export";
import { saveCalendarSettings } from "./calendar";
import { saveDefaultTemplateSelection } from "./templates";
import { persistSpeakerProfileInputs } from "./speaker-id";
import { closeSettings } from "./modal";
import { showToast } from "../interactions";

export async function saveSettings(): Promise<void> {
  applyAudioSettingsFromUi();
  await saveApiSettingsFromUi();
  persistSpeakerProfileInputs();
  saveDefaultTemplateSelection();
  persistExportSettingsFromUi();
  saveCalendarSettings();

  const globalShortcut = elements.globalShortcutInput?.value.trim();
  const muteShortcut = elements.muteShortcutInput?.value.trim();

  if (globalShortcut) {
    try {
      await registerGlobalShortcut(globalShortcut);
      if (import.meta.env.DEV) {
        console.log("Global shortcut registered:", globalShortcut);
      }
    } catch (error) {
      console.error("Failed to register global shortcut:", error);
      showToast(
        `Failed to register shortcut: ${error}\nUse a format like "CommandOrControl+Shift+M", "Alt+N", or "Shift+F9".`,
        { type: "error", duration: 5000 }
      );
      return;
    }
  }

  if (muteShortcut) {
    try {
      await registerMuteShortcut(muteShortcut);
      if (import.meta.env.DEV) {
        console.log("Mute shortcut registered:", muteShortcut);
      }
    } catch (error) {
      console.error("Failed to register mute shortcut:", error);
      showToast(
        `Failed to register mute shortcut: ${error}\nUse a format like "CommandOrControl+Shift+K" or "Alt+M".`,
        { type: "error", duration: 5000 }
      );
      return;
    }
  } else {
    clearMuteShortcut();
  }

  closeSettings();
  showToast("Settings saved successfully!", { type: "success" });
}

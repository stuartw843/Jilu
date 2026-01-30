import { invoke } from "@tauri-apps/api/core";
import { elements } from "../../dom";

export function loadShortcutInputs(): void {
  if (elements.globalShortcutInput) {
    const savedShortcut = localStorage.getItem("global_shortcut");
    elements.globalShortcutInput.value = savedShortcut || "CommandOrControl+Shift+M";
  }

  if (elements.muteShortcutInput) {
    const savedMuteShortcut = localStorage.getItem("mute_shortcut");
    elements.muteShortcutInput.value = savedMuteShortcut || "";
  }
}

export async function registerGlobalShortcut(shortcut: string): Promise<void> {
  await invoke("register_global_shortcut", { shortcut });
  localStorage.setItem("global_shortcut", shortcut);
}

export async function registerMuteShortcut(shortcut: string): Promise<void> {
  await invoke("register_mute_shortcut", { shortcut });
  localStorage.setItem("mute_shortcut", shortcut);
}

export function clearMuteShortcut(): void {
  localStorage.removeItem("mute_shortcut");
}

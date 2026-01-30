import { elements } from "../../dom";
import { loadAudioDevices } from "./audio";
import { loadCalendarSettings } from "./calendar";
import { loadExportSettings } from "./export";
import { loadShortcutInputs } from "./shortcuts";
import { loadDefaultTemplate } from "./templates";

export async function openSettings(): Promise<void> {
  setActiveSettingsTab("general");
  elements.settingsModal?.classList.add("active");
  await loadAudioDevices();
  loadExportSettings();
  loadDefaultTemplate();
  loadShortcutInputs();
  await loadCalendarSettings();
}

export function closeSettings(): void {
  elements.settingsModal?.classList.remove("active");
}

function setActiveSettingsTab(tabId: string) {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".settings-tab");
  const panels = document.querySelectorAll<HTMLElement>(".settings-panel");

  tabs.forEach((tab) => {
    const isActive = tab.dataset.tab === tabId;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === tabId;
    panel.classList.toggle("active", isActive);
    panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    panel.toggleAttribute("hidden", !isActive);
  });
}

export function setupSettingsTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".settings-tab");
  if (!tabs.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetTab = tab.dataset.tab;
      if (targetTab) {
        setActiveSettingsTab(targetTab);
      }
    });
  });
}

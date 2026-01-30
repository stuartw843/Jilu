import { elements } from "../../dom";
import { openTemplateManager } from "../template-manager";
import {
  browseExportPath,
  handleDeleteAllMeetings,
  handleExportDatabase,
  handleImportDatabase,
} from "./export";
import { closeSettings, openSettings, setupSettingsTabs } from "./modal";
import { saveSettings } from "./save";

export function setupSettingsListeners(): void {
  elements.settingsBtn?.addEventListener("click", openSettings);
  elements.closeSettingsBtn?.addEventListener("click", closeSettings);
  elements.saveSettingsBtn?.addEventListener("click", saveSettings);
  elements.browseExportPathBtn?.addEventListener("click", browseExportPath);
  elements.exportDatabaseBtn?.addEventListener("click", handleExportDatabase);
  elements.importDatabaseBtn?.addEventListener("click", handleImportDatabase);
  elements.deleteAllMeetingsBtn?.addEventListener("click", handleDeleteAllMeetings);
  elements.manageTemplatesBtn?.addEventListener("click", () => {
    closeSettings();
    openTemplateManager();
  });

  elements.settingsModal?.addEventListener("click", (e) => {
    if (e.target === elements.settingsModal) closeSettings();
  });

  setupSettingsTabs();
}

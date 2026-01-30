// Export settings management
export interface ExportSettings {
  enabled: boolean;
  exportPath: string;
}

// Get export settings from localStorage
export function getExportSettings(): ExportSettings {
  const enabledValue = localStorage.getItem("export_enabled");
  const enabled = enabledValue === "true";
  const exportPath = localStorage.getItem("export_path") || "";
  return { enabled, exportPath };
}

// Save export settings to localStorage
export function saveExportSettings(settings: ExportSettings): void {
  localStorage.setItem("export_enabled", settings.enabled.toString());
  localStorage.setItem("export_path", settings.exportPath);
}

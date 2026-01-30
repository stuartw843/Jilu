import { invoke } from "@tauri-apps/api/core";
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { elements } from "../../dom";
import { db, type DatabaseExport } from "../../database";
import {
  getExportSettings,
  saveExportSettings,
  initializeDefaultExportPath,
} from "../../file-export";
import { showToast } from "../interactions";
import { stopAutoSave, setCurrentMeeting, getMeetings, setMeetings } from "../../state";
import { loadMeetings, loadMeeting } from "../../meeting-operations";
import { renderTagsList, renderMeetingsList } from "../sidebar";
import { renderPeoplePanel } from "../people";

export function loadExportSettings(): void {
  const settings = getExportSettings();

  if (elements.exportEnabledCheckbox) {
    elements.exportEnabledCheckbox.checked = settings.enabled;
  }

  if (elements.exportPathInput) {
    elements.exportPathInput.value = settings.exportPath;
  }
}

export async function browseExportPath(): Promise<void> {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Export Folder",
    });

    if (selected && typeof selected === "string" && elements.exportPathInput) {
      elements.exportPathInput.value = selected;
    }
  } catch (error) {
    console.error("Failed to open folder dialog:", error);
  }
}

function createDefaultBackupName(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:]/g, "-")
    .replace("T", "_")
    .replace(/\.\d{3}Z$/, "Z");
  return `meeting-notes-backup-${timestamp}.json`;
}

function normalizeBackupPath(path: string): string {
  const trimmed = path.trim();
  return trimmed.toLowerCase().endsWith(".json") ? trimmed : `${trimmed}.json`;
}

export async function handleExportDatabase(): Promise<void> {
  if (!elements.exportDatabaseBtn) return;

  elements.exportDatabaseBtn.disabled = true;

  try {
    const snapshot = await db.exportDatabase();
    const defaultFileName = createDefaultBackupName();
    const filePath = await save({
      title: "Export Meetings Database",
      defaultPath: defaultFileName,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!filePath) {
      return;
    }

    const normalizedPath = normalizeBackupPath(filePath);
    const payload = JSON.stringify(snapshot, null, 2);

    await invoke("write_file", {
      path: normalizedPath,
      content: payload,
    });

    showToast(`Database exported to ${normalizedPath}`, { type: "success", duration: 5000 });
  } catch (error) {
    console.error("Failed to export database:", error);
    showToast(
      `Failed to export database: ${error instanceof Error ? error.message : String(error)}`,
      { type: "error", duration: 5000 }
    );
  } finally {
    elements.exportDatabaseBtn.disabled = false;
  }
}

export async function handleImportDatabase(): Promise<void> {
  if (!elements.importDatabaseBtn) return;

  elements.importDatabaseBtn.disabled = true;

  try {
    const confirmed = await ask(
      "Importing a backup will overwrite all existing meetings. This action cannot be undone. Continue?",
      { title: "Import Database", kind: "warning" },
    );

    if (!confirmed) {
      return;
    }

    let selected = await open({
      title: "Select Database Backup",
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!selected) {
      return;
    }

    if (Array.isArray(selected)) {
      selected = selected[0];
    }

    const fileContent = await invoke<string>("read_file", { path: selected });

    let parsed: DatabaseExport;
    try {
      parsed = JSON.parse(fileContent) as DatabaseExport;
    } catch (err) {
      throw new Error("Selected file is not valid JSON.");
    }

    if (typeof parsed.version !== "number" || !Array.isArray(parsed.meetings)) {
      throw new Error("Selected file is not a valid Jilu backup.");
    }

    await db.importDatabase(parsed);

    stopAutoSave();
    setCurrentMeeting(null);

    await loadMeetings();

    const meetings = getMeetings();
    if (meetings.length > 0) {
      await loadMeeting(meetings[0].id);
    } else {
      if (elements.meetingView) elements.meetingView.style.display = "none";
      if (elements.emptyView) elements.emptyView.style.display = "flex";
    }

    renderTagsList();

    showToast(
      "Database imported successfully. Reloading to apply changes...",
      { type: "success", duration: 4000 }
    );
    setTimeout(() => {
      window.location.reload();
    }, 300);
  } catch (error) {
    console.error("Failed to import database:", error);
    showToast(
      `Failed to import database: ${error instanceof Error ? error.message : String(error)}`,
      { type: "error", duration: 5000 }
    );
  } finally {
    elements.importDatabaseBtn.disabled = false;
  }
}

export async function handleDeleteAllMeetings(): Promise<void> {
  if (!elements.deleteAllMeetingsBtn) return;

  const confirmed = await ask(
    "This will permanently delete all meetings and notes from this device. This action cannot be undone. Continue?",
    { title: "Delete All Notes", kind: "warning" },
  );

  if (!confirmed) {
    return;
  }

  try {
    elements.deleteAllMeetingsBtn.disabled = true;
    await db.deleteAllMeetings();

    stopAutoSave();
    setCurrentMeeting(null);
    setMeetings([]);

    renderPeoplePanel(null);

    renderMeetingsList();
    renderTagsList();

    if (elements.meetingView) elements.meetingView.style.display = "none";
    if (elements.emptyView) elements.emptyView.style.display = "flex";

    showToast("All meetings have been deleted.", { type: "success", duration: 4000 });
  } catch (error) {
    console.error("Failed to delete meetings:", error);
    showToast(
      `Failed to delete meetings: ${error instanceof Error ? error.message : String(error)}`,
      { type: "error", duration: 5000 }
    );
  } finally {
    elements.deleteAllMeetingsBtn.disabled = false;
  }
}

export async function initializeExportSettings(): Promise<void> {
  const settings = getExportSettings();

  if (!settings.exportPath) {
    const defaultPath = await initializeDefaultExportPath();
    saveExportSettings({
      enabled: settings.enabled,
      exportPath: defaultPath,
    });
  }
}

export function persistExportSettingsFromUi(): void {
  const exportEnabled = elements.exportEnabledCheckbox?.checked || false;
  const exportPath = elements.exportPathInput?.value || "";

  saveExportSettings({
    enabled: exportEnabled,
    exportPath,
  });
}

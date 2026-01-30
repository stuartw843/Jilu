import { invoke } from "@tauri-apps/api/core";
import { Meeting } from "../types";
import { getExportSettings } from './export-settings';
import { htmlToMarkdown, isHtmlEmpty } from './html-converter';
import { hasTranscriptContent, transcriptTurnsToText } from "../utils";

// Sanitize meeting title to create a valid folder name
export function sanitizeFolderName(title: string): string {
  // Remove or replace invalid characters for file systems
  let sanitized = title
    .replace(/[<>:"/\\|?*]/g, "-") // Replace invalid chars with dash
    .replace(/\s+/g, "-") // Replace spaces with dash
    .replace(/\.+$/g, "") // Remove trailing dots
    .replace(/^\.+/g, "") // Remove leading dots
    .replace(/-+/g, "-") // Replace multiple dashes with single dash
    .trim();

  // Limit length to 100 characters
  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }

  // Ensure it's not empty
  if (!sanitized) {
    sanitized = "Untitled-Meeting";
  }

  return sanitized;
}

// Check if meeting should be exported
export function shouldExportMeeting(meeting: Meeting): boolean {
  const settings = getExportSettings();
  
  // Don't export if feature is disabled
  if (!settings.enabled) {
    return false;
  }

  // Don't export if no export path is set
  if (!settings.exportPath) {
    return false;
  }

  // Don't export if title is blank or default
  if (!meeting.title || meeting.title.trim() === "" || meeting.title === "Untitled Meeting") {
    return false;
  }

  // Don't export if ALL content is empty
  const hasContent = 
    hasTranscriptContent(meeting.transcript) ||
    !!(meeting.personalNotes && meeting.personalNotes.trim() !== "") ||
    !!(meeting.enhancedNotes && meeting.enhancedNotes.trim() !== "");

  return hasContent;
}

// Generate markdown content for a file
export function generateMarkdownContent(meeting: Meeting, type: "transcript" | "notes" | "enhanced"): string {
  let content = "";

  // Add metadata header
  content += `# ${meeting.title}\n\n`;
  content += `**Date:** ${new Date(meeting.date).toLocaleString()}\n\n`;

  if (meeting.tags && meeting.tags.length > 0) {
    content += `**Tags:** ${meeting.tags.join(", ")}\n\n`;
  }

  content += "---\n\n";

  // Add content based on type
  switch (type) {
    case "transcript":
      if (hasTranscriptContent(meeting.transcript)) {
        content += transcriptTurnsToText(meeting.transcript);
      } else {
        content += "*No transcript available*";
      }
      break;

    case "notes":
      if (meeting.personalNotes && meeting.personalNotes.trim() !== "") {
        // Convert HTML to markdown
        content += htmlToMarkdown(meeting.personalNotes);
      } else {
        content += "*No personal notes*";
      }
      break;

    case "enhanced":
      if (meeting.enhancedNotes && meeting.enhancedNotes.trim() !== "") {
        content += meeting.enhancedNotes;
      } else {
        content += "*No enhanced notes available*";
      }
      break;
  }

  return content;
}

// Export meeting to files
export async function exportMeeting(meeting: Meeting): Promise<void> {
  if (!shouldExportMeeting(meeting)) {
    return;
  }

  const settings = getExportSettings();
  const folderName = sanitizeFolderName(meeting.title);
  const folderPath = `${settings.exportPath}/${folderName}`;

  try {
    // Check if we need to rename the folder (title changed)
    if (meeting.lastExportedFolderName && meeting.lastExportedFolderName !== folderName) {
      const oldFolderPath = `${settings.exportPath}/${meeting.lastExportedFolderName}`;
      const exists = await invoke<boolean>("directory_exists", { path: oldFolderPath });
      
      if (exists) {
        // Try to rename the folder
        try {
          await invoke("rename_directory", { oldPath: oldFolderPath, newPath: folderPath });
          console.log(`Renamed folder from ${meeting.lastExportedFolderName} to ${folderName}`);
        } catch (error) {
          // If rename fails, just create new folder (maybe old one was deleted manually)
          console.warn(`Failed to rename folder: ${error}`);
        }
      }
    }

    // Create the directory (or ensure it exists)
    await invoke("create_directory", { path: folderPath });

    // Write transcript file (only if not empty)
    if (hasTranscriptContent(meeting.transcript)) {
      const transcriptContent = generateMarkdownContent(meeting, "transcript");
      await invoke("write_file", {
        path: `${folderPath}/transcript.md`,
        content: transcriptContent,
      });
    }

    // Write notes file (only if not empty - check HTML content properly)
    if (meeting.personalNotes && !isHtmlEmpty(meeting.personalNotes)) {
      const notesContent = generateMarkdownContent(meeting, "notes");
      await invoke("write_file", {
        path: `${folderPath}/notes.md`,
        content: notesContent,
      });
    }

    // Write enhanced notes file (only if not empty)
    if (meeting.enhancedNotes && meeting.enhancedNotes.trim() !== "") {
      const enhancedContent = generateMarkdownContent(meeting, "enhanced");
      await invoke("write_file", {
        path: `${folderPath}/enhanced-notes.md`,
        content: enhancedContent,
      });
    }

    // Update the last exported folder name
    meeting.lastExportedFolderName = folderName;

    console.log(`Successfully exported meeting to ${folderPath}`);
  } catch (error) {
    console.error("Failed to export meeting:", error);
    throw error;
  }
}

// Initialize default export path
export async function initializeDefaultExportPath(): Promise<string> {
  try {
    const homeDir = await invoke<string>("get_home_directory");
    return `${homeDir}/Documents/MeetingNotes`;
  } catch (error) {
    console.error("Failed to get home directory:", error);
    return "";
  }
}

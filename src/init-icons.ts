/**
 * Icon Initialization
 * Injects SVG icons into the DOM on page load
 */

import {
  getMeetingsIcon,
  getCalendarIcon,
  getTasksIcon,
  getSettingsIcon,
  getAddIcon,
  getChatIcon,
  getSparkleIcon,
  getMicrophoneIcon,
  getMicrophoneMutedIcon,
  getExternalWindowIcon,
  getDocumentIcon,
  getCheckIcon,
  getRecordIcon,
  getCloseIcon,
  getCopyIcon,
  getDownloadIcon,
  getUploadIcon,
  getTrashIcon,
  getLockIcon,
  getBellIcon,
  getSyncIcon,
  getEditIcon,
  getSaveIcon,
  getPeopleIcon,
  createIcon,
  Icons,
} from './icons';

/**
 * Initialize all icons in the application
 * Should be called on DOM ready
 */
export function initializeIcons(): void {
  // Navigation icons
  injectIcon('meetings-icon', getMeetingsIcon(18));
  injectIcon('calendar-icon', getCalendarIcon(18));
  injectIcon('tasks-icon', getTasksIcon(18));
  
  // Header action icons
  injectIcon('new-meeting-icon', getAddIcon(16));
  injectIcon('settings-icon', getSettingsIcon(16));
  
  // Sidebar heading icon
  injectIcon('sidebar-meetings-icon', getMeetingsIcon(20));
  injectIcon('clear-search-icon', getCloseIcon(14));
  
  // Tab icons
  injectIcon('notes-tab-icon', getDocumentIcon(16));
  injectIcon('transcript-tab-icon', getDocumentIcon(16));
  injectIcon('enhanced-tab-icon', getSparkleIcon(16));
  injectIcon('chat-tab-icon', getChatIcon(16));
  
  // Transcript actions
  injectIcon('copy-transcript-icon', getCopyIcon(16));
  
  // Tasks heading icon
  injectIcon('tasks-heading-icon', getCheckIcon(20));
  injectIcon('pop-out-icon', getExternalWindowIcon(16));
  
  // Recording button icons
  injectIcon('start-recording-icon', getRecordIcon(20));
  injectIcon('mute-icon-unmuted', getMicrophoneIcon(20));
  injectIcon('mute-icon-muted', getMicrophoneMutedIcon(20));
  
  // Tasks add due date button
  injectIcon('add-task-date-icon', getCalendarIcon(16));
  injectIcon('add-task-submit-icon', getAddIcon(16));
  
  // Modal header icons
  injectIcon('template-manager-heading-icon', getDocumentIcon(20));
  injectIcon('close-template-manager-icon', getCloseIcon(20));
  injectIcon('settings-heading-icon', getSettingsIcon(20));
  injectIcon('close-settings-icon', getCloseIcon(20));
  
  // Settings panel icons
  injectIcon('add-term-icon', getAddIcon(16));
  injectIcon('manage-templates-icon', getDocumentIcon(16));
  injectIcon('export-db-icon', getDownloadIcon(16));
  injectIcon('import-db-icon', getUploadIcon(16));
  injectIcon('delete-all-icon', getTrashIcon(16));
  injectIcon('calendar-permission-icon', getLockIcon(16));
  injectIcon('notification-permission-icon', getBellIcon(16));
  injectIcon('sync-now-icon', getSyncIcon(16));
  injectIcon('test-reminders-icon', getBellIcon(16));
  
  // Welcome screen
  injectIcon('start-new-meeting-icon', getMicrophoneIcon(20));
  
  // People section
  injectIcon('people-section-icon', getPeopleIcon(16));
  injectIcon('people-section-chevron', createIcon(Icons.chevronDown, { size: 14, ariaHidden: true }));
  
  // Enhanced notes actions
  injectIcon('copy-enhanced-icon', getCopyIcon(16));
  injectIcon('refresh-template-icon', getSyncIcon(16));
  injectIcon('edit-enhanced-icon', getEditIcon(16));
  injectIcon('clear-enhanced-icon', getTrashIcon(16));
  injectIcon('save-enhanced-icon', getSaveIcon(16));
  injectIcon('cancel-enhanced-icon', getCloseIcon(16));
  
  // Calendar view
  injectIcon('calendar-sync-icon', getSyncIcon(16));
  
  // Tasks view
  injectIcon('toggle-completed-icon', getCheckIcon(16));
  
  // Chat welcome
  injectIcon('chat-welcome-icon', getChatIcon(20));
}

/**
 * Inject an icon into a specific element
 */
function injectIcon(elementId: string, iconHtml: string): void {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = iconHtml;
  }
}

/**
 * Update button text with icon
 * Replaces emoji with SVG icon
 */
export function updateButtonWithIcon(
  buttonId: string,
  iconHtml: string,
  text: string
): void {
  const button = document.getElementById(buttonId);
  if (button) {
    button.innerHTML = `<span class="btn-icon-inline">${iconHtml}</span><span>${text}</span>`;
  }
}

/**
 * Helper to replace emoji in text with icon HTML
 */
export function replaceEmojiWithIcon(
  text: string,
  emoji: string,
  iconHtml: string
): string {
  return text.replace(emoji, iconHtml);
}

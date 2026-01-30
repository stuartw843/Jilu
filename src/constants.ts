/**
 * Application-wide constants
 */

// Database
export const DB_NAME = 'meeting-notes-db';
export const DB_VERSION = 10;
export const STORE_NAME = 'meetings';
export const TASKS_STORE_NAME = 'tasks';
export const CALENDAR_EVENTS_STORE = 'calendarEvents';
export const PEOPLE_STORE = 'people';
export const CUSTOM_DICTIONARY_STORE = 'customDictionary';

// Custom Dictionary
export const CUSTOM_DICTIONARY_LIMIT = 500;

// Recording & Transcription
export const INACTIVITY_TIMEOUT_MS = 60 * 1000; // 60 seconds
export const INACTIVITY_CHECK_INTERVAL_MS = 10 * 1000; // 10 seconds
export const MIC_SAMPLE_RATE = 48_000;
export const MIC_BUFFER_SIZE = 512;

// Auto-save
export const AUTO_SAVE_INTERVAL_MS = 30_000; // 30 seconds

// Transcript Processing
export const PUNCT_GAP_REGEX = /[ \t]+([.,!?;:])/g;
export const PUNCT_SPACE_AFTER_REGEX = /([.,!?;:])(?!\s|$)/g;
export const INLINE_GAPS_REGEX = /[ \t]{2,}/g;
export const TRAILING_NEWLINE_SPACE_REGEX = /[ \t]+\n/g;
export const LEADING_NEWLINE_SPACE_REGEX = /\n[ \t]+/g;

// Calendar
export const DEFAULT_CALENDAR_SYNC_INTERVAL_MINUTES = 15;
export const DEFAULT_REMINDER_MINUTES_BEFORE = 5;
export const CALENDAR_UPCOMING_HOURS = 48;

// UI
export const TOAST_DEFAULT_DURATION_MS = 3000;
export const DEBOUNCE_DEFAULT_DELAY_MS = 300;
export const BUTTON_SUCCESS_DISPLAY_MS = 2000;
export const BUTTON_ERROR_DISPLAY_MS = 3000;

// Shortcuts
export const DEFAULT_GLOBAL_SHORTCUT = "CommandOrControl+Shift+M";
export const MUTE_SHORTCUT_DEBOUNCE_MS = 100;
export const GLOBAL_SHORTCUT_DEBOUNCE_MS = 100;

// Local Storage Keys
export const STORAGE_KEY_SPEECHMATICS_API = "speechmatics_api_key";
export const STORAGE_KEY_SPEECHMATICS_URL = "speechmatics_url";
export const STORAGE_KEY_OPENAI_API = "openai_api_key";
export const STORAGE_KEY_OPENAI_ENDPOINT = "openai_endpoint";
export const STORAGE_KEY_OPENAI_MODEL = "openai_model";
export const STORAGE_KEY_GLOBAL_SHORTCUT = "global_shortcut";
export const STORAGE_KEY_MUTE_SHORTCUT = "mute_shortcut";
export const STORAGE_KEY_AUDIO_DEVICE = "audio_device";
export const STORAGE_KEY_EXPORT_ENABLED = "export_enabled";
export const STORAGE_KEY_EXPORT_PATH = "export_path";
export const STORAGE_KEY_DEFAULT_TEMPLATE = "default_template_id";
export const STORAGE_KEY_CALENDAR_SETTINGS = "calendar_settings";
export const STORAGE_KEY_APP_MODE = "app_mode";
export const STORAGE_KEY_PEOPLE_SECTION_EXPANDED = "people_section_expanded";

export const DEFAULT_SPEECHMATICS_URL = "wss://eu2.rt.speechmatics.com/v2";

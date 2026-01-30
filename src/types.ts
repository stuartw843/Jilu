// Shared type definitions and interfaces

export interface Meeting {
  id: string;
  title: string;
  date: Date;
  transcript: TranscriptTurn[];
  personalNotes: string;
  enhancedNotes: string;
  participants?: MeetingParticipant[];
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  lastExportedFolderName?: string;
  promptTemplateId?: string; // Override template for this meeting
  // Calendar sync fields
  calendarEventId?: string;      // Link to calendar event
  calendarName?: string;          // Which calendar it came from
  startTime?: Date;               // Meeting scheduled start
  endTime?: Date;                 // Meeting scheduled end
  location?: string;              // Meeting location
  calendarSeriesId?: string;      // Recurring series identifier
  calendarSeriesName?: string;    // Recurring series display name
  isSynced?: boolean;             // True if from calendar
  syncedAt?: Date;                // Last sync timestamp
}

export interface MeetingParticipant {
  email?: string;
  name?: string;
  jobRole?: string;
}

export interface Person {
  email: string;
  name?: string;
  jobRole?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomDictionaryEntry {
  id: string;
  content: string;
  soundsLike: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  userPrompt: string; // Supports {{#if}} conditionals
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: string;
  title: string;
  dueDate: Date | null;
  isDone: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export type AppMode = 'meetings' | 'calendar' | 'tasks';

export type TaskFilter = 'all' | 'today' | 'week' | 'overdue';

export interface TranscriptData {
  text: string;
  is_partial: boolean;
  turns?: TranscriptTurn[];
}

export interface TranscriptTurn {
  speaker?: string | null;
  text: string;
}

export interface Calendar {
  id: string;
  title: string;
  color: string;
  source_title: string;
}

export interface CalendarEvent {
  id: string;
  series_id: string;
  title: string;
  start_time: string; // ISO 8601 timestamp
  end_time: string;   // ISO 8601 timestamp
  attendees: CalendarAttendee[];
  notes: string;
  location: string;
  calendar_id: string;
  calendar_name: string;
}

export interface CalendarAttendee {
  email?: string;
  name?: string;
}

export interface CalendarEventInstance {
  id: string;
  title: string;
  startTime: string; // ISO 8601 timestamp
  endTime: string;
  calendarId: string;
  calendarName: string;
  location?: string;
  attendees: CalendarAttendee[];
  notes: string;
  updatedAt: string;
  seriesId?: string;
  seriesName?: string;
  reminderEnabled?: boolean;
  isStarred?: boolean;
}

export interface CalendarSettings {
  enabled: boolean;
  selectedCalendarIds: string[];
  syncIntervalMinutes: number;
  reminderMinutesBefore: number;
  autoStopReminder: boolean;
  notificationsEnabled: boolean;
}

export interface DOMElements {
  // Modals
  settingsModal: HTMLElement | null;
  settingsBtn: HTMLElement | null;
  closeSettingsBtn: HTMLElement | null;
  saveSettingsBtn: HTMLElement | null;
  audioDeviceSelect: HTMLSelectElement | null;
  speechmaticsUrlInput: HTMLInputElement | null;
  speechmaticsKeyInput: HTMLInputElement | null;
  openaiKeyInput: HTMLInputElement | null;
  openaiEndpointInput: HTMLInputElement | null;
  openaiModelInput: HTMLInputElement | null;
  globalShortcutInput: HTMLInputElement | null;
  muteShortcutInput: HTMLInputElement | null;
  speakerNameInput: HTMLInputElement | null;
  speakerEmailInput: HTMLInputElement | null;
  voiceSampleDeviceSelect: HTMLSelectElement | null;
  recordVoiceSampleBtn: HTMLButtonElement | null;
  voiceSampleList: HTMLElement | null;
  voiceSampleScript: HTMLElement | null;
  enrollVoiceProfileBtn: HTMLButtonElement | null;
  speakerIdStatus: HTMLElement | null;
  speakerIdentifiersList: HTMLElement | null;
  clearVoiceSamplesBtn: HTMLButtonElement | null;
  exportEnabledCheckbox: HTMLInputElement | null;
  exportPathInput: HTMLInputElement | null;
  browseExportPathBtn: HTMLElement | null;
  exportDatabaseBtn: HTMLButtonElement | null;
  importDatabaseBtn: HTMLButtonElement | null;
  deleteAllMeetingsBtn: HTMLButtonElement | null;
  customDictionaryAddBtn: HTMLButtonElement | null;
  customDictionaryCount: HTMLElement | null;
  customDictionaryList: HTMLElement | null;
  customDictionaryForm: HTMLFormElement | null;
  customDictionaryTermInput: HTMLInputElement | null;
  customDictionarySoundsLikeInput: HTMLInputElement | null;
  customDictionaryCancelBtn: HTMLButtonElement | null;
  calendarSyncEnabled: HTMLInputElement | null;
  requestCalendarPermissionBtn: HTMLElement | null;
  calendarPermissionStatus: HTMLElement | null;
  calendarSettingsGroup: HTMLElement | null;
  calendarList: HTMLElement | null;
  syncIntervalInput: HTMLInputElement | null;
  reminderMinutesInput: HTMLInputElement | null;
  autoStopReminderCheckbox: HTMLInputElement | null;
  notificationsEnabledToggle: HTMLInputElement | null;
  requestNotificationPermissionBtn: HTMLElement | null;
  notificationPermissionStatus: HTMLElement | null;
  syncNowBtn: HTMLElement | null;
  testRemindersBtn: HTMLButtonElement | null;

  // Sidebar
  newMeetingBtn: HTMLElement | null;
  startNewMeetingBtn: HTMLElement | null;
  searchInput: HTMLInputElement | null;
  searchClearBtn: HTMLButtonElement | null;
  searchFullContentToggle: HTMLInputElement | null;
  meetingsList: HTMLElement | null;

  // Main views
  emptyView: HTMLElement | null;
  meetingView: HTMLElement | null;

  // Meeting header
  meetingTitle: HTMLInputElement | null;
  meetingDate: HTMLElement | null;
  meetingSeriesIndicator: HTMLElement | null;
  meetingSeriesButton: HTMLButtonElement | null;
  recordingStatus: HTMLElement | null;
  startRecordingBtn: HTMLButtonElement | null;
  stopRecordingBtn: HTMLButtonElement | null;
  muteBtn: HTMLButtonElement | null;
  inlineAudioDeviceSelect: HTMLSelectElement | null;
  micActivity: HTMLElement | null;
  micActivityDot: HTMLElement | null;
  micActivityLabel: HTMLElement | null;
  enhanceNotesBtn: HTMLButtonElement | null;
  
  // Tags
  tagInput: HTMLInputElement | null;
  tagSuggestions: HTMLElement | null;
  meetingTagsDisplay: HTMLElement | null;
  peopleSection: HTMLElement | null;
  peopleSectionToggle: HTMLButtonElement | null;
  peopleSectionContent: HTMLElement | null;
  peopleExpandBtn: HTMLButtonElement | null;
  peopleList: HTMLElement | null;
  addPersonToggle: HTMLButtonElement | null;
  addPersonForm: HTMLFormElement | null;
  addPersonEmailInput: HTMLInputElement | null;
  addPersonNameInput: HTMLInputElement | null;
  addPersonRoleInput: HTMLInputElement | null;
  cancelAddPersonBtn: HTMLButtonElement | null;

  // Tabs
  tabBtns: HTMLElement[];
  notesTab: HTMLElement | null;
  transcriptTab: HTMLElement | null;
  enhancedTab: HTMLElement | null;
  chatTab: HTMLElement | null;
  tabFindContainer: HTMLElement | null;
  tabFindInput: HTMLInputElement | null;
  tabFindCount: HTMLElement | null;
  tabFindPrevBtn: HTMLButtonElement | null;
  tabFindNextBtn: HTMLButtonElement | null;
  tabFindCloseBtn: HTMLButtonElement | null;

  // Content areas
  transcriptViewer: HTMLElement | null;
  transcriptContent: HTMLElement | null;
  partialTranscript: HTMLElement | null;
  enhancedViewer: HTMLElement | null;
  enhancedContent: HTMLElement | null;
  enhancedProgress: HTMLElement | null;
  transcriptAutoScrollBtn: HTMLButtonElement | null;
  copyTranscriptBtn: HTMLButtonElement | null;
  copyEnhancedBtn: HTMLButtonElement | null;

  // Chat
  chatMessages: HTMLElement | null;
  chatInput: HTMLInputElement | null;
  chatSendBtn: HTMLElement | null;

  // Template Manager
  templateManagerModal: HTMLElement | null;
  closeTemplateManagerBtn: HTMLElement | null;
  templateList: HTMLElement | null;
  templateEditor: HTMLElement | null;
  newTemplateBtn: HTMLElement | null;
  
  // Template selector in AI Enhanced tab
  templateSelector: HTMLSelectElement | null;
  refreshTemplateBtn: HTMLElement | null;
  
  // Settings - Default template
  defaultTemplateSelect: HTMLSelectElement | null;
  manageTemplatesBtn: HTMLElement | null;

  // Mode Toggle
  meetingsModeBtn: HTMLElement | null;
  calendarModeBtn: HTMLElement | null;
  tasksModeBtn: HTMLElement | null;
  nextEventPill: HTMLElement | null;

  // Containers
  meetingsContainer: HTMLElement | null;
  calendarContainer: HTMLElement | null;

  // Tasks View
  tasksView: HTMLElement | null;
  tasksContainer: HTMLElement | null;
  addTaskInput: HTMLInputElement | null;
  addTaskButton: HTMLButtonElement | null;
  tasksList: HTMLElement | null;
  taskFilterAll: HTMLElement | null;
  taskFilterToday: HTMLElement | null;
  taskFilterWeek: HTMLElement | null;
  taskFilterOverdue: HTMLElement | null;
  popOutTasksBtn: HTMLElement | null;

  // Calendar View
  calendarTimeline: HTMLElement | null;
  calendarPriorityNow: HTMLElement | null;
  calendarPriorityNext: HTMLElement | null;
  calendarGrid: HTMLElement | null;
  calendarDayAgenda: HTMLElement | null;
  calendarRangePill: HTMLElement | null;
  calendarSelectedDateLabel: HTMLElement | null;
  calendarFocusLabel: HTMLElement | null;
  calendarPrevDayBtn: HTMLButtonElement | null;
  calendarNextDayBtn: HTMLButtonElement | null;
  calendarViewToggle: HTMLElement | null;
  calendarFilter: HTMLSelectElement | null;
  calendarSyncBtn: HTMLElement | null;
  calendarLastSync: HTMLElement | null;
  calendarDatePicker: HTMLInputElement | null;
  calendarTodayBtn: HTMLElement | null;
  calendarWeekControls: HTMLElement | null;
  calendarWeekLabel: HTMLElement | null;
  calendarPrevWeekBtn: HTMLButtonElement | null;
  calendarNextWeekBtn: HTMLButtonElement | null;
  calendarDayLabel: HTMLElement | null;
}

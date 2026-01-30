import { invoke } from "@tauri-apps/api/core";
import type {
  Calendar,
  CalendarAttendee,
  CalendarEvent,
  CalendarEventInstance,
  CalendarSettings,
  Meeting,
  MeetingParticipant,
  Person,
} from "./types";
import { db } from "./database";
import { getCurrentMeeting, getIsRecording } from "./state";
import { normalizeEmail } from "./utils";
import { ensureNotificationPermission, sendNotification } from "./notifications";
import {
  NOTIFICATION_EXTRA_TYPE_CALENDAR_EVENT,
  NOTIFICATION_EXTRA_TYPE_MEETING,
} from "./notification-types";

const TEAMS_SEPARATOR = "________________________________________________________________________________";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const isDev = import.meta.env.DEV;
const SYNC_LOOKBACK_DAYS = 30;
const SYNC_LOOKAHEAD_DAYS = 60;

function sanitizeEventNotes(notes?: string | null): string {
  if (!notes) {
    return "";
  }

  const separatorIndex = notes.indexOf(TEAMS_SEPARATOR);
  if (separatorIndex !== -1) {
    return notes.slice(0, separatorIndex).trimEnd();
  }

  // Fallback: strip any trailing block of many underscores (common meeting footer pattern)
  const genericSeparator = /[\r\n]{0,2}_{10,}[\s\S]*$/;
  if (genericSeparator.test(notes)) {
    return notes.replace(genericSeparator, "").trimEnd();
  }

  return notes;
}

function normalizeAttendeeList(attendees: CalendarAttendee[]): CalendarAttendee[] {
  if (!attendees || attendees.length === 0) {
    return [];
  }

  const sanitized: CalendarAttendee[] = [];

  attendees.forEach((attendee) => {
    const email = normalizeEmail(attendee.email);
    const name = attendee.name?.trim();

    if (!email && !name) {
      return;
    }

    sanitized.push({
      email: email || undefined,
      name: name || undefined,
    });
  });

  return sanitized;
}

class CalendarSyncService {
  private syncIntervalId: number | null = null;
  private reminderIntervalId: number | null = null;
  private reminderCheckIntervalMs = 60 * 1000;
  private readonly defaultSettings: CalendarSettings = {
    enabled: false,
    selectedCalendarIds: [],
    syncIntervalMinutes: 5,
    reminderMinutesBefore: 5,
    autoStopReminder: true,
    notificationsEnabled: true,
  };
  private settings: CalendarSettings = { ...this.defaultSettings };
  private isCalendarAccessGranted: boolean = false;
  private lastSyncAt: Date | null = null;
  private notifiedUpcomingEvents: Map<string, number> = new Map();
  private notifiedStopMeetings: Set<string> = new Set();
  private notifiedMeetingCompletions: Map<string, number> = new Map();
  private isReminderCheckRunning = false;

  async initialize(): Promise<void> {
    // Load settings from localStorage
    this.loadSettings();

    // Check calendar permission status
    try {
      this.isCalendarAccessGranted = await invoke<boolean>("check_calendar_permission");
    } catch (error) {
      console.error("Failed to check calendar permission:", error);
      this.isCalendarAccessGranted = false;
    }

    // Start auto-sync if enabled
    if (this.settings.enabled && this.isCalendarAccessGranted) {
      await this.startAutoSync();
    }

    this.startReminderChecks();
  }

  async requestCalendarPermission(): Promise<boolean> {
    try {
      const granted = await invoke<boolean>("request_calendar_permission");
      this.isCalendarAccessGranted = granted;
      return granted;
    } catch (error) {
      console.error("Failed to request calendar permission:", error);
      return false;
    }
  }

  async checkCalendarPermission(): Promise<boolean> {
    try {
      const granted = await invoke<boolean>("check_calendar_permission");
      this.isCalendarAccessGranted = granted;
      return granted;
    } catch (error) {
      console.error("Failed to check calendar permission:", error);
      return false;
    }
  }

  async listCalendars(): Promise<Calendar[]> {
    try {
      return await invoke<Calendar[]>("list_calendars");
    } catch (error) {
      console.error("Failed to list calendars:", error);
      throw error;
    }
  }

  getSettings(): CalendarSettings {
    return { ...this.settings };
  }

  updateSettings(newSettings: Partial<CalendarSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();

    // Restart sync if settings changed
    if (this.settings.enabled && this.isCalendarAccessGranted) {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }

    this.startReminderChecks();
  }

  async runReminderTest(): Promise<{ success: boolean; messages: string[] }> {
    const messages: string[] = [];

    if (!this.settings.notificationsEnabled) {
      messages.push("Desktop notifications are turned off. Enable them to receive reminders.");
      return { success: false, messages };
    }

    const permissionGranted = await ensureNotificationPermission({ promptUser: true });
    if (!permissionGranted) {
      messages.push(
        "Notifications are blocked for Meeting Transcriber. Allow them in System Settings > Notifications."
      );
      return { success: false, messages };
    }

    try {
      await this.checkReminders();
    } catch (error) {
      console.error("Manual reminder check failed:", error);
      messages.push("Reminder check ran into an error. See console for details.");
    }

    const hasCalendarSelection = this.settings.selectedCalendarIds.length > 0;
    const hasUpcomingReminder =
      this.settings.enabled && hasCalendarSelection && this.settings.reminderMinutesBefore > 0;
    const hasStopReminder = this.settings.autoStopReminder;
    const hasCompletionReminder = this.settings.enabled;

    const previewBodySections: string[] = [];

    if (hasUpcomingReminder) {
      previewBodySections.push(
        `Upcoming meetings trigger ${this.settings.reminderMinutesBefore}-minute reminders.`
      );
    } else {
      previewBodySections.push(
        "Enable calendar sync, choose calendars, and set a reminder window above 0 to get pre-meeting alerts."
      );
    }

    if (hasStopReminder) {
      previewBodySections.push("You'll also be nudged if recording keeps running after meetings.");
    } else {
      previewBodySections.push("Auto stop reminders are currently turned off.");
    }

    if (hasCompletionReminder) {
      previewBodySections.push("Wrap-up reminders fire right after synced meetings end.");
    } else {
      previewBodySections.push("Wrap-up reminders stay disabled until calendar sync is enabled.");
    }

    const summaryBody = previewBodySections.join("\n\n");
    const sent = await this.sendTestNotifications(summaryBody);

    if (sent) {
      messages.push(
        "Sample notifications sent. If they do not appear, enable Meeting Transcriber in System Settings > Notifications."
      );
    } else {
      messages.push("Failed to deliver the test notifications. Check console logs for details.");
    }

    return { success: sent, messages };
  }

  private saveSettings(): void {
    localStorage.setItem("calendarSettings", JSON.stringify(this.settings));
  }

  private loadSettings(): void {
    const saved = localStorage.getItem("calendarSettings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.settings = { ...this.defaultSettings, ...parsed };
      } catch (error) {
        console.error("Failed to parse calendar settings:", error);
        this.settings = { ...this.defaultSettings };
      }
    } else {
      this.settings = { ...this.defaultSettings };
    }

    const lastSync = localStorage.getItem("calendarLastSync");
    if (lastSync) {
      this.lastSyncAt = new Date(lastSync);
    }
  }

  async startAutoSync(): Promise<void> {
    this.stopAutoSync(); // Clear any existing interval

    if (!this.settings.enabled || this.settings.selectedCalendarIds.length === 0) {
      if (isDev) {
        console.log("Calendar sync not enabled or no calendars selected");
      }
      return;
    }

    // Do initial sync
    await this.syncNow();

    // Set up recurring sync
    const intervalMs = this.settings.syncIntervalMinutes * 60 * 1000;
    this.syncIntervalId = window.setInterval(() => {
      this.syncNow().catch(error => {
        console.error("Auto-sync failed:", error);
      });
    }, intervalMs);

    if (isDev) {
      console.log(`Calendar auto-sync started (every ${this.settings.syncIntervalMinutes} minutes)`);
    }
  }

  stopAutoSync(): void {
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      if (isDev) {
        console.log("Calendar auto-sync stopped");
      }
    }
  }

  private startReminderChecks(): void {
    const notificationsEnabled = this.settings.notificationsEnabled;
    const hasStartReminders =
      notificationsEnabled && this.settings.enabled && this.settings.reminderMinutesBefore > 0;
    const hasStopReminders = notificationsEnabled && this.settings.autoStopReminder;
    const hasCompletionReminders = notificationsEnabled && this.settings.enabled;
    const shouldRun = hasStartReminders || hasStopReminders || hasCompletionReminders;

    if (!shouldRun) {
      this.stopReminderChecks();
      this.pruneReminderCaches();
      return;
    }

    this.stopReminderChecks();

    // Kick off an immediate check so we catch events without waiting a minute
    this.checkReminders().catch((error) => {
      console.error("Initial reminder check failed:", error);
    });

    this.reminderIntervalId = window.setInterval(() => {
      this.checkReminders().catch((error) => {
        console.error("Reminder check failed:", error);
      });
    }, this.reminderCheckIntervalMs);
  }

  private stopReminderChecks(): void {
    if (this.reminderIntervalId !== null) {
      window.clearInterval(this.reminderIntervalId);
      this.reminderIntervalId = null;
    }
  }

  private async checkReminders(): Promise<void> {
    if (this.isReminderCheckRunning) {
      return;
    }

    if (!this.settings.notificationsEnabled) {
      this.pruneReminderCaches();
      return;
    }

    const notificationsEnabled = this.settings.notificationsEnabled;
    const shouldCheckUpcoming =
      notificationsEnabled &&
      this.settings.enabled &&
      this.settings.selectedCalendarIds.length > 0 &&
      this.settings.reminderMinutesBefore > 0;
    const shouldCheckStop = notificationsEnabled && this.settings.autoStopReminder;
    const shouldCheckCompletion = notificationsEnabled && this.settings.enabled;

    if (!shouldCheckUpcoming && !shouldCheckStop && !shouldCheckCompletion) {
      this.pruneReminderCaches();
      return;
    }

    this.isReminderCheckRunning = true;

    try {
      const [upcomingEvents, stopMeetings, endingMeetings] = await Promise.all([
        shouldCheckUpcoming ? this.getEventsNeedingReminder() : Promise.resolve([]),
        shouldCheckStop ? this.getMeetingsNeedingStopReminder() : Promise.resolve([]),
        shouldCheckCompletion ? this.getMeetingsEndingSoon() : Promise.resolve([]),
      ]);

      const stopIds = new Set(stopMeetings.map((meeting) => meeting.id));
      const completionCandidates = endingMeetings.filter((meeting) => !stopIds.has(meeting.id));

      this.pruneReminderCaches(upcomingEvents, stopMeetings, completionCandidates);

      if (upcomingEvents.length === 0 && stopMeetings.length === 0 && completionCandidates.length === 0) {
        return;
      }

      const permissionGranted = await ensureNotificationPermission();
      if (!permissionGranted) {
        return;
      }

      await this.sendUpcomingNotifications(upcomingEvents);
      await this.sendStopNotifications(stopMeetings);
      await this.sendCompletionNotifications(completionCandidates);
    } catch (error) {
      console.error("Reminder check failed:", error);
    } finally {
      this.isReminderCheckRunning = false;
    }
  }

  private async sendUpcomingNotifications(events: CalendarEventInstance[]): Promise<void> {
    if (!this.settings.notificationsEnabled) {
      return;
    }

    for (const event of events) {
      const startTime = event.startTime ? new Date(event.startTime).getTime() : null;
      if (!startTime) continue;

      const alreadyNotified = this.notifiedUpcomingEvents.get(event.id);
      if (alreadyNotified === startTime) {
        continue;
      }

      const startDisplay = new Date(startTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const title = event.title || "Untitled meeting";
      const calendarName = event.calendarName ? ` • ${event.calendarName}` : "";
      const location = event.location ? ` @ ${event.location}` : "";

      const sent = await sendNotification(`Upcoming meeting in ${this.settings.reminderMinutesBefore} min`, {
        body: `${title}${calendarName} starts at ${startDisplay}${location}`,
        tag: `meeting-upcoming-${event.id}`,
        extra: {
          type: NOTIFICATION_EXTRA_TYPE_CALENDAR_EVENT,
          calendarEventId: event.id,
        },
      });

      if (sent) {
        this.notifiedUpcomingEvents.set(event.id, startTime);
      }
    }
  }

  private async sendStopNotifications(meetings: Meeting[]): Promise<void> {
    if (!this.settings.notificationsEnabled) {
      return;
    }

    for (const meeting of meetings) {
      if (this.notifiedStopMeetings.has(meeting.id)) {
        continue;
      }

      const title = meeting.title || "Untitled meeting";
      const endDisplay = meeting.endTime
        ? new Date(meeting.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : null;
      const body = endDisplay
        ? `${title} ended at ${endDisplay}. Recording is still running — tap Stop in Jilu.`
        : `${title} has ended. Recording is still running — tap Stop in Jilu.`;

      const sent = await sendNotification("Recording still running", {
        body,
        tag: `meeting-stop-${meeting.id}`,
        extra: {
          type: NOTIFICATION_EXTRA_TYPE_MEETING,
          meetingId: meeting.id,
        },
      });

      if (sent) {
        this.notifiedStopMeetings.add(meeting.id);
      }
    }
  }

  private async sendCompletionNotifications(meetings: Meeting[]): Promise<void> {
    if (!this.settings.notificationsEnabled) {
      return;
    }

    for (const meeting of meetings) {
      if (!meeting.endTime) continue;

      const endTimeMs = new Date(meeting.endTime).getTime();
      const previous = this.notifiedMeetingCompletions.get(meeting.id);
      if (previous === endTimeMs) {
        continue;
      }

      const title = meeting.title || "Meeting";
      const endDisplay = new Date(endTimeMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      const sent = await sendNotification("Meeting finished", {
        body: `${title} wrapped up at ${endDisplay}. Capture next steps while it's fresh.`,
        tag: `meeting-complete-${meeting.id}`,
        extra: {
          type: NOTIFICATION_EXTRA_TYPE_MEETING,
          meetingId: meeting.id,
        },
      });

      if (sent) {
        this.notifiedMeetingCompletions.set(meeting.id, endTimeMs);
      }
    }
  }

  private async sendTestNotifications(summaryBody: string): Promise<boolean> {
    const randomSuffix = () => Math.random().toString(36).slice(2, 10);
    const tagSeed = Date.now().toString(36);

    const reminderOffsetMinutes = Math.max(1, this.settings.reminderMinutesBefore || 1);
    const sampleStartTime = new Date(Date.now() + reminderOffsetMinutes * 60 * 1000);
    const startDisplay = sampleStartTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const upcomingSent = await sendNotification("Upcoming meeting test", {
      body: `Sample event starts at ${startDisplay}. ${summaryBody}`,
      tag: `meeting-reminder-test-upcoming-${tagSeed}-${randomSuffix()}`,
      sound: "default",
    });

    const stopSent = await sendNotification("Recording still running (test)", {
      body: "This is how a post-meeting stop reminder will look.",
      tag: `meeting-reminder-test-stop-${tagSeed}-${randomSuffix()}`,
      sound: "default",
    });

    const completionSent = await sendNotification("Meeting finished (test)", {
      body: "Wrap-up reminders help capture next steps right after the meeting.",
      tag: `meeting-reminder-test-complete-${tagSeed}-${randomSuffix()}`,
      sound: "default",
    });

    return upcomingSent || stopSent || completionSent;
  }

  private pruneReminderCaches(
    upcoming: CalendarEventInstance[] = [],
    stopMeetings: Meeting[] = [],
    completionMeetings: Meeting[] = []
  ): void {
    const upcomingIds = new Set(upcoming.map((event) => event.id));
    for (const [eventId] of Array.from(this.notifiedUpcomingEvents.entries())) {
      if (!upcomingIds.has(eventId)) {
        this.notifiedUpcomingEvents.delete(eventId);
      }
    }

    const stopIds = new Set(stopMeetings.map((meeting) => meeting.id));
    for (const meetingId of Array.from(this.notifiedStopMeetings.values())) {
      if (!stopIds.has(meetingId)) {
        this.notifiedStopMeetings.delete(meetingId);
      }
    }

    const completionIds = new Set(completionMeetings.map((meeting) => meeting.id));
    for (const [meetingId] of Array.from(this.notifiedMeetingCompletions.entries())) {
      if (!completionIds.has(meetingId)) {
        this.notifiedMeetingCompletions.delete(meetingId);
      }
    }
  }

  private async getMeetingsEndingSoon(): Promise<Meeting[]> {
    const allMeetings = await db.getAllMeetings();
    const now = Date.now();
    const completionWindowMs = 60 * 1000;

    return allMeetings.filter((meeting) => {
      if (!meeting.endTime || !meeting.isSynced) {
        return false;
      }

      const endTimeMs = new Date(meeting.endTime).getTime();
      const diff = now - endTimeMs;

      return diff >= 0 && diff <= completionWindowMs;
    });
  }

  async syncNow(): Promise<void> {
    if (!this.isCalendarAccessGranted) {
      console.warn("Calendar access not granted");
      return;
    }

    if (this.settings.selectedCalendarIds.length === 0) {
      if (isDev) {
        console.log("No calendars selected for sync");
      }
      return;
    }

    if (isDev) {
      console.log("Starting calendar sync...");
    }
    
    try {
      // Fetch events for a broader window so auto-sync keeps everything in view
      const now = new Date();
      const rangeStart = new Date(now.getTime() - SYNC_LOOKBACK_DAYS * DAY_IN_MS);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(now.getTime() + SYNC_LOOKAHEAD_DAYS * DAY_IN_MS);
      rangeEnd.setHours(23, 59, 59, 999);

      const events = await invoke<CalendarEvent[]>("fetch_calendar_events", {
        calendarIds: this.settings.selectedCalendarIds,
        startDate: rangeStart.toISOString(),
        endDate: rangeEnd.toISOString(),
      });

      if (isDev) {
        console.log(`Fetched ${events.length} calendar events`);
      }

      if (events.length === 0) {
        // Avoid wiping the calendar view if the OS temporarily returns no events
        const cachedEvents = await db.getAllCalendarEvents();
        const hasActiveCachedEvents = cachedEvents.some((event) => {
          const end = new Date(event.endTime);
          return !Number.isNaN(end.getTime()) && end.getTime() >= Date.now();
        });

        if (hasActiveCachedEvents) {
          console.warn("Calendar sync returned no events; keeping existing calendar cache");
          this.lastSyncAt = new Date();
          localStorage.setItem("calendarLastSync", this.lastSyncAt.toISOString());
          window.dispatchEvent(new CustomEvent("calendar-events-updated"));
          window.dispatchEvent(new CustomEvent("calendar-sync-completed"));
          return;
        }
      }

      const seenIds = new Set<string>();
      for (const event of events) {
        seenIds.add(event.id);
        await this.processCalendarEvent(event);
      }

      await db.deleteCalendarEventsNotIn(seenIds);

      this.lastSyncAt = new Date();
      localStorage.setItem("calendarLastSync", this.lastSyncAt.toISOString());
      window.dispatchEvent(new CustomEvent('calendar-events-updated'));
      window.dispatchEvent(new CustomEvent('calendar-sync-completed'));
      if (isDev) {
        console.log("Calendar sync completed");
      }
    } catch (error) {
      console.error("Calendar sync failed:", error);
      throw error;
    }
  }

  private async processCalendarEvent(event: CalendarEvent): Promise<void> {
    const snapshot = this.toCalendarEventInstance(event);
    const peopleByEmail = await this.syncAttendeeDirectory(snapshot.attendees);
    await db.saveCalendarEvent(snapshot);
    const seriesId = snapshot.seriesId;
    const seriesName = seriesId ? snapshot.seriesName || snapshot.title : undefined;

    // Check if meeting already exists
    let existing = await db.getMeetingByCalendarEventId(snapshot.id);
    let calendarLinkUpdated = false;

    if (!existing && event.series_id && event.series_id !== snapshot.id) {
      const legacy = await db.getMeetingByCalendarEventId(event.series_id);
      if (legacy) {
        legacy.calendarEventId = snapshot.id;
        existing = legacy;
        calendarLinkUpdated = true;
      }
    }

    if (existing) {
      const participants = this.buildMeetingParticipants(snapshot.attendees, peopleByEmail);

      // Normalize stored values that may have been revived as strings from IndexedDB
      const existingStartTime = existing.startTime ? new Date(existing.startTime) : null;
      const existingEndTime = existing.endTime ? new Date(existing.endTime) : null;

      // Update existing meeting if event details changed
      const hasChanged = 
        existing.title !== event.title ||
        existingStartTime?.toISOString() !== event.start_time ||
        existingEndTime?.toISOString() !== event.end_time ||
        existing.location !== event.location ||
        existing.calendarName !== event.calendar_name;

      const seriesChanged =
        existing.calendarSeriesId !== seriesId ||
        existing.calendarSeriesName !== seriesName;

      const participantsChanged = this.haveParticipantsChanged(existing.participants, participants);

      if (calendarLinkUpdated || hasChanged || participantsChanged || seriesChanged) {
        if (isDev) {
          console.log(`Updating meeting from calendar event: ${event.title}`);
        }
        existing.title = event.title;
        existing.startTime = new Date(event.start_time);
        existing.endTime = new Date(event.end_time);
        existing.location = event.location;
        existing.participants = participants.length > 0 ? participants : undefined;
        existing.calendarName = event.calendar_name;
        existing.calendarSeriesId = seriesId;
        existing.calendarSeriesName = seriesName;
        existing.syncedAt = new Date();
        existing.updatedAt = new Date();
        
        await db.saveMeeting(existing);
      }
    }
  }
  
  async getUpcomingEvents(hoursAhead: number = 48): Promise<CalendarEventInstance[]> {
    return await db.getUpcomingCalendarEvents(hoursAhead);
  }

  async getEventsForRange(start: Date, end: Date): Promise<CalendarEventInstance[]> {
    return await db.getCalendarEventsBetween(start, end);
  }

  async getAllEvents(): Promise<CalendarEventInstance[]> {
    return await db.getAllCalendarEvents();
  }

  async getEvent(eventId: string): Promise<CalendarEventInstance | null> {
    return await db.getCalendarEvent(eventId);
  }

  getLastSyncAt(): Date | null {
    return this.lastSyncAt;
  }

  /**
   * Get events that are starting within the reminder window
   */
  async getEventsNeedingReminder(): Promise<CalendarEventInstance[]> {
    const upcoming = await this.getUpcomingEvents(24);
    const now = new Date();
    const reminderMs = this.settings.reminderMinutesBefore * 60 * 1000;

    return upcoming.filter(event => {
      const startTime = new Date(event.startTime);
      const timeUntilStart = startTime.getTime() - now.getTime();
      
      // Meeting starts within reminder window
      return timeUntilStart > 0 && timeUntilStart <= reminderMs;
    });
  }

  /**
   * Get meetings that have ended but recording is still active
   */
  async getMeetingsNeedingStopReminder(): Promise<Meeting[]> {
    if (!this.settings.autoStopReminder) return [];

    const allMeetings = await db.getAllMeetings();
    const now = new Date();

    return allMeetings.filter(meeting => {
      if (!meeting.endTime || !meeting.isSynced) return false;
      
      const endTime = new Date(meeting.endTime);
      const hasEnded = endTime < now;
      
      // Check if this is the current meeting and recording is active
      const currentMeeting = getCurrentMeeting();
      const isCurrentMeeting = currentMeeting?.id === meeting.id;
      const isRecording = getIsRecording();
      
      return hasEnded && isCurrentMeeting && isRecording;
    });
  }

  /**
   * Format time remaining until meeting starts
   */
  formatTimeUntilStart(meeting: Meeting): string {
    if (!meeting.startTime) return "";

    const now = new Date();
    const startTime = new Date(meeting.startTime);
    const diffMs = startTime.getTime() - now.getTime();

    if (diffMs < 0) return "Started";

    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `In ${diffDays}d`;
    if (diffHours > 0) return `In ${diffHours}h ${diffMinutes % 60}m`;
    if (diffMinutes > 0) return `In ${diffMinutes}m`;
    return "Starting now";
  }

  /**
   * Format meeting time range
   */
  formatMeetingTime(meeting: Meeting): string {
    if (!meeting.startTime || !meeting.endTime) return "";

    const start = new Date(meeting.startTime);
    const end = new Date(meeting.endTime);

    const startStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `${startStr} - ${endStr}`;
  }

  /**
   * Check if meeting is currently in progress
   */
  isMeetingInProgress(meeting: Meeting): boolean {
    if (!meeting.startTime || !meeting.endTime) return false;

    const now = new Date();
    const start = new Date(meeting.startTime);
    const end = new Date(meeting.endTime);

    return now >= start && now <= end;
  }

  /**
   * Check if meeting is starting soon (within reminder window)
   */
  isMeetingStartingSoon(meeting: Meeting): boolean {
    if (!meeting.startTime) return false;

    const now = new Date();
    const start = new Date(meeting.startTime);
    const diffMs = start.getTime() - now.getTime();
    const reminderMs = this.settings.reminderMinutesBefore * 60 * 1000;

    return diffMs > 0 && diffMs <= reminderMs;
  }

  private async syncAttendeeDirectory(attendees: CalendarAttendee[]): Promise<Map<string, Person>> {
    const lookup = new Map<string, Person>();
    const processed = new Set<string>();

    for (const attendee of attendees) {
      const email = normalizeEmail(attendee.email);
      if (!email || processed.has(email)) continue;

      processed.add(email);
      const existing = await db.getPerson(email);
      const now = new Date();

      if (existing) {
        let shouldUpdate = false;
        if (!existing.name && attendee.name) {
          existing.name = attendee.name;
          shouldUpdate = true;
        }

        if (shouldUpdate) {
          existing.updatedAt = now;
          await db.savePerson(existing);
        }

        lookup.set(email, existing);
      } else {
        const person: Person = {
          email,
          name: attendee.name,
          jobRole: undefined,
          createdAt: now,
          updatedAt: now,
        };
        await db.savePerson(person);
        lookup.set(email, person);
      }
    }

    return lookup;
  }

  private buildMeetingParticipants(
    attendees: CalendarAttendee[],
    peopleByEmail: Map<string, Person>
  ): MeetingParticipant[] {
    const participants: MeetingParticipant[] = [];

    attendees.forEach((attendee) => {
      const email = normalizeEmail(attendee.email);
      const person = email ? peopleByEmail.get(email) : undefined;
      const name = person?.name || attendee.name || undefined;
      const jobRole = person?.jobRole || undefined;

      if (!email && !name) {
        return;
      }

      participants.push({
        email: email || undefined,
        name,
        jobRole,
      });
    });

    return participants;
  }

  private haveParticipantsChanged(
    before?: MeetingParticipant[] | null,
    after?: MeetingParticipant[]
  ): boolean {
    if (!before && !after) return false;

    const first = before ?? [];
    const second = after ?? [];

    if (first.length !== second.length) {
      return true;
    }

    for (let index = 0; index < first.length; index++) {
      const left = first[index];
      const right = second[index];

      if ((left.email || "") !== (right.email || "")) return true;
      if ((left.name || "") !== (right.name || "")) return true;
      if ((left.jobRole || "") !== (right.jobRole || "")) return true;
    }

    return false;
  }

  private toCalendarEventInstance(event: CalendarEvent): CalendarEventInstance {
    const seriesId = event.series_id && event.series_id !== event.id ? event.series_id : undefined;

    return {
      id: event.id,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      calendarId: event.calendar_id,
      calendarName: event.calendar_name,
      location: event.location,
      attendees: normalizeAttendeeList(event.attendees),
      notes: sanitizeEventNotes(event.notes),
      updatedAt: new Date().toISOString(),
      seriesId,
      seriesName: seriesId ? event.title : undefined,
    };
  }
}

export const calendarService = new CalendarSyncService();

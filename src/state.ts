import { AppMode, CalendarEventInstance, Meeting } from "./types";
import { AUTO_SAVE_INTERVAL_MS } from "./constants";

let currentMeeting: Meeting | null = null;
let isRecording = false;
let isMuted = false;
let recordingMeetingId: string | null = null;
let meetings: Meeting[] = [];
let autoSaveInterval: number | null = null;
let calendarEvents: CalendarEventInstance[] = [];
let appMode: AppMode = "meetings";

export function getCurrentMeeting(): Meeting | null {
  return currentMeeting;
}

export function getIsRecording(): boolean {
  return isRecording;
}

export function getIsMuted(): boolean {
  return isMuted;
}

export function getMeetings(): Meeting[] {
  return meetings;
}

export function setCurrentMeeting(meeting: Meeting | null) {
  currentMeeting = meeting;
}

export function setIsRecording(value: boolean) {
  isRecording = value;
}

export function setIsMuted(value: boolean) {
  isMuted = value;
}

export function getRecordingMeetingId(): string | null {
  return recordingMeetingId;
}

export function setRecordingMeetingId(id: string | null) {
  recordingMeetingId = id;
}

export function setMeetings(newMeetings: Meeting[]) {
  meetings = newMeetings;
}

export function updateMeetingInList(updatedMeeting: Meeting) {
  const index = meetings.findIndex(m => m.id === updatedMeeting.id);
  if (index !== -1) {
    meetings[index] = updatedMeeting;
  }
}

export function addMeetingToList(meeting: Meeting) {
  meetings.unshift(meeting);
}

export function removeMeetingFromList(id: string) {
  meetings = meetings.filter(m => m.id !== id);
}

export function getCalendarEvents(): CalendarEventInstance[] {
  return calendarEvents;
}

export function setCalendarEvents(events: CalendarEventInstance[]) {
  calendarEvents = events;
}

export function setAppMode(mode: AppMode) {
  appMode = mode;
}

export function getAppMode(): AppMode {
  return appMode;
}

export function startAutoSave(callback: () => void) {
  stopAutoSave();
  autoSaveInterval = window.setInterval(() => {
    if (currentMeeting) {
      callback();
    }
  }, AUTO_SAVE_INTERVAL_MS);
}

export function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

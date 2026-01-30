export const NOTIFICATION_EXTRA_TYPE_CALENDAR_EVENT = "calendar-event";
export const NOTIFICATION_EXTRA_TYPE_MEETING = "meeting";

export interface CalendarEventNotificationExtra {
  type: typeof NOTIFICATION_EXTRA_TYPE_CALENDAR_EVENT;
  calendarEventId: string;
}

export interface MeetingNotificationExtra {
  type: typeof NOTIFICATION_EXTRA_TYPE_MEETING;
  meetingId: string;
}

export type NotificationExtra = CalendarEventNotificationExtra | MeetingNotificationExtra;

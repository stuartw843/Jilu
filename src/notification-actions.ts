import { onAction, type Options as TauriNotificationOptions } from "@tauri-apps/plugin-notification";
import {
  NOTIFICATION_EXTRA_TYPE_CALENDAR_EVENT,
  NOTIFICATION_EXTRA_TYPE_MEETING,
  type NotificationExtra,
} from "./notification-types";
import { createMeetingFromCalendarEvent, loadMeeting } from "./meeting-operations";
import { switchToMeetingsMode } from "./ui/tasks";

type ActionEventPayload = TauriNotificationOptions & { extra?: unknown };
type ActionCallbackPayload = ActionEventPayload | { notification?: ActionEventPayload; extra?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotificationExtra(value: unknown): value is NotificationExtra {
  if (!isRecord(value)) {
    return false;
  }

  const type = value.type;

  if (type === NOTIFICATION_EXTRA_TYPE_CALENDAR_EVENT) {
    return typeof value.calendarEventId === "string" && value.calendarEventId.length > 0;
  }

  if (type === NOTIFICATION_EXTRA_TYPE_MEETING) {
    return typeof value.meetingId === "string" && value.meetingId.length > 0;
  }

  return false;
}

function extractNotificationExtra(payload: unknown): NotificationExtra | null {
  if (!payload) {
    return null;
  }

  if (isNotificationExtra((payload as { extra?: unknown }).extra)) {
    return (payload as { extra: NotificationExtra }).extra;
  }

  if (
    isRecord(payload) &&
    "notification" in payload &&
    isNotificationExtra((payload.notification as { extra?: unknown }).extra)
  ) {
    return (payload.notification as { extra: NotificationExtra }).extra;
  }

  return null;
}

async function handleCalendarEventNotification(extra: NotificationExtra): Promise<void> {
  if (extra.type !== NOTIFICATION_EXTRA_TYPE_CALENDAR_EVENT) {
    return;
  }

  try {
    const meeting = await createMeetingFromCalendarEvent(extra.calendarEventId, { activate: true });
    if (meeting) {
      switchToMeetingsMode();
    }
  } catch (error) {
    console.error("Failed to handle calendar-event notification action:", error);
  }
}

async function handleMeetingNotification(extra: NotificationExtra): Promise<void> {
  if (extra.type !== NOTIFICATION_EXTRA_TYPE_MEETING) {
    return;
  }

  try {
    await loadMeeting(extra.meetingId);
    switchToMeetingsMode();
  } catch (error) {
    console.error("Failed to handle meeting notification action:", error);
  }
}

export async function initializeNotificationActionHandlers(): Promise<void> {
  try {
    await onAction(async (payload: ActionCallbackPayload) => {
      const extra = extractNotificationExtra(payload);
      if (!extra) {
        return;
      }

      if (extra.type === NOTIFICATION_EXTRA_TYPE_CALENDAR_EVENT) {
        await handleCalendarEventNotification(extra);
        return;
      }

      if (extra.type === NOTIFICATION_EXTRA_TYPE_MEETING) {
        await handleMeetingNotification(extra);
      }
    });
  } catch (error) {
    console.error("Failed to register notification action handler:", error);
  }
}

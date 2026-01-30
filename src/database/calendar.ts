/**
 * Calendar event database operations
 */

import type { CalendarEventInstance } from "../types";
import { CALENDAR_EVENTS_STORE } from "../constants";
import { dbCore } from "./core";

export async function saveCalendarEvent(event: CalendarEventInstance): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CALENDAR_EVENTS_STORE], 'readwrite');
    const store = transaction.objectStore(CALENDAR_EVENTS_STORE);
    const request = store.put(event);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function saveCalendarEvents(events: CalendarEventInstance[]): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CALENDAR_EVENTS_STORE], 'readwrite');
    const store = transaction.objectStore(CALENDAR_EVENTS_STORE);

    events.forEach(event => store.put(event));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteCalendarEventsNotIn(allowedIds: Set<string>): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CALENDAR_EVENTS_STORE], 'readwrite');
    const store = transaction.objectStore(CALENDAR_EVENTS_STORE);
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        if (!allowedIds.has(cursor.key as string)) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getCalendarEvent(id: string): Promise<CalendarEventInstance | null> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CALENDAR_EVENTS_STORE], 'readonly');
    const store = transaction.objectStore(CALENDAR_EVENTS_STORE);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllCalendarEvents(): Promise<CalendarEventInstance[]> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CALENDAR_EVENTS_STORE], 'readonly');
    const store = transaction.objectStore(CALENDAR_EVENTS_STORE);
    const index = store.index('startTime');
    const request = index.openCursor(null, 'next');
    const events: CalendarEventInstance[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        events.push(cursor.value as CalendarEventInstance);
        cursor.continue();
      } else {
        resolve(events);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getCalendarEventsBetween(start: Date, end: Date): Promise<CalendarEventInstance[]> {
  const all = await getAllCalendarEvents();
  const startMs = start.getTime();
  const endMs = end.getTime();
  return all.filter(event => {
    const eventStart = new Date(event.startTime).getTime();
    return eventStart >= startMs && eventStart <= endMs;
  });
}

export async function getUpcomingCalendarEvents(hoursAhead: number = 48): Promise<CalendarEventInstance[]> {
  const now = new Date();
  const future = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  return getCalendarEventsBetween(now, future);
}

/**
 * Meeting database operations
 */

import type { Meeting } from "../types";
import { STORE_NAME } from "../constants";
import { dbCore } from "./core";
import { transcriptTurnsToText } from "../utils";

export async function saveMeeting(meeting: Meeting): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(meeting);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllMeetings(): Promise<Meeting[]> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('updatedAt');
    const request = index.openCursor(null, 'prev');
    
    const meetings: Meeting[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        meetings.push(cursor.value);
        cursor.continue();
      } else {
        resolve(meetings);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function deleteMeeting(id: string): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteAllMeetings(): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function searchMeetings(
  query: string,
  options: { fullContent?: boolean } = {}
): Promise<Meeting[]> {
  const allMeetings = await getAllMeetings();
  const lowerQuery = query.toLowerCase();
  const { fullContent = false } = options;
  const includesQuery = (value?: string) =>
    typeof value === "string" && value.toLowerCase().includes(lowerQuery);

  return allMeetings.filter(meeting => {
    if (meeting.title.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    if (!fullContent) {
      return false;
    }

    const transcriptText = transcriptTurnsToText(meeting.transcript).toLowerCase();

    return (
      transcriptText.includes(lowerQuery) ||
      includesQuery(meeting.personalNotes) ||
      includesQuery(meeting.enhancedNotes) ||
      meeting.participants?.some(participant =>
        [participant.name, participant.email, participant.jobRole]
          .filter((value): value is string => Boolean(value))
          .some(value => value.toLowerCase().includes(lowerQuery))
      ) ||
      meeting.tags?.some(t => includesQuery(t))
    );
  });
}

export async function getMeetingsByTag(tag: string): Promise<Meeting[]> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('tags');
    const request = index.getAll(tag);

    request.onsuccess = () => {
      const meetings = request.result;
      meetings.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(meetings);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getMeetingsByTags(tags: string[]): Promise<Meeting[]> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (tags.length === 0) return getAllMeetings();

  const allMeetings = await getAllMeetings();
  
  const filteredMeetings = allMeetings.filter(meeting => {
    if (!meeting.tags || meeting.tags.length === 0) return false;
    return tags.some(tag => meeting.tags!.includes(tag));
  });

  return filteredMeetings;
}

export async function getMeetingsBySeries(seriesId: string): Promise<Meeting[]> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!seriesId) return [];

  const allMeetings = await getAllMeetings();
  return allMeetings.filter(meeting => meeting.calendarSeriesId === seriesId);
}

export async function getAllTags(): Promise<string[]> {
  const allMeetings = await getAllMeetings();
  const tagsSet = new Set<string>();
  
  allMeetings.forEach(meeting => {
    if (meeting.tags && meeting.tags.length > 0) {
      meeting.tags.forEach(tag => tagsSet.add(tag));
    }
  });

  return Array.from(tagsSet).sort();
}

export async function getMeetingByCalendarEventId(eventId: string): Promise<Meeting | null> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('calendarEventId');
    const request = index.get(eventId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getUpcomingMeetings(hoursAhead: number = 24): Promise<Meeting[]> {
  const allMeetings = await getAllMeetings();
  const now = new Date();
  const futureTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  return allMeetings
    .filter(meeting => {
      if (!meeting.startTime) return false;
      const startTime = new Date(meeting.startTime);
      return startTime > now && startTime <= futureTime;
    })
    .sort((a, b) => {
      const aTime = new Date(a.startTime!).getTime();
      const bTime = new Date(b.startTime!).getTime();
      return aTime - bTime;
    });
}

export async function getSyncedMeetings(): Promise<Meeting[]> {
  const allMeetings = await getAllMeetings();
  
  return allMeetings
    .filter(meeting => meeting.isSynced === true)
    .sort((a, b) => {
      if (!a.startTime || !b.startTime) return 0;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
}

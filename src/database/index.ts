/**
 * Database module - unified interface
 * Re-exports all database operations and provides compatibility layer
 */

import { dbCore } from "./core";
import { DB_VERSION, STORE_NAME, PEOPLE_STORE, CUSTOM_DICTIONARY_STORE, TASKS_STORE_NAME, CALENDAR_EVENTS_STORE } from "../constants";
import type { DatabaseExport } from "./serialization";
import {
  serializeMeeting,
  deserializeMeeting,
  serializePerson,
  deserializePerson,
  serializeCustomDictionaryEntry,
  deserializeCustomDictionaryEntry,
  serializeTask,
  deserializeTask,
  serializeCalendarEvent,
  deserializeCalendarEvent,
} from "./serialization";
import * as meetings from "./meetings";
import * as tasks from "./tasks";
import * as calendar from "./calendar";
import * as people from "./people";
import * as dictionary from "./dictionary";

// Re-export all operations
export * from "./meetings";
export * from "./tasks";
export * from "./calendar";
export * from "./people";
export * from "./dictionary";
export * from "./serialization";

// Re-export core
export { dbCore };

/**
 * DatabaseService class provides the unified interface matching the original database.ts API
 * This ensures backward compatibility with existing code
 */
class DatabaseService {
  async init(): Promise<void> {
    return dbCore.init();
  }

  // Import/Export operations
  async exportDatabase(): Promise<DatabaseExport> {
    const meetingsList = await meetings.getAllMeetings();
    const peopleList = dbCore.hasStore(PEOPLE_STORE) ? await people.getAllPeople() : [];
    const customDictionary = dbCore.hasStore(CUSTOM_DICTIONARY_STORE)
      ? await dictionary.getAllCustomDictionaryEntries()
      : [];
    const tasksList = dbCore.hasStore(TASKS_STORE_NAME) ? await tasks.getAllTasks() : [];
    const calendarEvents = dbCore.hasStore(CALENDAR_EVENTS_STORE)
      ? await calendar.getAllCalendarEvents()
      : [];
    
    return {
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      meetings: meetingsList.map(meeting => serializeMeeting(meeting)),
      people: peopleList.map(person => serializePerson(person)),
      customDictionary: customDictionary.map(entry => serializeCustomDictionaryEntry(entry)),
      tasks: tasksList.map(task => serializeTask(task)),
      calendarEvents: calendarEvents.map(event => serializeCalendarEvent(event)),
    };
  }

  async importDatabase(data: DatabaseExport): Promise<void> {
    const db = dbCore.getDatabase();
    if (!db) throw new Error('Database not initialized');

    if (!data || !Array.isArray(data.meetings)) {
      throw new Error('Invalid database export file: missing meetings array');
    }

    const meetingRecords = data.meetings.map(meeting => deserializeMeeting(meeting));
    const people = Array.isArray(data.people)
      ? data.people.map(person => deserializePerson(person))
      : null;
    const customDictionary = Array.isArray(data.customDictionary)
      ? data.customDictionary.map(entry => deserializeCustomDictionaryEntry(entry))
      : null;
    const tasksData = Array.isArray(data.tasks)
      ? data.tasks.map(task => deserializeTask(task))
      : null;
    const calendarEvents = Array.isArray(data.calendarEvents)
      ? data.calendarEvents.map(event => deserializeCalendarEvent(event))
      : null;

    // Import meetings
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      let hasSettled = false;

      const rejectOnce = (error: any) => {
        if (!hasSettled) {
          hasSettled = true;
          reject(error);
        }
      };

      const clearRequest = store.clear();
      clearRequest.onerror = () => rejectOnce(clearRequest.error);
      clearRequest.onsuccess = () => {
        meetingRecords.forEach(meeting => {
          const request = store.put(meeting);
          request.onerror = () => {
            transaction.abort();
            rejectOnce(request.error);
          };
        });
      };

      transaction.oncomplete = () => {
        if (!hasSettled) {
          hasSettled = true;
          resolve();
        }
      };
      transaction.onerror = () => rejectOnce(transaction.error || new Error("Transaction failed"));
      transaction.onabort = () => rejectOnce(transaction.error || new Error("Transaction aborted"));
    });

    // Import people
    if (people !== null && dbCore.hasStore(PEOPLE_STORE)) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([PEOPLE_STORE], 'readwrite');
        const store = transaction.objectStore(PEOPLE_STORE);
        let hasSettled = false;

        const rejectOnce = (error: any) => {
          if (!hasSettled) {
            hasSettled = true;
            reject(error);
          }
        };

        const clearRequest = store.clear();
        clearRequest.onerror = () => rejectOnce(clearRequest.error);
        clearRequest.onsuccess = () => {
          people.forEach(person => {
            const request = store.put(serializePerson(person));
            request.onerror = () => {
              transaction.abort();
              rejectOnce(request.error);
            };
          });
        };

        transaction.oncomplete = () => {
          if (!hasSettled) {
            hasSettled = true;
            resolve();
          }
        };
        transaction.onerror = () => rejectOnce(transaction.error || new Error("Transaction failed"));
        transaction.onabort = () => rejectOnce(transaction.error || new Error("Transaction aborted"));
      });
    } else if (people !== null) {
      console.warn('People store not available; skipping people import');
    }

    // Import tasks
    if (tasksData !== null && dbCore.hasStore(TASKS_STORE_NAME)) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([TASKS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(TASKS_STORE_NAME);
        let hasSettled = false;

        const rejectOnce = (error: any) => {
          if (!hasSettled) {
            hasSettled = true;
            reject(error);
          }
        };

        const clearRequest = store.clear();
        clearRequest.onerror = () => rejectOnce(clearRequest.error);
        clearRequest.onsuccess = () => {
          tasksData.forEach(task => {
            const request = store.put(task);
            request.onerror = () => {
              transaction.abort();
              rejectOnce(request.error);
            };
          });
        };

        transaction.oncomplete = () => {
          if (!hasSettled) {
            hasSettled = true;
            resolve();
          }
        };
        transaction.onerror = () => rejectOnce(transaction.error || new Error("Transaction failed"));
        transaction.onabort = () => rejectOnce(transaction.error || new Error("Transaction aborted"));
      });
    } else if (tasksData !== null) {
      console.warn('Tasks store not available; skipping tasks import');
    }

    // Import calendar events
    if (calendarEvents !== null && dbCore.hasStore(CALENDAR_EVENTS_STORE)) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([CALENDAR_EVENTS_STORE], 'readwrite');
        const store = transaction.objectStore(CALENDAR_EVENTS_STORE);
        let hasSettled = false;

        const rejectOnce = (error: any) => {
          if (!hasSettled) {
            hasSettled = true;
            reject(error);
          }
        };

        const clearRequest = store.clear();
        clearRequest.onerror = () => rejectOnce(clearRequest.error);
        clearRequest.onsuccess = () => {
          calendarEvents.forEach(event => {
            const request = store.put(event);
            request.onerror = () => {
              transaction.abort();
              rejectOnce(request.error);
            };
          });
        };

        transaction.oncomplete = () => {
          if (!hasSettled) {
            hasSettled = true;
            resolve();
          }
        };
        transaction.onerror = () => rejectOnce(transaction.error || new Error("Transaction failed"));
        transaction.onabort = () => rejectOnce(transaction.error || new Error("Transaction aborted"));
      });
    } else if (calendarEvents !== null) {
      console.warn('Calendar events store not available; skipping calendar import');
    }

    // Import custom dictionary
    if (customDictionary !== null && dbCore.hasStore(CUSTOM_DICTIONARY_STORE)) {
      await dictionary.clearCustomDictionary();
      await dictionary.saveCustomDictionaryEntries(customDictionary);
    } else if (customDictionary !== null) {
      console.warn('Custom dictionary store not available; skipping custom dictionary import');
    }
  }

  // Forward all other methods to the appropriate modules
  async saveMeeting(...args: Parameters<typeof meetings.saveMeeting>) {
    return meetings.saveMeeting(...args);
  }

  async getMeeting(...args: Parameters<typeof meetings.getMeeting>) {
    return meetings.getMeeting(...args);
  }

  async getAllMeetings(...args: Parameters<typeof meetings.getAllMeetings>) {
    return meetings.getAllMeetings(...args);
  }

  async deleteMeeting(...args: Parameters<typeof meetings.deleteMeeting>) {
    return meetings.deleteMeeting(...args);
  }

  async deleteAllMeetings(...args: Parameters<typeof meetings.deleteAllMeetings>) {
    return meetings.deleteAllMeetings(...args);
  }

  async searchMeetings(...args: Parameters<typeof meetings.searchMeetings>) {
    return meetings.searchMeetings(...args);
  }

  async getMeetingsByTag(...args: Parameters<typeof meetings.getMeetingsByTag>) {
    return meetings.getMeetingsByTag(...args);
  }

  async getMeetingsByTags(...args: Parameters<typeof meetings.getMeetingsByTags>) {
    return meetings.getMeetingsByTags(...args);
  }

  async getMeetingsBySeries(...args: Parameters<typeof meetings.getMeetingsBySeries>) {
    return meetings.getMeetingsBySeries(...args);
  }

  async getAllTags(...args: Parameters<typeof meetings.getAllTags>) {
    return meetings.getAllTags(...args);
  }

  async getMeetingByCalendarEventId(...args: Parameters<typeof meetings.getMeetingByCalendarEventId>) {
    return meetings.getMeetingByCalendarEventId(...args);
  }

  async getUpcomingMeetings(...args: Parameters<typeof meetings.getUpcomingMeetings>) {
    return meetings.getUpcomingMeetings(...args);
  }

  async getSyncedMeetings(...args: Parameters<typeof meetings.getSyncedMeetings>) {
    return meetings.getSyncedMeetings(...args);
  }

  async saveTask(...args: Parameters<typeof tasks.saveTask>) {
    return tasks.saveTask(...args);
  }

  async getTask(...args: Parameters<typeof tasks.getTask>) {
    return tasks.getTask(...args);
  }

  async getAllTasks(...args: Parameters<typeof tasks.getAllTasks>) {
    return tasks.getAllTasks(...args);
  }

  async getIncompleteTasks(...args: Parameters<typeof tasks.getIncompleteTasks>) {
    return tasks.getIncompleteTasks(...args);
  }

  async getCompletedTasks(...args: Parameters<typeof tasks.getCompletedTasks>) {
    return tasks.getCompletedTasks(...args);
  }

  async deleteTask(...args: Parameters<typeof tasks.deleteTask>) {
    return tasks.deleteTask(...args);
  }

  async updateTasksOrder(...args: Parameters<typeof tasks.updateTasksOrder>) {
    return tasks.updateTasksOrder(...args);
  }

  async saveCalendarEvent(...args: Parameters<typeof calendar.saveCalendarEvent>) {
    return calendar.saveCalendarEvent(...args);
  }

  async saveCalendarEvents(...args: Parameters<typeof calendar.saveCalendarEvents>) {
    return calendar.saveCalendarEvents(...args);
  }

  async deleteCalendarEventsNotIn(...args: Parameters<typeof calendar.deleteCalendarEventsNotIn>) {
    return calendar.deleteCalendarEventsNotIn(...args);
  }

  async getCalendarEvent(...args: Parameters<typeof calendar.getCalendarEvent>) {
    return calendar.getCalendarEvent(...args);
  }

  async getAllCalendarEvents(...args: Parameters<typeof calendar.getAllCalendarEvents>) {
    return calendar.getAllCalendarEvents(...args);
  }

  async getCalendarEventsBetween(...args: Parameters<typeof calendar.getCalendarEventsBetween>) {
    return calendar.getCalendarEventsBetween(...args);
  }

  async getUpcomingCalendarEvents(...args: Parameters<typeof calendar.getUpcomingCalendarEvents>) {
    return calendar.getUpcomingCalendarEvents(...args);
  }

  async savePerson(...args: Parameters<typeof people.savePerson>) {
    return people.savePerson(...args);
  }

  async getPerson(...args: Parameters<typeof people.getPerson>) {
    return people.getPerson(...args);
  }

  async getPeopleByEmails(...args: Parameters<typeof people.getPeopleByEmails>) {
    return people.getPeopleByEmails(...args);
  }

  async getAllPeople(...args: Parameters<typeof people.getAllPeople>) {
    return people.getAllPeople(...args);
  }

  async saveCustomDictionaryEntry(...args: Parameters<typeof dictionary.saveCustomDictionaryEntry>) {
    return dictionary.saveCustomDictionaryEntry(...args);
  }

  async saveCustomDictionaryEntries(...args: Parameters<typeof dictionary.saveCustomDictionaryEntries>) {
    return dictionary.saveCustomDictionaryEntries(...args);
  }

  async getCustomDictionaryEntry(...args: Parameters<typeof dictionary.getCustomDictionaryEntry>) {
    return dictionary.getCustomDictionaryEntry(...args);
  }

  async getCustomDictionaryEntryByContent(...args: Parameters<typeof dictionary.getCustomDictionaryEntryByContent>) {
    return dictionary.getCustomDictionaryEntryByContent(...args);
  }

  async getAllCustomDictionaryEntries(...args: Parameters<typeof dictionary.getAllCustomDictionaryEntries>) {
    return dictionary.getAllCustomDictionaryEntries(...args);
  }

  async deleteCustomDictionaryEntry(...args: Parameters<typeof dictionary.deleteCustomDictionaryEntry>) {
    return dictionary.deleteCustomDictionaryEntry(...args);
  }

  async clearCustomDictionary(...args: Parameters<typeof dictionary.clearCustomDictionary>) {
    return dictionary.clearCustomDictionary(...args);
  }

  async getCustomDictionaryCount(...args: Parameters<typeof dictionary.getCustomDictionaryCount>) {
    return dictionary.getCustomDictionaryCount(...args);
  }
}

export const db = new DatabaseService();
export type { DatabaseExport };

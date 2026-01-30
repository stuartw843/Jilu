/**
 * Core database initialization and management
 */

import {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  TASKS_STORE_NAME,
  CALENDAR_EVENTS_STORE,
  PEOPLE_STORE,
  CUSTOM_DICTIONARY_STORE,
} from "../constants";

export class DatabaseCore {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    try {
      this.db = await this.openDatabase(DB_VERSION);
    } catch (error: any) {
      if (error?.name === "VersionError") {
        console.warn(
          "IndexedDB version is newer than expected; opening existing database without upgrade. If you see issues, clear app data and restart.",
          error
        );
        this.db = await this.openDatabase();
      } else {
        throw error;
      }
    }
  }

  getDatabase(): IDBDatabase | null {
    return this.db;
  }

  hasStore(name: string): boolean {
    return Boolean(this.db && this.db.objectStoreNames.contains(name));
  }

  private openDatabase(version?: number): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      if (version === undefined) {
        return;
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;
        
        console.log(`Upgrading database from version ${oldVersion} to ${DB_VERSION}`);
        
        // Create meetings store if it doesn't exist (version 1)
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          console.log('Creating meetings store');
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('title', 'title', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        }

        // Create tasks store when upgrading to version 2
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(TASKS_STORE_NAME)) {
            console.log('Creating tasks store');
            const tasksStore = db.createObjectStore(TASKS_STORE_NAME, { keyPath: 'id' });
            tasksStore.createIndex('order', 'order', { unique: false });
            tasksStore.createIndex('isDone', 'isDone', { unique: false });
            tasksStore.createIndex('dueDate', 'dueDate', { unique: false });
            tasksStore.createIndex('createdAt', 'createdAt', { unique: false });
          }
        }

        // Add calendar indexes when upgrading to version 4
        if (oldVersion < 4) {
          console.log('Adding calendar indexes to meetings store');
          const transaction = (event.target as IDBOpenDBRequest).transaction!;
          const store = transaction.objectStore(STORE_NAME);
          
          // Add indexes for calendar fields
          if (!store.indexNames.contains('calendarEventId')) {
            store.createIndex('calendarEventId', 'calendarEventId', { unique: false });
          }
          if (!store.indexNames.contains('startTime')) {
            store.createIndex('startTime', 'startTime', { unique: false });
          }
          if (!store.indexNames.contains('isSynced')) {
            store.createIndex('isSynced', 'isSynced', { unique: false });
          }
        }

        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains(CALENDAR_EVENTS_STORE)) {
            console.log('Creating calendar events store');
            const calendarStore = db.createObjectStore(CALENDAR_EVENTS_STORE, { keyPath: 'id' });
            calendarStore.createIndex('startTime', 'startTime', { unique: false });
            calendarStore.createIndex('calendarId', 'calendarId', { unique: false });
          }
        }

        if (oldVersion < 8) {
          const transaction = (event.target as IDBOpenDBRequest).transaction!;
          const meetingsStore = transaction.objectStore(STORE_NAME);
          if (!meetingsStore.indexNames.contains('calendarSeriesId')) {
            meetingsStore.createIndex('calendarSeriesId', 'calendarSeriesId', { unique: false });
          }

          if (db.objectStoreNames.contains(CALENDAR_EVENTS_STORE)) {
            const calendarStore = transaction.objectStore(CALENDAR_EVENTS_STORE);
            if (!calendarStore.indexNames.contains('seriesId')) {
              calendarStore.createIndex('seriesId', 'seriesId', { unique: false });
            }
          }
        }

        if (oldVersion < 7 || !db.objectStoreNames.contains(PEOPLE_STORE)) {
          if (!db.objectStoreNames.contains(PEOPLE_STORE)) {
            console.log('Creating people store');
            const peopleStore = db.createObjectStore(PEOPLE_STORE, { keyPath: 'email' });
            peopleStore.createIndex('name', 'name', { unique: false });
            peopleStore.createIndex('jobRole', 'jobRole', { unique: false });
          }
        }

        if (oldVersion < 10 || !db.objectStoreNames.contains(CUSTOM_DICTIONARY_STORE)) {
          if (!db.objectStoreNames.contains(CUSTOM_DICTIONARY_STORE)) {
            console.log('Creating custom dictionary store');
            const dictionaryStore = db.createObjectStore(CUSTOM_DICTIONARY_STORE, { keyPath: 'id' });
            dictionaryStore.createIndex('normalizedContent', 'normalizedContent', { unique: true });
            dictionaryStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        }
      };
    });
  }
}

export const dbCore = new DatabaseCore();

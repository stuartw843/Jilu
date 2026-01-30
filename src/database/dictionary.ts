/**
 * Custom dictionary database operations
 */

import type { CustomDictionaryEntry } from "../types";
import { CUSTOM_DICTIONARY_STORE } from "../constants";
import { dbCore } from "./core";
import { normalizeDictionaryContent } from "../utils/text";
import {
  serializeCustomDictionaryEntry,
  deserializeCustomDictionaryEntry,
  type SerializedCustomDictionaryEntry,
} from "./serialization";

export async function saveCustomDictionaryEntry(entry: CustomDictionaryEntry): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!dbCore.hasStore(CUSTOM_DICTIONARY_STORE)) throw new Error('Custom dictionary store not initialized');

  const record = serializeCustomDictionaryEntry(entry);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CUSTOM_DICTIONARY_STORE], 'readwrite');
    const store = transaction.objectStore(CUSTOM_DICTIONARY_STORE);
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function saveCustomDictionaryEntries(entries: CustomDictionaryEntry[]): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!dbCore.hasStore(CUSTOM_DICTIONARY_STORE)) throw new Error('Custom dictionary store not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CUSTOM_DICTIONARY_STORE], 'readwrite');
    const store = transaction.objectStore(CUSTOM_DICTIONARY_STORE);

    entries.forEach(entry => {
      const request = store.put(serializeCustomDictionaryEntry(entry));
      request.onerror = () => {
        transaction.abort();
      };
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Custom dictionary import aborted"));
  });
}

export async function getCustomDictionaryEntry(id: string): Promise<CustomDictionaryEntry | null> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!dbCore.hasStore(CUSTOM_DICTIONARY_STORE)) return null;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CUSTOM_DICTIONARY_STORE], 'readonly');
    const store = transaction.objectStore(CUSTOM_DICTIONARY_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      const result = request.result as SerializedCustomDictionaryEntry | undefined;
      resolve(result ? deserializeCustomDictionaryEntry(result) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getCustomDictionaryEntryByContent(content: string): Promise<CustomDictionaryEntry | null> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!dbCore.hasStore(CUSTOM_DICTIONARY_STORE)) return null;

  const normalized = normalizeDictionaryContent(content);
  if (!normalized) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CUSTOM_DICTIONARY_STORE], 'readonly');
    const store = transaction.objectStore(CUSTOM_DICTIONARY_STORE);
    const index = store.index('normalizedContent');
    const request = index.get(normalized);

    request.onsuccess = () => {
      const result = request.result as SerializedCustomDictionaryEntry | undefined;
      resolve(result ? deserializeCustomDictionaryEntry(result) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getAllCustomDictionaryEntries(): Promise<CustomDictionaryEntry[]> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!dbCore.hasStore(CUSTOM_DICTIONARY_STORE)) return [];

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CUSTOM_DICTIONARY_STORE], 'readonly');
    const store = transaction.objectStore(CUSTOM_DICTIONARY_STORE);
    const index = store.index('updatedAt');
    const request = index.openCursor(null, 'prev');
    const entries: CustomDictionaryEntry[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        entries.push(deserializeCustomDictionaryEntry(cursor.value as SerializedCustomDictionaryEntry));
        cursor.continue();
      } else {
        resolve(entries);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function deleteCustomDictionaryEntry(id: string): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!dbCore.hasStore(CUSTOM_DICTIONARY_STORE)) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CUSTOM_DICTIONARY_STORE], 'readwrite');
    const store = transaction.objectStore(CUSTOM_DICTIONARY_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearCustomDictionary(): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!dbCore.hasStore(CUSTOM_DICTIONARY_STORE)) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CUSTOM_DICTIONARY_STORE], 'readwrite');
    const store = transaction.objectStore(CUSTOM_DICTIONARY_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getCustomDictionaryCount(): Promise<number> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!dbCore.hasStore(CUSTOM_DICTIONARY_STORE)) return 0;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CUSTOM_DICTIONARY_STORE], 'readonly');
    const store = transaction.objectStore(CUSTOM_DICTIONARY_STORE);
    const request = store.count();

    request.onsuccess = () => resolve(request.result ?? 0);
    request.onerror = () => reject(request.error);
  });
}

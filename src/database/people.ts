/**
 * People database operations
 */

import type { Person } from "../types";
import { PEOPLE_STORE } from "../constants";
import { dbCore } from "./core";
import { normalizeEmail } from "../utils";
import {
  serializePerson,
  deserializePerson,
  normalizeEmailKey,
  type SerializedPerson,
} from "./serialization";

export async function savePerson(person: Person): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!dbCore.hasStore(PEOPLE_STORE)) {
    console.warn('People store is not available; skipping savePerson');
    return;
  }

  const normalizedEmail = normalizeEmailKey(person.email);
  const record = serializePerson({ ...person, email: normalizedEmail });

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PEOPLE_STORE], 'readwrite');
    const store = transaction.objectStore(PEOPLE_STORE);
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getPerson(email: string): Promise<Person | null> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!dbCore.hasStore(PEOPLE_STORE)) {
    return null;
  }
  const normalizedEmail = normalizeEmailKey(email);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PEOPLE_STORE], 'readonly');
    const store = transaction.objectStore(PEOPLE_STORE);
    const request = store.get(normalizedEmail);

    request.onsuccess = () => {
      const result = request.result as SerializedPerson | undefined;
      resolve(result ? deserializePerson(result) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getPeopleByEmails(emails: string[]): Promise<Person[]> {
  const normalized = Array.from(
    new Set(
      emails
        .map(email => normalizeEmail(email))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (!dbCore.hasStore(PEOPLE_STORE)) {
    return [];
  }

  const people = await Promise.all(normalized.map(email => getPerson(email)));
  return people.filter((person): person is Person => Boolean(person));
}

export async function getAllPeople(): Promise<Person[]> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');
  if (!dbCore.hasStore(PEOPLE_STORE)) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PEOPLE_STORE], 'readonly');
    const store = transaction.objectStore(PEOPLE_STORE);
    const request = store.openCursor();
    const people: Person[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        people.push(deserializePerson(cursor.value as SerializedPerson));
        cursor.continue();
      } else {
        resolve(people);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

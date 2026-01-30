/**
 * Task database operations
 */

import type { Task } from "../types";
import { TASKS_STORE_NAME } from "../constants";
import { dbCore } from "./core";

export async function saveTask(task: Task): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TASKS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(TASKS_STORE_NAME);
    const request = store.put(task);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getTask(id: string): Promise<Task | null> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TASKS_STORE_NAME], 'readonly');
    const store = transaction.objectStore(TASKS_STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllTasks(): Promise<Task[]> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TASKS_STORE_NAME], 'readonly');
    const store = transaction.objectStore(TASKS_STORE_NAME);
    const index = store.index('order');
    const request = index.openCursor(null, 'next');
    
    const tasks: Task[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        tasks.push(cursor.value);
        cursor.continue();
      } else {
        resolve(tasks);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getIncompleteTasks(): Promise<Task[]> {
  const allTasks = await getAllTasks();
  return allTasks.filter(task => !task.isDone);
}

export async function getCompletedTasks(): Promise<Task[]> {
  const allTasks = await getAllTasks();
  return allTasks
    .filter(task => task.isDone)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function deleteTask(id: string): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TASKS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(TASKS_STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateTasksOrder(tasks: Task[]): Promise<void> {
  const db = dbCore.getDatabase();
  if (!db) throw new Error('Database not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TASKS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(TASKS_STORE_NAME);

    tasks.forEach(task => {
      const request = store.put(task);
      request.onerror = () => {
        transaction.abort();
        reject(request.error);
      };
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

import { Task, TaskFilter } from "./types";
import { db } from "./database";
import { emit } from "@tauri-apps/api/event";

let currentTasks: Task[] = [];
let completedTasks: Task[] = [];
let currentFilter: TaskFilter = 'all';
let showingCompleted: boolean = false;

export async function loadTasks(): Promise<void> {
  currentTasks = await db.getIncompleteTasks();
  completedTasks = await db.getCompletedTasks();
}

export function getTasks(): Task[] {
  return showingCompleted ? completedTasks : currentTasks;
}

export function getCompletedTasks(): Task[] {
  return completedTasks;
}

export function isShowingCompleted(): boolean {
  return showingCompleted;
}

export function setShowingCompleted(value: boolean): void {
  showingCompleted = value;
}

export function getCurrentFilter(): TaskFilter {
  return currentFilter;
}

export function setCurrentFilter(filter: TaskFilter): void {
  currentFilter = filter;
}

export function getFilteredTasks(): Task[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const weekFromNow = new Date(now);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  switch (currentFilter) {
    case 'today':
      return currentTasks.filter(task => {
        if (!task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate.getTime() === now.getTime();
      });
    
    case 'week':
      return currentTasks.filter(task => {
        if (!task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate >= now && dueDate < weekFromNow;
      });
    
    case 'overdue':
      return currentTasks.filter(task => {
        if (!task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < now;
      });
    
    case 'all':
    default:
      return currentTasks;
  }
}

export async function createTask(title: string, dueDate: Date | null = null): Promise<Task> {
  const now = new Date();
  
  // Get the highest order value and add 1
  const maxOrder = currentTasks.reduce((max, task) => Math.max(max, task.order), 0);
  
  const task: Task = {
    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    dueDate,
    isDone: false,
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  };

  await db.saveTask(task);
  currentTasks.push(task);
  
  // Notify other windows
  await emit("tasks-updated", {});
  
  return task;
}

export async function updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
  const taskIndex = currentTasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  const task = currentTasks[taskIndex];
  const updatedTask = {
    ...task,
    ...updates,
    updatedAt: new Date(),
  };

  await db.saveTask(updatedTask);
  currentTasks[taskIndex] = updatedTask;
  
  // Notify other windows
  await emit("tasks-updated", {});
}

export async function deleteTask(taskId: string): Promise<void> {
  await db.deleteTask(taskId);
  currentTasks = currentTasks.filter(t => t.id !== taskId);
  
  // Notify other windows
  await emit("tasks-updated", {});
}

export async function toggleTaskDone(taskId: string): Promise<void> {
  // Check if task is in incomplete list
  let task = currentTasks.find(t => t.id === taskId);
  
  if (!task) {
    // Check if task is in completed list
    task = completedTasks.find(t => t.id === taskId);
  }
  
  if (!task) return;

  // Toggle the isDone status
  task.isDone = !task.isDone;
  task.updatedAt = new Date();
  
  await db.saveTask(task);
  
  if (task.isDone) {
    // Move from incomplete to completed
    currentTasks = currentTasks.filter(t => t.id !== taskId);
    completedTasks.unshift(task); // Add to beginning (most recent first)
  } else {
    // Move from completed to incomplete
    completedTasks = completedTasks.filter(t => t.id !== taskId);
    currentTasks.push(task);
    // Re-sort by order
    currentTasks.sort((a, b) => a.order - b.order);
  }
  
  // Notify other windows
  await emit("tasks-updated", {});
}

// Keep the old function name for backward compatibility, but use the new toggle
export async function markTaskDone(taskId: string): Promise<void> {
  await toggleTaskDone(taskId);
}

export async function reorderTasks(reorderedTasks: Task[]): Promise<void> {
  // Update order values
  const tasksToUpdate = reorderedTasks.map((task, index) => ({
    ...task,
    order: index,
    updatedAt: new Date(),
  }));

  // Update in database
  await db.updateTasksOrder(tasksToUpdate);
  
  // Update local state
  currentTasks = tasksToUpdate;
  
  // Notify other windows
  await emit("tasks-updated", {});
}

export function isToday(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate.getTime() === today.getTime();
}

export function isOverdue(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate < today;
}

export function formatDate(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  if (checkDate.getTime() === today.getTime()) {
    return 'Today';
  }
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (checkDate.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (checkDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }
  
  // Format as "Mon, Jan 20"
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  };
  return checkDate.toLocaleDateString('en-US', options);
}

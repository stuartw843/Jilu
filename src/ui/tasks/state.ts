import Sortable from "sortablejs";

let currentEditingTaskId: string | null = null;
let sortableInstance: Sortable | null = null;
let newTaskDueDate: Date | null = null;

export function getCurrentEditingTaskId(): string | null {
  return currentEditingTaskId;
}

export function setCurrentEditingTaskId(taskId: string | null): void {
  currentEditingTaskId = taskId;
}

export function getSortableInstance(): Sortable | null {
  return sortableInstance;
}

export function setSortableInstance(instance: Sortable | null): void {
  sortableInstance = instance;
}

export function getNewTaskDueDate(): Date | null {
  return newTaskDueDate;
}

export function setNewTaskDueDate(date: Date | null): void {
  newTaskDueDate = date;
}

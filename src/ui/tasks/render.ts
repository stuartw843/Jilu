import {
  getFilteredTasks,
  getTasks,
  getCurrentFilter,
  isShowingCompleted,
  getCompletedTasks,
  toggleTaskDone,
  deleteTask,
  formatDate,
  isOverdue,
  isToday,
} from "../../tasks";
import type { Task } from "../../types";
import { setupSortable } from "./sortable";
import { showTaskDatePicker } from "./date-picker";
import { saveTitleEdit } from "./actions";
import { getCurrentEditingTaskId, setCurrentEditingTaskId } from "./state";
import { getCalendarIcon } from "../../icons";
import { escapeHtml } from "../../utils/html";

export function renderTasks(): void {
  const tasksList = document.getElementById("tasks-list");
  const tasksCount = document.getElementById("tasks-count");

  if (!tasksList) return;

  const tasksToShow = isShowingCompleted() ? getCompletedTasks() : getFilteredTasks();

  if (tasksCount) {
    if (isShowingCompleted()) {
      tasksCount.textContent = `${tasksToShow.length} completed ${tasksToShow.length === 1 ? "task" : "tasks"}`;
    } else {
      const allTasks = getTasks();
      const overdueCount = allTasks.filter((t) => t.dueDate && isOverdue(new Date(t.dueDate))).length;

      if (overdueCount > 0) {
        tasksCount.textContent = `${tasksToShow.length} tasks, ${overdueCount} overdue`;
      } else {
        tasksCount.textContent = `${tasksToShow.length} ${tasksToShow.length === 1 ? "task" : "tasks"}`;
      }
    }
  }

  if (tasksToShow.length === 0) {
    const emptyMessage = isShowingCompleted()
      ? "No completed tasks yet"
      : getCurrentFilter() === "all"
        ? "Add your first task to get started"
        : "No tasks match this filter";

    tasksList.innerHTML = `
      <div class="empty-state">
        <p>No tasks here! 🎉</p>
        <p class="small-text">${emptyMessage}</p>
      </div>
    `;
    return;
  }

  tasksList.innerHTML = tasksToShow.map((task) => renderTaskItem(task)).join("");

  tasksToShow.forEach((task) => {
    setupTaskItemListeners(task.id);
  });

  if (!isShowingCompleted()) {
    setupSortable();
  }
}

function renderTaskItem(task: Task): string {
  const dueDateClass = task.dueDate
    ? isOverdue(new Date(task.dueDate))
      ? "overdue"
      : isToday(new Date(task.dueDate))
        ? "today"
        : ""
    : "";

  const dueDateDisplay = task.dueDate
    ? `<span class="task-due-date ${dueDateClass}" data-task-id="${task.id}">
         ${getCalendarIcon(16)} ${formatDate(new Date(task.dueDate))}
       </span>`
    : `<span class="task-due-date" data-task-id="${task.id}">
         ${getCalendarIcon(16)} Add date
       </span>`;

  return `
    <div class="task-item" data-task-id="${task.id}">
      <span class="task-drag-handle">⋮⋮</span>
      <input 
        type="checkbox" 
        class="task-checkbox" 
        data-task-id="${task.id}"
        ${task.isDone ? "checked" : ""}
      />
      <div class="task-content">
        <div 
          class="task-title" 
          contenteditable="false"
          data-task-id="${task.id}"
        >${escapeHtml(task.title)}</div>
        ${dueDateDisplay}
      </div>
      <div class="task-actions">
        <button class="task-action-btn task-delete-btn" data-task-id="${task.id}" title="Delete task">×</button>
      </div>
    </div>
  `;
}

function setupTaskItemListeners(taskId: string): void {
  const checkbox = document.querySelector(`.task-checkbox[data-task-id="${taskId}"]`) as HTMLInputElement | null;
  checkbox?.addEventListener("change", async () => {
    await toggleTaskDone(taskId);
    renderTasks();
  });

  const title = document.querySelector(`.task-title[data-task-id="${taskId}"]`) as HTMLElement | null;
  title?.addEventListener("click", () => {
    const currentEditingTaskId = getCurrentEditingTaskId();
    if (currentEditingTaskId && currentEditingTaskId !== taskId) {
      void saveTitleEdit(currentEditingTaskId);
    }

    if (title) {
      title.contentEditable = "true";
      title.classList.add("editing");
      title.focus();
      setCurrentEditingTaskId(taskId);

      const range = document.createRange();
      range.selectNodeContents(title);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  });

  title?.addEventListener("blur", () => {
    void saveTitleEdit(taskId);
  });

  title?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void saveTitleEdit(taskId);
      title.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      renderTasks();
    }
  });

  const dueDate = document.querySelector(`.task-due-date[data-task-id="${taskId}"]`) as HTMLElement | null;
  dueDate?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!dueDate) return;
    showTaskDatePicker(taskId, dueDate, async () => {
      renderTasks();
    });
  });

  const deleteBtn = document.querySelector(`.task-delete-btn[data-task-id="${taskId}"]`) as HTMLElement | null;
  deleteBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    await deleteTask(taskId);
    renderTasks();
  });
}

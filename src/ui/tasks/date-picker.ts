import { isOverdue, isToday, formatDate } from "../../tasks";
import { updateTask } from "../../tasks";
import { getNewTaskDueDate, setNewTaskDueDate } from "./state";
import { getCalendarIcon } from "../../icons";

const DATE_PICKER_MARGIN = 16;
const DATE_PICKER_ANCHOR_SPACING = 4;

export function positionDatePickerPopup(popup: HTMLElement, anchorRect: DOMRect): void {
  popup.style.position = "fixed";

  let top = anchorRect.bottom + DATE_PICKER_ANCHOR_SPACING;
  let left = anchorRect.left;

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  const popupRect = popup.getBoundingClientRect();

  const minLeft = DATE_PICKER_MARGIN;
  const maxLeft = window.innerWidth - popupRect.width - DATE_PICKER_MARGIN;

  if (maxLeft >= minLeft) {
    if (left < minLeft) {
      left = minLeft;
    }
    if (left > maxLeft) {
      left = maxLeft;
    }
  } else {
    left = Math.max(0, window.innerWidth - popupRect.width);
  }

  const minTop = DATE_PICKER_MARGIN;
  const maxTop = window.innerHeight - popupRect.height - DATE_PICKER_MARGIN;

  if (maxTop >= minTop) {
    if (top > maxTop) {
      const aboveTop = anchorRect.top - popupRect.height - DATE_PICKER_ANCHOR_SPACING;
      top = aboveTop >= minTop ? aboveTop : maxTop;
    }
    if (top < minTop) {
      top = minTop;
    }
  } else {
    top = Math.max(0, window.innerHeight - popupRect.height);
  }

  if (top < 0) {
    top = 0;
  }
  if (left < 0) {
    left = 0;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function updateAddTaskDueDateButton(): void {
  const addTaskDateBtn = document.getElementById("add-task-date-btn") as HTMLButtonElement | null;
  if (!addTaskDateBtn) {
    return;
  }

  const date = getNewTaskDueDate();

  addTaskDateBtn.classList.remove("today", "overdue");

  if (date) {
    addTaskDateBtn.innerHTML = `${getCalendarIcon(16)} ${formatDate(date)}`;
    if (isToday(date)) {
      addTaskDateBtn.classList.add("today");
    } else if (isOverdue(date)) {
      addTaskDateBtn.classList.add("overdue");
    }
  } else {
    addTaskDateBtn.innerHTML = `${getCalendarIcon(16)} Add due date`;
  }
}

export function showAddTaskDatePicker(anchorElement: HTMLElement, onDateChange: () => void): void {
  const existing = document.querySelector(".date-picker-popup");
  if (existing) {
    existing.remove();
  }

  const popup = document.createElement("div");
  popup.className = "date-picker-popup";

  const initialDate = getNewTaskDueDate() ?? new Date();
  const initialValue = formatDateForInput(initialDate);

  popup.innerHTML = `
    <input type="date" id="task-date-input" value="${initialValue}" />
    <div class="date-shortcuts">
      <button class="date-shortcut-btn" data-days="0">Today</button>
      <button class="date-shortcut-btn" data-days="1">Tomorrow</button>
      <button class="date-shortcut-btn" data-days="7">Next week</button>
      <button class="date-shortcut-btn" data-days="-1">Clear date</button>
    </div>
  `;

  const rect = anchorElement.getBoundingClientRect();
  document.body.appendChild(popup);
  positionDatePickerPopup(popup, rect);

  const dateInput = popup.querySelector("#task-date-input") as HTMLInputElement;
  dateInput.addEventListener("change", () => {
    if (dateInput.value) {
      setNewTaskDueDate(new Date(dateInput.value));
    } else {
      setNewTaskDueDate(null);
    }
    onDateChange();
  });

  const shortcuts = popup.querySelectorAll(".date-shortcut-btn");
  shortcuts.forEach((btn) => {
    btn.addEventListener("click", () => {
      const days = parseInt(btn.getAttribute("data-days") || "0", 10);

      if (days === -1) {
        setNewTaskDueDate(null);
      } else {
        const date = new Date();
        date.setDate(date.getDate() + days);
        setNewTaskDueDate(date);
      }

      onDateChange();
      popup.remove();
    });
  });

  const closeListener = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node) && e.target !== anchorElement) {
      popup.remove();
      document.removeEventListener("click", closeListener);
    }
  };

  setTimeout(() => {
    document.addEventListener("click", closeListener);
  }, 10);
}

export function showTaskDatePicker(
  taskId: string,
  anchorElement: HTMLElement,
  onUpdated: () => Promise<void>
): void {
  const existing = document.querySelector(".date-picker-popup");
  if (existing) {
    existing.remove();
  }

  const popup = document.createElement("div");
  popup.className = "date-picker-popup";

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  popup.innerHTML = `
    <input type="date" id="task-date-input" value="${todayStr}" />
    <div class="date-shortcuts">
      <button class="date-shortcut-btn" data-days="0">Today</button>
      <button class="date-shortcut-btn" data-days="1">Tomorrow</button>
      <button class="date-shortcut-btn" data-days="7">Next week</button>
      <button class="date-shortcut-btn" data-days="-1">Clear date</button>
    </div>
  `;

  const rect = anchorElement.getBoundingClientRect();
  document.body.appendChild(popup);
  positionDatePickerPopup(popup, rect);

  const dateInput = popup.querySelector("#task-date-input") as HTMLInputElement;
  dateInput.addEventListener("change", async () => {
    const dateValue = dateInput.value ? new Date(dateInput.value) : null;
    await updateTask(taskId, { dueDate: dateValue });
    await onUpdated();
    popup.remove();
  });

  const shortcuts = popup.querySelectorAll(".date-shortcut-btn");
  shortcuts.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const days = parseInt(btn.getAttribute("data-days") || "0", 10);

      if (days === -1) {
        await updateTask(taskId, { dueDate: null });
      } else {
        const date = new Date();
        date.setDate(date.getDate() + days);
        await updateTask(taskId, { dueDate: date });
      }

      await onUpdated();
      popup.remove();
    });
  });

  const closeListener = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node) && e.target !== anchorElement) {
      popup.remove();
      document.removeEventListener("click", closeListener);
    }
  };

  setTimeout(() => {
    document.addEventListener("click", closeListener);
  }, 10);
}

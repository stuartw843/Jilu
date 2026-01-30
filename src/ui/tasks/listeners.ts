import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { TaskFilter } from "../../types";
import {
  setCurrentFilter,
  setShowingCompleted,
  isShowingCompleted,
} from "../../tasks";
import { handleAddTask } from "./actions";
import { renderTasks } from "./render";
import { showAddTaskDatePicker, updateAddTaskDueDateButton } from "./date-picker";
import { switchToTasksMode, switchToMeetingsMode, switchToCalendarMode } from "./mode";

export function setupTasksListeners(): void {
  const addTaskInput = document.getElementById("add-task-input") as HTMLInputElement | null;
  const addTaskDateBtn = document.getElementById("add-task-date-btn") as HTMLButtonElement | null;
  const addTaskButton = document.getElementById("add-task-btn") as HTMLButtonElement | null;
  const filterButtons = document.querySelectorAll(".task-filter-btn");
  const toggleCompletedBtn = document.getElementById("toggle-completed-btn");
  const popOutBtn = document.getElementById("pop-out-tasks-btn");

  popOutBtn?.addEventListener("click", async () => {
    try {
      const webview = new WebviewWindow(`tasks-window-${Date.now()}`, {
        title: "Tasks",
        width: 500,
        height: 700,
        resizable: true,
        center: true,
        url: "index.html?popout=tasks",
      });

      webview.once("tauri://error", (error) => {
        console.error("Error creating tasks window:", error);
      });
    } catch (error) {
      console.error("Failed to create tasks window:", error);
    }
  });

  const submitNewTask = async () => {
    if (!addTaskInput) return;
    const title = addTaskInput.value.trim();
    if (!title) {
      addTaskInput.focus();
      return;
    }

    await handleAddTask(title);
    addTaskInput.value = "";
    renderTasks();
  };

  addTaskInput?.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
      await submitNewTask();
    }
  });

  addTaskButton?.addEventListener("click", () => {
    void submitNewTask();
  });

  addTaskDateBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (addTaskDateBtn) {
      showAddTaskDatePicker(addTaskDateBtn, updateAddTaskDueDateButton);
    }
  });

  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const filter = btn.getAttribute("data-filter") as TaskFilter | null;
      if (filter) {
        setCurrentFilter(filter);

        filterButtons.forEach((b) => {
          if (b.getAttribute("data-filter")) {
            b.classList.remove("active");
          }
        });
        btn.classList.add("active");

        renderTasks();
      }
    });
  });

  toggleCompletedBtn?.addEventListener("click", () => {
    const nowShowingCompleted = !isShowingCompleted();
    setShowingCompleted(nowShowingCompleted);

    if (nowShowingCompleted) {
      toggleCompletedBtn.classList.add("active");
      toggleCompletedBtn.textContent = "← Back to Tasks";
    } else {
      toggleCompletedBtn.classList.remove("active");
      toggleCompletedBtn.textContent = "✓ Completed";
    }

    const filterBtns = document.querySelectorAll(".task-filter-btn[data-filter]") as NodeListOf<HTMLElement>;
    filterBtns.forEach((btn) => {
      btn.style.display = nowShowingCompleted ? "none" : "block";
    });

    const addTaskSection = document.querySelector(".add-task-section") as HTMLElement | null;
    if (addTaskSection) {
      addTaskSection.style.display = nowShowingCompleted ? "none" : "block";
    }

    renderTasks();
  });

  updateAddTaskDueDateButton();
}

export function setupModeToggleListeners(): void {
  const tasksModeBtn = document.getElementById("tasks-mode-btn");
  const meetingsModeBtn = document.getElementById("meetings-mode-btn");
  const calendarModeBtn = document.getElementById("calendar-mode-btn");

  tasksModeBtn?.addEventListener("click", () => {
    switchToTasksMode();
    renderTasks();
  });

  meetingsModeBtn?.addEventListener("click", () => {
    switchToMeetingsMode();
  });

  calendarModeBtn?.addEventListener("click", () => {
    switchToCalendarMode();
  });
}

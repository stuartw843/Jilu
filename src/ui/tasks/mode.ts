import type { AppMode } from "../../types";

export function switchToTasksMode(): void {
  const tasksContainer = document.getElementById("tasks-container");
  const meetingsContainer = document.getElementById("meetings-container");
  const calendarContainer = document.getElementById("calendar-container");
  const tasksModeBtn = document.getElementById("tasks-mode-btn");
  const meetingsModeBtn = document.getElementById("meetings-mode-btn");
  const calendarModeBtn = document.getElementById("calendar-mode-btn");

  tasksContainer?.classList.add("active");
  meetingsContainer?.classList.remove("active");
  calendarContainer?.classList.remove("active");
  tasksModeBtn?.classList.add("active");
  meetingsModeBtn?.classList.remove("active");
  calendarModeBtn?.classList.remove("active");

  const addTaskInput = document.getElementById("add-task-input") as HTMLInputElement | null;
  if (addTaskInput) {
    setTimeout(() => addTaskInput.focus(), 100);
  }

  localStorage.setItem("app_mode", "tasks");
}

export function switchToMeetingsMode(): void {
  const tasksContainer = document.getElementById("tasks-container");
  const meetingsContainer = document.getElementById("meetings-container");
  const calendarContainer = document.getElementById("calendar-container");
  const tasksModeBtn = document.getElementById("tasks-mode-btn");
  const meetingsModeBtn = document.getElementById("meetings-mode-btn");
  const calendarModeBtn = document.getElementById("calendar-mode-btn");

  tasksContainer?.classList.remove("active");
  meetingsContainer?.classList.add("active");
  calendarContainer?.classList.remove("active");
  tasksModeBtn?.classList.remove("active");
  meetingsModeBtn?.classList.add("active");
  calendarModeBtn?.classList.remove("active");

  localStorage.setItem("app_mode", "meetings");
}

export function switchToCalendarMode(): void {
  const tasksContainer = document.getElementById("tasks-container");
  const meetingsContainer = document.getElementById("meetings-container");
  const calendarContainer = document.getElementById("calendar-container");
  const tasksModeBtn = document.getElementById("tasks-mode-btn");
  const meetingsModeBtn = document.getElementById("meetings-mode-btn");
  const calendarModeBtn = document.getElementById("calendar-mode-btn");

  tasksContainer?.classList.remove("active");
  meetingsContainer?.classList.remove("active");
  calendarContainer?.classList.add("active");
  tasksModeBtn?.classList.remove("active");
  meetingsModeBtn?.classList.remove("active");
  calendarModeBtn?.classList.add("active");

  localStorage.setItem("app_mode", "calendar");
}

export function restoreAppMode(): void {
  const urlParams = new URLSearchParams(window.location.search);
  const isPopout = urlParams.get("popout") === "tasks";

  if (isPopout) {
    const modeToggleHeader = document.querySelector(".mode-toggle-header") as HTMLElement | null;
    if (modeToggleHeader) {
      modeToggleHeader.style.display = "none";
    }

    const popOutBtn = document.getElementById("pop-out-tasks-btn");
    if (popOutBtn) {
      popOutBtn.style.display = "none";
    }

    const meetingsContainer = document.getElementById("meetings-container");
    if (meetingsContainer) {
      meetingsContainer.style.display = "none";
    }
    const calendarContainer = document.getElementById("calendar-container");
    if (calendarContainer) {
      calendarContainer.style.display = "none";
    }

    switchToTasksMode();
    return;
  }

  const savedMode = localStorage.getItem("app_mode") as AppMode | null;

  if (savedMode === "tasks") {
    switchToTasksMode();
  } else if (savedMode === "calendar") {
    switchToCalendarMode();
  } else {
    switchToMeetingsMode();
  }
}

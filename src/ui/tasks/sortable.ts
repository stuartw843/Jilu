import Sortable from "sortablejs";
import { getFilteredTasks, reorderTasks } from "../../tasks";
import type { Task } from "../../types";
import { getSortableInstance, setSortableInstance } from "./state";

export function setupSortable(): void {
  const tasksList = document.getElementById("tasks-list");
  if (!tasksList) return;

  const existing = getSortableInstance();
  if (existing) {
    existing.destroy();
    setSortableInstance(null);
  }

  const sortable = new Sortable(tasksList, {
    animation: 150,
    handle: ".task-drag-handle",
    ghostClass: "task-item-ghost",
    dragClass: "task-item-dragging",
    chosenClass: "task-item-chosen",
    forceFallback: true,
    fallbackClass: "task-item-fallback",
    fallbackOnBody: true,
    swapThreshold: 0.65,
    filter: ".task-checkbox, .task-delete-btn, .task-due-date, .task-title",
    preventOnFilter: false,
    onStart() {
      document.body.classList.add("is-dragging");
    },
    async onEnd(evt) {
      document.body.classList.remove("is-dragging");

      if (evt.oldIndex === evt.newIndex) {
        return;
      }

      const taskElements = Array.from(tasksList.querySelectorAll(".task-item"));
      const newOrder = taskElements
        .map((el) => el.getAttribute("data-task-id"))
        .filter((id): id is string => Boolean(id));

      const tasks = getFilteredTasks();
      const reorderedTasks = newOrder
        .map((id) => tasks.find((t) => t.id === id))
        .filter((task): task is Task => Boolean(task));

      await reorderTasks(reorderedTasks);
    },
  });

  setSortableInstance(sortable);
}

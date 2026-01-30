import { createTask, updateTask } from "../../tasks";
import { getNewTaskDueDate, setCurrentEditingTaskId, setNewTaskDueDate } from "./state";
import { updateAddTaskDueDateButton } from "./date-picker";

export async function handleAddTask(title: string): Promise<void> {
  const dueDate = getNewTaskDueDate();
  await createTask(title, dueDate ? new Date(dueDate) : null);
  setNewTaskDueDate(null);
  updateAddTaskDueDateButton();
}

export async function saveTitleEdit(taskId: string): Promise<void> {
  const title = document.querySelector(`.task-title[data-task-id="${taskId}"]`) as HTMLElement | null;
  if (!title) return;

  const newTitle = title.textContent?.trim() || "";
  if (newTitle) {
    await updateTask(taskId, { title: newTitle });
  }

  title.contentEditable = "false";
  title.classList.remove("editing");
  setCurrentEditingTaskId(null);
}

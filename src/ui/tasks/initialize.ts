import { loadTasks } from "../../tasks";
import { renderTasks } from "./render";

export async function initializeTasks(): Promise<void> {
  await loadTasks();
  renderTasks();
}

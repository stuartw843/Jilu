// Tab management
import { elements } from "../dom";

export function switchTab(tabName: string) {
  // Update tab buttons
  elements.tabBtns.forEach((btn) => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Update tab panes
  const panes = [
    elements.notesTab,
    elements.transcriptTab,
    elements.enhancedTab,
    elements.chatTab,
  ];

  panes.forEach((pane) => {
    if (pane) pane.classList.remove("active");
  });

  if (tabName === "notes" && elements.notesTab) {
    elements.notesTab.classList.add("active");
  } else if (tabName === "transcript" && elements.transcriptTab) {
    elements.transcriptTab.classList.add("active");
  } else if (tabName === "enhanced" && elements.enhancedTab) {
    elements.enhancedTab.classList.add("active");
  } else if (tabName === "chat" && elements.chatTab) {
    elements.chatTab.classList.add("active");
  }

  document.dispatchEvent(new CustomEvent("tab-changed", { detail: { tabName } }));
}

export function setupTabListeners() {
  elements.tabBtns.forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab || "notes"));
  });
}

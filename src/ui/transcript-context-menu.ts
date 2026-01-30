import { elements } from "../dom";
import { openCustomDictionaryForm, showCustomDictionaryToast } from "./custom-dictionary";
import { openSettings } from "./settings";
import { showToast } from "./interactions";

let contextMenuEl: HTMLDivElement | null = null;
let addButtonEl: HTMLButtonElement | null = null;
let lastSelection = "";

export function initializeTranscriptContextMenu(): void {
  ensureContextMenu();

  const transcriptTargets = [elements.transcriptContent, elements.partialTranscript];
  transcriptTargets.forEach((target) => {
    target?.addEventListener("contextmenu", handleTranscriptContextMenu);
  });

  document.addEventListener("click", hideContextMenu);
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("scroll", hideContextMenu, true);
  window.addEventListener("blur", hideContextMenu);
  window.addEventListener("resize", hideContextMenu);
}

function ensureContextMenu(): void {
  if (contextMenuEl) {
    return;
  }

  contextMenuEl = document.createElement("div");
  contextMenuEl.className = "transcript-context-menu";
  contextMenuEl.setAttribute("role", "menu");

  addButtonEl = document.createElement("button");
  addButtonEl.type = "button";
  addButtonEl.className = "transcript-context-menu-item";
  addButtonEl.dataset.action = "add-dictionary";
  addButtonEl.addEventListener("click", () => {
    void addSelectionToDictionary();
  });

  contextMenuEl.appendChild(addButtonEl);
  document.body.appendChild(contextMenuEl);
}

function handleTranscriptContextMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target) {
    hideContextMenu();
    return;
  }

  const transcriptContainer = elements.transcriptContent;
  const partialContainer = elements.partialTranscript;

  const isTranscriptArea =
    (transcriptContainer && transcriptContainer.contains(target)) ||
    (partialContainer && partialContainer.contains(target));

  if (!isTranscriptArea) {
    hideContextMenu();
    return;
  }

  const selection = window.getSelection();
  const selectedText = sanitizeSelection(selection?.toString() ?? "");

  if (!selectedText) {
    hideContextMenu();
    return;
  }

  lastSelection = selectedText;

  event.preventDefault();
  event.stopPropagation();

  showContextMenu(event.clientX, event.clientY, selectedText);
}

function sanitizeSelection(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function showContextMenu(clientX: number, clientY: number, selectedText: string): void {
  if (!contextMenuEl || !addButtonEl) {
    return;
  }

  const displayText =
    selectedText.length > 36 ? `${selectedText.slice(0, 33)}...` : selectedText;
  addButtonEl.textContent = `Add "${displayText}" to custom dictionary`;

  contextMenuEl.style.left = `${clientX}px`;
  contextMenuEl.style.top = `${clientY}px`;
  contextMenuEl.classList.add("is-visible");

  adjustContextMenuPosition();
}

function adjustContextMenuPosition(): void {
  if (!contextMenuEl) return;

  const rect = contextMenuEl.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top;

  if (rect.right > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - rect.width - 8);
  }

  if (rect.bottom > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - rect.height - 8);
  }

  contextMenuEl.style.left = `${left}px`;
  contextMenuEl.style.top = `${top}px`;
}

function hideContextMenu(): void {
  if (!contextMenuEl) return;
  contextMenuEl.classList.remove("is-visible");
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    hideContextMenu();
  }
}

async function addSelectionToDictionary(): Promise<void> {
  hideContextMenu();

  const soundsLikeBase = sanitizeSelection(lastSelection);
  if (!soundsLikeBase) {
    return;
  }

  if (soundsLikeBase.length > 80) {
    const proceed = confirm(
      `The selected text is ${soundsLikeBase.length} characters long. Custom dictionary entries work best for shorter names or phrases.\n\nAdd it anyway?`
    );
    if (!proceed) {
      return;
    }
  }

  try {
    openSettings();
    const opened = await openCustomDictionaryForm("", [soundsLikeBase]);
    if (opened) {
      showCustomDictionaryToast(
        "Enter the correct spelling in the Custom Dictionary form, then click Save."
      );
    }
  } catch (error) {
    console.error("Failed to open custom dictionary form:", error);
    showToast(
      `Failed to open custom dictionary form: ${String((error as Error)?.message || error)}`,
      { type: "error" }
    );
  }
}

import {
  CUSTOM_DICTIONARY_LIMIT,
  deleteCustomDictionaryEntry,
  getCustomDictionaryEntries,
  getCustomDictionaryCount,
  parseSoundsLikeInput,
  updateCustomDictionaryEntry,
  upsertCustomDictionaryEntry,
} from "../custom-dictionary";
import { elements } from "../dom";
import { CustomDictionaryEntry } from "../types";
import { showToast } from "./interactions";

type FormMode = "add" | "edit";

let entries: CustomDictionaryEntry[] = [];
let currentEditId: string | null = null;

export async function initializeCustomDictionaryUI(): Promise<void> {
  if (!elements.customDictionaryList) {
    return;
  }

  elements.customDictionaryAddBtn?.addEventListener("click", handleAddButtonClick);
  elements.customDictionaryCancelBtn?.addEventListener("click", () => {
    hideForm();
  });

  elements.customDictionaryForm?.addEventListener("submit", handleFormSubmit);

  elements.customDictionaryList.addEventListener("click", handleListClick);

  await refreshCustomDictionaryUI();
}

export async function refreshCustomDictionaryUI(): Promise<void> {
  entries = await getCustomDictionaryEntries();
  updateDictionaryCount();
  renderDictionaryList();
}

export async function openCustomDictionaryForm(
  initialTerm: string,
  initialSoundsLike?: string[]
): Promise<boolean> {
  const count = await getCustomDictionaryCount();
  if (count >= CUSTOM_DICTIONARY_LIMIT) {
    showToast(
      `You already have ${CUSTOM_DICTIONARY_LIMIT} custom terms. Remove one before adding a new term.`,
      { type: "warning" }
    );
    return false;
  }

  document.querySelector<HTMLButtonElement>("#settings-tab-general")?.click();

  startForm("add", initialTerm, initialSoundsLike ?? []);

  const card = document.getElementById("custom-dictionary-card");
  if (card) {
    requestAnimationFrame(() => {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  elements.customDictionaryTermInput?.focus();
  return true;
}

function updateDictionaryCount(): void {
  if (elements.customDictionaryCount) {
    elements.customDictionaryCount.textContent = `${entries.length} / ${CUSTOM_DICTIONARY_LIMIT} terms`;
  }

  if (elements.customDictionaryAddBtn) {
    const atLimit = entries.length >= CUSTOM_DICTIONARY_LIMIT;
    elements.customDictionaryAddBtn.disabled = atLimit;
    elements.customDictionaryAddBtn.title = atLimit
      ? `Custom dictionary limit of ${CUSTOM_DICTIONARY_LIMIT} terms reached`
      : "";
  }
}

function renderDictionaryList(): void {
  const list = elements.customDictionaryList;
  if (!list) {
    return;
  }

  list.innerHTML = "";

  if (!entries.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "custom-dictionary-empty";
    emptyItem.textContent = "No custom terms yet. Add your first term.";
    list.appendChild(emptyItem);
    return;
  }

  const sorted = [...entries].sort((a, b) =>
    a.content.localeCompare(b.content, undefined, { sensitivity: "base" })
  );

  const fragment = document.createDocumentFragment();

  sorted.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "custom-dictionary-item";
    item.dataset.dictionaryId = entry.id;

    if (entry.id === currentEditId) {
      item.classList.add("is-editing");
    }

    const textWrapper = document.createElement("div");
    textWrapper.className = "custom-dictionary-item-text";

    const termSpan = document.createElement("span");
    termSpan.className = "custom-dictionary-term";
    termSpan.textContent = entry.content;
    textWrapper.appendChild(termSpan);

    if (entry.soundsLike.length) {
      const soundsSpan = document.createElement("span");
      soundsSpan.className = "custom-dictionary-sounds-like";
      soundsSpan.textContent = `Sounds like: ${entry.soundsLike.join(", ")}`;
      textWrapper.appendChild(soundsSpan);
    }

    const actions = document.createElement("div");
    actions.className = "custom-dictionary-item-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "custom-dictionary-action-btn";
    editBtn.dataset.dictionaryAction = "edit";
    editBtn.dataset.dictionaryId = entry.id;
    editBtn.textContent = "✏️ Edit";
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "custom-dictionary-action-btn";
    deleteBtn.dataset.dictionaryAction = "delete";
    deleteBtn.dataset.dictionaryId = entry.id;
    deleteBtn.textContent = "🗑 Remove";
    actions.appendChild(deleteBtn);

    item.appendChild(textWrapper);
    item.appendChild(actions);
    fragment.appendChild(item);
  });

  list.appendChild(fragment);
}

function handleAddButtonClick(): void {
  startForm("add");
}

function startForm(mode: FormMode, initialTerm: string = "", soundsLike: string[] = []): void {
  if (!elements.customDictionaryForm || !elements.customDictionaryTermInput) {
    return;
  }

  currentEditId = mode === "edit" ? currentEditId : null;

  elements.customDictionaryForm.dataset.mode = mode;
  elements.customDictionaryForm.hidden = false;

  elements.customDictionaryTermInput.value = initialTerm;
  if (elements.customDictionarySoundsLikeInput) {
    elements.customDictionarySoundsLikeInput.value = soundsLike.join(", ");
  }

  const submitBtn = elements.customDictionaryForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submitBtn) {
    submitBtn.textContent = mode === "edit" ? "Update Term" : "Add Term";
  }

  if (elements.customDictionaryTermInput) {
    elements.customDictionaryTermInput.focus();
    elements.customDictionaryTermInput.select();
  }

  highlightEditingItem();
}

function hideForm(): void {
  if (!elements.customDictionaryForm) {
    return;
  }

  elements.customDictionaryForm.hidden = true;
  elements.customDictionaryForm.dataset.mode = "";
  currentEditId = null;

  if (elements.customDictionaryForm instanceof HTMLFormElement) {
    elements.customDictionaryForm.reset();
  }

  if (elements.customDictionaryTermInput) {
    elements.customDictionaryTermInput.value = "";
  }
  if (elements.customDictionarySoundsLikeInput) {
    elements.customDictionarySoundsLikeInput.value = "";
  }

  highlightEditingItem();
}

function handleListClick(event: Event): void {
  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }

  const actionBtn = target.closest<HTMLButtonElement>("[data-dictionary-action]");
  if (!actionBtn) {
    return;
  }

  const { dictionaryAction: action, dictionaryId: id } = actionBtn.dataset as {
    dictionaryAction?: string;
    dictionaryId?: string;
  };

  if (!action || !id) {
    return;
  }

  if (action === "edit") {
    const entry = entries.find((item) => item.id === id);
    if (entry) {
      currentEditId = entry.id;
      startForm("edit", entry.content, entry.soundsLike);
    }
    return;
  }

  if (action === "delete") {
    handleDeleteEntry(id);
  }
}

async function handleDeleteEntry(id: string): Promise<void> {
  const entry = entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  const confirmed = confirm(`Remove "${entry.content}" from your custom dictionary?`);
  if (!confirmed) {
    return;
  }

  try {
    await deleteCustomDictionaryEntry(id);
    if (currentEditId === id) {
      hideForm();
    }
    await refreshCustomDictionaryUI();
    showCustomDictionaryToast(`Removed "${entry.content}" from the custom dictionary.`);
  } catch (error) {
    console.error("Failed to delete custom dictionary entry:", error);
    showToast(`Failed to delete entry: ${String((error as Error)?.message || error)}`, { type: "error" });
  }
}

async function handleFormSubmit(event: Event): Promise<void> {
  event.preventDefault();

  if (!elements.customDictionaryForm || !elements.customDictionaryTermInput) {
    return;
  }

  const mode = (elements.customDictionaryForm.dataset.mode as FormMode | undefined) ?? "add";
  const term = elements.customDictionaryTermInput.value.trim();
  const soundsInput = elements.customDictionarySoundsLikeInput?.value ?? "";
  const soundsLike = parseSoundsLikeInput(soundsInput);

  if (!term) {
    showToast("Please enter a term.", { type: "warning" });
    elements.customDictionaryTermInput.focus();
    return;
  }

  try {
    if (mode === "edit" && currentEditId) {
      await updateCustomDictionaryEntry(currentEditId, { content: term, soundsLike });
      hideForm();
      await refreshCustomDictionaryUI();
      showCustomDictionaryToast(`Updated "${term}" in the custom dictionary.`);
      return;
    }

    const { isNew } = await upsertCustomDictionaryEntry(term, soundsLike);
    hideForm();
    await refreshCustomDictionaryUI();

    if (!isNew) {
      showToast(
        "That term already existed, so we refreshed its pronunciation with your latest sounds like suggestion.",
        { type: "info" }
      );
      showCustomDictionaryToast(`Updated pronunciations for "${term}".`);
    } else {
      showCustomDictionaryToast(`Added "${term}" to the custom dictionary.`);
    }
  } catch (error) {
    console.error("Failed to save custom dictionary entry:", error);
    showToast(String((error as Error)?.message || error), { type: "error" });
  }
}

function highlightEditingItem(): void {
  const list = elements.customDictionaryList;
  if (!list) return;

  const items = list.querySelectorAll<HTMLElement>(".custom-dictionary-item");
  items.forEach((item) => {
    const id = item.dataset.dictionaryId;
    item.classList.toggle("is-editing", Boolean(currentEditId && id === currentEditId));
  });
}

export function showCustomDictionaryToast(message: string): void {
  const toast = document.createElement("div");
  toast.className = "success-toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2800);
}

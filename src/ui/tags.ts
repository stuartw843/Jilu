// Tag management UI
import { elements } from "../dom";
import { getCurrentMeeting, setCurrentMeeting } from "../state";
import { db } from "../database";
import { renderTagsList, renderMeetingsList } from "./sidebar";

let availableTags: string[] = [];

export async function initializeTags() {
  availableTags = await db.getAllTags();
  setupTagListeners();
  
  // Initialize tags list in sidebar
  renderTagsList();
}

function setupTagListeners() {
  if (!elements.tagInput) return;

  // Handle tag input
  elements.tagInput.addEventListener("keydown", handleTagInput);
  elements.tagInput.addEventListener("input", handleTagSuggestions);
  elements.tagInput.addEventListener("blur", () => {
    // Delay hiding to allow clicking on suggestions
    setTimeout(() => hideSuggestions(), 200);
  });
}

async function handleTagInput(e: KeyboardEvent) {
  const input = e.target as HTMLInputElement;
  const value = input.value.trim();

  if (e.key === "Enter" && value) {
    e.preventDefault();
    await addTag(value);
    input.value = "";
    hideSuggestions();
  } else if (e.key === "Escape") {
    input.value = "";
    hideSuggestions();
  }
}

async function handleTagSuggestions(e: Event) {
  const input = e.target as HTMLInputElement;
  const value = input.value.trim().toLowerCase();

  if (!value || !elements.tagSuggestions) {
    hideSuggestions();
    return;
  }

  const currentMeeting = getCurrentMeeting();
  const currentTags = currentMeeting?.tags || [];

  // Filter tags that match and aren't already applied
  const suggestions = availableTags.filter(
    (tag) =>
      tag.toLowerCase().includes(value) && !currentTags.includes(tag)
  );

  if (suggestions.length === 0) {
    hideSuggestions();
    return;
  }

  showSuggestions(suggestions);
}

function showSuggestions(suggestions: string[]) {
  if (!elements.tagSuggestions) return;

  elements.tagSuggestions.innerHTML = suggestions
    .map((tag) => `<div class="tag-suggestion-item" data-tag="${tag}">${tag}</div>`)
    .join("");

  elements.tagSuggestions.style.display = "block";

  // Add click listeners
  elements.tagSuggestions.querySelectorAll(".tag-suggestion-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const tag = (item as HTMLElement).dataset.tag;
      if (tag) {
        await addTag(tag);
        if (elements.tagInput) {
          elements.tagInput.value = "";
        }
        hideSuggestions();
      }
    });
  });
}

function hideSuggestions() {
  if (elements.tagSuggestions) {
    elements.tagSuggestions.style.display = "none";
  }
}

async function addTag(tag: string) {
  const currentMeeting = getCurrentMeeting();
  if (!currentMeeting) return;

  // Initialize tags array if it doesn't exist
  if (!currentMeeting.tags) {
    currentMeeting.tags = [];
  }

  // Don't add duplicate tags
  if (currentMeeting.tags.includes(tag)) {
    return;
  }

  currentMeeting.tags.push(tag);
  currentMeeting.updatedAt = new Date();

  // Update database
  await db.saveMeeting(currentMeeting);

  // Update state
  setCurrentMeeting(currentMeeting);

  // Update available tags list
  if (!availableTags.includes(tag)) {
    availableTags.push(tag);
    availableTags.sort();
  }

  // Re-render tags display
  renderTags();

  // Notify sidebar to update (tags might appear there)
  renderMeetingsList();
  renderTagsList();
}

export async function removeTag(tag: string) {
  const currentMeeting = getCurrentMeeting();
  if (!currentMeeting || !currentMeeting.tags) return;

  currentMeeting.tags = currentMeeting.tags.filter((t) => t !== tag);
  currentMeeting.updatedAt = new Date();

  // Update database
  await db.saveMeeting(currentMeeting);

  // Update state
  setCurrentMeeting(currentMeeting);

  // Re-render tags display
  renderTags();

  // Notify sidebar to update
  renderMeetingsList();
  renderTagsList();
}

export function renderTags() {
  if (!elements.meetingTagsDisplay) return;

  const currentMeeting = getCurrentMeeting();
  if (!currentMeeting || !currentMeeting.tags || currentMeeting.tags.length === 0) {
    elements.meetingTagsDisplay.innerHTML = "";
    return;
  }

  elements.meetingTagsDisplay.innerHTML = currentMeeting.tags
    .map(
      (tag) =>
        `<span class="tag-badge">
          ${tag}
          <button class="tag-remove-btn" data-tag="${tag}" title="Remove tag">×</button>
        </span>`
    )
    .join("");

  // Add click listeners for remove buttons
  elements.meetingTagsDisplay.querySelectorAll(".tag-remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const tag = (btn as HTMLElement).dataset.tag;
      if (tag) {
        removeTag(tag);
      }
    });
  });
}

export async function refreshAvailableTags() {
  availableTags = await db.getAllTags();
}

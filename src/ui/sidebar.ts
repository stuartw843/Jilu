// Sidebar UI management
import { elements } from "../dom";
import { getMeetings, getCurrentMeeting, removeMeetingFromList, setCurrentMeeting, setMeetings } from "../state";
import { formatDate } from "../utils";
import { db } from "../database";
import { ask } from "@tauri-apps/plugin-dialog";
import { escapeHtml } from "../utils/html";
import { loadMeeting, renderMeetingView } from "../meeting-operations";
import { showToast } from "./interactions";

let selectedTags: string[] = [];
let activeSeriesFilter: { id: string; label: string } | null = null;

function updateSearchClearButtonVisibility() {
  const hasValue = Boolean(elements.searchInput?.value.trim());

  if (!elements.searchClearBtn) return;

  elements.searchClearBtn.classList.toggle("visible", hasValue);
  elements.searchClearBtn.disabled = !hasValue;
  elements.searchClearBtn.setAttribute("aria-hidden", hasValue ? "false" : "true");
}

export function renderMeetingsList() {
  if (!elements.meetingsList) return;

  const meetings = getMeetings();
  const currentMeeting = getCurrentMeeting();
  const filteredMeetings = activeSeriesFilter
    ? meetings.filter(meeting => meeting.calendarSeriesId === activeSeriesFilter!.id)
    : meetings;
  const filterBanner = activeSeriesFilter
    ? `
      <div class="meeting-filter-banner">
        <span class="filter-label">Series: ${escapeHtml(activeSeriesFilter.label)}</span>
        <button type="button" class="btn btn-secondary btn-small" data-action="clear-series-filter">Clear</button>
      </div>
    `
    : "";

  if (filteredMeetings.length === 0) {
    const emptyPrimary = activeSeriesFilter ? "No notes in this series yet" : "No meetings yet";
    const emptySecondary = activeSeriesFilter
      ? "Create a note in this series or clear the filter to browse everything."
      : 'Click "New" to start recording';
    const clearButton = activeSeriesFilter
      ? `<button type="button" class="btn btn-secondary btn-small" data-action="clear-series-filter">Clear series filter</button>`
      : "";

    elements.meetingsList.innerHTML = `
      ${filterBanner}
      <div class="empty-state">
        <p>${emptyPrimary}</p>
        <p class="small-text">${emptySecondary}</p>
        ${clearButton}
      </div>
    `;
    attachSeriesFilterClearHandlers();
    return;
  }

  const listItems = filteredMeetings
    .map((meeting) => {
      const date = new Date(meeting.updatedAt);
      const isActive = currentMeeting?.id === meeting.id;
      const safeTitle = escapeHtml(meeting.title);
      const safeId = escapeHtml(meeting.id);
      return `
        <div class="meeting-item ${isActive ? "active" : ""}" data-id="${safeId}">
          <div class="meeting-item-content">
            <div class="meeting-item-title">${safeTitle}</div>
            <div class="meeting-item-date">${formatDate(date)}</div>
          </div>
          <button class="meeting-delete-btn" data-id="${safeId}" title="Delete meeting">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      `;
    })
    .join("");

  elements.meetingsList.innerHTML = `
    ${filterBanner}
    ${listItems}
  `;

  // Add click listeners for meeting items
  document.querySelectorAll(".meeting-item-content").forEach((content) => {
    content.addEventListener("click", () => {
      const item = content.closest(".meeting-item") as HTMLElement;
      const id = item?.dataset.id;
      if (id) {
        void loadMeeting(id);
      }
    });
  });

  // Add click listeners for delete buttons
  const deleteButtons = document.querySelectorAll(".meeting-delete-btn");
  
  deleteButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent triggering the meeting item click
      const id = (btn as HTMLElement).dataset.id;
      if (id) {
        handleDeleteMeeting(id);
      }
    });
  });

  attachSeriesFilterClearHandlers();
}

async function handleDeleteMeeting(id: string) {
  try {
    const meeting = await db.getMeeting(id);
    
    if (!meeting) {
      return;
    }

    const confirmed = await ask(
      `Are you sure you want to delete "${meeting.title}"?\n\nThis will permanently remove the meeting, transcript, and all notes. This action cannot be undone.`,
      {
        title: "Delete Meeting"
      }
    );

    if (!confirmed) {
      return;
    }
    
    // Check if this is the current meeting BEFORE deleting
    const currentMeeting = getCurrentMeeting();
    const isDeletingCurrentMeeting = currentMeeting?.id === id;

    // Delete from database
    await db.deleteMeeting(id);

    // Update state
    removeMeetingFromList(id);

    // If this was the current meeting, clear it
    if (isDeletingCurrentMeeting) {
      setCurrentMeeting(null);
    }

    // Re-render the list
    renderMeetingsList();

    // If we deleted the current meeting, reload the UI to show empty state
    if (isDeletingCurrentMeeting) {
      renderMeetingView();
    }
  } catch (error) {
    console.error("Failed to delete meeting:", error);
    showToast("Failed to delete meeting. Please try again.", { type: "error" });
  }
}

export async function handleSearch(_event?: Event) {
  updateSearchClearButtonVisibility();

  const query = elements.searchInput?.value.trim() ?? "";
  const fullContent = elements.searchFullContentToggle?.checked ?? false;
  if (!query) {
    const allMeetings = await db.getAllMeetings();
    setMeetings(allMeetings);
  } else {
    const searchResults = await db.searchMeetings(query, { fullContent });
    setMeetings(searchResults);
  }

  renderMeetingsList();
}

export function setupSidebarListeners(onNewMeeting: () => void) {
  elements.newMeetingBtn?.addEventListener("click", onNewMeeting);
  elements.startNewMeetingBtn?.addEventListener("click", onNewMeeting);
  elements.searchInput?.addEventListener("input", handleSearch);
  elements.searchFullContentToggle?.addEventListener("change", handleSearch);
  elements.searchClearBtn?.addEventListener("click", () => {
    if (!elements.searchInput) return;
    elements.searchInput.value = "";
    elements.searchInput.focus();
    void handleSearch();
  });
  updateSearchClearButtonVisibility();
  
  const clearTagsFilterBtn = document.getElementById("clear-tags-filter");
  clearTagsFilterBtn?.addEventListener("click", clearTagFilter);
  
  const tagsDropdown = document.getElementById("tags-dropdown") as HTMLSelectElement;
  tagsDropdown?.addEventListener("mousedown", handleTagOptionMouseDown);
  tagsDropdown?.addEventListener("click", suppressTagClickDefault);
  tagsDropdown?.addEventListener("change", handleTagsDropdownChange);
}

export async function renderTagsList() {
  const tagsDropdown = document.getElementById("tags-dropdown") as HTMLSelectElement;
  if (!tagsDropdown) return;

  const allTags = await db.getAllTags();
  
  if (allTags.length === 0) {
    tagsDropdown.innerHTML = '<option value="" disabled>No tags available</option>';
    tagsDropdown.disabled = true;
    return;
  }

  tagsDropdown.disabled = false;
  tagsDropdown.innerHTML = allTags
    .map((tag) => {
      const isSelected = selectedTags.includes(tag);
      return `<option value="${tag}" ${isSelected ? 'selected' : ''}>${tag}</option>`;
    })
    .join("");
  
  updateTagOptionStyles(tagsDropdown);
}

export async function applySeriesFilter(seriesId: string, label: string) {
  if (!seriesId) return;

  if (activeSeriesFilter?.id === seriesId) {
    await clearSeriesFilter();
    return;
  }

  activeSeriesFilter = { id: seriesId, label };
  selectedTags = [];

  const tagsDropdown = document.getElementById("tags-dropdown") as HTMLSelectElement | null;
  if (tagsDropdown) {
    Array.from(tagsDropdown.options).forEach(option => {
      option.selected = false;
    });
    updateTagOptionStyles(tagsDropdown);
  }

  const clearTagsBtn = document.getElementById("clear-tags-filter");
  if (clearTagsBtn) {
    clearTagsBtn.style.display = "none";
  }

  const meetingsInSeries = await db.getMeetingsBySeries(seriesId);
  setMeetings(meetingsInSeries);
  renderMeetingsList();
}

export async function clearSeriesFilter() {
  if (!activeSeriesFilter) return;

  activeSeriesFilter = null;
  const allMeetings = await db.getAllMeetings();
  setMeetings(allMeetings);
  renderMeetingsList();
}

function handleTagOptionMouseDown(event: MouseEvent) {
  const dropdown = event.currentTarget as HTMLSelectElement | null;
  const option = event.target;

  if (!dropdown || dropdown.disabled || !(option instanceof HTMLOptionElement)) return;

  event.preventDefault();
  option.selected = !option.selected;
  updateTagOptionStyles(dropdown);
  dropdown.focus();

  void handleTagsDropdownChange();
}

function suppressTagClickDefault(event: MouseEvent) {
  if (event.target instanceof HTMLOptionElement) {
    event.preventDefault();
  }
}

function updateTagOptionStyles(dropdown: HTMLSelectElement) {
  Array.from(dropdown.options).forEach((opt) => {
    opt.classList.toggle("is-selected", opt.selected);
  });
}

async function handleTagsDropdownChange() {
  const tagsDropdown = document.getElementById("tags-dropdown") as HTMLSelectElement;
  if (!tagsDropdown) return;

  // Get all selected options
  const selectedOptions = Array.from(tagsDropdown.selectedOptions);
  selectedTags = selectedOptions.map(option => option.value);
  updateTagOptionStyles(tagsDropdown);

  if (selectedTags.length === 0) {
    await clearTagFilter();
    return;
  }

  const filteredMeetings = await db.getMeetingsByTags(selectedTags);
  setMeetings(filteredMeetings);
  
  renderMeetingsList();
  
  // Show clear button
  const clearBtn = document.getElementById("clear-tags-filter");
  if (clearBtn) {
    clearBtn.style.display = "inline-block";
  }
}

async function clearTagFilter() {
  selectedTags = [];
  
  // Clear dropdown selection
  const tagsDropdown = document.getElementById("tags-dropdown") as HTMLSelectElement;
  if (tagsDropdown) {
    Array.from(tagsDropdown.options).forEach(option => {
      option.selected = false;
    });
    updateTagOptionStyles(tagsDropdown);
  }
  
  const allMeetings = await db.getAllMeetings();
  setMeetings(allMeetings);
  
  renderMeetingsList();
  
  // Hide clear button
  const clearBtn = document.getElementById("clear-tags-filter");
  if (clearBtn) {
    clearBtn.style.display = "none";
  }
}

function attachSeriesFilterClearHandlers() {
  const container = elements.meetingsList;
  if (!container) return;

  const buttons = container.querySelectorAll<HTMLButtonElement>('[data-action="clear-series-filter"]');
  buttons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void clearSeriesFilter();
    });
  });
}

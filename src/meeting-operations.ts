import { CalendarAttendee, Meeting, MeetingParticipant, Person } from "./types";
import { db } from "./database";
import { exportMeeting } from "./file-export";
import { 
  getCurrentMeeting, 
  setCurrentMeeting, 
  addMeetingToList, 
  updateMeetingInList,
  removeMeetingFromList,
  setMeetings,
  startAutoSave,
  stopAutoSave
} from "./state";
import { elements } from "./dom";
import { generateId, formatDate, renderEnhancedNotes, normalizeEmail, hasTranscriptContent, debounce } from "./utils";
import { escapeHtml } from "./utils/html";
import { renderMeetingsList, applySeriesFilter } from "./ui/sidebar";
import { initializeNotesEditor } from "./ui/editor";
import { clearChatMessages } from "./ui/chat";
import { switchTab } from "./ui/tabs";
import { renderTags } from "./ui/tags";
import { initializeTemplateSelector, syncEnhancementUIState, updateEnhancedCopyButtonState } from "./ai-operations";
import { renderPeoplePanel } from "./ui/people";
import { renderTranscript, resetTranscriptAutoScroll } from "./ui/transcript";
import { updateRecordingUI } from "./recording";

export async function loadMeetings() {
  const meetings = await db.getAllMeetings();
  setMeetings(meetings);
  renderMeetingsList();
}

export async function createNewMeeting() {
  const now = new Date();
  const newMeeting: Meeting = {
    id: generateId(),
    title: "Untitled Meeting",
    date: now,
    transcript: [],
    personalNotes: "",
    enhancedNotes: "",
    createdAt: now,
    updatedAt: now,
  };

  await db.saveMeeting(newMeeting);
  addMeetingToList(newMeeting);
  renderMeetingsList();
  await loadMeeting(newMeeting.id);
}

export async function loadMeeting(id: string) {
  const meeting = await db.getMeeting(id);
  if (!meeting) return;

  setCurrentMeeting(meeting);
  renderMeetingView();
  startAutoSave(saveMeetingChanges);
  
  // Update recording UI to reflect whether we're viewing the recording meeting
  await updateRecordingUI();
}

export function renderMeetingView() {
  const currentMeeting = getCurrentMeeting();
  if (!currentMeeting) return;

  if (elements.emptyView) elements.emptyView.style.display = "none";
  if (elements.meetingView) elements.meetingView.style.display = "flex";

  if (elements.meetingTitle) elements.meetingTitle.value = currentMeeting.title;
  if (elements.meetingDate) {
    elements.meetingDate.textContent = formatDate(new Date(currentMeeting.date));
  }

  if (elements.meetingSeriesIndicator) {
    elements.meetingSeriesIndicator.hidden = true;
  }
  void updateMeetingSeriesIndicator(currentMeeting);
  
  initializeNotesEditor(currentMeeting.personalNotes);
  renderPeoplePanel(currentMeeting);

  resetTranscriptAutoScroll();

  if (elements.transcriptContent) {
    renderTranscript(elements.transcriptContent, currentMeeting.transcript);
  }

  if (elements.enhancedContent) {
    if (currentMeeting.enhancedNotes && currentMeeting.enhancedNotes.trim()) {
      renderEnhancedNotes(currentMeeting.enhancedNotes, elements.enhancedContent);
      const editBtn = document.getElementById('edit-enhanced-btn');
      const clearBtn = document.getElementById('clear-enhanced-btn');
      if (editBtn) editBtn.style.display = 'inline-block';
      if (clearBtn) clearBtn.style.display = 'inline-block';
    } else {
      elements.enhancedContent.innerHTML =
        '<p class="placeholder-text">Click "Enhance with AI" to generate enhanced notes from your transcript and personal notes.</p>';
      // Hide edit and clear buttons
      const editBtn = document.getElementById('edit-enhanced-btn');
      const clearBtn = document.getElementById('clear-enhanced-btn');
      if (editBtn) editBtn.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
    }
  }

  updateEnhancedCopyButtonState();

  // Render tags
  renderTags();

  // Clear chat
  clearChatMessages();

  // Initialize template selector with meeting's saved template or default
  initializeTemplateSelector();

  // Enable/disable enhance button - only needs transcript
  if (elements.enhanceNotesBtn) {
    elements.enhanceNotesBtn.disabled = !hasTranscriptContent(currentMeeting.transcript);
  }

  // Ensure enhancement UI reflects any in-flight processes
  syncEnhancementUIState();

  // Update meetings list
  renderMeetingsList();

  // Auto-select appropriate tab: enhanced if available and not empty, otherwise personal notes
  if (currentMeeting.enhancedNotes && currentMeeting.enhancedNotes.trim()) {
    switchTab("enhanced");
  } else {
    switchTab("notes");
  }
}

async function updateMeetingSeriesIndicator(meeting: Meeting): Promise<void> {
  const meetingSeriesIndicator = elements.meetingSeriesIndicator;
  const meetingSeriesButton = elements.meetingSeriesButton;

  const resetSeriesUI = () => {
    if (meetingSeriesIndicator && meetingSeriesButton) {
      meetingSeriesIndicator.hidden = true;
      meetingSeriesButton.textContent = "";
      meetingSeriesButton.removeAttribute("aria-label");
      meetingSeriesButton.removeAttribute("title");
      delete meetingSeriesButton.dataset.seriesId;
    }
  };

  const current = getCurrentMeeting();
  if (!current || current.id !== meeting.id) {
    resetSeriesUI();
    return;
  }

  const seriesId = meeting.calendarSeriesId;
  if (!seriesId) {
    resetSeriesUI();
    return;
  }

  try {
    const seriesMeetings = await db.getMeetingsBySeries(seriesId);
    const latest = getCurrentMeeting();
    if (!latest || latest.id !== meeting.id) {
      return;
    }

    const label = meeting.calendarSeriesName || meeting.title;
    const totalCount = seriesMeetings.length;

    if (totalCount <= 1) {
      resetSeriesUI();
      return;
    }

    if (meetingSeriesIndicator && meetingSeriesButton) {
      meetingSeriesButton.textContent = label;
      meetingSeriesButton.dataset.seriesId = seriesId;
      meetingSeriesButton.setAttribute("aria-label", `Show notes from series: ${label}`);
      meetingSeriesButton.setAttribute(
        "title",
        `Show notes from series: ${label}${totalCount > 1 ? ` (${totalCount} notes)` : ""}`
      );
      meetingSeriesIndicator.hidden = false;
    }
  } catch (error) {
    console.error("Failed to update series indicator:", error);
    resetSeriesUI();
  }
}

export async function saveMeetingChanges() {
  const currentMeeting = getCurrentMeeting();
  if (!currentMeeting) return;

  currentMeeting.title = elements.meetingTitle?.value || "Untitled Meeting";
  currentMeeting.updatedAt = new Date();

  await db.saveMeeting(currentMeeting);
  updateMeetingInList(currentMeeting);
  renderMeetingsList();

  // Auto-export to files if enabled
  try {
    await exportMeeting(currentMeeting);
    // Save again to update lastExportedFolderName if it changed
    await db.saveMeeting(currentMeeting);
  } catch (error) {
    console.error("Failed to export meeting:", error);
    // Don't block the save operation if export fails
  }
}

export async function deleteMeeting() {
  const currentMeeting = getCurrentMeeting();
  if (!currentMeeting) return;

  const userConfirmed = await Promise.resolve(confirm(`Delete "${currentMeeting.title}"?`));
  if (!userConfirmed) return;

  await db.deleteMeeting(currentMeeting.id);
  removeMeetingFromList(currentMeeting.id);
  
  setCurrentMeeting(null);
  stopAutoSave();
  
  renderMeetingsList();

  // Show empty view
  if (elements.emptyView) elements.emptyView.style.display = "flex";
  if (elements.meetingView) elements.meetingView.style.display = "none";
}

export function setupMeetingListeners() {
  // Meeting title auto-save
  elements.meetingTitle?.addEventListener("input", async () => {
    debounce(saveMeetingChanges, 1000)();
  });

  const handleSeriesClick = () => {
    const meeting = getCurrentMeeting();
    if (!meeting?.calendarSeriesId) return;
    const label = meeting.calendarSeriesName || meeting.title;
    void applySeriesFilter(meeting.calendarSeriesId, label);
  };

  elements.meetingSeriesButton?.addEventListener("click", handleSeriesClick);
}

export interface CalendarMeetingOptions {
  activate?: boolean;
}

export async function createMeetingFromCalendarEvent(
  eventId: string,
  options: CalendarMeetingOptions = {}
): Promise<Meeting | null> {
  const { activate = true } = options;
  const existing = await db.getMeetingByCalendarEventId(eventId);

  if (existing) {
    if (activate) {
      await loadMeeting(existing.id);
    }
    return existing;
  }

  const eventSnapshot = await db.getCalendarEvent(eventId);
  if (!eventSnapshot) {
    console.warn("Calendar event not found for", eventId);
    return null;
  }

  const participantList = await resolveParticipantsFromAttendees(eventSnapshot.attendees);
  const createdAt = new Date();
  const seriesId = eventSnapshot.seriesId;
  const seriesName = seriesId ? eventSnapshot.seriesName || eventSnapshot.title : undefined;
  const meeting: Meeting = {
    id: generateId(),
    title: eventSnapshot.title || "Untitled Event",
    date: new Date(eventSnapshot.startTime),
    transcript: [],
    personalNotes: buildPersonalNotesFromAgenda(eventSnapshot.notes),
    enhancedNotes: "",
    participants: participantList,
    tags: undefined,
    createdAt,
    updatedAt: createdAt,
    calendarEventId: eventSnapshot.id,
    calendarName: eventSnapshot.calendarName,
    startTime: new Date(eventSnapshot.startTime),
    endTime: new Date(eventSnapshot.endTime),
    location: eventSnapshot.location,
    calendarSeriesId: seriesId,
    calendarSeriesName: seriesName,
    isSynced: true,
    syncedAt: createdAt,
  };

  await db.saveMeeting(meeting);
  addMeetingToList(meeting);
  renderMeetingsList();

  if (activate) {
    await loadMeeting(meeting.id);
  }

  return meeting;
}

function buildPersonalNotesFromAgenda(rawAgenda?: string | null): string {
  const agenda = rawAgenda?.trim();
  if (!agenda) {
    return "";
  }

  const paragraphs = agenda
    .split(/\r?\n\r?\n/)
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const escaped = escapeHtml(block);
      const withBreaks = escaped.replace(/\r?\n/g, "<br>");
      return `<p>${withBreaks}</p>`;
    })
    .join("");

  return `<p><br></p><hr>${paragraphs}`;
}

async function resolveParticipantsFromAttendees(
  attendees: CalendarAttendee[] | undefined
): Promise<MeetingParticipant[] | undefined> {
  if (!attendees || attendees.length === 0) {
    return undefined;
  }

  const normalizedEmails = Array.from(
    new Set(
      attendees
        .map((attendee) => normalizeEmail(attendee.email))
        .filter((email): email is string => Boolean(email))
    )
  );

  let peopleByEmail: Map<string, Person> | null = null;

  if (normalizedEmails.length > 0) {
    const people = await db.getPeopleByEmails(normalizedEmails);
    peopleByEmail = new Map(people.map((person) => [person.email, person]));
  }

  const participants: MeetingParticipant[] = [];

  attendees.forEach((attendee) => {
    const email = normalizeEmail(attendee.email);
    const person = email && peopleByEmail ? peopleByEmail.get(email) : undefined;
    const name = person?.name || attendee.name || undefined;
    const jobRole = person?.jobRole || undefined;

    if (!email && !name) {
      return;
    }

    participants.push({
      email: email || undefined,
      name,
      jobRole,
    });
  });

  return participants.length > 0 ? participants : undefined;
}

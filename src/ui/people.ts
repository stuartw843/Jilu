import { db } from "../database";
import { elements } from "../dom";
import { Meeting, MeetingParticipant, Person } from "../types";
import { getCurrentMeeting, updateMeetingInList } from "../state";
import { renderMeetingsList } from "./sidebar";
import { normalizeEmail } from "../utils";
import { showToast } from "./interactions";

let isPeopleSectionExpanded = false;
let isPeopleListExpanded = false;
let hasPeopleOverflow = false;
let lastRenderedMeetingId: string | null = null;

export function initializePeoplePanel(): void {
  initializePeopleSectionToggle();
  elements.addPersonToggle?.addEventListener("click", () => toggleAddPersonForm());
  elements.cancelAddPersonBtn?.addEventListener("click", () => {
    toggleAddPersonForm(false);
  });
  elements.addPersonForm?.addEventListener("submit", handleAddPersonSubmit);
  elements.peopleList?.addEventListener("click", handlePeopleListClick);
  elements.peopleList?.addEventListener("submit", handlePersonEditSubmit);
  elements.peopleExpandBtn?.addEventListener("click", () => {
    isPeopleListExpanded = !isPeopleListExpanded;
    applyPeopleListState();
  });
}

export function renderPeoplePanel(meeting: Meeting | null): void {
  const list = elements.peopleList;
  if (!list) return;

  const meetingId = meeting?.id ?? null;
  if (meetingId !== lastRenderedMeetingId) {
    lastRenderedMeetingId = meetingId;
    isPeopleSectionExpanded = false;
    isPeopleListExpanded = false;
    hasPeopleOverflow = false;
  }

  if (!meeting || !meeting.participants || meeting.participants.length === 0) {
    list.innerHTML = '<span class="placeholder-text">People from the calendar will appear here</span>';
    isPeopleSectionExpanded = false;
    isPeopleListExpanded = false;
    hasPeopleOverflow = false;
    applyPeopleSectionState();
    applyPeopleListState();
    return;
  }

  const rows = meeting.participants
    .map((participant) => renderPersonRow(participant))
    .join("");

  list.innerHTML = rows;
  isPeopleListExpanded = false;
  hasPeopleOverflow = false;
  applyPeopleSectionState();
  if (isPeopleSectionExpanded) {
    window.requestAnimationFrame(updatePeopleOverflowState);
  } else {
    applyPeopleListState();
  }
}

function initializePeopleSectionToggle(): void {
  const toggle = elements.peopleSectionToggle;
  if (!toggle || !elements.peopleSectionContent || !elements.peopleSection) return;

  setPeopleSectionExpanded(false);

  toggle.addEventListener("click", () => {
    setPeopleSectionExpanded(!isPeopleSectionExpanded);
  });
}

function setPeopleSectionExpanded(expanded: boolean): void {
  isPeopleSectionExpanded = expanded;

  const { peopleSection, peopleSectionContent, peopleSectionToggle } = elements;
  if (!peopleSection || !peopleSectionContent || !peopleSectionToggle) return;

  peopleSectionToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  peopleSection.classList.toggle("collapsed", !expanded);
  peopleSectionContent.hidden = !expanded;
  peopleSectionContent.style.display = expanded ? "" : "none";
  if (expanded) {
    window.requestAnimationFrame(updatePeopleOverflowState);
  } else {
    isPeopleListExpanded = false;
    applyPeopleListState();
  }
}

function applyPeopleSectionState(): void {
  setPeopleSectionExpanded(isPeopleSectionExpanded);
}

function applyPeopleListState(): void {
  const { peopleSectionContent, peopleList, peopleExpandBtn } = elements;
  if (!peopleList || !peopleSectionContent || !peopleExpandBtn) return;

  peopleList.classList.toggle("expanded", isPeopleListExpanded);
  peopleList.classList.toggle("has-overflow", hasPeopleOverflow && !isPeopleListExpanded);
  peopleSectionContent.classList.toggle("expanded", isPeopleListExpanded);

  peopleExpandBtn.hidden = !hasPeopleOverflow;
  peopleExpandBtn.setAttribute("aria-expanded", isPeopleListExpanded ? "true" : "false");
  peopleExpandBtn.textContent = isPeopleListExpanded ? "Collapse" : "Expand";
}

function updatePeopleOverflowState(): void {
  const list = elements.peopleList;
  const content = elements.peopleSectionContent;
  if (!list || !content || content.hidden) {
    hasPeopleOverflow = false;
    applyPeopleListState();
    return;
  }

  const wasExpanded = isPeopleListExpanded;
  if (wasExpanded) {
    list.classList.remove("expanded");
  }

  const overflow = list.scrollWidth - list.clientWidth > 2;
  hasPeopleOverflow = overflow;
  if (!overflow) {
    isPeopleListExpanded = false;
  }

  if (wasExpanded) {
    list.classList.add("expanded");
  }

  applyPeopleListState();
}

function renderPersonRow(participant: MeetingParticipant): string {
  const rawEmail = participant.email ?? "";
  const emailAttr = escapeAttribute(rawEmail);
  const safeName = participant.name ? escapeHtml(participant.name) : "";
  const safeRole = participant.jobRole ? escapeHtml(participant.jobRole) : "";
  const displayName = safeName || "Unknown attendee";
  const fallbackInitialSource = safeName || (rawEmail ?? "");
  const initials = fallbackInitialSource.trim().charAt(0).toUpperCase() || "?";

  const editButton = rawEmail
    ? `<button type="button" class="person-edit-btn" data-email="${emailAttr}" aria-label="Edit ${displayName}" title="Edit">✏</button>`
    : "";

  const roleBadge = safeRole
    ? `<span class="chip-role" title="Job role">${safeRole}</span>`
    : "";

  const editForm = rawEmail
    ? `
      <form class="person-edit-form" data-email="${emailAttr}" hidden>
        <div class="person-edit-fields">
          <label>
            <span>Name</span>
            <input type="text" name="name" value="${safeName}" placeholder="Add a name" autocomplete="off" />
          </label>
          <label>
            <span>Job role</span>
            <input type="text" name="role" value="${safeRole}" placeholder="Add a job role" autocomplete="off" />
          </label>
        </div>
        <div class="person-edit-actions">
          <button type="submit" class="btn btn-primary btn-small">Save</button>
          <button type="button" class="btn btn-secondary btn-small person-cancel-btn">Cancel</button>
        </div>
      </form>
    `
    : "";

  return `
    <div class="person-chip" data-email="${emailAttr}">
      <span class="chip-avatar" aria-hidden="true">${initials}</span>
      <span class="chip-body">
        <span class="chip-label">${displayName}</span>
        ${roleBadge}
      </span>
      ${editButton}
      ${editForm}
    </div>
  `;
}

function toggleAddPersonForm(force?: boolean): void {
  if (!elements.addPersonForm || !elements.addPersonToggle) return;
  const shouldShow = force ?? elements.addPersonForm.hidden;
  elements.addPersonForm.hidden = !shouldShow;
  elements.addPersonToggle.textContent = shouldShow ? "×" : "＋";
  elements.addPersonToggle.title = shouldShow ? "Cancel" : "Add person";
  elements.addPersonToggle.setAttribute("aria-label", shouldShow ? "Cancel" : "Add person");

  if (!shouldShow) {
    elements.addPersonForm.reset();
  } else {
    elements.addPersonEmailInput?.focus();
  }
}

async function handleAddPersonSubmit(event: Event): Promise<void> {
  event.preventDefault();
  if (!elements.addPersonEmailInput) return;

  const emailInput = elements.addPersonEmailInput.value.trim();
  const nameInput = elements.addPersonNameInput?.value.trim() || "";
  const roleInput = elements.addPersonRoleInput?.value.trim() || "";

  const normalizedEmail = normalizeEmail(emailInput);
  if (!normalizedEmail) {
    showToast("Please provide a valid email address.", { type: "warning" });
    return;
  }

  const meeting = getCurrentMeeting();
  if (!meeting) return;

  if (meeting.participants?.some((participant) => normalizeEmail(participant.email) === normalizedEmail)) {
    showToast("This person is already linked to the meeting.", { type: "info" });
    return;
  }

  const now = new Date();
  const person: Person = {
    email: normalizedEmail,
    name: nameInput || undefined,
    jobRole: roleInput || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await db.savePerson(person);

  const updatedParticipants: MeetingParticipant[] = [
    ...(meeting.participants || []),
    {
      email: normalizedEmail,
      name: person.name,
      jobRole: person.jobRole,
    },
  ];

  await persistParticipants(updatedParticipants);

  elements.addPersonForm?.reset();
  toggleAddPersonForm(false);
}

function handlePeopleListClick(event: Event): void {
  const target = event.target as HTMLElement;
  const editBtn = target.closest<HTMLButtonElement>(".person-edit-btn");
  if (editBtn) {
    const chip = editBtn.closest<HTMLElement>(".person-chip");
    toggleEditState(chip, true);
    return;
  }

  const cancelBtn = target.closest<HTMLButtonElement>(".person-cancel-btn");
  if (cancelBtn) {
    const chip = cancelBtn.closest<HTMLElement>(".person-chip");
    toggleEditState(chip, false);
    renderPeoplePanel(getCurrentMeeting());
  }
}

async function handlePersonEditSubmit(event: Event): Promise<void> {
  const form = event.target as HTMLFormElement;
  if (!form.classList.contains("person-edit-form")) return;

  event.preventDefault();

  const email = form.dataset.email || "";
  if (!email) return;

  const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]');
  const roleInput = form.querySelector<HTMLInputElement>('input[name="role"]');
  const name = nameInput?.value ?? "";
  const role = roleInput?.value ?? "";

  await savePersonDetails(email, name, role);
}

async function savePersonDetails(email: string, rawName: string, rawRole: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;

  const trimmedName = rawName.trim();
  const trimmedRole = rawRole.trim();

  const existing = await db.getPerson(normalizedEmail);
  const now = new Date();

  const person: Person = existing
    ? { ...existing, updatedAt: now }
    : {
        email: normalizedEmail,
        name: undefined,
        jobRole: undefined,
        createdAt: now,
        updatedAt: now,
      };

  person.name = trimmedName || undefined;
  person.jobRole = trimmedRole || undefined;

  await db.savePerson(person);

  const meeting = getCurrentMeeting();
  if (!meeting || !meeting.participants) {
    renderPeoplePanel(meeting ?? null);
    return;
  }

  const updatedParticipants = meeting.participants.map((participant) => {
    if (normalizeEmail(participant.email) !== normalizedEmail) {
      return participant;
    }

    return {
      ...participant,
      name: person.name,
      jobRole: person.jobRole,
    };
  });

  await persistParticipants(updatedParticipants);
}

async function persistParticipants(participants: MeetingParticipant[]): Promise<void> {
  const meeting = getCurrentMeeting();
  if (!meeting) return;

  meeting.participants = participants.length > 0 ? participants : undefined;
  meeting.updatedAt = new Date();

  await db.saveMeeting(meeting);
  updateMeetingInList(meeting);
  renderMeetingsList();
  renderPeoplePanel(meeting);
}

function toggleEditState(chip: HTMLElement | null, editing: boolean): void {
  if (!chip) return;

  const form = chip.querySelector<HTMLFormElement>(".person-edit-form");
  chip.classList.toggle("editing", editing);
  if (form) {
    form.hidden = !editing;
    if (editing) {
      const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]');
      window.setTimeout(() => nameInput?.focus(), 0);
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"'<>]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return char;
    }
  });
}

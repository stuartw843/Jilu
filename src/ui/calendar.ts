import { calendarService } from "../calendar-service";
import { elements } from "../dom";
import { CalendarEventInstance } from "../types";
import { createMeetingFromCalendarEvent } from "../meeting-operations";
import { getMeetings, setCalendarEvents, getCalendarEvents, getCurrentMeeting, getIsRecording } from "../state";
import { switchToMeetingsMode } from "./tasks";
import { getDocumentIcon, getEditIcon, getMicrophoneIcon } from "../icons";
import { startRecording } from "../recording";
import { showToast } from "./interactions";

const CALENDAR_FILTER_STORAGE_KEY = "calendar-filter-selection";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const WEEK_IN_MS = DAY_IN_MS * 7;
const UPCOMING_WINDOW_MS = 6 * WEEK_IN_MS;
const PAST_WINDOW_MS = 30 * DAY_IN_MS;
const CALENDAR_UI_REFRESH_MS = 30 * 1000;
const NEAR_EVENT_WINDOW_MS = 5 * 60 * 1000;
const START_ICON = getMicrophoneIcon(16);
const PREP_ICON = getEditIcon(16);
const OPEN_ICON = getDocumentIcon(16);

let selectedCalendarId: string = "all";
let selectedDate = startOfDay(new Date());
let isSyncing = false;
let refreshIntervalId: number | null = null;
let refreshInFlight = false;
let reloadPending = false;

export async function initializeCalendarUI(): Promise<void> {
  bindCalendarListeners();
  const storedFilter = localStorage.getItem(CALENDAR_FILTER_STORAGE_KEY);
  if (storedFilter) {
    selectedCalendarId = storedFilter;
  }
  await refreshCalendarView({ reloadEvents: true });
  startCalendarRefreshLoop();

  const refreshAfterExternalUpdate = () => {
    if (isSyncing) return;
    void refreshCalendarView({ reloadEvents: true });
  };

  window.addEventListener("calendar-events-updated", refreshAfterExternalUpdate);

  window.addEventListener("calendar-sync-completed", refreshAfterExternalUpdate);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void refreshCalendarView({ reloadEvents: true });
    }
  });
}

async function loadCalendarEvents(): Promise<void> {
  const events = await calendarService.getAllEvents();
  setCalendarEvents(events);
  populateCalendarFilter(events);
  updateLastSync();
}

function bindCalendarListeners(): void {
  const todayBtn = elements.calendarTodayBtn;
  todayBtn?.addEventListener("click", () => {
    setSelectedDate(startOfDay(new Date()));
  });

  const datePicker = elements.calendarDatePicker;
  datePicker?.addEventListener("change", (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      setSelectedDate(startOfDay(new Date(`${value}T00:00:00`)));
    }
  });

  const filter = elements.calendarFilter;
  if (filter) {
    filter.addEventListener("change", () => {
      selectedCalendarId = filter.value;
      localStorage.setItem(CALENDAR_FILTER_STORAGE_KEY, selectedCalendarId);
      renderCalendarView();
    });
  }

  const prevWeekBtn = elements.calendarPrevWeekBtn;
  prevWeekBtn?.addEventListener("click", () => changeDay(-1));

  const nextWeekBtn = elements.calendarNextWeekBtn;
  nextWeekBtn?.addEventListener("click", () => changeDay(1));

  const prevDayBtn = elements.calendarPrevDayBtn;
  prevDayBtn?.addEventListener("click", () => changeDay(-1));

  const nextDayBtn = elements.calendarNextDayBtn;
  nextDayBtn?.addEventListener("click", () => changeDay(1));

  const syncBtn = elements.calendarSyncBtn;
  syncBtn?.addEventListener("click", handleManualSync);

  elements.calendarGrid?.addEventListener("click", (event) => {
    const dayCell = (event.target as HTMLElement).closest<HTMLElement>(".calendar-grid-day");
    if (!dayCell) return;
    const dateValue = dayCell.dataset.date;
    if (dateValue) {
      setSelectedDate(startOfDay(new Date(`${dateValue}T00:00:00`)));
    }
  });

  [
    elements.calendarTimeline,
    elements.calendarDayAgenda,
    elements.calendarPriorityNow,
    elements.calendarPriorityNext,
    elements.nextEventPill,
  ].forEach((el) => el?.addEventListener("click", handleCalendarActionClick));

  updateDatePicker();
  updateSelectedDateLabels();
}

async function handleManualSync(): Promise<void> {
  if (isSyncing) return;
  if (!elements.calendarSyncBtn) return;

  const settings = calendarService.getSettings();
  if (settings.selectedCalendarIds.length === 0) {
    showToast("No calendars selected for sync. Pick calendars in Settings to start syncing.", { type: "warning" });
    return;
  }

  isSyncing = true;
  const originalText = elements.calendarSyncBtn.textContent;
  elements.calendarSyncBtn.textContent = "Syncing…";
  elements.calendarSyncBtn.setAttribute("disabled", "true");

  try {
    await calendarService.syncNow();
    await refreshCalendarView({ reloadEvents: true });
  } catch (error) {
    console.error("Calendar sync failed:", error);
  } finally {
    elements.calendarSyncBtn.textContent = originalText || "🔄 Sync";
    elements.calendarSyncBtn.removeAttribute("disabled");
    isSyncing = false;
    updateLastSync();
  }
}

function populateCalendarFilter(events: CalendarEventInstance[]): void {
  const filter = elements.calendarFilter;
  if (!filter) return;

  const unique = new Map<string, string>();
  events.forEach((event) => {
    if (!unique.has(event.calendarId)) {
      unique.set(event.calendarId, event.calendarName || "Calendar");
    }
  });

  const previousSelection = selectedCalendarId;
  filter.innerHTML = `
    <option value=\"all\">All calendars</option>
    ${Array.from(unique.entries())
      .map(([id, name]) => `<option value=\"${id}\">${name}</option>`)
      .join("")}
  `;

  if (previousSelection === "all") {
    filter.value = "all";
    selectedCalendarId = "all";
  } else if (unique.has(previousSelection)) {
    filter.value = previousSelection;
    selectedCalendarId = previousSelection;
  } else {
    filter.value = "all";
    selectedCalendarId = "all";
  }

  localStorage.setItem(CALENDAR_FILTER_STORAGE_KEY, selectedCalendarId);
}

function renderCalendarView(): void {
  updateSelectedDateLabels();
  updateRangePill();
  renderPriorityStrip();
  renderTimeline();
  renderDayAgenda();
  renderCalendarGrid();
  renderTopBarNextEvent();
}

function renderTimeline(): void {
  const pane = elements.calendarTimeline;
  if (!pane) return;

  const now = new Date();
  const { start, end } = getCalendarWindow();

  const events = getCalendarEvents()
    .filter(filterByCalendar)
    .filter((event) => {
      const startTime = new Date(event.startTime);
      const endTime = new Date(event.endTime);
      const isOngoingOrFuture = endTime >= now;
      return startTime >= start && startTime <= end && isOngoingOrFuture;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  if (events.length === 0) {
    pane.innerHTML = `
      <div class="calendar-empty-state">
        <p>No events in this window.</p>
      </div>
    `;
    return;
  }

  const grouped = groupEventsByDate(events);
  const linkedIds = buildLinkedMeetingIdSet();
  const todayKey = formatDateKey(now);
  const nextWorkKey = formatDateKey(nextWorkingDay(now));

  const upcomingDays = grouped.filter(({ key }) => key === todayKey || key === nextWorkKey);

  const renderSection = (label: string, days: typeof grouped, emptyText: string) => {
    if (days.length === 0) {
      return `
        <div class="calendar-timeline-section empty">
          <header class="calendar-day-header">${label}</header>
          <div class="calendar-empty-state compact"><p>${emptyText}</p></div>
        </div>
      `;
    }

    return `
      <div class="calendar-timeline-section">
        <header class="calendar-day-header">${label}</header>
        ${days
          .map(
            ({ label: dayLabel, items }) => `
              <div class="calendar-day-group">
                <div class="calendar-day-header subtle">${dayLabel}</div>
                <div class="calendar-day-events">
                  ${items.map((event) => renderEventCard(event, linkedIds)).join("")}
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  };

  pane.innerHTML = renderSection("Upcoming", upcomingDays, "Nothing scheduled yet");
}

function renderPriorityStrip(): void {
  const nowCard = elements.calendarPriorityNow;
  const nextCard = elements.calendarPriorityNext;
  if (!nowCard || !nextCard) return;

  const now = new Date();
  const linkedIds = buildLinkedMeetingIdSet();
  const currentMeeting = getCurrentMeeting();
  const isRecording = getIsRecording();
  const ongoing =
    getCalendarEvents()
      .filter(filterByCalendar)
      .find((event) => {
        const start = new Date(event.startTime);
        const end = new Date(event.endTime);
        const isOngoing = start <= now && end >= now;
        const isRecordingMatch = isRecording && currentMeeting?.calendarEventId === event.id;
        return isOngoing || isRecordingMatch;
      }) ?? null;

  const next = getNextUpcomingEvent(true);

  const renderPriorityCard = (
    target: HTMLElement,
    event: CalendarEventInstance | null,
    label: string
  ) => {
    if (!event) {
      target.innerHTML = "";
      return;
    }

    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    const timing = getTimingInfo(start, end);
    const isLinked = linkedIds.has(event.id);
    const currentMeeting = getCurrentMeeting();
    const isRecording = getIsRecording() && currentMeeting?.calendarEventId === event.id;
    const timingLabel = isRecording ? "Recording" : timing.label;
    const timingTone = isRecording ? "now" : timing.tone;

    target.innerHTML = `
      <div class="priority-card-label">${label}</div>
      <div class="priority-card-title">${escapeHtml(event.title || "Untitled event")}</div>
      <div class="priority-card-meta">
        <span class="pill-chip">${formatTimeRange(start, end)}</span>
        ${event.location ? `<span class="pill-chip">${escapeHtml(event.location)}</span>` : ""}
        ${isRecording ? `<span class="pill-chip recording">Transcribing</span>` : ""}
      </div>
      <div class="priority-card-timing ${timingTone}">${escapeHtml(timingLabel)}</div>
      <div class="priority-card-actions">
        ${
          isLinked
            ? `<button class="btn btn-secondary btn-icon calendar-action" data-action="open" data-event-id="${event.id}" title="Open note" aria-label="Open note">${OPEN_ICON}</button>`
            : `<button class="btn btn-primary btn-icon calendar-action" data-action="start" data-event-id="${event.id}" title="Start meeting" aria-label="Start meeting">${START_ICON}</button>`
        }
        <button class="btn btn-secondary btn-icon calendar-action" data-action="prep" data-event-id="${event.id}" title="Prep notes" aria-label="Prep notes">${PREP_ICON}</button>
      </div>
    `;
  };

  if (!ongoing) {
    nowCard.hidden = true;
  } else {
    nowCard.hidden = false;
    renderPriorityCard(nowCard, ongoing, "Now");
  }
  renderPriorityCard(nextCard, ongoing ? getNextAfter(ongoing) : next, "Up next");
}

function renderDayAgenda(): void {
  const agenda = elements.calendarDayAgenda;
  if (!agenda) return;

  const linkedIds = buildLinkedMeetingIdSet();
  const dayEvents = getCalendarEvents()
    .filter(filterByCalendar)
    .filter((event) => isSameDay(new Date(event.startTime), selectedDate))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  if (dayEvents.length === 0) {
    agenda.innerHTML = `
      <div class="calendar-empty-state compact">
        <p>No events on this day.</p>
        <p class="small-text">Use the arrows or date picker to hop across the six-week horizon.</p>
      </div>
    `;
    return;
  }

  agenda.innerHTML = `
    <div class="calendar-day-stack">
      ${dayEvents.map((event) => renderEventCard(event, linkedIds, false, { showTimingChip: false })).join("")}
    </div>
  `;
}

function renderCalendarGrid(): void {
  const grid = elements.calendarGrid;
  if (!grid) return;

  const today = startOfDay(new Date());
  const { start, end } = getCalendarWindow();
  const gridStart = getWeekStart(start);
  const totalDays = Math.ceil((end.getTime() - gridStart.getTime()) / DAY_IN_MS) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);
  const gridEnd = new Date(gridStart.getTime() + totalWeeks * WEEK_IN_MS);

  const eventsByDay = buildEventsByDay(gridStart, gridEnd);
  const selectedDayEvents = eventsByDay.get(formatDateKey(selectedDate)) ?? [];

  if (selectedDayEvents.length === 0) {
    grid.classList.add("hidden");
    grid.innerHTML = "";
    return;
  } else {
    grid.classList.remove("hidden");
  }

  const headRow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .map((name) => `<div class="calendar-grid-head-cell">${name}</div>`)
    .join("");

  const linkedIds = buildLinkedMeetingIdSet();

  const cells = Array.from({ length: totalWeeks * 7 })
    .map((_, index) => {
      const date = new Date(gridStart.getTime() + index * DAY_IN_MS);
      const key = formatDateKey(date);
      const dayEvents = eventsByDay.get(key) ?? [];
      const preview = dayEvents
        .slice(0, 3)
        .map((event) => {
          const startTime = new Date(event.startTime);
          const linked = linkedIds.has(event.id);
          return `
            <div class="calendar-grid-event-chip${linked ? " linked" : ""}">
              <span class="time">${startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span class="title">${escapeHtml(event.title || "Untitled")}</span>
            </div>
          `;
        })
        .join("");
      const extra =
        dayEvents.length > 3 ? `<div class="calendar-grid-more">+${dayEvents.length - 3} more</div>` : "";

      const classes = ["calendar-grid-day"];
      if (isToday(date)) classes.push("today");
      if (isSameDay(date, selectedDate)) classes.push("selected");
      if (dayEvents.length > 0) classes.push("has-events");
      if (date < today) classes.push("past");

      return `
        <button class="${classes.join(" ")}" data-date="${key}" aria-label="${date.toDateString()}" type="button">
          <div class="calendar-grid-day-header">
            <span class="calendar-grid-day-name">${date.toLocaleDateString(undefined, { weekday: "short" })}</span>
            <span class="calendar-grid-day-number">${date.getDate()}</span>
          </div>
          <div class="calendar-grid-day-events">
            ${preview}${extra}
          </div>
        </button>
      `;
    })
    .join("");

  grid.innerHTML = `
    <div class="calendar-grid-head">${headRow}</div>
    ${cells}
  `;
}

function changeDay(offsetDays: number): void {
  const target = startOfDay(new Date(selectedDate.getTime() + offsetDays * DAY_IN_MS));
  setSelectedDate(target);
}

function setSelectedDate(date: Date): void {
  const { start, end } = getCalendarWindow();
  const clamped = date < start ? start : date > startOfDay(end) ? startOfDay(end) : date;
  selectedDate = clamped;
  updateDatePicker();
  renderCalendarView();
}

async function refreshCalendarView(options: { reloadEvents?: boolean } = {}): Promise<void> {
  const { reloadEvents = false } = options;

  if (reloadEvents) {
    reloadPending = true;
  }

  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;

  try {
    const shouldReload = reloadPending || reloadEvents;
    reloadPending = false;

    if (shouldReload) {
      await loadCalendarEvents();
    }

    renderCalendarView();
  } finally {
    refreshInFlight = false;

    if (reloadPending) {
      void refreshCalendarView();
    }
  }
}

function startCalendarRefreshLoop(): void {
  if (refreshIntervalId !== null) {
    window.clearInterval(refreshIntervalId);
  }

  refreshIntervalId = window.setInterval(() => {
    void refreshCalendarView();
  }, CALENDAR_UI_REFRESH_MS);
}

function renderEventCard(
  event: CalendarEventInstance,
  linkedIds: Set<string>,
  isOverlapping: boolean = false,
  options: { showTimingChip?: boolean } = {}
): string {
  const { showTimingChip = true } = options;
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const isLinked = linkedIds.has(event.id);

  const attendeeNames =
    event.attendees
      ?.map((attendee) => attendee.name || attendee.email)
      .filter((value): value is string => Boolean(value))
      .reduce<string[]>((acc, value) => {
        if (!acc.includes(value)) acc.push(value);
        return acc;
      }, []) ?? [];

  const MAX_ATTENDEE_CHIPS = 6;
  const visibleAttendees = attendeeNames.slice(0, MAX_ATTENDEE_CHIPS);
  const remaining = Math.max(attendeeNames.length - MAX_ATTENDEE_CHIPS, 0);

  const attendeeChips = [
    ...visibleAttendees.map((value) => `<span class="calendar-event-chip attendee">${escapeHtml(value)}</span>`),
    ...(remaining > 0 ? [`<span class="calendar-event-chip attendee attendee-more">+${remaining} more</span>`] : []),
  ].join("");

  const locationChip = event.location
    ? `<span class="calendar-event-chip location">${escapeHtml(event.location)}</span>`
    : "";
  const calendarChip = event.calendarName
    ? `<span class="calendar-event-chip calendar-source">${escapeHtml(event.calendarName)}</span>`
    : "";
  const seriesChip = event.seriesName
    ? `<span class="calendar-event-chip series">${escapeHtml(event.seriesName)}</span>`
    : "";
  let timingChip = "";
  if (showTimingChip) {
    const timing = getTimingInfo(start, end);
    const currentMeeting = getCurrentMeeting();
    const isRecording = getIsRecording() && currentMeeting?.calendarEventId === event.id;
    const timingLabel = isRecording ? "Recording" : timing.label;
    const timingTone = isRecording ? "now" : timing.tone;
    timingChip = `<span class="calendar-event-chip timing ${timingTone}">${escapeHtml(timingLabel)}</span>`;
  }

  return `
    <article class="calendar-event-card${isLinked ? " linked" : ""}${isOverlapping ? " overlapping" : ""}" data-event-id="${event.id}">
      <div class="calendar-event-timeblock">
        <span class="calendar-event-time">${formatTimeRange(start, end)}</span>
        ${timingChip}
        ${seriesChip}
      </div>
      <div class="calendar-event-body">
        <div class="calendar-event-title-row">
          <div class="calendar-event-title">${escapeHtml(event.title || "Untitled event")}</div>
          ${calendarChip}
        </div>
        <div class="calendar-event-meta">
          ${locationChip}
          ${attendeeChips}
        </div>
        <div class="calendar-event-actions">
        ${
          isLinked
            ? `<button class="btn btn-secondary btn-icon calendar-action" data-action="open" data-event-id="${event.id}" title="Open note" aria-label="Open note">${OPEN_ICON}</button>`
            : `<button class="btn btn-primary btn-icon calendar-action" data-action="start" data-event-id="${event.id}" title="Start transcription" aria-label="Start transcription">${START_ICON}</button>`
        }
        <button class="btn btn-secondary btn-icon calendar-action" data-action="prep" data-event-id="${event.id}" title="Prep notes" aria-label="Prep notes">${PREP_ICON}</button>
        </div>
      </div>
    </article>
  `;
}

function groupEventsByDate(
  events: CalendarEventInstance[]
): Array<{ key: string; label: string; items: CalendarEventInstance[] }> {
  const groups = new Map<string, CalendarEventInstance[]>();

  events.forEach((event) => {
    const dayKey = formatDateKey(startOfDay(new Date(event.startTime)));
    if (!groups.has(dayKey)) {
      groups.set(dayKey, []);
    }
    groups.get(dayKey)!.push(event);
  });

  const sortedKeys = Array.from(groups.keys()).sort();

  return sortedKeys.map((key) => {
    const date = parseDateKey(key);
    return {
      key,
      label: formatDayLabel(date),
      items: groups.get(key)!.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      ),
    };
  });
}

async function handleCalendarActionClick(event: Event): Promise<void> {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(".calendar-action");
  if (!target) return;

  const action = target.dataset.action;
  const eventId = target.dataset.eventId;
  if (!eventId) return;

  if (action === "start") {
    const meeting = await createMeetingFromCalendarEvent(eventId, { activate: true });
    if (meeting) {
      switchToMeetingsMode();
      await startRecording();
    }
  } else if (action === "prep") {
    const meeting = await createMeetingFromCalendarEvent(eventId, { activate: true });
    if (meeting) {
      switchToMeetingsMode();
    }
  } else if (action === "open") {
    const meeting = await createMeetingFromCalendarEvent(eventId, { activate: true });
    if (meeting) {
      switchToMeetingsMode();
    }
  }

  renderCalendarView();
}

function filterByCalendar(event: CalendarEventInstance): boolean {
  if (selectedCalendarId === "all") return true;
  return event.calendarId === selectedCalendarId;
}

function updateSelectedDateLabels(): void {
  const label = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  if (elements.calendarSelectedDateLabel) {
    elements.calendarSelectedDateLabel.textContent = label;
  }

  if (elements.calendarFocusLabel) {
    elements.calendarFocusLabel.textContent = label;
  }

  if (elements.calendarDayLabel) {
    elements.calendarDayLabel.textContent = label;
  }
}

function updateRangePill(): void {
  if (!elements.calendarRangePill) return;
  const { start, end } = getCalendarWindow();
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  elements.calendarRangePill.textContent = `Past 30 days → Next 6 weeks (${startLabel} – ${endLabel})`;
}

function updateDatePicker(): void {
  if (!elements.calendarDatePicker) return;
  const tzOffset = selectedDate.getTimezoneOffset() * 60000;
  const localISODate = new Date(selectedDate.getTime() - tzOffset).toISOString().split("T")[0];
  elements.calendarDatePicker.value = localISODate;
}

function updateLastSync(): void {
  if (!elements.calendarLastSync) return;
  const lastSync = calendarService.getLastSyncAt();
  if (!lastSync) {
    elements.calendarLastSync.textContent = "Last synced: -";
  } else {
    elements.calendarLastSync.textContent = `Last synced: ${lastSync.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
}

function getCalendarWindow(): { start: Date; end: Date } {
  const now = new Date();
  const start = startOfDay(new Date(now.getTime() - PAST_WINDOW_MS));
  const end = new Date(now.getTime() + UPCOMING_WINDOW_MS);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getWeekStart(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day;
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function buildEventsByDay(rangeStart: Date, rangeEnd: Date): Map<string, CalendarEventInstance[]> {
  const events = getCalendarEvents()
    .filter(filterByCalendar)
    .filter((event) => {
      const start = new Date(event.startTime);
      return start >= rangeStart && start <= rangeEnd;
    });

  const map = new Map<string, CalendarEventInstance[]>();

  events.forEach((event) => {
    const key = formatDateKey(startOfDay(new Date(event.startTime)));
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(event);
  });

  map.forEach((list) =>
    list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  );

  return map;
}

function buildLinkedMeetingIdSet(): Set<string> {
  return new Set(
    getMeetings()
      .filter((meeting) => meeting.calendarEventId)
      .map((meeting) => meeting.calendarEventId!)
  );
}

function getNextUpcomingEvent(useFilter: boolean = true): CalendarEventInstance | null {
  const now = new Date();
  const horizon = new Date(now.getTime() + UPCOMING_WINDOW_MS);
  const events = getCalendarEvents()
    .filter((event) => (useFilter ? filterByCalendar(event) : true))
    .filter((event) => {
      const start = new Date(event.startTime);
      const end = new Date(event.endTime);
      return end >= now && start <= horizon;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  if (events.length === 0) return null;

  const ongoing = events.find((event) => {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    return start <= now && end >= now;
  });

  return ongoing ?? events[0];
}

function getNextAfter(current: CalendarEventInstance): CalendarEventInstance | null {
  const events = getCalendarEvents()
    .filter(filterByCalendar)
    .filter((event) => new Date(event.startTime) > new Date(current.startTime))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return events[0] ?? null;
}

function nextWorkingDay(from: Date): Date {
  const candidate = new Date(from);
  candidate.setHours(0, 0, 0, 0);
  do {
    candidate.setDate(candidate.getDate() + 1);
  } while (candidate.getDay() === 0 || candidate.getDay() === 6);
  return candidate;
}

type BannerEventResult = {
  event: CalendarEventInstance | null;
  isUpcomingSoon: boolean;
  replacedOngoing: boolean;
};

function findNextBannerEvent(): BannerEventResult {
  const now = new Date();
  const currentMeeting = getCurrentMeeting();
  const isRecording = getIsRecording();
  const events = getCalendarEvents().filter(filterByCalendar);

  const recordingEvent =
    isRecording && currentMeeting?.calendarEventId
      ? events.find((e) => e.id === currentMeeting.calendarEventId) ?? null
      : null;

  const ongoingEvent =
    recordingEvent ??
    (events.find((event) => {
      const start = new Date(event.startTime);
      const end = new Date(event.endTime);
      return start <= now && end >= now;
    }) ?? null);

  const upcomingSoon =
    events
      .filter((event) => {
        const start = new Date(event.startTime);
        const timeUntilStart = start.getTime() - now.getTime();
        return timeUntilStart > 0 && timeUntilStart <= NEAR_EVENT_WINDOW_MS;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] ?? null;

  if (upcomingSoon) {
    return {
      event: upcomingSoon,
      isUpcomingSoon: true,
      replacedOngoing: ongoingEvent ? ongoingEvent.id !== upcomingSoon.id : false,
    };
  }

  if (ongoingEvent) {
    return { event: ongoingEvent, isUpcomingSoon: false, replacedOngoing: false };
  }

  return { event: null, isUpcomingSoon: false, replacedOngoing: false };
}

function renderTopBarNextEvent(): void {
  const pill = elements.nextEventPill;
  if (!pill) return;

  const { event, isUpcomingSoon, replacedOngoing } = findNextBannerEvent();
  const currentMeeting = getCurrentMeeting();
  const isRecording = getIsRecording() && currentMeeting?.calendarEventId === event?.id;
  if (!event) {
    pill.hidden = true;
    pill.innerHTML = "";
    return;
  }

  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const timing = getTimingInfo(start, end);
  const timingLabel = isRecording ? "Recording" : timing.label;
  const timingTone = isRecording ? "now" : timing.tone;
  const isLinked = buildLinkedMeetingIdSet().has(event.id);
  const pillLabel = isUpcomingSoon && replacedOngoing ? `Next · ${timingLabel}` : timingLabel;

  pill.hidden = false;
  pill.innerHTML = `
    <div class="next-event-pill-left">
      <div class="next-event-pill-label ${timingTone}">${escapeHtml(pillLabel)}</div>
      <div class="next-event-pill-title">${escapeHtml(event.title || "Untitled event")}</div>
    </div>
    <div class="next-event-pill-actions">
      ${
        isLinked
          ? `<button class="btn btn-secondary btn-icon calendar-action" data-action="open" data-event-id="${event.id}" title="Open note" aria-label="Open note">${OPEN_ICON}</button>`
          : `<button class="btn btn-primary btn-icon calendar-action" data-action="start" data-event-id="${event.id}" title="Start meeting" aria-label="Start meeting">${START_ICON}</button>`
      }
      <button class="btn btn-secondary btn-icon calendar-action" data-action="prep" data-event-id="${event.id}" title="Prep notes" aria-label="Prep notes">${PREP_ICON}</button>
    </div>
  `;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

function getTimingInfo(
  start: Date,
  end: Date
): { label: string; tone: "now" | "soon" | "later" | "past" } {
  const now = new Date();

  if (start <= now && end >= now) {
    const minutesLeft = Math.max(Math.round((end.getTime() - now.getTime()) / 60000), 0);
    const label = minutesLeft > 0 ? `Now · ${minutesLeft}m left` : "Ending now";
    return { label, tone: "now" };
  }

  if (start > now) {
    const diffMs = start.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes <= 5) {
      return { label: "Starts in <5m", tone: "now" };
    }
    if (diffMinutes <= 60) {
      return { label: `Starts in ${diffMinutes}m`, tone: "soon" };
    }
    if (isSameDay(start, now)) {
      return {
        label: `Today · ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        tone: "later",
      };
    }
    return { label: formatDayLabel(start), tone: "later" };
  }

  return { label: `Ended ${formatRelativeTime(end)}`, tone: "past" };
}

function formatRelativeTime(target: Date): string {
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  const minutes = Math.round(absMs / 60000);
  if (minutes < 1) return diffMs >= 0 ? "in <1m" : "<1m ago";
  if (minutes < 60) return diffMs >= 0 ? `in ${minutes}m` : `${minutes}m ago`;

  const hours = Math.round(absMs / (60 * 60000));
  if (hours < 24) return diffMs >= 0 ? `in ${hours}h` : `${hours}h ago`;

  const days = Math.round(absMs / (24 * 60 * 60000));
  return diffMs >= 0 ? `in ${days}d` : `${days}d ago`;
}

function formatTimeRange(start: Date, end: Date): string {
  const startText = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endText = end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${startText} – ${endText}`;
}

function formatDayLabel(date: Date): string {
  if (isToday(date)) {
    return "Today";
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, tomorrow)) {
    return "Tomorrow";
  }
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatDateKey(date: Date): string {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().split("T")[0];
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
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

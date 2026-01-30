/**
 * Database serialization utilities for converting between runtime and stored formats
 */

import type {
  Meeting,
  Person,
  CustomDictionaryEntry,
  MeetingParticipant,
  TranscriptTurn,
  CalendarEventInstance,
  Task,
} from "../types";
import { normalizeEmail, transcriptTextToTurns } from "../utils";
import { sanitizeSoundsLike, normalizeDictionaryContent } from "../utils/text";

export interface SerializedMeeting extends Omit<Meeting, "date" | "createdAt" | "updatedAt"> {
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedCalendarEvent extends CalendarEventInstance {}

export interface SerializedPerson extends Omit<Person, "createdAt" | "updatedAt"> {
  createdAt: string;
  updatedAt: string;
}

export interface SerializedCustomDictionaryEntry extends Omit<CustomDictionaryEntry, "createdAt" | "updatedAt"> {
  createdAt: string;
  updatedAt: string;
  normalizedContent: string;
}

export interface SerializedTask extends Omit<Task, "dueDate" | "createdAt" | "updatedAt"> {
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseExport {
  version: number;
  exportedAt: string;
  meetings: SerializedMeeting[];
  calendarEvents?: SerializedCalendarEvent[];
  people?: SerializedPerson[];
  customDictionary?: SerializedCustomDictionaryEntry[];
  tasks?: SerializedTask[];
}

/**
 * Serializes a Date to ISO string
 */
export function serializeDate(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return parsed.toISOString();
}

/**
 * Normalizes email for use as database key
 */
export function normalizeEmailKey(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error(`Invalid email value: ${email}`);
  }
  return normalized;
}

/**
 * Normalizes transcript data from various formats
 */
export function normalizeTranscript(raw: unknown): TranscriptTurn[] {
  if (Array.isArray(raw)) {
    const turns: TranscriptTurn[] = [];
    raw.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }
      const text = typeof (item as any).text === "string" ? (item as any).text : "";
      const speakerRaw = (item as any).speaker;
      const speaker =
        typeof speakerRaw === "string" && speakerRaw.trim().length > 0
          ? speakerRaw.trim()
          : null;

      if (text && text.trim().length > 0) {
        turns.push({
          speaker,
          text: text.trim(),
        });
      }
    });
    if (turns.length > 0) {
      return turns;
    }
  } else if (typeof raw === "string") {
    return transcriptTextToTurns(raw);
  }

  return [];
}

/**
 * Normalizes participant data from various formats
 */
export function normalizeParticipants(raw: unknown): MeetingParticipant[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }

  if (typeof raw[0] === "string") {
    const mapped = (raw as string[])
      .map(value => value?.trim())
      .filter((value): value is string => Boolean(value))
      .map(value => {
        const email = normalizeEmail(value);
        if (email) {
          return { email };
        }
        return { name: value };
      });
    return mapped.length > 0 ? mapped : undefined;
  }

  return (raw as MeetingParticipant[])
    .map(participant => {
      const normalizedEmail = participant.email ? normalizeEmail(participant.email) : null;
      const name = participant.name?.trim() || undefined;
      const jobRole = participant.jobRole?.trim() || undefined;
      return {
        email: normalizedEmail || undefined,
        name,
        jobRole,
      };
    })
    .filter(participant => participant.email || participant.name);
}

/**
 * Serializes a meeting for storage
 */
export function serializeMeeting(meeting: Meeting): SerializedMeeting {
  return {
    ...meeting,
    transcript: meeting.transcript.map((turn) => ({
      speaker: turn.speaker ?? null,
      text: turn.text ?? "",
    })),
    date: serializeDate(meeting.date),
    createdAt: serializeDate(meeting.createdAt),
    updatedAt: serializeDate(meeting.updatedAt),
  };
}

/**
 * Deserializes a meeting from storage
 */
export function deserializeMeeting(serialized: SerializedMeeting): Meeting {
  const requiredFields: (keyof SerializedMeeting)[] = [
    "id",
    "title",
    "date",
    "createdAt",
    "updatedAt",
  ];

  for (const field of requiredFields) {
    if (serialized[field] === undefined || serialized[field] === null) {
      throw new Error(`Meeting is missing required field: ${String(field)}`);
    }
  }

  const date = new Date(serialized.date);
  const createdAt = new Date(serialized.createdAt);
  const updatedAt = new Date(serialized.updatedAt);

  if (Number.isNaN(date.getTime())) throw new Error(`Invalid meeting date: ${serialized.date}`);
  if (Number.isNaN(createdAt.getTime())) throw new Error(`Invalid createdAt date: ${serialized.createdAt}`);
  if (Number.isNaN(updatedAt.getTime())) throw new Error(`Invalid updatedAt date: ${serialized.updatedAt}`);

  const participants = normalizeParticipants((serialized as any).participants);
  const transcript = normalizeTranscript((serialized as any).transcript);
  const sanitizedSerialized = { ...(serialized as any) };
  delete (sanitizedSerialized as any).progressiveSummaries;
  delete (sanitizedSerialized as any).lastProgressiveSummaryTurn;

  return {
    ...(sanitizedSerialized as SerializedMeeting),
    participants,
    tags: serialized.tags ?? undefined,
    transcript,
    personalNotes: serialized.personalNotes ?? "",
    enhancedNotes: serialized.enhancedNotes ?? "",
    date,
    createdAt,
    updatedAt,
  };
}

/**
 * Serializes a person for storage
 */
export function serializePerson(person: Person): SerializedPerson {
  return {
    ...person,
    email: normalizeEmailKey(person.email),
    createdAt: serializeDate(person.createdAt),
    updatedAt: serializeDate(person.updatedAt),
  };
}

/**
 * Deserializes a person from storage
 */
export function deserializePerson(serialized: SerializedPerson): Person {
  const createdAt = new Date(serialized.createdAt);
  const updatedAt = new Date(serialized.updatedAt);

  if (Number.isNaN(createdAt.getTime())) throw new Error(`Invalid person createdAt: ${serialized.createdAt}`);
  if (Number.isNaN(updatedAt.getTime())) throw new Error(`Invalid person updatedAt: ${serialized.updatedAt}`);

  return {
    ...serialized,
    email: normalizeEmailKey(serialized.email),
    createdAt,
    updatedAt,
  };
}

/**
 * Serializes a custom dictionary entry for storage
 */
export function serializeCustomDictionaryEntry(entry: CustomDictionaryEntry): SerializedCustomDictionaryEntry {
  const content = entry.content.trim();
  if (!content) {
    throw new Error("Custom dictionary entry must include content");
  }

  const createdAt = serializeDate(entry.createdAt);
  const updatedAt = serializeDate(entry.updatedAt);
  const soundsLike = sanitizeSoundsLike(entry.soundsLike || []);

  return {
    id: entry.id,
    content,
    soundsLike,
    createdAt,
    updatedAt,
    normalizedContent: normalizeDictionaryContent(content),
  };
}

/**
 * Deserializes a custom dictionary entry from storage
 */
export function deserializeCustomDictionaryEntry(serialized: SerializedCustomDictionaryEntry): CustomDictionaryEntry {
  const createdAt = new Date(serialized.createdAt);
  const updatedAt = new Date(serialized.updatedAt);

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`Invalid dictionary createdAt: ${serialized.createdAt}`);
  }
  if (Number.isNaN(updatedAt.getTime())) {
    throw new Error(`Invalid dictionary updatedAt: ${serialized.updatedAt}`);
  }

  return {
    id: serialized.id,
    content: serialized.content,
    soundsLike: sanitizeSoundsLike(serialized.soundsLike || []),
    createdAt,
    updatedAt,
  };
}

export function serializeTask(task: Task): SerializedTask {
  return {
    ...task,
    dueDate: task.dueDate ? serializeDate(task.dueDate) : null,
    createdAt: serializeDate(task.createdAt),
    updatedAt: serializeDate(task.updatedAt),
  };
}

export function deserializeTask(serialized: SerializedTask): Task {
  const createdAt = new Date(serialized.createdAt);
  const updatedAt = new Date(serialized.updatedAt);

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`Invalid task createdAt: ${serialized.createdAt}`);
  }

  if (Number.isNaN(updatedAt.getTime())) {
    throw new Error(`Invalid task updatedAt: ${serialized.updatedAt}`);
  }

  const dueDate =
    serialized.dueDate === null
      ? null
      : new Date(serialized.dueDate);

  if (dueDate && Number.isNaN(dueDate.getTime())) {
    throw new Error(`Invalid task dueDate: ${serialized.dueDate}`);
  }

  return {
    ...serialized,
    dueDate,
    createdAt,
    updatedAt,
  };
}

export function serializeCalendarEvent(event: CalendarEventInstance): SerializedCalendarEvent {
  return { ...event };
}

export function deserializeCalendarEvent(serialized: SerializedCalendarEvent): CalendarEventInstance {
  return { ...serialized };
}

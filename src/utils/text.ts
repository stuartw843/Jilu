/**
 * Text processing utilities
 */

import { TranscriptTurn } from "../types";

/**
 * Normalizes email addresses to lowercase
 */
export function normalizeEmail(email?: string | null): string | null {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  if (!trimmed.includes("@")) return null;
  return trimmed.toLowerCase();
}

/**
 * Collapses multiple whitespace characters into single spaces
 */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Converts transcript turns to plain text
 */
export function transcriptTurnsToText(transcript: TranscriptTurn[] | undefined | null): string {
  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    return "";
  }

  return transcript
    .map((turn) => {
      const text = turn.text?.trim() || "";
      if (!text) return "";
      
      const speaker = turn.speaker?.trim();
      if (speaker) {
        return `${speaker}: ${text}`;
      }
      return text;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Converts plain text to transcript turns
 */
export function transcriptTextToTurns(raw: string | undefined | null): TranscriptTurn[] {
  if (!raw || typeof raw !== "string") {
    return [];
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const lines = trimmed.split(/\n+/);
  const turns: TranscriptTurn[] = [];

  for (const line of lines) {
    const cleaned = line.trim();
    if (!cleaned) continue;

    const colonIndex = cleaned.indexOf(":");
    if (colonIndex > 0 && colonIndex < 50) {
      const potentialSpeaker = cleaned.slice(0, colonIndex).trim();
      if (potentialSpeaker && !potentialSpeaker.includes(" ")) {
        const text = cleaned.slice(colonIndex + 1).trim();
        if (text) {
          turns.push({
            speaker: potentialSpeaker,
            text,
          });
          continue;
        }
      }
    }

    turns.push({
      speaker: null,
      text: cleaned,
    });
  }

  return turns;
}

/**
 * Checks if transcript has meaningful content
 */
export function hasTranscriptContent(transcript: TranscriptTurn[] | undefined | null): boolean {
  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    return false;
  }

  return transcript.some((turn) => {
    const text = turn.text?.trim();
    return text && text.length > 0;
  });
}

/**
 * Generates a random ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Debounce function - delays execution until after a wait period of inactivity
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(later, wait);
  };
}

/**
 * Sanitizes text for use in custom dictionary
 */
export function sanitizeDictionaryContent(value: string): string {
  return value.trim();
}

/**
 * Normalizes text for dictionary lookup (lowercase)
 */
export function normalizeDictionaryContent(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Sanitizes "sounds like" values for custom dictionary
 */
export function sanitizeSoundsLike(values: string[] = []): string[] {
  return Array.from(
    new Set(
      values
        .map(value => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
}

/**
 * Parses comma-separated "sounds like" input
 */
export function parseSoundsLikeInput(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== "string") {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

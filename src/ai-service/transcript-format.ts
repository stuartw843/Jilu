import type { TranscriptTurn } from "../types";
import { transcriptTextToTurns } from "../utils";
import { getStoredSpeakerProfile } from "../speaker-id";

export function formatTranscriptTurn(turn: TranscriptTurn | undefined | null): string | null {
  if (!turn) {
    return null;
  }
  const text = turn.text?.trim();
  if (!text) {
    return null;
  }
  const speaker = turn.speaker?.trim();
  return speaker ? `[${speaker}]: ${text}` : text;
}

export function extractSpeakersFromText(text: string): string[] {
  if (!text) {
    return [];
  }
  const speakerMatches = text.matchAll(/\[(.+?)\]:/g);
  const speakers = new Set<string>();
  for (const match of speakerMatches) {
    const name = match[1]?.trim();
    if (name) {
      speakers.add(name);
    }
  }
  return Array.from(speakers);
}

export function findPreviousTurn(
  transcriptTurns: TranscriptTurn[],
  startIndex: number
): string | null {
  if (!Array.isArray(transcriptTurns) || transcriptTurns.length === 0) {
    return null;
  }

  for (let index = startIndex; index >= 0; index--) {
    const formatted = formatTranscriptTurn(transcriptTurns[index]);
    if (formatted) {
      return formatted;
    }
  }

  return null;
}

interface SpeakerMapResult {
  mainSpeakerLabel: string;
  legend: string;
  mapping: Map<string, string>;
}

function normalizeSpeakerLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const cleaned = label.replace(/[\[\]]/g, "").trim();
  return cleaned ? cleaned.toLowerCase() : null;
}

function buildSpeakerLegend(mainLabel: string, hasOtherSpeakers: boolean, name?: string, email?: string): string {
  const details: string[] = [];
  if (name && name.trim()) {
    details.push(name.trim());
  }
  if (email && email.trim()) {
    details.push(`email ${email.trim()}`);
  }
  const detailText = details.length ? ` (${details.join(", ")})` : "";
  const lines = [
    "Speaker labeling:",
    `- [${mainLabel}]: primary user (enrolled speaker profile if available${detailText ? `; ${detailText}` : ""}).`,
  ];

  if (hasOtherSpeakers) {
    lines.push("- Other speakers: [S1], [S2], [S3], ... assigned to each unique non-enrolled speaker in order of appearance.");
  } else {
    lines.push("- Other speakers: none detected in this transcript. If they appear, they are labeled S1, S2, S3 in order of appearance.");
  }

  lines.push('- Transcript format: "[SpeakerLabel]: message text".');
  return lines.join("\n");
}

function buildSpeakerMap(transcriptTurns: TranscriptTurn[]): SpeakerMapResult {
  const profile = getStoredSpeakerProfile();
  const mainSpeakerLabel = (profile?.name?.trim() || "You").trim();
  const mainKey = normalizeSpeakerLabel(mainSpeakerLabel);
  const mainAliases = new Set<string>();
  if (mainKey) {
    mainAliases.add(mainKey);
  }
  mainAliases.add("you"); // Speechmatics default label

  const mapping = new Map<string, string>();
  let otherIndex = 1;
  let hasOtherSpeakers = false;

  transcriptTurns.forEach((turn) => {
    const normalized = normalizeSpeakerLabel(turn.speaker);
    if (!normalized) return;

    if (mainAliases.has(normalized)) {
      mapping.set(normalized, mainSpeakerLabel);
      return;
    }

    if (!mapping.has(normalized)) {
      const existingSLabel = normalized.match(/^s\d+$/i);
      const assigned = existingSLabel ? normalized.toUpperCase() : `S${otherIndex++}`;
      mapping.set(normalized, assigned);
      hasOtherSpeakers = true;
    }
  });

  const legend = buildSpeakerLegend(mainSpeakerLabel, hasOtherSpeakers, profile?.name, profile?.email);
  return { mainSpeakerLabel, legend, mapping };
}

function mapSpeakerLabel(raw: string | null | undefined, mapping: Map<string, string>, mainSpeakerLabel: string): string | null {
  const normalized = normalizeSpeakerLabel(raw);
  if (!normalized) return null;
  if (mapping.has(normalized)) {
    return mapping.get(normalized) ?? null;
  }

  const mainKey = normalizeSpeakerLabel(mainSpeakerLabel);
  if (mainKey && normalized === mainKey) {
    return mainSpeakerLabel;
  }

  if (normalized === "you") {
    return mainSpeakerLabel;
  }

  return raw?.trim() || null;
}

export interface PromptReadyTranscript {
  transcript: string;
  transcriptWithLegend: string;
  transcriptTurns: TranscriptTurn[];
  speakerLegend: string;
  mainSpeakerLabel: string;
}

export function prepareTranscriptForPrompt(
  transcript: string,
  transcriptTurns?: TranscriptTurn[],
  options?: { useTurnReconstruction?: boolean }
): PromptReadyTranscript {
  const shouldReconstruct = options?.useTurnReconstruction !== false;
  const baseTurns =
    (Array.isArray(transcriptTurns) && transcriptTurns.length > 0
      ? transcriptTurns
      : transcriptTextToTurns(transcript)) ?? [];

  const cleanedTurns = baseTurns.map((turn) => ({
    speaker: turn.speaker?.trim() || null,
    text: turn.text?.trim() || "",
  }));

  const { mainSpeakerLabel, legend, mapping } = buildSpeakerMap(cleanedTurns);

  const mappedTurns: TranscriptTurn[] = cleanedTurns.map((turn) => ({
    speaker: mapSpeakerLabel(turn.speaker, mapping, mainSpeakerLabel),
    text: turn.text,
  }));

  const promptTranscript = mappedTurns
    .map((turn) => formatTranscriptTurn(turn))
    .filter((segment): segment is string => Boolean(segment))
    .join("\n\n");

  const suppliedTranscript = transcript?.trim() || "";
  const transcriptContent = shouldReconstruct
    ? promptTranscript || suppliedTranscript
    : suppliedTranscript || promptTranscript;
  const transcriptWithLegend = legend ? `${legend}\n\n${transcriptContent}` : transcriptContent;

  return {
    transcript: transcriptContent,
    transcriptWithLegend,
    transcriptTurns: mappedTurns,
    speakerLegend: legend,
    mainSpeakerLabel,
  };
}

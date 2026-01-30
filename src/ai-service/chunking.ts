import type { TranscriptTurn } from "../types";
import { extractSpeakersFromText, formatTranscriptTurn, findPreviousTurn } from "./transcript-format";
import type { TranscriptChunk } from "./types";

export function chunkTranscript(
  transcript: string,
  maxTokens: number,
  estimateTokens: (text: string) => number
): string[] {
  const words = transcript.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const word of words) {
    if (!word) continue;
    const estimated = estimateTokens(`${word} `);
    if (currentTokens + estimated > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [word];
      currentTokens = estimated;
    } else {
      currentChunk.push(word);
      currentTokens += estimated;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks.length > 0 ? chunks : [transcript];
}

export function chunkTranscriptTurns(
  transcriptTurns: TranscriptTurn[],
  fallbackTranscript: string,
  maxTokens: number,
  estimateTokens: (text: string) => number
): TranscriptChunk[] {
  if (!transcriptTurns || transcriptTurns.length === 0) {
    return [];
  }

  const chunks: TranscriptChunk[] = [];
  let currentSegments: string[] = [];
  let currentTokens = 0;
  let currentSpeakers = new Set<string>();
  let chunkStartIndex = -1;
  let lastTurnIndex = -1;

  for (let index = 0; index < transcriptTurns.length; index++) {
    const turn = transcriptTurns[index];
    const formatted = formatTranscriptTurn(turn);
    if (!formatted) {
      continue;
    }

    const estimated = estimateTokens(`${formatted}\n`);

    if (currentSegments.length > 0 && currentTokens + estimated > maxTokens) {
      const previousTurn = findPreviousTurn(transcriptTurns, chunkStartIndex - 1);
      chunks.push({
        text: currentSegments.join("\n\n"),
        speakers: Array.from(currentSpeakers),
        startTurn: chunkStartIndex >= 0 ? chunkStartIndex : 0,
        endTurn: lastTurnIndex >= 0 ? lastTurnIndex : chunkStartIndex,
        previousTurn,
      });

      currentSegments = [];
      currentSpeakers = new Set<string>();
      currentTokens = 0;
      chunkStartIndex = -1;
      lastTurnIndex = -1;
    }

    if (currentSegments.length === 0) {
      chunkStartIndex = index;
    }

    currentSegments.push(formatted);
    currentTokens += estimated;
    lastTurnIndex = index;

    const speaker = turn.speaker?.trim();
    if (speaker) {
      currentSpeakers.add(speaker);
    }
  }

  if (currentSegments.length > 0) {
    const previousTurn = findPreviousTurn(transcriptTurns, chunkStartIndex - 1);
    chunks.push({
      text: currentSegments.join("\n\n"),
      speakers: Array.from(currentSpeakers),
      startTurn: chunkStartIndex >= 0 ? chunkStartIndex : 0,
      endTurn: lastTurnIndex >= 0 ? lastTurnIndex : chunkStartIndex,
      previousTurn,
    });
  }

  if (chunks.length === 0 && fallbackTranscript.trim().length > 0) {
    return [
      {
        text: fallbackTranscript,
        speakers: extractSpeakersFromText(fallbackTranscript),
        startTurn: 0,
        endTurn: transcriptTurns.length - 1,
        previousTurn: null,
      },
    ];
  }

  return chunks;
}

export function generateTranscriptChunks(
  transcript: string,
  transcriptTurns: TranscriptTurn[] | undefined,
  maxTokens: number,
  estimateTokens: (text: string) => number
): TranscriptChunk[] {
  const trimmedTranscript = transcript?.trim() || "";

  if (transcriptTurns && transcriptTurns.length > 0) {
    const turnChunks = chunkTranscriptTurns(transcriptTurns, trimmedTranscript, maxTokens, estimateTokens);
    if (turnChunks.length > 0) {
      return turnChunks;
    }
  }

  if (!trimmedTranscript) {
    return [];
  }

  const textChunks = chunkTranscript(trimmedTranscript, maxTokens, estimateTokens);
  return textChunks.map((text, index) => {
    const previousChunkText = index > 0 ? textChunks[index - 1] : undefined;
    const previousTurn = previousChunkText
      ? previousChunkText.split("\n").slice(-1)[0]?.trim() || null
      : null;

    return {
      text,
      speakers: extractSpeakersFromText(text),
      startTurn: index,
      endTurn: index,
      previousTurn,
    };
  });
}

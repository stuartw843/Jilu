import type { TranscriptTurn } from "../types";

export interface TranscriptChunk {
  text: string;
  speakers: string[];
  startTurn: number;
  endTurn: number;
  previousTurn?: string | null;
}

export interface DynamicNoteArea {
  title: string;
  focus: string[];
  rationale?: string;
}

export type TranscriptTurnList = TranscriptTurn[] | undefined | null;

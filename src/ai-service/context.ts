import type OpenAI from "openai";
import type { TranscriptTurn } from "../types";
import { generateTranscriptChunks } from "./chunking";
import type { TranscriptChunk } from "./types";
import { summarizeTranscriptChunk, condenseSummariesIfNeeded } from "./summaries";
import { buildChatCompletionParams } from "./chat-options";
import { extractFirstChoiceText } from "./response-content";

export function buildChatContext(
  transcript: string,
  personalNotes: string,
  enhancedNotes: string
): string {
  const sections: string[] = [];
  const cleanTranscript = transcript?.trim() || "";
  const cleanPersonalNotes = personalNotes?.trim() || "";
  const cleanEnhancedNotes = enhancedNotes?.trim() || "";

  if (cleanTranscript) {
    sections.push(`Meeting Transcript:\n${cleanTranscript}`);
  }

  if (cleanPersonalNotes) {
    sections.push(`Personal Notes:\n${cleanPersonalNotes}`);
  }

  if (cleanEnhancedNotes) {
    sections.push(`Enhanced Notes:\n${cleanEnhancedNotes}`);
  }

  if (sections.length === 0) {
    return "No transcript or notes were provided.";
  }

  return sections.join("\n\n");
}

interface ChunkedContextDeps {
  client: OpenAI;
  model: string;
  maxChunkTokens: number;
  maxPromptTokens: number;
  chunkSummaryMaxTokens: number;
  estimateTokens: (text: string) => number;
}

async function summarizeChunksSequentially(
  deps: ChunkedContextDeps,
  chunks: TranscriptChunk[],
  speakerLegend?: string
): Promise<string[]> {
  const summaries: string[] = [];
  let previousSummary: string | undefined;

  for (let index = 0; index < chunks.length; index++) {
    const summary = await summarizeTranscriptChunk(
      {
        client: deps.client,
        model: deps.model,
        chunkSummaryMaxTokens: deps.chunkSummaryMaxTokens,
      },
      chunks[index],
      index + 1,
      chunks.length,
      previousSummary,
      speakerLegend
    );

    const finalSummary = summary?.trim() || chunks[index].text.slice(0, 4000);
    summaries.push(finalSummary);
    previousSummary = finalSummary;
  }

  return summaries;
}

export async function buildChunkedChatContext(
  deps: ChunkedContextDeps,
  transcript: string,
  personalNotes: string,
  enhancedNotes: string,
  transcriptTurns?: TranscriptTurn[],
  speakerLegend?: string
): Promise<string> {
  const trimmedTranscript = transcript?.trim() || "";
  if (!trimmedTranscript) {
    return buildChatContext(trimmedTranscript, personalNotes, enhancedNotes);
  }

  const chunks = generateTranscriptChunks(trimmedTranscript, transcriptTurns, deps.maxChunkTokens, deps.estimateTokens);
  if (chunks.length === 0) {
    return buildChatContext(trimmedTranscript, personalNotes, enhancedNotes);
  }

  const chunkSummaries = await summarizeChunksSequentially(deps, chunks, speakerLegend);

  const condensedTranscript = await condenseSummariesIfNeeded(
    {
      client: deps.client,
      model: deps.model,
      maxPromptTokens: deps.maxPromptTokens,
      estimateTokens: deps.estimateTokens,
    },
    "",
    "{transcript}",
    chunkSummaries,
    "",
    speakerLegend
  );

  const sections: string[] = [`Condensed Transcript:\n${condensedTranscript}`];

  const cleanPersonalNotes = personalNotes?.trim();
  const cleanEnhancedNotes = enhancedNotes?.trim();

  if (cleanPersonalNotes) {
    sections.push(`Personal Notes:\n${cleanPersonalNotes}`);
  }

  if (cleanEnhancedNotes) {
    sections.push(`Enhanced Notes:\n${cleanEnhancedNotes}`);
  }

  let context = sections.join("\n\n");

  if (deps.estimateTokens(context) <= deps.maxPromptTokens) {
    return context;
  }

  const consolidationResponse = await deps.client.chat.completions.create(
    buildChatCompletionParams(
      deps.model,
      [
        {
          role: "system",
          content: "You compress meeting context into concise briefs while preserving every critical decision, action, and nuance.",
        },
        {
          role: "user",
          content: `Condense the following meeting materials into a concise but information-dense brief suitable for answering questions later. Preserve all critical facts, decisions, action items (with owners/dates), blockers, and context.\n\n${context}`,
        },
      ],
      Math.min(1000, deps.maxPromptTokens / 2)
    )
  );

  const consolidated = extractFirstChoiceText(consolidationResponse) || condensedTranscript;
  context = `Unified Meeting Brief:\n${consolidated}`;

  if (deps.estimateTokens(context) > deps.maxPromptTokens) {
    throw new Error("Unable to reduce chat context within model context window");
  }

  return context;
}

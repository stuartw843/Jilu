import type OpenAI from "openai";
import { getDefaultTemplateId, getTemplate } from "../prompt-templates";
import { processTemplate } from "../template-processor";
import type { PromptTemplate, TranscriptTurn } from "../types";
import { generateTranscriptChunks } from "./chunking";
import { identifyDynamicAreas, buildDynamicAreasNarrative, defaultDynamicAreas } from "./dynamic-areas";
import { createCompletion } from "./completions";
import { summarizeTranscriptChunk, condenseSummariesIfNeeded } from "./summaries";
import type { DynamicNoteArea } from "./types";
import { buildChatCompletionParams } from "./chat-options";
import { extractFirstChoiceText } from "./response-content";

interface EnhancementDeps {
  client: OpenAI;
  model: string;
  maxPromptTokens: number;
  maxChunkTokens: number;
  chunkSummaryMaxTokens: number;
  estimateTokens: (text: string) => number;
}

async function summarizeChunks(
  deps: EnhancementDeps,
  chunks: ReturnType<typeof generateTranscriptChunks>,
  speakerLegend?: string
): Promise<string[]> {
  const chunkSummaries: string[] = [];
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
    chunkSummaries.push(finalSummary);
    previousSummary = finalSummary;
  }

  return chunkSummaries;
}

export async function enhanceWithChunking(
  deps: EnhancementDeps,
  template: PromptTemplate,
  transcript: string,
  personalNotes: string,
  transcriptTurns?: TranscriptTurn[],
  speakerLegend?: string
): Promise<string> {
  const chunks = generateTranscriptChunks(transcript, transcriptTurns, deps.maxChunkTokens, deps.estimateTokens);
  if (chunks.length === 0) {
    throw new Error("Transcript is empty – cannot generate enhanced notes.");
  }

  const chunkSummaries = await summarizeChunks(deps, chunks, speakerLegend);

  const condensedPrompt = await condenseSummariesIfNeeded(
    {
      client: deps.client,
      model: deps.model,
      maxPromptTokens: deps.maxPromptTokens,
      estimateTokens: deps.estimateTokens,
    },
    template.systemPrompt,
    template.userPrompt,
    chunkSummaries,
    personalNotes,
    speakerLegend
  );

  return createCompletion(
    {
      client: deps.client,
      model: deps.model,
    },
    template.systemPrompt,
    condensedPrompt,
    5000
  );
}

export async function generateDynamicNote(
  deps: EnhancementDeps,
  transcript: string,
  personalNotes: string,
  transcriptTurns?: TranscriptTurn[],
  speakerLegend?: string
): Promise<string> {
  const trimmedTranscript = transcript?.trim() || "";
  const trimmedNotes = personalNotes?.trim() || "";

  if (!trimmedTranscript && !trimmedNotes) {
    throw new Error("No transcript or personal notes were provided.");
  }

  const chunks = generateTranscriptChunks(trimmedTranscript, transcriptTurns, deps.maxChunkTokens, deps.estimateTokens);
  if (chunks.length === 0) {
    throw new Error("Transcript is empty – cannot generate dynamic notes.");
  }

  const chunkSummaries = await summarizeChunks(deps, chunks, speakerLegend);

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
    trimmedNotes,
    speakerLegend
  );

  let areas: DynamicNoteArea[];
  try {
    areas = await identifyDynamicAreas(
      {
        client: deps.client,
        model: deps.model,
      },
      condensedTranscript,
      trimmedNotes
    );
  } catch (error) {
    console.warn("Failed to identify dynamic areas, using defaults:", error);
    areas = defaultDynamicAreas();
  }

  const areasNarrative = buildDynamicAreasNarrative(areas);
  const areasJson = JSON.stringify(areas, null, 2);

  const personalNotesSection = trimmedNotes
    ? `Personal notes to consider:\n${trimmedNotes}`
    : "Personal notes to consider:\nNone provided.";

  const response = await deps.client.chat.completions.create(
    buildChatCompletionParams(
      deps.model,
      [
        {
          role: "system",
          content:
            "You create dynamic meeting notes using only markdown bullet lists. Top-level bullets must start with bolded area labels, followed by concise summaries. Use nested sub-bullets for supporting detail. Do not use headings, numbered lists, or paragraphs.",
        },
        {
          role: "user",
          content: `You already analysed the meeting. Use the condensed transcript and recommended focus areas below to produce the final dynamic note.

Condensed transcript:
${condensedTranscript}

Recommended focus areas (JSON):
${areasJson}

Focus guidance in prose:
${areasNarrative}

${personalNotesSection}

Instructions:
- Produce one top-level bullet per focus area in the order provided. Format as "- **Area Title**: brief headline".
- Under each top-level bullet, add 1-4 nested sub-bullets with supporting detail drawn from the transcript and notes. Use "  - " for sub bullets.
- Highlight critical names, decisions, dates, and owners in bold.
- Tag critical items with [Decision], [Action], or [Risk] when relevant.
- Do NOT include the words "Summary", section headers, or introductory prose.
- If an area lacks content, still include the bullet with a single sub-bullet stating "No notable updates discussed."
- Previous speaker turns supplied earlier were context only; do not quote or summarise them separately.
- Keep the tone factual and concise.`,
        },
      ],
      900
    )
  );

  const content = extractFirstChoiceText(response);
  if (content) return content;

  const finishReason = response.choices[0]?.finish_reason ?? "unknown";
  const responseId = (response as any)?.id ?? "n/a";
  console.warn(
    `Empty dynamic note content (finish_reason=${finishReason}, response_id=${responseId}); returning condensed transcript fallback`
  );
  return condensedTranscript || "Model returned no content.";
}

export async function enhanceNotes(
  deps: EnhancementDeps,
  transcript: string,
  personalNotes: string = "",
  templateId?: string,
  transcriptTurns?: TranscriptTurn[],
  isContextWindowError?: (error: unknown) => boolean,
  speakerLegend?: string
): Promise<string> {
  const selectedTemplateId = templateId || getDefaultTemplateId();
  const template = getTemplate(selectedTemplateId);
  if (!template) {
    throw new Error(`Template not found: ${selectedTemplateId}`);
  }

  if (template.id === "dynamic-note") {
    return generateDynamicNote(deps, transcript, personalNotes, transcriptTurns, speakerLegend);
  }

  const processedPrompt = processTemplate(template.userPrompt, transcript, personalNotes);
  const estimatedTokens = deps.estimateTokens(`${template.systemPrompt}\n${processedPrompt}`);

  if (estimatedTokens <= deps.maxPromptTokens) {
    try {
      return await createCompletion(
        {
          client: deps.client,
          model: deps.model,
        },
        template.systemPrompt,
        processedPrompt,
        5000
      );
    } catch (error) {
      console.warn("Direct enhancement failed, attempting chunked workflow:", error);
      if (!isContextWindowError || !isContextWindowError(error)) {
        throw new Error(`Failed to enhance notes: ${error}`);
      }
      try {
        return await enhanceWithChunking(deps, template, transcript, personalNotes, transcriptTurns, speakerLegend);
      } catch (chunkError) {
        console.error("Error enhancing long transcript:", chunkError);
        throw new Error(`Failed to enhance notes: ${chunkError}`);
      }
    }
  }

  try {
    return await enhanceWithChunking(deps, template, transcript, personalNotes, transcriptTurns, speakerLegend);
  } catch (error) {
    console.error("Error enhancing long transcript:", error);
    throw new Error(`Failed to enhance notes: ${error}`);
  }
}

import type OpenAI from "openai";
import { processTemplate } from "../template-processor";
import type { TranscriptChunk } from "./types";
import { buildChatCompletionParams } from "./chat-options";
import { extractFirstChoiceText } from "./response-content";

interface SummarizeDeps {
  client: OpenAI;
  model: string;
  chunkSummaryMaxTokens: number;
}

export async function summarizeTranscriptChunk(
  deps: SummarizeDeps,
  chunk: TranscriptChunk,
  index: number,
  total: number,
  previousSummary?: string,
  speakerLegend?: string
): Promise<string> {
  const speakerList = chunk.speakers.length > 0 ? chunk.speakers.join(", ") : "Speakers not identified";
  const previousContext = previousSummary
    ? `\nPrevious segment summary (for continuity, do not repeat unless the topic continues):\n${previousSummary}\n`
    : "";
  const previousTurnSection = chunk.previousTurn
    ? `\nPrevious speaker turn (context only, do NOT summarize or attribute new actions to this turn):\n${chunk.previousTurn}\n`
    : "";
  const speakerContext = speakerLegend?.trim()
    ? `\nSpeaker labeling:\n${speakerLegend.trim()}\n`
    : "";

  const prompt = `You are assisting with meeting notes that exceed the model context window. Summarize transcript segment ${index} of ${total}. Preserve key decisions, action items (with owners and dates), discussion points, and important context. Keep the output under 350 words.

Requirements:
- Return markdown bullets only (no standalone paragraphs).
- Use bold lead-ins for primary bullets and nested sub-bullets for supporting details.
- Attribute insights to speakers using their names where available.
- Tag items with [Decision], [Action], or [Blocker] where appropriate.
- Build on the prior segment summary to maintain continuity without repeating resolved points.

Segment metadata:
- Speakers: ${speakerList}
- Transcript turns: ${chunk.startTurn + 1} to ${chunk.endTurn + 1}${previousContext}
${speakerContext}${previousTurnSection}

Transcript segment ${index}/${total}:
${chunk.text}`;

  const response = await deps.client.chat.completions.create(
    buildChatCompletionParams(
      deps.model,
      [
        {
          role: "system",
          content: "You condense meeting transcripts into precise, information-dense summaries that retain all critical facts.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      deps.chunkSummaryMaxTokens
    )
  );

  const content = extractFirstChoiceText(response);
  if (content) return content;

  const finishReason = response.choices[0]?.finish_reason ?? "unknown";
  const responseId = (response as any)?.id ?? "n/a";
  console.warn(
    `Empty chunk summary content (finish_reason=${finishReason}, response_id=${responseId}); falling back to raw transcript segment`
  );
  return chunk.text.slice(0, 4000);
}

export function buildCondensedTranscript(chunkSummaries: string[]): string {
  return chunkSummaries
    .map((summary, index) => {
      const header = `### Transcript Segment ${index + 1} Summary`;
      return summary ? `${header}\n${summary}` : header;
    })
    .join("\n\n");
}

interface CondenseDeps {
  client: OpenAI;
  model: string;
  maxPromptTokens: number;
  estimateTokens: (text: string) => number;
}

export async function condenseSummariesIfNeeded(
  deps: CondenseDeps,
  systemPrompt: string,
  userPrompt: string,
  chunkSummaries: string[],
  personalNotes: string,
  speakerLegend?: string
): Promise<string> {
  const legendPrefix = speakerLegend?.trim() ? `${speakerLegend.trim()}\n\n` : "";
  let condensedTranscript = `${legendPrefix}The original transcript was processed in segments. The following summaries capture the essential content of each part:\n\n${buildCondensedTranscript(
    chunkSummaries
  )}`;
  let processedPrompt = processTemplate(userPrompt, condensedTranscript, personalNotes);
  let estimatedTokens = deps.estimateTokens(`${systemPrompt}\n${processedPrompt}`);

  if (estimatedTokens <= deps.maxPromptTokens) {
    return processedPrompt;
  }

  const mergedResponse = await deps.client.chat.completions.create(
    buildChatCompletionParams(
      deps.model,
      [
        {
          role: "system",
          content: "You merge multiple meeting summaries into a single comprehensive, non-redundant brief.",
        },
        {
          role: "user",
          content: `Combine the following meeting segment summaries into a single cohesive outline that preserves every critical detail, decision, action item, and nuance. Keep it concise but information rich, suitable for feeding into a downstream summarization template.\n\n${chunkSummaries.join(
            "\n\n"
          )}`,
        },
      ],
      1200
    )
  );

  const mergedSummary = extractFirstChoiceText(mergedResponse) || chunkSummaries.join("\n\n");
  condensedTranscript = `${legendPrefix}Combined meeting outline derived from segmented summaries:\n\n${mergedSummary}`;
  processedPrompt = processTemplate(userPrompt, condensedTranscript, personalNotes);
  estimatedTokens = deps.estimateTokens(`${systemPrompt}\n${processedPrompt}`);

  if (estimatedTokens > deps.maxPromptTokens) {
    throw new Error("Unable to reduce transcript within model context window");
  }

  return processedPrompt;
}

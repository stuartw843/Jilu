import type OpenAI from "openai";
import type { TranscriptTurn } from "../types";
import { createChatCompletion } from "./completions";
import { buildChatContext, buildChunkedChatContext } from "./context";

interface ChatDeps {
  client: OpenAI;
  model: string;
  maxPromptTokens: number;
  maxChunkTokens: number;
  chunkSummaryMaxTokens: number;
  estimateTokens: (text: string) => number;
  isContextWindowError: (error: unknown) => boolean;
  provider: "openai" | "local";
}

export async function chatWithTranscript(
  deps: ChatDeps,
  transcript: string,
  personalNotes: string,
  enhancedNotes: string,
  question: string,
  transcriptTurns?: TranscriptTurn[],
  speakerLegend?: string
): Promise<string> {
  const isOpenAi = deps.provider === "openai";
  const maxAnswerTokens = isOpenAi ? 1200 : 500;
  const systemPrompt =
    "You are a helpful assistant that answers questions about meeting content. Base your answers on the provided transcript and notes. Be concise and accurate.";
  const baseContext = buildChatContext(transcript, personalNotes, enhancedNotes);
  const baseUserPrompt = `${baseContext}\n\nQuestion: ${question}`;
  const estimatedTokens = deps.estimateTokens(`${systemPrompt}\n${baseUserPrompt}`);

  if (isOpenAi || estimatedTokens <= deps.maxPromptTokens) {
    try {
      return await createChatCompletion(
        {
          client: deps.client,
          model: deps.model,
        },
        systemPrompt,
        baseUserPrompt,
        maxAnswerTokens
      );
    } catch (error) {
      console.warn("Direct chat completion failed, attempting condensed context:", error);
      if (!deps.isContextWindowError(error)) {
        throw new Error(`Failed to get answer: ${error}`);
      }
      // For OpenAI, this is a rare fallback when we hit context issues despite the larger window.
    }
  }

  const condensedContext = await buildChunkedChatContext(
    {
      client: deps.client,
      model: deps.model,
      maxChunkTokens: deps.maxChunkTokens,
      maxPromptTokens: deps.maxPromptTokens,
      chunkSummaryMaxTokens: deps.chunkSummaryMaxTokens,
      estimateTokens: deps.estimateTokens,
    },
    transcript,
    personalNotes,
    enhancedNotes,
    transcriptTurns,
    speakerLegend
  );
  const condensedPrompt = `${condensedContext}\n\nQuestion: ${question}`;
  return createChatCompletion(
    {
      client: deps.client,
      model: deps.model,
    },
    systemPrompt,
    condensedPrompt,
    maxAnswerTokens
  );
}

import type OpenAI from "openai";

type ReasoningEffort = "low" | "medium" | "high";

interface ChatOptionOverrides {
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
}

const DEFAULT_TEMPERATURE = 0.2;
const GPT5_PREFIX = /^gpt-5/i;

function usesReasoningEffort(model: string): boolean {
  return GPT5_PREFIX.test(model.trim());
}

export function buildChatCompletionParams(
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  maxCompletionTokens: number,
  overrides: ChatOptionOverrides = {}
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages,
    max_completion_tokens: maxCompletionTokens,
    stream: false as const,
  };

  if (usesReasoningEffort(model)) {
    params.reasoning_effort = overrides.reasoningEffort ?? "medium";
  } else {
    params.temperature = overrides.temperature ?? DEFAULT_TEMPERATURE;
  }

  return params;
}

export function getDefaultTemperature(): number {
  return DEFAULT_TEMPERATURE;
}

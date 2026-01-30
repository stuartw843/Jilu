import type OpenAI from "openai";
import { buildChatCompletionParams, getDefaultTemperature } from "./chat-options";
import { extractFirstChoiceText } from "./response-content";

interface CompletionDeps {
  client: OpenAI;
  model: string;
}

export async function createCompletion(
  deps: CompletionDeps,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const attemptCompletion = async (maxTokensOverride: number) => {
    const response = await deps.client.chat.completions.create(
      buildChatCompletionParams(
        deps.model,
        [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        maxTokensOverride,
        { temperature: getDefaultTemperature() }
      )
    );
    const content = extractFirstChoiceText(response);
    const finishReason = response.choices[0]?.finish_reason ?? "unknown";
    const responseId = (response as any)?.id ?? "n/a";
    return { content, finishReason, responseId };
  };

  const first = await attemptCompletion(maxTokens);
  if (first.content) return first.content;

  if (first.finishReason === "length") {
    const retryTokens = Math.min(Math.max(Math.floor(maxTokens * 1.5), maxTokens + 200), 6000);
    console.warn(
      `Retrying completion due to length finish_reason; increasing max tokens from ${maxTokens} to ${retryTokens}`
    );
    const retry = await attemptCompletion(retryTokens);
    if (retry.content) return retry.content;
    console.warn(
      `Second attempt returned no content (finish_reason=${retry.finishReason}, response_id=${retry.responseId})`
    );
  } else {
    console.warn(
      `Empty completion content while generating enhanced notes (finish_reason=${first.finishReason}, response_id=${first.responseId})`
    );
  }

  return `Model returned no content (finish_reason: ${first.finishReason}, response_id: ${first.responseId})`;
}

export async function createChatCompletion(
  deps: CompletionDeps,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const attemptCompletion = async (maxTokensOverride: number) => {
    const response = await deps.client.chat.completions.create(
      buildChatCompletionParams(
        deps.model,
        [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        maxTokensOverride,
        { temperature: getDefaultTemperature() }
      )
    );

    const content = extractFirstChoiceText(response);
    const finishReason = response.choices[0]?.finish_reason ?? "unknown";
    const responseId = (response as any)?.id ?? "n/a";
    return { content, finishReason, responseId };
  };

  const first = await attemptCompletion(maxTokens);
  if (first.content) return first.content;

  if (first.finishReason === "length") {
    const retryTokens = Math.min(Math.max(Math.floor(maxTokens * 1.5), maxTokens + 200), 6000);
    console.warn(
      `Retrying chat completion due to length finish_reason; increasing max tokens from ${maxTokens} to ${retryTokens}`
    );
    const retry = await attemptCompletion(retryTokens);
    if (retry.content) return retry.content;
    console.warn(
      `Second chat attempt returned no content (finish_reason=${retry.finishReason}, response_id=${retry.responseId})`
    );
    return `Model returned no content (finish_reason: ${retry.finishReason}, response_id: ${retry.responseId})`;
  }

  console.warn(
    `Empty completion content while answering a question (finish_reason=${first.finishReason}, response_id=${first.responseId})`
  );
  return `Model returned no content (finish_reason: ${first.finishReason}, response_id: ${first.responseId})`;
}

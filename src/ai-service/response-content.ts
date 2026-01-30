import type OpenAI from "openai";

function extractFromContent(
  content: OpenAI.Chat.Completions.ChatCompletionMessage["content"]
): string {
  if (typeof content === "string") {
    return content;
  }

  const contentValue: any = content;
  if (Array.isArray(contentValue)) {
    return contentValue
      .map((part: any) => {
        if (typeof part === "string") {
          return part;
        }
        if (part?.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  return "";
}

export function extractFirstChoiceText(
  response: OpenAI.Chat.Completions.ChatCompletion | undefined | null
): string {
  if (!response || !Array.isArray(response.choices) || response.choices.length === 0) {
    return "";
  }

  const choice = response.choices[0];
  const content = extractFromContent(choice?.message?.content);
  const refusal = typeof choice?.message?.refusal === "string" ? choice.message.refusal : "";
  return (content || refusal || "").trim();
}

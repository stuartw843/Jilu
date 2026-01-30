import type OpenAI from "openai";
import { buildChatCompletionParams } from "./chat-options";
import { extractFirstChoiceText } from "./response-content";

interface TitleDeps {
  client: OpenAI;
  model: string;
}

export async function generateTitle(
  deps: TitleDeps,
  transcript: string,
  personalNotes: string
): Promise<string> {
  const prompt = `Based on this meeting transcript and notes, generate a short, descriptive title (maximum 60 characters):

Transcript excerpt: ${transcript.substring(0, 500)}...
Notes: ${personalNotes.substring(0, 200)}...

Title:`;

  try {
    const response = await deps.client.chat.completions.create(
      buildChatCompletionParams(
        deps.model,
        [
          {
            role: "system",
            content: "You generate concise, descriptive meeting titles. Reply with only the title, nothing else.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        50
      )
    );

    const content = extractFirstChoiceText(response);
    return content || "Untitled Meeting";
  } catch (error) {
    console.error("Error generating title:", error);
    return "Untitled Meeting";
  }
}

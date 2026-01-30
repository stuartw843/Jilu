import type OpenAI from "openai";
import { buildChatCompletionParams } from "./chat-options";
import { extractFirstChoiceText } from "./response-content";
import type { DynamicNoteArea } from "./types";

export function parseDynamicAreas(raw: string): DynamicNoteArea[] {
  if (!raw) {
    return [];
  }

  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    const areaList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.areas)
        ? parsed.areas
        : [];

    if (!Array.isArray(areaList)) {
      return [];
    }

    const normalized = areaList
      .map((area: any) => {
        const title = typeof area?.title === "string" ? area.title.trim() : "";
        if (!title) {
          return null;
        }
        const focusSource = area?.focus;
        const focusArray = Array.isArray(focusSource)
          ? focusSource
              .map((item: any) => (typeof item === "string" ? item.trim() : ""))
              .filter(Boolean)
          : typeof focusSource === "string"
            ? [focusSource.trim()]
            : [];
        const rationale =
          typeof area?.rationale === "string" && area.rationale.trim().length > 0
            ? area.rationale.trim()
            : undefined;

        return {
          title,
          focus: focusArray,
          rationale,
        } as DynamicNoteArea;
      })
      .filter((area: DynamicNoteArea | null): area is DynamicNoteArea => !!area);

    return normalized;
  } catch {
    return [];
  }
}

export function defaultDynamicAreas(): DynamicNoteArea[] {
  return [
    {
      title: "Highlights & Outcomes",
      focus: [
        "Major announcements or results",
        "Key metrics or achievements that define success",
      ],
    },
    {
      title: "Decisions & Rationale",
      focus: [
        "Important choices made, including who decided",
        "Short rationale or supporting evidence",
      ],
    },
    {
      title: "Next Actions & Owners",
      focus: [
        "Follow-up tasks with owners and timelines",
        "Dependencies or blockers tied to each action",
      ],
    },
    {
      title: "Risks & Open Questions",
      focus: [
        "Outstanding concerns that need monitoring",
        "Questions that remain unresolved",
      ],
    },
  ];
}

interface DynamicAreasDeps {
  client: OpenAI;
  model: string;
}

export async function identifyDynamicAreas(
  deps: DynamicAreasDeps,
  condensedTranscript: string,
  personalNotes: string
): Promise<DynamicNoteArea[]> {
  const personalNotesText = personalNotes?.trim() || "None provided";
  const trimmedTranscript = condensedTranscript.trim().slice(0, 6000);

  const response = await deps.client.chat.completions.create(
    buildChatCompletionParams(
      deps.model,
      [
        {
          role: "system",
          content:
            'You analyse meeting transcripts to propose the most useful note categories. Reply with JSON only using the structure {"areas":[{"title":"","focus":["",""],"rationale":""}]} and keep between 3 and 6 areas.',
        },
        {
          role: "user",
          content: `Transcript outline (condensed):
${trimmedTranscript}

Personal notes:
${personalNotesText}

Identify the 3-6 most helpful high-level areas for summarising this meeting. Each area should have a short title and 2-3 focus reminders describing the detail to capture.`,
        },
      ],
      400
    )
  );

  const raw = extractFirstChoiceText(response) || "";
  const areas = parseDynamicAreas(raw);
  if (areas.length > 0) {
    return areas.slice(0, 6);
  }
  return defaultDynamicAreas();
}

export function buildDynamicAreasNarrative(areas: DynamicNoteArea[]): string {
  if (!areas || areas.length === 0) {
    return "";
  }

  return areas
    .map((area) => {
      const focus = area.focus?.length
        ? area.focus.map((item) => `- ${item}`).join("\n")
        : "- No specific focus points supplied.";
      const rationale = area.rationale ? `Rationale: ${area.rationale}` : "";
      return `Area: ${area.title}\nFocus:\n${focus}${rationale ? `\n${rationale}` : ""}`;
    })
    .join("\n\n");
}

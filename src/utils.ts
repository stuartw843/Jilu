/**
 * Legacy utils file - re-exports from utility modules
 * and provides markdown rendering functions
 */

import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * Normalizes markdown-like output from LLMs by removing surrounding
 * code fences and trimming stray helper text.
 */
export function normalizeMarkdown(content: string): string {
  if (!content) return "";

  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/```(?:markdown|md)?\s*[\r\n]+([\s\S]*?)\s*```/i);

  if (fencedMatch) {
    const inside = fencedMatch[1].trim();
    const before = trimmed.slice(0, fencedMatch.index ?? 0).trim();
    const after = trimmed.slice((fencedMatch.index ?? 0) + fencedMatch[0].length).trim();
    const outsideLength = before.length + after.length;
    const hasMarkdownStructure = /(^|\n)\s*(?:[-*+]\s|\d+\.\s|#{1,6}\s)/.test(inside);

    // If the fenced block is the primary content, use it and drop the fences
    if (!before && !after) {
      return inside;
    }

    if (hasMarkdownStructure && inside.length > outsideLength) {
      return [before, inside, after].filter(Boolean).join("\n\n").trim();
    }
  }

  return trimmed;
}

// Re-export text utilities
export {
  generateId,
  normalizeEmail,
  debounce,
  transcriptTurnsToText,
  transcriptTextToTurns,
  hasTranscriptContent,
} from "./utils/text";

// Re-export date utilities  
export { formatDate } from "./utils/date";

/**
 * Renders markdown to HTML in a container
 */
export function renderMarkdown(markdown: string, container: HTMLElement) {
  const html = marked.parse(normalizeMarkdown(markdown)) as string;
  container.innerHTML = DOMPurify.sanitize(html);
}

/**
 * Renders enhanced notes (supports both HTML and markdown)
 */
export function renderEnhancedNotes(content: string, container: HTMLElement) {
  const normalized = normalizeMarkdown(content);
  const isHTML = normalized.trim().startsWith('<');
  
  if (isHTML) {
    container.innerHTML = DOMPurify.sanitize(normalized);
  } else {
    const html = marked.parse(normalized) as string;
    container.innerHTML = DOMPurify.sanitize(html);
  }
}

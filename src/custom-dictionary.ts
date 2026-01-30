import { db } from "./database";
import { generateId } from "./utils";
import { CustomDictionaryEntry } from "./types";
import {
  sanitizeDictionaryContent,
  normalizeDictionaryContent,
  sanitizeSoundsLike,
  parseSoundsLikeInput,
} from "./utils/text";
import { CUSTOM_DICTIONARY_LIMIT } from "./constants";

export { CUSTOM_DICTIONARY_LIMIT };

export { parseSoundsLikeInput };

export async function getCustomDictionaryEntries(): Promise<CustomDictionaryEntry[]> {
  return db.getAllCustomDictionaryEntries();
}

export async function getCustomDictionaryCount(): Promise<number> {
  return db.getCustomDictionaryCount();
}

export interface UpsertDictionaryResult {
  entry: CustomDictionaryEntry;
  isNew: boolean;
}

export async function upsertCustomDictionaryEntry(
  content: string,
  soundsLike: string[] = []
): Promise<UpsertDictionaryResult> {
  const sanitizedContent = sanitizeDictionaryContent(content);
  if (!sanitizedContent) {
    throw new Error("Custom dictionary term cannot be empty.");
  }

  const sanitizedSounds = sanitizeSoundsLike(soundsLike);

  const existing = await db.getCustomDictionaryEntryByContent(sanitizedContent);
  if (existing) {
    const mergedSounds =
      sanitizedSounds.length > 0
        ? Array.from(new Set([...existing.soundsLike, ...sanitizedSounds]))
        : existing.soundsLike;
    const entry: CustomDictionaryEntry = {
      ...existing,
      content: sanitizedContent,
      soundsLike: mergedSounds,
      updatedAt: new Date(),
    };
    await db.saveCustomDictionaryEntry(entry);
    return { entry, isNew: false };
  }

  const currentCount = await db.getCustomDictionaryCount();
  if (currentCount >= CUSTOM_DICTIONARY_LIMIT) {
    throw new Error(
      `Custom dictionary limit reached. You can store up to ${CUSTOM_DICTIONARY_LIMIT} terms.`
    );
  }

  const now = new Date();
  const entry: CustomDictionaryEntry = {
    id: generateId(),
    content: sanitizedContent,
    soundsLike: sanitizedSounds,
    createdAt: now,
    updatedAt: now,
  };
  await db.saveCustomDictionaryEntry(entry);
  return { entry, isNew: true };
}

export async function updateCustomDictionaryEntry(
  id: string,
  updates: { content?: string; soundsLike?: string[] }
): Promise<CustomDictionaryEntry> {
  const existing = await db.getCustomDictionaryEntry(id);
  if (!existing) {
    throw new Error("Custom dictionary entry not found.");
  }

  let content = existing.content;
  if (typeof updates.content === "string") {
    const sanitizedContent = sanitizeDictionaryContent(updates.content);
    if (!sanitizedContent) {
      throw new Error("Custom dictionary term cannot be empty.");
    }

    if (normalizeDictionaryContent(sanitizedContent) !== normalizeDictionaryContent(existing.content)) {
      const duplicate = await db.getCustomDictionaryEntryByContent(sanitizedContent);
      if (duplicate && duplicate.id !== id) {
        throw new Error(`The term "${sanitizedContent}" is already in your custom dictionary.`);
      }
    }

    content = sanitizedContent;
  }

  let soundsLike = existing.soundsLike;
  if (Array.isArray(updates.soundsLike)) {
    soundsLike = sanitizeSoundsLike(updates.soundsLike);
  }

  const entry: CustomDictionaryEntry = {
    ...existing,
    content,
    soundsLike,
    updatedAt: new Date(),
  };

  await db.saveCustomDictionaryEntry(entry);
  return entry;
}

export async function deleteCustomDictionaryEntry(id: string): Promise<void> {
  await db.deleteCustomDictionaryEntry(id);
}

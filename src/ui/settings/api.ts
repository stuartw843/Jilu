import { aiService } from "../../ai-service";
import { elements } from "../../dom";
import {
  DEFAULT_SPEECHMATICS_URL,
  STORAGE_KEY_OPENAI_ENDPOINT,
  STORAGE_KEY_OPENAI_MODEL,
  STORAGE_KEY_SPEECHMATICS_URL,
} from "../../constants";
import { syncSavedAudioSelection } from "./audio";
import {
  getOpenAIApiKey,
  getSpeechmaticsApiKey,
  migrateLegacyApiKeys,
  setOpenAIApiKey,
  setSpeechmaticsApiKey,
} from "../../secure-storage";

export async function loadApiKeys(): Promise<void> {
  syncSavedAudioSelection();

  await migrateLegacyApiKeys();

  const speechmaticsKey = await getSpeechmaticsApiKey();
  const speechmaticsUrl = localStorage.getItem(STORAGE_KEY_SPEECHMATICS_URL);
  const openaiKey = await getOpenAIApiKey();
  const openaiEndpoint = localStorage.getItem(STORAGE_KEY_OPENAI_ENDPOINT);
  const openaiModel = localStorage.getItem(STORAGE_KEY_OPENAI_MODEL);

  if (elements.speechmaticsUrlInput) {
    elements.speechmaticsUrlInput.value = speechmaticsUrl ?? "";
    elements.speechmaticsUrlInput.placeholder = DEFAULT_SPEECHMATICS_URL;
  }

  if (speechmaticsKey && elements.speechmaticsKeyInput) {
    elements.speechmaticsKeyInput.value = speechmaticsKey;
  }

  if (elements.openaiKeyInput) {
    elements.openaiKeyInput.value = openaiKey || "";
  }

  if (elements.openaiEndpointInput) {
    elements.openaiEndpointInput.value = openaiEndpoint || "";
  }

  if (elements.openaiModelInput) {
    elements.openaiModelInput.value = openaiModel || "";
  }

  if (openaiKey || openaiEndpoint) {
    const apiKeyForClient = openaiKey || "local-llm";
    aiService.setApiKey(apiKeyForClient, openaiEndpoint || undefined, openaiModel || undefined);
  }
}

export async function saveApiSettingsFromUi(): Promise<void> {
  const speechmaticsKey = elements.speechmaticsKeyInput?.value.trim();
  const openaiKey = elements.openaiKeyInput?.value.trim();
  const openaiEndpoint = elements.openaiEndpointInput?.value.trim();
  const openaiModel = elements.openaiModelInput?.value.trim();
  const speechmaticsUrl = elements.speechmaticsUrlInput?.value.trim();

  if (speechmaticsUrl) {
    localStorage.setItem(STORAGE_KEY_SPEECHMATICS_URL, speechmaticsUrl);
  } else {
    localStorage.removeItem(STORAGE_KEY_SPEECHMATICS_URL);
  }
  await setSpeechmaticsApiKey(speechmaticsKey);
  await setOpenAIApiKey(openaiKey);

  if (openaiEndpoint) {
    localStorage.setItem(STORAGE_KEY_OPENAI_ENDPOINT, openaiEndpoint);
  } else {
    localStorage.removeItem(STORAGE_KEY_OPENAI_ENDPOINT);
  }

  if (openaiModel) {
    localStorage.setItem(STORAGE_KEY_OPENAI_MODEL, openaiModel);
  } else {
    localStorage.removeItem(STORAGE_KEY_OPENAI_MODEL);
  }

  if (openaiKey || openaiEndpoint) {
    const apiKeyForClient = openaiKey || "local-llm";
    aiService.setApiKey(apiKeyForClient, openaiEndpoint || undefined, openaiModel || undefined);
  }
}

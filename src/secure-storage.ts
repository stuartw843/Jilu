import { Stronghold, type Store } from "@tauri-apps/plugin-stronghold";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { STORAGE_KEY_OPENAI_API, STORAGE_KEY_SPEECHMATICS_API } from "./constants";

const SNAPSHOT_FILE = "secure-keys.hold";
const CLIENT_NAME = "api-keys";
const PASSWORD_SALT = "jilu-stronghold";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let storePromise: Promise<{ stronghold: Stronghold; store: Store }> | null = null;
let secureStorageUnavailable = false;

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function derivePassword(basePath: string): Promise<string> {
  const data = encoder.encode(`${PASSWORD_SALT}:${basePath}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getStore(): Promise<{ stronghold: Stronghold; store: Store }> {
  if (secureStorageUnavailable || !isTauriEnvironment()) {
    throw new Error("Secure storage unavailable");
  }

  if (!storePromise) {
    storePromise = (async () => {
      const basePath = await appLocalDataDir();
      const password = await derivePassword(basePath);
      const snapshotPath = await join(basePath, SNAPSHOT_FILE);
      const stronghold = await Stronghold.load(snapshotPath, password);
      let client;
      try {
        client = await stronghold.loadClient(CLIENT_NAME);
      } catch {
        client = await stronghold.createClient(CLIENT_NAME);
      }
      return { stronghold, store: client.getStore() };
    })();
  }

  try {
    return await storePromise;
  } catch (error) {
    console.error("Failed to initialize secure storage", error);
    storePromise = null;
    secureStorageUnavailable = true;
    throw error;
  }
}

async function setSecret(key: string, value: string): Promise<boolean> {
  try {
    const { stronghold, store } = await getStore();
    await store.insert(key, Array.from(encoder.encode(value)));
    await stronghold.save();
    return true;
  } catch (error) {
    console.warn("Falling back to localStorage for secret set", error);
    localStorage.setItem(key, value);
    return false;
  }
}

async function getSecret(key: string): Promise<string | null> {
  try {
    const { store } = await getStore();
    const result = await store.get(key);
    return result ? decoder.decode(result) : null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("Falling back to localStorage for secret get", error);
    }
    return localStorage.getItem(key);
  }
}

async function deleteSecret(key: string): Promise<void> {
  try {
    const { stronghold, store } = await getStore();
    await store.remove(key);
    await stronghold.save();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("Failed to delete secure secret, continuing", error);
    }
  }
  localStorage.removeItem(key);
}

export async function migrateLegacyApiKeys(): Promise<void> {
  const speechLegacy = localStorage.getItem(STORAGE_KEY_SPEECHMATICS_API);
  const openaiLegacy = localStorage.getItem(STORAGE_KEY_OPENAI_API);

  if (speechLegacy) {
    const storedSecurely = await setSecret(STORAGE_KEY_SPEECHMATICS_API, speechLegacy);
    if (storedSecurely) {
      localStorage.removeItem(STORAGE_KEY_SPEECHMATICS_API);
    }
  }

  if (openaiLegacy) {
    const storedSecurely = await setSecret(STORAGE_KEY_OPENAI_API, openaiLegacy);
    if (storedSecurely) {
      localStorage.removeItem(STORAGE_KEY_OPENAI_API);
    }
  }
}

export async function getSpeechmaticsApiKey(): Promise<string | null> {
  return getSecret(STORAGE_KEY_SPEECHMATICS_API);
}

export async function setSpeechmaticsApiKey(value: string | null | undefined): Promise<void> {
  if (!value || !value.trim()) {
    await deleteSecret(STORAGE_KEY_SPEECHMATICS_API);
    return;
  }
  await setSecret(STORAGE_KEY_SPEECHMATICS_API, value.trim());
}

export async function getOpenAIApiKey(): Promise<string | null> {
  return getSecret(STORAGE_KEY_OPENAI_API);
}

export async function setOpenAIApiKey(value: string | null | undefined): Promise<void> {
  if (!value || !value.trim()) {
    await deleteSecret(STORAGE_KEY_OPENAI_API);
    return;
  }
  await setSecret(STORAGE_KEY_OPENAI_API, value.trim());
}

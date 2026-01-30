import { invoke } from "@tauri-apps/api/core";
import { showToast } from "./ui/interactions";
import { DEFAULT_SPEECHMATICS_URL, STORAGE_KEY_SPEECHMATICS_URL } from "./constants";

export interface VoiceSample {
  id: string;
  blob: Blob;
  durationMs: number;
  deviceId: string | null;
  deviceLabel: string;
  mimeType?: string;
}

export interface SpeakerProfile {
  name: string;
  email?: string;
  identifiers: string[];
  updatedAt: number;
  microphones?: string[];
}

const SPEAKER_PROFILE_STORAGE_KEY = "speechmatics_speaker_profile";
const VOICE_SAMPLES_STORAGE_KEY = "speechmatics_voice_samples";

export function getVoiceSampleScript(name?: string): string {
  const safeName = name?.trim() || "your name here";
  return [
    `Hi, this is ${safeName}.`,
    "I'm recording this short script so Speechmatics can learn my voice.",
    "You should hear me clearly for the next fifteen seconds while you capture a clean sample to recognize me across the whole meeting and future sessions.",
  ].join(" ");
}

export function getStoredSpeakerProfile(): SpeakerProfile | null {
  const raw = localStorage.getItem(SPEAKER_PROFILE_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SpeakerProfile;
    if (Array.isArray(parsed.identifiers) && parsed.identifiers.length > 0) {
      return parsed;
    }
    return {
      ...parsed,
      identifiers: parsed.identifiers ?? [],
    };
  } catch (error) {
    console.error("Failed to parse stored speaker profile", error);
    localStorage.removeItem(SPEAKER_PROFILE_STORAGE_KEY);
    return null;
  }
}

export function saveSpeakerProfile(profile: SpeakerProfile): void {
  localStorage.setItem(SPEAKER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function updateSpeakerProfileMetadata(name: string | undefined, email?: string): SpeakerProfile | null {
  const existing = getStoredSpeakerProfile();
  if (!name && !email && !existing) {
    return null;
  }

  const normalizedName = name?.trim() ?? existing?.name ?? "";
  const normalizedEmail = email?.trim() || existing?.email;
  const identifiers = existing?.identifiers ?? [];

  if (!normalizedName && identifiers.length === 0) {
    return null;
  }

  const updated: SpeakerProfile = {
    name: normalizedName || existing?.name || "",
    email: normalizedEmail,
    identifiers,
    updatedAt: existing?.updatedAt ?? Date.now(),
    microphones: existing?.microphones ?? [],
  };

  saveSpeakerProfile(updated);
  return updated;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        const base64 = reader.result.split(",")[1] || "";
        resolve(base64);
      } else {
        reject(new Error("Failed to read blob"));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType = "audio/webm"): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export async function persistVoiceSamples(samples: VoiceSample[]): Promise<void> {
  const serialized = await Promise.all(
    samples.map(async (sample) => ({
      id: sample.id,
      durationMs: sample.durationMs,
      deviceId: sample.deviceId,
      deviceLabel: sample.deviceLabel,
      mimeType: sample.mimeType || sample.blob.type || "audio/webm",
      data: await blobToBase64(sample.blob),
    }))
  );
  localStorage.setItem(VOICE_SAMPLES_STORAGE_KEY, JSON.stringify(serialized));
}

export function loadStoredVoiceSamples(): VoiceSample[] {
  const raw = localStorage.getItem(VOICE_SAMPLES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      id: string;
      durationMs: number;
      deviceId: string | null;
      deviceLabel: string;
      mimeType?: string;
      data: string;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      id: item.id,
      durationMs: item.durationMs,
      deviceId: item.deviceId ?? null,
      deviceLabel: item.deviceLabel,
      mimeType: item.mimeType,
      blob: base64ToBlob(item.data, item.mimeType || "audio/webm"),
    }));
  } catch (error) {
    console.error("Failed to parse stored voice samples", error);
    localStorage.removeItem(VOICE_SAMPLES_STORAGE_KEY);
    return [];
  }
}

function mergeToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }

  const length = buffer.length;
  const mixed = new Float32Array(length);
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    const channel = buffer.getChannelData(i);
    for (let j = 0; j < length; j++) {
      mixed[j] += channel[j] / buffer.numberOfChannels;
    }
  }
  return mixed;
}

async function decodeSamples(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("AudioContext is not available in this environment.");
  }
  const audioContext = new AudioContextCtor();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const samples = mergeToMono(audioBuffer);
    return {
      samples,
      sampleRate: audioBuffer.sampleRate || 48_000,
    };
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}


interface EnrollmentOptions {
  name?: string;
  email?: string;
  onProgress?: (message: string) => void;
}

export async function enrollSpeakerFromSamples(
  samples: VoiceSample[],
  apiKey: string,
  options?: EnrollmentOptions
): Promise<SpeakerProfile> {
  if (!samples.length) {
    throw new Error("Please record at least one voice sample first.");
  }

  const identifiers = new Set<string>();
  const microphones = new Set<string>();
  const rtUrl = localStorage.getItem(STORAGE_KEY_SPEECHMATICS_URL) || DEFAULT_SPEECHMATICS_URL;

  for (const sample of samples) {
    options?.onProgress?.(`Enrolling sample from ${sample.deviceLabel || "microphone"}...`);
    const decoded = await decodeSamples(sample.blob);
    const ids = await invoke<string[]>("enroll_speaker_rt", {
      apiKey,
      samples: Array.from(decoded.samples),
      sampleRate: decoded.sampleRate,
      rtUrl,
    });

    ids.forEach((id) => {
      if (id && typeof id === "string") {
        identifiers.add(id);
      }
    });

    microphones.add(sample.deviceLabel || "Microphone");
  }

  if (identifiers.size === 0) {
    throw new Error("Speechmatics did not return any speaker identifiers for these samples.");
  }

  const profile: SpeakerProfile = {
    name: options?.name?.trim() || "You",
    email: options?.email?.trim() || undefined,
    identifiers: Array.from(identifiers),
    updatedAt: Date.now(),
    microphones: Array.from(microphones),
  };

  saveSpeakerProfile(profile);
  showToast("Voice enrollment completed", { type: "success" });
  return profile;
}

import { refreshAudioDeviceOptions } from "../../audio-devices";
import { elements } from "../../dom";
import {
  VoiceSample,
  enrollSpeakerFromSamples,
  getStoredSpeakerProfile,
  getVoiceSampleScript,
  loadStoredVoiceSamples,
  persistVoiceSamples,
  updateSpeakerProfileMetadata,
} from "../../speaker-id";
import { showToast } from "../interactions";
import { getSpeechmaticsApiKey, setSpeechmaticsApiKey } from "../../secure-storage";

let samples: VoiceSample[] = [];
let isRecordingSample = false;
let isEnrolling = false;
let recordTimer: number | null = null;

function setStatus(message: string, isError = false) {
  if (!elements.speakerIdStatus) return;
  elements.speakerIdStatus.textContent = message;
  elements.speakerIdStatus.classList.toggle("error", isError);
}

function updateVoiceScript() {
  if (elements.voiceSampleScript) {
    const name = elements.speakerNameInput?.value;
    elements.voiceSampleScript.textContent = getVoiceSampleScript(name);
  }
}

function renderSavedIdentifiers(profile = getStoredSpeakerProfile()) {
  if (!elements.speakerIdentifiersList) return;

  elements.speakerIdentifiersList.innerHTML = "";
  if (!profile || profile.identifiers.length === 0) {
    const empty = document.createElement("span");
    empty.className = "small-text";
    empty.textContent = "No speaker identifiers saved yet.";
    elements.speakerIdentifiersList.appendChild(empty);
    setStatus("Not enrolled yet. Uses your Speechmatics API key.");
    return;
  }

  const pill = document.createElement("span");
  pill.className = "speaker-identifier-pill";
  pill.textContent = `${profile.identifiers.length} identifier${profile.identifiers.length === 1 ? "" : "s"} saved`;
  elements.speakerIdentifiersList?.appendChild(pill);

  const updated = new Date(profile.updatedAt).toLocaleString();
  const micInfo =
    profile.microphones && profile.microphones.length
      ? ` · Mics: ${profile.microphones.join(", ")}`
      : "";
  setStatus(`Enrolled (${profile.identifiers.length} id${profile.identifiers.length === 1 ? "" : "s"}) · Updated ${updated}${micInfo}`);
}

function renderSamples() {
  if (!elements.voiceSampleList) return;
  elements.voiceSampleList.innerHTML = "";

  if (samples.length === 0) {
    const empty = document.createElement("p");
    empty.className = "small-text";
    empty.textContent = "No samples yet. Record a clip with the mic you'll use.";
    elements.voiceSampleList.appendChild(empty);
  } else {
    samples.forEach((sample) => {
      const row = document.createElement("div");
      row.className = "voice-sample";

      const meta = document.createElement("div");
      meta.className = "voice-sample-meta";
      const title = document.createElement("strong");
      title.textContent = sample.deviceLabel || "Microphone";
      const detail = document.createElement("span");
      detail.className = "small-text";
      const durationSeconds = Math.round(sample.durationMs / 1000);
      detail.textContent = `${durationSeconds}s · ${(sample.blob.size / 1024).toFixed(0)} KB`;
      meta.appendChild(title);
      meta.appendChild(detail);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-secondary btn-small ghost-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        samples = samples.filter((s) => s.id !== sample.id);
        void persistVoiceSamples(samples);
        renderSamples();
        updateButtonStates();
      });

      row.appendChild(meta);
      row.appendChild(removeBtn);
      elements.voiceSampleList?.appendChild(row);
    });
  }

  updateButtonStates();
}

function updateButtonStates() {
  const hasSamples = samples.length > 0;
  if (elements.enrollVoiceProfileBtn) {
    elements.enrollVoiceProfileBtn.disabled = isRecordingSample || isEnrolling || !hasSamples;
  }

  if (elements.recordVoiceSampleBtn) {
    elements.recordVoiceSampleBtn.disabled = isEnrolling;
  }
}

async function recordVoiceSample() {
  if (isRecordingSample) {
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Microphone access is not available in this browser.", { type: "error" });
    return;
  }

  const deviceId = elements.voiceSampleDeviceSelect?.value || "";
  const constraints: MediaStreamConstraints = {
    audio: deviceId
      ? { deviceId: { exact: deviceId }, channelCount: 1, sampleRate: 48_000 }
      : { channelCount: 1, sampleRate: 48_000 },
  };

  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : undefined;
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    const chunks: BlobPart[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    isRecordingSample = true;
    updateButtonStates();
    const startedAt = Date.now();

    if (elements.recordVoiceSampleBtn) {
      elements.recordVoiceSampleBtn.textContent = "Recording… 15s";
    }

    recorder.start();
    recordTimer = window.setInterval(() => {
      if (!elements.recordVoiceSampleBtn) return;
      const elapsed = Math.min(15, Math.round((Date.now() - startedAt) / 1000));
      const remaining = 15 - elapsed;
      elements.recordVoiceSampleBtn.textContent = remaining > 0 ? `Recording… ${remaining}s` : "Processing…";
    }, 500);

    await new Promise<void>((resolve) => {
      recorder?.addEventListener("stop", () => resolve());
      window.setTimeout(() => recorder?.stop(), 15_000);
    });

    const blob = new Blob(chunks, { type: recorder.mimeType });
    const track = stream.getAudioTracks()[0];
    const label = track?.label || "Microphone sample";

    samples.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      blob,
      durationMs: Date.now() - startedAt,
      deviceId,
      deviceLabel: label,
      mimeType: recorder.mimeType,
    });

    await persistVoiceSamples(samples);
    renderSamples();
  } catch (error) {
    console.error("Failed to record voice sample", error);
    showToast(`Unable to record sample: ${error}`, { type: "error", duration: 5000 });
  } finally {
    if (recordTimer) {
      clearInterval(recordTimer);
      recordTimer = null;
    }
    if (recorder && recorder.state === "recording") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    stream?.getTracks().forEach((track) => track.stop());
    isRecordingSample = false;
    if (elements.recordVoiceSampleBtn) {
      elements.recordVoiceSampleBtn.textContent = "Record 15s sample";
    }
    updateButtonStates();
  }
}

async function handleEnroll() {
  if (isEnrolling) return;

  const typedKey = elements.speechmaticsKeyInput?.value.trim();
  const apiKey = typedKey || (await getSpeechmaticsApiKey());
  if (!apiKey) {
    showToast("Add your Speechmatics API key before enrolling your voice.", { type: "warning" });
    return;
  }

  if (samples.length === 0) {
    showToast("Record at least one 15 second sample first.", { type: "warning" });
    return;
  }

  isEnrolling = true;
  updateButtonStates();

  try {
    if (typedKey) {
      await setSpeechmaticsApiKey(typedKey);
    }

    const profile = await enrollSpeakerFromSamples(samples, apiKey, {
      name: elements.speakerNameInput?.value,
      email: elements.speakerEmailInput?.value,
      onProgress: (message) => setStatus(message),
    });
    setStatus(`Enrolled ${profile.identifiers.length} identifier${profile.identifiers.length === 1 ? "" : "s"} for ${profile.name}`);
    renderSavedIdentifiers(profile);
    // Keep samples persisted so the user can re-enroll or enroll on other mics later
    await persistVoiceSamples(samples);
  } catch (error) {
    console.error("Voice enrollment failed", error);
    showToast(`Voice enrollment failed: ${error}`, { type: "error", duration: 6000 });
    setStatus(String(error), true);
  } finally {
    isEnrolling = false;
    updateButtonStates();
  }
}

export async function initializeSpeakerIdUI(): Promise<void> {
  await refreshAudioDeviceOptions([elements.voiceSampleDeviceSelect]);
  samples = loadStoredVoiceSamples();
  const storedProfile = getStoredSpeakerProfile();
  if (storedProfile) {
    if (elements.speakerNameInput) {
      elements.speakerNameInput.value = storedProfile.name ?? "";
    }
    if (elements.speakerEmailInput) {
      elements.speakerEmailInput.value = storedProfile.email ?? "";
    }
  }
  renderSavedIdentifiers(storedProfile);
  renderSamples();
  updateVoiceScript();

  elements.voiceSampleDeviceSelect?.addEventListener("change", () => {
    // keep selection synced when recording
  });

  elements.recordVoiceSampleBtn?.addEventListener("click", () => {
    void recordVoiceSample();
  });

  elements.clearVoiceSamplesBtn?.addEventListener("click", () => {
    samples = [];
    void persistVoiceSamples(samples);
    renderSamples();
    setStatus("Cleared recorded samples.");
  });

  elements.enrollVoiceProfileBtn?.addEventListener("click", () => {
    void handleEnroll();
  });

  elements.speakerNameInput?.addEventListener("input", updateVoiceScript);

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      refreshAudioDeviceOptions([elements.voiceSampleDeviceSelect]).catch((error) => {
        console.error("Failed to refresh microphones for voice ID", error);
      });
    });
  }
}

export function persistSpeakerProfileInputs(): void {
  const name = elements.speakerNameInput?.value;
  const email = elements.speakerEmailInput?.value;
  updateSpeakerProfileMetadata(name, email);
  updateVoiceScript();
}

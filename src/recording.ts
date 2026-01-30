import { invoke } from "@tauri-apps/api/core";
import { TranscriptData, Meeting } from "./types";
import {
  getCurrentMeeting,
  setIsRecording,
  getIsRecording,
  getRecordingMeetingId,
  setRecordingMeetingId,
  getIsMuted,
  setIsMuted,
  updateMeetingInList,
  setCurrentMeeting,
} from "./state";
import { elements } from "./dom";
import { saveMeetingChanges, createNewMeeting, loadMeeting } from "./meeting-operations";
import { aiService } from "./ai-service";
import { renderTranscript, handlePartialTranscriptUpdate, resetTranscriptAutoScroll } from "./ui/transcript";
import { transcriptTextToTurns, transcriptTurnsToText, hasTranscriptContent } from "./utils";
import { getCustomDictionaryEntries, CUSTOM_DICTIONARY_LIMIT } from "./custom-dictionary";
import { refreshAudioDeviceOptions, getSavedAudioDevice, setSavedAudioDevice, syncSelectedAudioDevice } from "./audio-devices";
import { autoEnhanceNotesForMeeting } from "./ai-operations";
import { getDefaultTemplateId } from "./prompt-templates";
import { showToast } from "./ui/interactions";
import { getStoredSpeakerProfile } from "./speaker-id";
import { DEFAULT_SPEECHMATICS_URL, STORAGE_KEY_SPEECHMATICS_URL } from "./constants";
import { openOnboarding } from "./ui/onboarding";
import { db } from "./database";
import { renderMeetingsList } from "./ui/sidebar";
import { getSpeechmaticsApiKey } from "./secure-storage";

let micContext: AudioContext | null = null;
let micProcessor: ScriptProcessorNode | null = null;
let micSink: MediaStreamAudioDestinationNode | null = null;
let micMonitor: GainNode | null = null;
let micStream: MediaStream | null = null;
let activeMicDeviceId: string | null = null;
let micStopRequested = false;
let micRecoveryInProgress = false;
let stopRecordingInProgress = false;
const micTrackEndHandlers = new Map<MediaStreamTrack, () => void>();
const SOUND_DETECTION_THRESHOLD = 0.02;
const MIC_ACTIVITY_BOOST = 3;
const SOUND_DETECTED_WINDOW_MS = 1_000;
const MIC_BUFFER_SIZE = 1024;
let lastSoundDetectedAt = 0;
const PUNCT_GAP_REGEX = /[ \t]+([.,!?;:])/g;
const PUNCT_SPACE_AFTER_REGEX = /([.,!?;:])(?!\s|$)/g;
const INLINE_GAPS_REGEX = /[ \t]{2,}/g;
const TRAILING_NEWLINE_SPACE_REGEX = /[ \t]+\n/g;
const LEADING_NEWLINE_SPACE_REGEX = /\n[ \t]+/g;

function tidyTranscriptText(text: string): string {
  if (!text) return "";

  const noLeadSpaceBeforePunct = text.replace(PUNCT_GAP_REGEX, "$1");
  const spaceAfterPunct = noLeadSpaceBeforePunct.replace(PUNCT_SPACE_AFTER_REGEX, "$1 ");
  const collapseInlineGaps = spaceAfterPunct.replace(INLINE_GAPS_REGEX, " ");
  const tidyNewlineEdges = collapseInlineGaps
    .replace(TRAILING_NEWLINE_SPACE_REGEX, "\n")
    .replace(LEADING_NEWLINE_SPACE_REGEX, "\n");

  return tidyNewlineEdges.trim();
}

async function startMicCapture(deviceId?: string | null, allowRetry = true) {
  if (micContext) {
    return;
  }

  micStopRequested = false;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone unavailable");
  }

  const preferredDevice = deviceId ?? getSavedAudioDevice();
  const targetDeviceId = preferredDevice || undefined;
  const baseAudioConstraints: MediaTrackConstraints = {
    channelCount: 1,
    sampleRate: 48_000,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };

  const constraints: MediaStreamConstraints = {
    audio: targetDeviceId
      ? { ...baseAudioConstraints, deviceId: { exact: targetDeviceId } }
      : baseAudioConstraints,
  };

  try {
    micStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    if (targetDeviceId && allowRetry) {
      console.warn("Preferred microphone unavailable, falling back to default", error);
      setSavedAudioDevice(null);
      syncSelectedAudioDevice(
        [elements.inlineAudioDeviceSelect, elements.audioDeviceSelect],
        null,
      );
      await refreshMicDeviceOptions();
      return startMicCapture(null, false);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  micContext = new AudioContext({ sampleRate: 48_000 });
  const source = micContext.createMediaStreamSource(micStream);
  micProcessor = micContext.createScriptProcessor(MIC_BUFFER_SIZE, 1, 1);
  micSink = micContext.createMediaStreamDestination();
  micMonitor = micContext.createGain();
  micMonitor.gain.value = 0;

  micTrackEndHandlers.forEach((handler, track) => {
    track.removeEventListener("ended", handler);
  });
  micTrackEndHandlers.clear();

  micStream.getAudioTracks().forEach((track) => {
    const onEnded = () => {
      if (!getIsRecording() || micStopRequested) return;
      if (micRecoveryInProgress) return;

      micRecoveryInProgress = true;
      console.warn("Microphone track ended - attempting to recover on a new device");
      restartMicCapture(activeMicDeviceId ?? null).catch((err) => {
        console.error("Failed to recover microphone after track ended:", err);
      }).finally(() => {
        micRecoveryInProgress = false;
      });
    };
    track.addEventListener("ended", onEnded);
    micTrackEndHandlers.set(track, onEnded);
  });

  if (micContext.state === "suspended") {
    await micContext.resume().catch(() => undefined);
  }

  micProcessor.onaudioprocess = (event) => {
    const data = event.inputBuffer.getChannelData(0);
    // Compute RMS locally so mic activity works without relying on backend events
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const sample = data[i];
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    const boostedLevel = Math.min(1, rms * MIC_ACTIVITY_BOOST);
    handleAudioLevel(boostedLevel);

    invoke("push_mic_audio_chunk", { samples: Array.from(data) }).catch((err) => {
      console.error("Failed to push mic audio", err);
    });
  };

  source.connect(micProcessor);
  micProcessor.connect(micSink);
  micProcessor.connect(micMonitor);
  micMonitor.connect(micContext.destination);
  activeMicDeviceId = targetDeviceId ?? null;
  await refreshMicDeviceOptions();
}

function stopMicCapture() {
  micStopRequested = true;
  micRecoveryInProgress = false;

  micTrackEndHandlers.forEach((handler, track) => {
    track.removeEventListener("ended", handler);
  });
  micTrackEndHandlers.clear();

  if (micProcessor) {
    micProcessor.disconnect();
    micProcessor.onaudioprocess = null;
    micProcessor = null;
  }
  if (micSink) {
    micSink.disconnect();
    micSink = null;
  }
  if (micMonitor) {
    micMonitor.disconnect();
    micMonitor = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  if (micContext) {
    micContext.close().catch(() => undefined);
    micContext = null;
  }
  activeMicDeviceId = null;
}

async function restartMicCapture(deviceId?: string | null) {
  stopMicCapture();
  await startMicCapture(deviceId);
}

async function refreshMicDeviceOptions() {
  await refreshAudioDeviceOptions([
    elements.inlineAudioDeviceSelect,
    elements.audioDeviceSelect,
  ]);
}

export async function startRecording() {
  const speechmaticsKey = await getSpeechmaticsApiKey();
  const storedSpeechmaticsUrl = (localStorage.getItem(STORAGE_KEY_SPEECHMATICS_URL) || "").trim();
  const speechmaticsUrl = storedSpeechmaticsUrl || DEFAULT_SPEECHMATICS_URL;
  if (!storedSpeechmaticsUrl) {
    localStorage.setItem(STORAGE_KEY_SPEECHMATICS_URL, speechmaticsUrl);
  }

  if (!speechmaticsKey) {
    showToast("Add your Speechmatics API key to start recording. Opening setup now!", { type: "warning" });
    openOnboarding();
    return;
  }

  let currentMeeting = getCurrentMeeting();
  if (!currentMeeting) {
    await createNewMeeting();
    currentMeeting = getCurrentMeeting();
  }

  try {
    const customDictionaryEntries = await getCustomDictionaryEntries();
    const truncatedDictionary = customDictionaryEntries.slice(0, CUSTOM_DICTIONARY_LIMIT);
    const additionalVocabPayload = truncatedDictionary.map((entry) => ({
      content: entry.content,
      sounds_like: entry.soundsLike.length ? entry.soundsLike : undefined,
    }));

    const storedSpeakerProfile = getStoredSpeakerProfile();
    const speakerProfile =
      storedSpeakerProfile && storedSpeakerProfile.identifiers.length > 0
        ? {
            label: (storedSpeakerProfile.name ?? "").trim() || "You",
            speakerIdentifiers: storedSpeakerProfile.identifiers,
          }
        : null;

    if (import.meta.env.DEV) {
      console.debug("Starting Speechmatics RT with speaker profile:", speakerProfile);
    }

    await startMicCapture();
    const startArgs = {
      apiKey: speechmaticsKey,
      additionalVocab: additionalVocabPayload,
      speakerProfile: speakerProfile ?? undefined,
      rtUrl: speechmaticsUrl,
    };

    if (import.meta.env.DEV) {
      console.debug("Sending start_recording args:", {
        ...startArgs,
        apiKey: "[redacted]",
      });
    }

    await invoke("start_recording", {
      args: startArgs,
    });
    setIsRecording(true);
    setIsMuted(false); // Ensure unmuted when starting
    // Store which meeting is being recorded
    if (currentMeeting) {
      setRecordingMeetingId(currentMeeting.id);
    }
    await updateRecordingUI();

    lastTranscriptReceivedAt = Date.now();
    autoStopInProgress = false;
    updateRecordingMeetingEndTime(currentMeeting);
    startInactivityMonitor();

    if (currentMeeting && elements.transcriptContent) {
      currentMeeting.transcript = [];
      resetTranscriptAutoScroll();
      renderTranscript(elements.transcriptContent, currentMeeting.transcript);
    }
  } catch (error) {
    console.error("Failed to start recording:", error);
    stopMicCapture();
    showToast(`Failed to start recording: ${error}`, { type: "error", duration: 5000 });
  }
}

let recordingEndedPromise: Promise<void> | null = null;
let recordingEndedResolve: (() => void) | null = null;
let inactivityTimerId: number | null = null;
let lastTranscriptReceivedAt = 0;
let recordingMeetingEndTime: number | null = null;
let autoStopInProgress = false;

const INACTIVITY_TIMEOUT_MS = 60 * 1000;
const INACTIVITY_CHECK_INTERVAL_MS = 10 * 1000;
const RECORDING_END_TIMEOUT_MS = 10 * 1000;

export function setupRecordingEndedListener() {
  recordingEndedPromise = new Promise((resolve) => {
    recordingEndedResolve = resolve;
  });
}

export function onRecordingEnded() {
  stopMicCapture();
  if (recordingEndedResolve) {
    recordingEndedResolve();
    recordingEndedResolve = null;
  }
}

async function waitForRecordingEnd(): Promise<void> {
  if (!recordingEndedPromise) {
    return;
  }

  let timeoutHandle: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = window.setTimeout(() => {
      reject(new Error("Timed out waiting for recording to finish"));
    }, RECORDING_END_TIMEOUT_MS);
  });

  try {
    await Promise.race([recordingEndedPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      window.clearTimeout(timeoutHandle);
    }
    recordingEndedPromise = null;
    recordingEndedResolve = null;
  }
}

function updateRecordingMeetingEndTime(meeting?: Meeting | null) {
  if (meeting?.endTime) {
    recordingMeetingEndTime = new Date(meeting.endTime).getTime();
  } else {
    recordingMeetingEndTime = null;
  }
}

function startInactivityMonitor() {
  clearInactivityMonitor();
  inactivityTimerId = window.setInterval(() => {
    checkRecordingInactivity().catch((error) => {
      console.error("Failed to evaluate transcription inactivity:", error);
    });
  }, INACTIVITY_CHECK_INTERVAL_MS);
}

function clearInactivityMonitor() {
  if (inactivityTimerId !== null) {
    window.clearInterval(inactivityTimerId);
    inactivityTimerId = null;
  }
  autoStopInProgress = false;
  recordingMeetingEndTime = null;
}

async function checkRecordingInactivity(): Promise<void> {
  if (!getIsRecording()) {
    return;
  }

  const recordingMeetingId = getRecordingMeetingId();
  if (!recordingMeetingId) {
    return;
  }

  // Refresh meeting data to capture any calendar updates
  const meeting = await db.getMeeting(recordingMeetingId);
  updateRecordingMeetingEndTime(meeting);

  if (!recordingMeetingEndTime) {
    return;
  }

  const now = Date.now();
  if (now < recordingMeetingEndTime) {
    return;
  }

  if (now - lastTranscriptReceivedAt < INACTIVITY_TIMEOUT_MS) {
    return;
  }

  if (autoStopInProgress) {
    return;
  }

  autoStopInProgress = true;
  try {
    if (import.meta.env.DEV) {
      console.log("Auto-stopping recording due to inactivity after meeting end");
    }
    await stopRecording();
  } catch (error) {
    console.error("Failed to auto-stop recording:", error);
  } finally {
    autoStopInProgress = false;
  }
}

export async function stopRecording() {
  if (stopRecordingInProgress) {
    return;
  }

  stopRecordingInProgress = true;
  updateStopRecordingButton(getIsRecording());
  const recordingMeetingId = getRecordingMeetingId();
  try {
    clearInactivityMonitor();
    setupRecordingEndedListener();
    stopMicCapture();
    
    await invoke("stop_recording");
    setIsRecording(false);
    stopRecordingInProgress = false;
    await updateRecordingUI();

    // Wait for backend to finish processing all final transcripts
    try {
      await waitForRecordingEnd();
    } catch (error) {
      console.error("Recording end event timeout:", error);
    }

    // Only clear recording meeting ID after all final transcripts have been processed
    setRecordingMeetingId(null);

    if (elements.partialTranscript) {
      elements.partialTranscript.textContent = "";
      handlePartialTranscriptUpdate();
    }

    // Auto-generate title if still untitled
    const currentMeeting = getCurrentMeeting();
    if (currentMeeting && currentMeeting.title === "Untitled Meeting" && hasTranscriptContent(currentMeeting.transcript)) {
      try {
        const title = await aiService.generateTitle(
          transcriptTurnsToText(currentMeeting.transcript),
          currentMeeting.personalNotes,
          currentMeeting.transcript
        );
        currentMeeting.title = title;
        if (elements.meetingTitle) elements.meetingTitle.value = title;
        await saveMeetingChanges();
      } catch (error) {
        console.error("Failed to generate title:", error);
      }
    }

    if (recordingMeetingId) {
      void autoEnhanceNotesForMeeting(recordingMeetingId, getDefaultTemplateId());
    }
  } catch (error) {
    stopRecordingInProgress = false;
    await updateRecordingUI();
    console.error("Failed to stop recording:", error);
    showToast(`Failed to stop recording: ${error}`, { type: "error", duration: 5000 });
  }
}

export async function toggleMute() {
  try {
    const newMuteState = await invoke<boolean>("toggle_mute");
    setIsMuted(newMuteState);
    await updateRecordingUI();
  } catch (error) {
    console.error("Failed to toggle mute:", error);
  }
}

function setMicActivityVisibility(visible: boolean) {
  if (elements.micActivity) {
    elements.micActivity.style.display = visible ? "inline-flex" : "none";
  }
}

function setMicActivityState(state: "idle" | "detected" | "muted") {
  if (!elements.micActivity || !elements.micActivityDot || !elements.micActivityLabel) {
    return;
  }

  elements.micActivity.classList.toggle("detected", state === "detected");
  elements.micActivity.classList.toggle("muted", state === "muted");
  elements.micActivityLabel.textContent =
    state === "muted" ? "Muted" : state === "detected" ? "Sound detected" : "Listening";
}

function updateStopRecordingButton(isRecording: boolean) {
  if (!elements.stopRecordingBtn) {
    return;
  }

  const isStopping = stopRecordingInProgress;
  const label = isStopping ? "Stopping..." : "Stop recording";

  elements.stopRecordingBtn.disabled = !isRecording || isStopping;
  elements.stopRecordingBtn.classList.toggle("is-loading", isStopping);
  elements.stopRecordingBtn.title = label;
  elements.stopRecordingBtn.setAttribute("aria-label", label);
}

export async function updateRecordingUI() {
  const isRecording = getIsRecording();
  const isMuted = getIsMuted();
  const recordingMeetingId = getRecordingMeetingId();
  const currentMeeting = getCurrentMeeting();
  const isViewingRecordingMeeting = !recordingMeetingId || currentMeeting?.id === recordingMeetingId;
  
  if (elements.startRecordingBtn) {
    elements.startRecordingBtn.disabled = isRecording;
  }
  updateStopRecordingButton(isRecording);
  if (elements.muteBtn) {
    elements.muteBtn.disabled = !isRecording;
    elements.muteBtn.classList.toggle("muted", isMuted);
    
    // Update icon visibility
    const muteIconUnmuted = document.getElementById('mute-icon-unmuted');
    const muteIconMuted = document.getElementById('mute-icon-muted');
    if (muteIconUnmuted) {
      muteIconUnmuted.style.display = isMuted ? 'none' : 'inline';
    }
    if (muteIconMuted) {
      muteIconMuted.style.display = isMuted ? 'inline' : 'none';
    }
    
    elements.muteBtn.title = isMuted ? "Unmute microphone" : "Mute microphone";
    elements.muteBtn.setAttribute("aria-label", isMuted ? "Unmute microphone" : "Mute microphone");
  }

  const shouldShowMicActivity = isRecording && isViewingRecordingMeeting;
  setMicActivityVisibility(shouldShowMicActivity);
  if (shouldShowMicActivity) {
    lastSoundDetectedAt = 0;
    setMicActivityState(isMuted ? "muted" : "idle");
  } else if (!isRecording) {
    lastSoundDetectedAt = 0;
  }

  if (elements.recordingStatus) {
    // Remove any existing click listeners
    const newRecordingStatus = elements.recordingStatus.cloneNode(false) as HTMLElement;
    elements.recordingStatus.parentNode?.replaceChild(newRecordingStatus, elements.recordingStatus);
    elements.recordingStatus = newRecordingStatus;
    
    if (isRecording) {
      if (isViewingRecordingMeeting) {
        elements.recordingStatus.textContent = isMuted ? "Recording (muted)" : "Recording";
        elements.recordingStatus.style.cursor = "default";
        elements.recordingStatus.style.textDecoration = "none";
      } else if (recordingMeetingId) {
        // Get the recording meeting's title to show in status
        const recordingMeeting = await db.getMeeting(recordingMeetingId);
        if (recordingMeeting) {
          elements.recordingStatus.textContent = `Recording in background: "${recordingMeeting.title}" (click to view)`;
          elements.recordingStatus.style.cursor = "pointer";
          elements.recordingStatus.style.textDecoration = "underline";
          
          // Add click handler to navigate to the recording meeting
          elements.recordingStatus.addEventListener("click", async () => {
            await loadMeeting(recordingMeetingId);
          });
        } else {
          elements.recordingStatus.textContent = "Recording in background...";
          elements.recordingStatus.style.cursor = "default";
          elements.recordingStatus.style.textDecoration = "none";
        }
      } else {
        elements.recordingStatus.textContent = "Recording...";
        elements.recordingStatus.style.cursor = "default";
        elements.recordingStatus.style.textDecoration = "none";
      }
      elements.recordingStatus.classList.toggle("muted", isMuted);
      elements.recordingStatus.classList.add("recording");
    } else {
      elements.recordingStatus.textContent = "Not Recording";
      elements.recordingStatus.classList.remove("recording");
      elements.recordingStatus.classList.remove("muted");
      elements.recordingStatus.style.cursor = "default";
      elements.recordingStatus.style.textDecoration = "none";
    }
  }
}

export async function updateTranscript(data: TranscriptData) {
  const recordingMeetingId = getRecordingMeetingId();
  
  // Only update transcript if we have a recording session
  if (!recordingMeetingId) {
    return;
  }

  // Get the meeting being recorded (may not be the current one)
  const recordingMeeting = await db.getMeeting(recordingMeetingId);
  if (!recordingMeeting) {
    return;
  }
  updateRecordingMeetingEndTime(recordingMeeting);

  const currentMeeting = getCurrentMeeting();
  const isViewingRecordingMeeting = currentMeeting?.id === recordingMeetingId;

  if (data.is_partial) {
    const partialText = tidyTranscriptText(data.text);
    if (partialText.length > 0) {
      lastTranscriptReceivedAt = Date.now();
    }
    // Show partial transcript only if viewing the recording meeting
    if (isViewingRecordingMeeting && elements.partialTranscript) {
      elements.partialTranscript.textContent = partialText;
      handlePartialTranscriptUpdate();
    }
  } else {
    // Update final transcript in the recording meeting
    const turns =
      data.turns?.map((turn) => ({
        speaker: turn.speaker?.trim() || null,
        text: tidyTranscriptText(turn.text || ""),
      })) ??
      transcriptTextToTurns(tidyTranscriptText(data.text)).map((turn) => ({
        speaker: turn.speaker,
        text: tidyTranscriptText(turn.text),
      }));

    recordingMeeting.transcript = turns;
    recordingMeeting.updatedAt = new Date();
    lastTranscriptReceivedAt = Date.now();
    
    // Save to database
    await db.saveMeeting(recordingMeeting);

    // Update in-memory list
    updateMeetingInList(recordingMeeting);

    // If viewing the recording meeting, also update currentMeeting
    if (isViewingRecordingMeeting) {
      setCurrentMeeting(recordingMeeting);
    }

    // Update UI only if viewing the recording meeting
    if (isViewingRecordingMeeting) {
      if (elements.transcriptContent) {
        renderTranscript(elements.transcriptContent, recordingMeeting.transcript);
      }
      // Don't clear partial transcript here - let it be replaced by the next partial
      // This prevents flickering and keeps the UI more stable
      if (elements.enhanceNotesBtn) {
        elements.enhanceNotesBtn.disabled = !hasTranscriptContent(recordingMeeting.transcript);
      }
    }

    // Update the meetings list to show the recording meeting has been updated
    renderMeetingsList();
  }
}

async function handleMicDeviceChange(deviceId: string) {
  const normalized = deviceId || "";
  const previousDeviceId = activeMicDeviceId;

  setSavedAudioDevice(normalized || null);
  syncSelectedAudioDevice(
    [elements.inlineAudioDeviceSelect, elements.audioDeviceSelect],
    normalized,
  );

  if (!getIsRecording()) {
    return;
  }

  try {
    await restartMicCapture(normalized || null);
  } catch (error) {
    console.error("Failed to switch microphone during recording:", error);
    showToast("Unable to switch microphone. Reverting to the previous device.", { type: "warning" });
    const rollbackValue = previousDeviceId ?? "";
    setSavedAudioDevice(rollbackValue || null);
    syncSelectedAudioDevice(
      [elements.inlineAudioDeviceSelect, elements.audioDeviceSelect],
      rollbackValue,
    );
    try {
      await restartMicCapture(rollbackValue || null);
    } catch (restartError) {
      console.error("Failed to restore previous microphone:", restartError);
    }
  }
}

function setupMicSelector() {
  void refreshMicDeviceOptions();

  elements.inlineAudioDeviceSelect?.addEventListener("change", async (event) => {
    const select = event.target as HTMLSelectElement;
    await handleMicDeviceChange(select.value);
  });

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      refreshMicDeviceOptions().catch((error) => {
        console.error("Failed to refresh audio devices after device change:", error);
      });
    });
  }
}

export function setupRecordingListeners() {
  setupMicSelector();
  elements.startRecordingBtn?.addEventListener("click", startRecording);
  elements.stopRecordingBtn?.addEventListener("click", stopRecording);
  elements.muteBtn?.addEventListener("click", toggleMute);
}

export function handleAudioLevel(level: number) {
  if (!getIsRecording()) {
    return;
  }

  const recordingMeetingId = getRecordingMeetingId();
  const isViewingRecordingMeeting = !recordingMeetingId || getCurrentMeeting()?.id === recordingMeetingId;
  if (!isViewingRecordingMeeting) {
    return;
  }

  const muted = getIsMuted();
  if (elements.recordingStatus) {
    elements.recordingStatus.classList.toggle("muted", muted);
    elements.recordingStatus.classList.add("recording");
  }

  if (!elements.micActivity) {
    return;
  }

  const now = Date.now();
  const clamped = Math.max(0, Math.min(1, Number(level)));
  if (clamped > SOUND_DETECTION_THRESHOLD) {
    lastSoundDetectedAt = now;
  }

  const detectedRecently = lastSoundDetectedAt > 0 && now - lastSoundDetectedAt <= SOUND_DETECTED_WINDOW_MS;
  const state = muted ? "muted" : detectedRecently ? "detected" : "idle";
  setMicActivityState(state);
}

export async function handleRecordingError(error: string) {
  console.error("Recording error:", error);
  showToast(`Recording error: ${error}`, { type: "error", duration: 5000 });
  stopMicCapture();
  setIsRecording(false);
  setRecordingMeetingId(null);
  clearInactivityMonitor();
  stopRecordingInProgress = false;
  await updateRecordingUI();
}

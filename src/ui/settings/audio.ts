import {
  getSavedAudioDevice,
  refreshAudioDeviceOptions,
  setSavedAudioDevice,
  syncSelectedAudioDevice,
} from "../../audio-devices";
import { elements } from "../../dom";

export async function loadAudioDevices(): Promise<void> {
  await refreshAudioDeviceOptions([
    elements.audioDeviceSelect,
    elements.inlineAudioDeviceSelect,
    elements.voiceSampleDeviceSelect,
  ]);
}

export function syncSavedAudioSelection(): void {
  const savedDeviceUid = getSavedAudioDevice();
  syncSelectedAudioDevice(
    [elements.audioDeviceSelect, elements.inlineAudioDeviceSelect, elements.voiceSampleDeviceSelect],
    savedDeviceUid,
  );
}

export function applyAudioSettingsFromUi(): void {
  const audioDeviceUid = elements.audioDeviceSelect?.value || "";
  const normalizedAudioDevice = audioDeviceUid || null;
  setSavedAudioDevice(normalizedAudioDevice);
  syncSelectedAudioDevice([elements.inlineAudioDeviceSelect], normalizedAudioDevice);
}

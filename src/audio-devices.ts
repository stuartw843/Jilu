const AUDIO_DEVICE_STORAGE_KEY = "audio_device_uid";

export function getSavedAudioDevice(): string | null {
  const saved = localStorage.getItem(AUDIO_DEVICE_STORAGE_KEY);
  return saved && saved.trim().length > 0 ? saved : null;
}

export function setSavedAudioDevice(deviceId: string | null) {
  if (deviceId && deviceId.trim().length > 0) {
    localStorage.setItem(AUDIO_DEVICE_STORAGE_KEY, deviceId);
  } else {
    localStorage.removeItem(AUDIO_DEVICE_STORAGE_KEY);
  }
}

export function syncSelectedAudioDevice(
  selects: Array<HTMLSelectElement | null>,
  deviceId: string | null,
) {
  const value = deviceId ?? "";
  selects.forEach((select) => {
    if (select) {
      select.value = value;
    }
  });
}

export async function refreshAudioDeviceOptions(selects: Array<HTMLSelectElement | null>) {
  if (!selects.length || !navigator.mediaDevices?.enumerateDevices) {
    return;
  }

  let inputs: MediaDeviceInfo[] = [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    inputs = devices.filter((d) => d.kind === "audioinput");
  } catch (error) {
    console.error("Failed to enumerate audio devices:", error);
    return;
  }

  const deviceIds = new Set(inputs.map((d) => d.deviceId));
  const saved = getSavedAudioDevice();
  const preferredSaved = saved && deviceIds.has(saved) ? saved : "";

  selects.forEach((select) => {
    if (!select) return;

    const previousSelection = select.value;
    select.innerHTML = '<option value="">Default Microphone</option>';

    inputs.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `Microphone ${index + 1}`;
      select.append(option);
    });

    const fallback = previousSelection && deviceIds.has(previousSelection) ? previousSelection : "";
    const nextValue = preferredSaved || fallback;
    select.value = nextValue;
  });
}

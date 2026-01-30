import {
  isPermissionGranted as tauriIsPermissionGranted,
  requestPermission as tauriRequestPermission,
  sendNotification as tauriSendNotification,
  type Options as TauriNotificationOptions,
} from "@tauri-apps/plugin-notification";

export interface AppNotificationOptions extends Partial<Omit<TauriNotificationOptions, "title">> {
  /**
   * Provide a stable identifier to let the OS replace an existing notification
   * instead of stacking duplicates.
   */
  tag?: string;
}

let pendingPermissionRequest: Promise<boolean> | null = null;

function tagToStableId(tag: string): number {
  let hash = 0;

  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 31 + tag.charCodeAt(index)) | 0;
  }

  const positiveHash = Math.abs(hash);
  return positiveHash === 0 ? 1 : positiveHash;
}

export async function isNotificationPermissionGranted(): Promise<boolean> {
  return tauriIsPermissionGranted();
}

export async function ensureNotificationPermission(
  { promptUser = false }: { promptUser?: boolean } = {}
): Promise<boolean> {
  if (await tauriIsPermissionGranted()) {
    return true;
  }

  if (!promptUser) {
    return false;
  }

  if (!pendingPermissionRequest) {
    pendingPermissionRequest = tauriRequestPermission()
      .then((result) => result === "granted")
      .finally(() => {
        pendingPermissionRequest = null;
      });
  }

  return pendingPermissionRequest;
}

export async function requestNotificationPermission(): Promise<boolean> {
  return ensureNotificationPermission({ promptUser: true });
}

export async function sendNotification(
  title: string,
  options?: AppNotificationOptions
): Promise<boolean> {
  if (!(await ensureNotificationPermission())) {
    return false;
  }

  const { tag, ...nativeOptions } = options ?? {};
  const payload: TauriNotificationOptions = {
    title,
    ...(nativeOptions as Partial<TauriNotificationOptions>),
  };

  if (tag) {
    const stableId = tagToStableId(tag);
    if (payload.id === undefined) {
      payload.id = stableId;
    }
    if (!payload.group) {
      payload.group = tag;
    }
  }

  try {
    await tauriSendNotification(payload);
    return true;
  } catch (error) {
    console.error("Failed to display notification:", error);
    return false;
  }
}

import { calendarService } from "../../calendar-service";
import {
  ensureNotificationPermission,
  isNotificationPermissionGranted,
  requestNotificationPermission,
} from "../../notifications";
import { elements } from "../../dom";
import { showToast } from "../interactions";

export async function loadCalendarSettings(): Promise<void> {
  if (!elements.calendarSyncEnabled) return;

  const settings = calendarService.getSettings();

  elements.calendarSyncEnabled.checked = settings.enabled;

  if (elements.syncIntervalInput) {
    elements.syncIntervalInput.value = settings.syncIntervalMinutes.toString();
  }

  if (elements.reminderMinutesInput) {
    elements.reminderMinutesInput.value = settings.reminderMinutesBefore.toString();
  }

  if (elements.autoStopReminderCheckbox) {
    elements.autoStopReminderCheckbox.checked = settings.autoStopReminder;
  }

  if (elements.notificationsEnabledToggle) {
    elements.notificationsEnabledToggle.checked = settings.notificationsEnabled;
  }

  if (settings.selectedCalendarIds.length > 0 && elements.calendarList) {
    elements.calendarList.innerHTML = '<p class="loading-text">Click "Grant Permission" to load calendars</p>';
  }

  toggleCalendarSettingsVisibility(settings.enabled);

  const permissionGranted = await calendarService.checkCalendarPermission();
  updateCalendarPermissionStatus(permissionGranted);

  if (permissionGranted) {
    await loadCalendars(settings.selectedCalendarIds);
  } else if (elements.calendarList) {
    elements.calendarList.innerHTML = '<p class="loading-text">Grant permission to load calendars</p>';
  }

  const notificationPermissionGranted = await isNotificationPermissionGranted();
  updateNotificationPermissionStatus(notificationPermissionGranted);

  setupCalendarEventListeners();
}

export function saveCalendarSettings(): void {
  if (!elements.calendarSyncEnabled) return;

  const enabled = elements.calendarSyncEnabled.checked;
  const syncInterval = parseInt(elements.syncIntervalInput?.value || "5");
  const reminderMinutes = parseInt(elements.reminderMinutesInput?.value || "5");
  const autoStopReminder = elements.autoStopReminderCheckbox?.checked ?? true;
  const notificationsEnabled = elements.notificationsEnabledToggle?.checked ?? false;

  const selectedCalendarIds: string[] = [];
  if (elements.calendarList) {
    const checkboxes = elements.calendarList.querySelectorAll('input[type="checkbox"]:checked');
    checkboxes.forEach((checkbox) => {
      const id = (checkbox as HTMLInputElement).dataset.calendarId;
      if (id) selectedCalendarIds.push(id);
    });
  }

  calendarService.updateSettings({
    enabled,
    selectedCalendarIds,
    syncIntervalMinutes: syncInterval,
    reminderMinutesBefore: reminderMinutes,
    autoStopReminder,
    notificationsEnabled,
  });

  console.log("Calendar settings saved:", {
    enabled,
    selectedCalendarIds,
    syncIntervalMinutes: syncInterval,
    reminderMinutesBefore: reminderMinutes,
    autoStopReminder,
    notificationsEnabled,
  });
}

async function handleRequestCalendarPermission() {
  if (!elements.requestCalendarPermissionBtn) return;

  elements.requestCalendarPermissionBtn.textContent = "Requesting...";
  elements.requestCalendarPermissionBtn.setAttribute("disabled", "true");

  try {
    const granted = await calendarService.requestCalendarPermission();
    updateCalendarPermissionStatus(granted);

    if (granted) {
      const settings = calendarService.getSettings();
      await loadCalendars(settings.selectedCalendarIds);
      showToast("Calendar access granted! You can now select calendars to sync.", { type: "success" });
    } else {
      showToast(
        "Calendar access was denied or limited. Check Automation and Calendars permissions in system settings.",
        { type: "warning", duration: 6000 }
      );
    }
  } catch (error) {
    console.error("Failed to request calendar permission:", error);
    showToast(
      `Failed to request permission: ${error}. Check Automation and Calendars permissions in system settings.`,
      { type: "error", duration: 6000 }
    );
  } finally {
    elements.requestCalendarPermissionBtn.textContent = "🔐 Grant Permission";
    elements.requestCalendarPermissionBtn.removeAttribute("disabled");
  }
}

async function handleSyncNow() {
  if (!elements.syncNowBtn) return;

  const originalText = elements.syncNowBtn.textContent;
  elements.syncNowBtn.textContent = "Syncing...";
  elements.syncNowBtn.setAttribute("disabled", "true");

  try {
    await calendarService.syncNow();
    showToast("Calendar sync completed successfully!", { type: "success" });
  } catch (error) {
    console.error("Calendar sync failed:", error);
    showToast(`Sync failed: ${error}`, { type: "error", duration: 5000 });
  } finally {
    elements.syncNowBtn.textContent = originalText;
    elements.syncNowBtn.removeAttribute("disabled");
  }
}

async function handleTestReminders() {
  const button = elements.testRemindersBtn;
  if (!button) return;

  const originalText = button.textContent;
  button.textContent = "Testing...";
  button.setAttribute("disabled", "true");

  try {
    const result = await calendarService.runReminderTest();
    const detailMessage = result.messages.join("\n");
    if (result.success) {
      showToast(`Test notification sent successfully! ${detailMessage}`, { type: "success" });
    } else {
      showToast(`Could not send test notification. ${detailMessage}`, { type: "warning", duration: 5000 });
    }
  } catch (error) {
    console.error("Reminder test failed:", error);
    showToast(
      `Reminder test failed: ${error instanceof Error ? error.message : String(error)}`,
      { type: "error", duration: 5000 }
    );
  } finally {
    button.textContent = originalText || "🔔 Test Reminders";
    button.removeAttribute("disabled");
  }
}

function setupCalendarEventListeners() {
  elements.calendarSyncEnabled?.addEventListener("change", () => {
    const enabled = elements.calendarSyncEnabled?.checked || false;
    toggleCalendarSettingsVisibility(enabled);
  });

  elements.notificationsEnabledToggle?.addEventListener("change", handleNotificationToggleChange);

  elements.requestCalendarPermissionBtn?.addEventListener("click", handleRequestCalendarPermission);
  elements.requestNotificationPermissionBtn?.addEventListener("click", handleRequestNotificationPermission);

  elements.syncNowBtn?.addEventListener("click", handleSyncNow);
  elements.testRemindersBtn?.addEventListener("click", handleTestReminders);
}

async function handleNotificationToggleChange() {
  if (!elements.notificationsEnabledToggle) {
    return;
  }

  const enabled = elements.notificationsEnabledToggle.checked;

  if (enabled) {
    const granted = await ensureNotificationPermission({ promptUser: true });
    updateNotificationPermissionStatus(granted);

    if (!granted) {
      elements.notificationsEnabledToggle.checked = false;
      showToast(
        "Notifications are still blocked. Enable them in system notification settings to use reminders.",
        { type: "warning", duration: 5000 }
      );
    }
  } else {
    const permissionGranted = await isNotificationPermissionGranted();
    updateNotificationPermissionStatus(permissionGranted);
  }
}

async function handleRequestNotificationPermission() {
  const granted = await requestNotificationPermission();
  updateNotificationPermissionStatus(granted);

  if (!granted) {
    showToast(
      "Notifications are blocked. Allow them in system settings, then toggle notifications back on.",
      { type: "warning", duration: 5000 }
    );
  }
}

function updateCalendarPermissionStatus(granted: boolean) {
  if (!elements.calendarPermissionStatus) return;

  if (granted) {
    elements.calendarPermissionStatus.textContent = "✓ Granted";
    elements.calendarPermissionStatus.style.display = "inline";
    elements.calendarPermissionStatus.style.backgroundColor = "#10B981";
    elements.calendarPermissionStatus.style.color = "white";
  } else {
    elements.calendarPermissionStatus.textContent = "✗ Not Granted";
    elements.calendarPermissionStatus.style.display = "inline";
    elements.calendarPermissionStatus.style.backgroundColor = "#EF4444";
    elements.calendarPermissionStatus.style.color = "white";
  }
}

function updateNotificationPermissionStatus(granted: boolean) {
  if (!elements.notificationPermissionStatus) return;

  if (granted) {
    elements.notificationPermissionStatus.textContent = "✓ Allowed";
    elements.notificationPermissionStatus.style.display = "inline";
    elements.notificationPermissionStatus.style.backgroundColor = "#10B981";
    elements.notificationPermissionStatus.style.color = "white";
  } else {
    elements.notificationPermissionStatus.textContent = "✗ Not Allowed";
    elements.notificationPermissionStatus.style.display = "inline";
    elements.notificationPermissionStatus.style.backgroundColor = "#EF4444";
    elements.notificationPermissionStatus.style.color = "white";
  }
}

async function loadCalendars(selectedIds: string[]) {
  if (!elements.calendarList) return;

  elements.calendarList.innerHTML = '<p class="loading-text">Loading calendars...</p>';

  try {
    const calendars = await calendarService.listCalendars();

    if (calendars.length === 0) {
      elements.calendarList.innerHTML = '<p class="empty-text">No calendars found</p>';
      return;
    }

    elements.calendarList.innerHTML = "";
    calendars.forEach((calendar) => {
      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "8px";
      label.style.marginBottom = "8px";
      label.style.cursor = "pointer";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      const isSelected = selectedIds.includes(calendar.id) || selectedIds.includes(calendar.title);
      checkbox.value = calendar.id;
      checkbox.checked = isSelected;
      checkbox.dataset.calendarId = calendar.id;

      const colorDot = document.createElement("span");
      colorDot.style.width = "12px";
      colorDot.style.height = "12px";
      colorDot.style.borderRadius = "50%";
      colorDot.style.backgroundColor = calendar.color;
      colorDot.style.display = "inline-block";

      const nameSpan = document.createElement("span");
      nameSpan.textContent = `${calendar.title} (${calendar.source_title})`;

      label.appendChild(checkbox);
      label.appendChild(colorDot);
      label.appendChild(nameSpan);
      elements.calendarList!.appendChild(label);
    });
  } catch (error) {
    console.error("Failed to load calendars:", error);
    if (elements.calendarList) {
      elements.calendarList.innerHTML = '<p class="error-text">Failed to load calendars</p>';
    }
  }
}

function toggleCalendarSettingsVisibility(enabled: boolean) {
  if (elements.calendarSettingsGroup) {
    elements.calendarSettingsGroup.style.display = enabled ? "block" : "none";
  }
}

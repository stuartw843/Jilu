/**
 * Date utility functions for formatting and manipulation
 */

/**
 * Formats a date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the start of the day (00:00:00.000) for a given date
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Returns the start of the week (Monday) for a given date
 */
export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Adjust when Sunday (0)
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Checks if a date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Checks if two dates are the same day
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

/**
 * Checks if a date is before today (overdue)
 */
export function isOverdue(date: Date): boolean {
  const today = startOfDay(new Date());
  const checkDate = startOfDay(date);
  return checkDate < today;
}

/**
 * Formats a time range as "HH:MM - HH:MM"
 */
export function formatTimeRange(start: Date, end: Date): string {
  const formatTime = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };
  return `${formatTime(start)} - ${formatTime(end)}`;
}

/**
 * Formats a date as a day label (e.g., "Mon 23 Nov", "Today", "Tomorrow")
 */
export function formatDayLabel(date: Date): string {
  const today = startOfDay(new Date());
  const checkDate = startOfDay(date);
  const diffTime = checkDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

/**
 * Formats a week range as "Mon 18 Nov - Sun 24 Nov"
 */
export function formatWeekRangeLabel(start: Date, end: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const startStr = `${days[start.getDay()]} ${start.getDate()} ${months[start.getMonth()]}`;
  const endStr = `${days[end.getDay()]} ${end.getDate()} ${months[end.getMonth()]}`;
  
  return `${startStr} - ${endStr}`;
}

/**
 * Gets the week start (Monday) for a given date
 */
export function getWeekStart(date: Date): Date {
  return startOfWeek(date);
}

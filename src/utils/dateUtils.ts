import { format, addDays, subDays, isBefore, parseISO } from 'date-fns';

export const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTH_ABBR = MONTHS.map((m) => m.slice(0, 3));

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Formats an ISO date (YYYY-MM-DD) for display, e.g. "12 September 2026". */
export function formatISODateLong(iso: string): string {
  const d = parseISO(iso);
  return format(d, 'd MMMM yyyy');
}

export function formatISODateShort(iso: string): string {
  const d = parseISO(iso);
  return format(d, 'MMM d');
}

export function formatTime12h(time: string | null): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Finds a "Month Day[, Year]" style date in free text (e.g. "September 12",
 * "Sep 18th", "12 September 2026") and returns it as an ISO date, resolving
 * a missing year to the next future occurrence. Returns null if nothing
 * matches — never guesses a date that wasn't actually written.
 */
export function findNaturalDate(text: string, referenceDate: Date = new Date()): string | null {
  const lower = text.toLowerCase();
  const monthPattern = [...MONTHS, ...MONTH_ABBR].join('|');

  // "September 12", "Sep 12th", "September 12, 2026"
  const monthFirst = new RegExp(
    `\\b(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
    'i'
  );
  // "12 September", "12th September 2026"
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})\\.?(?:,?\\s*(\\d{4}))?\\b`,
    'i'
  );

  let monthName: string | undefined;
  let day: number | undefined;
  let year: number | undefined;

  const m1 = lower.match(monthFirst);
  const m2 = lower.match(dayFirst);

  if (m1) {
    monthName = m1[1];
    day = parseInt(m1[2], 10);
    year = m1[3] ? parseInt(m1[3], 10) : undefined;
  } else if (m2) {
    day = parseInt(m2[1], 10);
    monthName = m2[2];
    year = m2[3] ? parseInt(m2[3], 10) : undefined;
  } else {
    return null;
  }

  const monthIndex = MONTHS.findIndex((m) => monthName!.startsWith(m.slice(0, 3)));
  if (monthIndex === -1 || !day || day < 1 || day > 31) return null;

  const refYear = referenceDate.getFullYear();
  let candidate = new Date(year ?? refYear, monthIndex, day);

  // No year was written — assume the next future occurrence rather than a
  // date that already passed, since reminders about the past are useless.
  if (!year && isBefore(candidate, referenceDate)) {
    candidate = new Date(refYear + 1, monthIndex, day);
  }

  return toISODate(candidate);
}

/** Finds a time like "4 PM", "4:30pm", or "16:00" and returns 24h "HH:mm". */
export function findTime(text: string): string | null {
  const twelveHour = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (twelveHour) {
    let hour = parseInt(twelveHour[1], 10) % 12;
    const minute = twelveHour[2] ? parseInt(twelveHour[2], 10) : 0;
    if (/pm/i.test(twelveHour[3])) hour += 12;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  const twentyFourHour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHour) {
    return `${twentyFourHour[1].padStart(2, '0')}:${twentyFourHour[2]}`;
  }
  return null;
}

export function suggestReminderForDueDate(dueISO: string): { date: string; time: string } {
  const due = parseISO(dueISO);
  const suggested = subDays(due, 2);
  const floor = new Date();
  const date = isBefore(suggested, floor) ? toISODate(due) : toISODate(suggested);
  return { date, time: '09:00' };
}

export function suggestReminderForEvent(
  eventISO: string,
  eventTime: string | null
): { date: string; time: string } {
  if (eventTime) {
    const [h, m] = eventTime.split(':').map(Number);
    let hour = h - 1;
    let date = eventISO;
    if (hour < 0) {
      hour = 24 + hour;
      date = toISODate(subDays(parseISO(eventISO), 1));
    }
    return { date, time: `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  }
  return { date: toISODate(subDays(parseISO(eventISO), 1)), time: '18:00' };
}

export function isOverdue(dueISO: string): boolean {
  return isBefore(parseISO(dueISO), new Date(new Date().toDateString()));
}

export { addDays, subDays };

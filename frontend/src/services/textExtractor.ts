import type { ExtractedTaskData, SourceType, TaskCategory } from '../types';
import {
  findAnyDate,
  findTime,
  suggestReminderForDueDate,
  suggestReminderForEvent,
  toISODate,
} from '../utils/dateUtils';

// ---------------------------------------------------------------------------
// This is LifeOS's Phase 1 "local" extraction engine: a genuine rule-based
// parser (not a canned/hard-coded response — output depends entirely on the
// input text). It exists so the full Capture → Understand → Confirm → Remind
// loop still works end-to-end even with no network or server available.
//
// Phase 1.1: this is now the FALLBACK provider — LocalRuleBasedProvider is
// used automatically when the server extraction API is unreachable or
// unconfigured (see aiService.ts). It is intentionally isolated behind the
// AIProvider interface so neither the UI nor the stores know which one ran.
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: [TaskCategory, RegExp][] = [
  ['bills', /\b(electricity|water bill|gas bill|broadband|wifi bill|recharge|credit card bill|invoice|utility|subscription)\b/i],
  ['appointments', /\b(appointment|doctor|dentist|clinic|consultation|meeting with)\b/i],
  ['travel', /\b(flight|train|pnr|boarding|ticket|itinerary|departure|hotel booking)\b/i],
  ['study', /\b(exam|admit card|application|syllabus|ssc|upsc|bpsc|railway exam|banking exam|registration deadline|result)\b/i],
  ['work', /\b(deadline|project|report|client|submit|standup|review meeting)\b/i],
  ['documents', /\b(renewal|policy|passport|license|licence|expiry|expires|kyc|document)\b/i],
  ['personal', /\b(birthday|anniversary|dinner|party|gift)\b/i],
];

const DUE_KEYWORDS = /\b(due|deadline|pay by|last date|payable by|expires on|expires|renew by)\b/i;
const EVENT_KEYWORDS = /\b(appointment|scheduled|meeting|departure|boarding|starts at|on\s)\b/i;
const NO_ACTION_KEYWORDS = /\b(happy birthday|congratulations|thank you|thanks|good morning|good night|lol|haha)\b/i;

function detectCategory(text: string): TaskCategory {
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(text)) return category;
  }
  return 'other';
}

function detectAmount(text: string): { amount: number | null; currency: string | null } {
  const rupee = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (rupee) return { amount: parseFloat(rupee[1].replace(/,/g, '')), currency: 'INR' };

  const dollar = text.match(/(?:\$|usd)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (dollar) return { amount: parseFloat(dollar[1].replace(/,/g, '')), currency: 'USD' };

  return { amount: null, currency: null };
}

function titleFromText(text: string, category: TaskCategory): string {
  const firstLine = text.split(/[\n.!?]/)[0].trim();
  if (firstLine.length > 0 && firstLine.length <= 60) return firstLine;
  const fallback: Record<TaskCategory, string> = {
    bills: 'Bill Payment',
    appointments: 'Appointment',
    travel: 'Travel',
    study: 'Exam / Application',
    work: 'Work Item',
    documents: 'Document Renewal',
    personal: 'Reminder',
    other: 'Reminder',
  };
  return fallback[category];
}

/**
 * @param referenceDate "Today" as far as extraction is concerned — always
 * passed explicitly (never read from `new Date()` deep inside) so relative
 * phrases like "tomorrow" or "in 3 days" resolve correctly and so the
 * function is deterministic in tests.
 */
export function extractFromText(
  text: string,
  sourceType: SourceType,
  referenceDate: Date = new Date()
): ExtractedTaskData {
  const trimmed = text.trim();
  const todayISOValue = toISODate(referenceDate);

  const dateFound = findAnyDate(trimmed, referenceDate);
  const timeFound = findTime(trimmed);
  const { amount, currency } = detectAmount(trimmed);
  const category = detectCategory(trimmed);

  const hasDueSignal = DUE_KEYWORDS.test(trimmed) || category === 'bills' || category === 'documents';
  const hasEventSignal = EVENT_KEYWORDS.test(trimmed) || category === 'appointments' || category === 'travel';

  let due_date: string | null = null;
  let event_date: string | null = null;
  let event_time: string | null = null;

  if (dateFound) {
    if (hasEventSignal && !hasDueSignal) {
      event_date = dateFound;
      event_time = timeFound;
    } else if (hasDueSignal) {
      due_date = dateFound;
    } else if (timeFound) {
      // A specific time with no due-language reads as an event, not a deadline.
      event_date = dateFound;
      event_time = timeFound;
    } else {
      due_date = dateFound;
    }
  }

  const noActionable = NO_ACTION_KEYWORDS.test(trimmed) || (!dateFound && !amount);

  if (noActionable) {
    return {
      has_actionable_information: false,
      title: null,
      description: null,
      category: null,
      amount: null,
      currency: null,
      due_date: null,
      event_date: null,
      event_time: null,
      reminder_date: null,
      reminder_time: null,
      priority: null,
      recurring: false,
      confidence: dateFound || amount ? 0.4 : 0.85,
      source_type: sourceType,
    };
  }

  let reminder_date: string | null = null;
  let reminder_time: string | null = null;
  if (due_date) {
    const r = suggestReminderForDueDate(due_date, referenceDate);
    reminder_date = r.date;
    reminder_time = r.time;
  } else if (event_date) {
    const r = suggestReminderForEvent(event_date, event_time);
    reminder_date = r.date;
    reminder_time = r.time;
  }

  const targetDate = due_date ?? event_date ?? todayISOValue;
  const daysAway = Math.round(
    (new Date(`${targetDate}T00:00:00`).getTime() - new Date(`${todayISOValue}T00:00:00`).getTime()) / 86_400_000
  );
  const priority = amount && amount > 5000 ? 'high' : daysAway <= 2 ? 'high' : daysAway <= 7 ? 'medium' : 'low';

  let confidence = 0.55;
  if (dateFound) confidence += 0.2;
  if (amount != null) confidence += 0.1;
  if (category !== 'other') confidence += 0.1;
  confidence = Math.min(confidence, 0.97);

  return {
    has_actionable_information: true,
    title: titleFromText(trimmed, category),
    description: trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed,
    category,
    amount,
    currency,
    due_date,
    event_date,
    event_time,
    reminder_date,
    reminder_time,
    priority,
    recurring: false,
    confidence: Math.round(confidence * 100) / 100,
    source_type: sourceType,
  };
}

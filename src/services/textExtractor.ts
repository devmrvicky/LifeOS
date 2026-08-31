import type { ExtractedTaskData, SourceType, TaskCategory } from '../types';
import {
  findNaturalDate,
  findTime,
  suggestReminderForDueDate,
  suggestReminderForEvent,
  todayISO,
} from '../utils/dateUtils';

// ---------------------------------------------------------------------------
// This is LifeOS's Phase 1 "local" extraction engine: a genuine rule-based
// parser (not a canned/hard-coded response — output depends entirely on the
// input text). It exists so the full Capture → Understand → Confirm → Remind
// loop works end-to-end with no backend or API key.
//
// It is intentionally isolated behind the AIProvider interface in
// aiService.ts so it can be swapped for a real LLM-backed provider later
// without touching any UI or store code. See README.md "Enabling a
// production AI provider" for exactly what that swap requires.
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

const DUE_KEYWORDS = /\b(due|deadline|pay by|last date|payable by|expires on|renew by)\b/i;
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

export function extractFromText(text: string, sourceType: SourceType): ExtractedTaskData {
  const trimmed = text.trim();

  const dateFound = findNaturalDate(trimmed);
  const timeFound = findTime(trimmed);
  const { amount, currency } = detectAmount(trimmed);
  const category = detectCategory(trimmed);

  const hasDueSignal = DUE_KEYWORDS.test(trimmed) || category === 'bills' || category === 'documents';
  const hasEventSignal = EVENT_KEYWORDS.test(trimmed) || category === 'appointments' || category === 'travel';

  let due_date: string | null = null;
  let event_date: string | null = null;

  if (dateFound) {
    if (hasEventSignal && !hasDueSignal) {
      event_date = dateFound;
    } else if (hasDueSignal) {
      due_date = dateFound;
    } else if (timeFound) {
      // A specific time with no due-language reads as an event, not a deadline.
      event_date = dateFound;
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
    const r = suggestReminderForDueDate(due_date);
    reminder_date = r.date;
    reminder_time = r.time;
  } else if (event_date) {
    const r = suggestReminderForEvent(event_date, timeFound);
    reminder_date = r.date;
    reminder_time = r.time;
  }

  const targetDate = due_date ?? event_date ?? todayISO();
  const daysAway = Math.round(
    (new Date(targetDate).getTime() - new Date(todayISO()).getTime()) / 86_400_000
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
    reminder_date,
    reminder_time: event_date ? timeFound ?? reminder_time : reminder_time,
    priority,
    recurring: false,
    confidence: Math.round(confidence * 100) / 100,
    source_type: sourceType,
  };
}

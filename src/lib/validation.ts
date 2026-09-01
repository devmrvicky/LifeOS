import { z } from 'zod';
import type { ExtractedTaskData } from '../types';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .nullable();

const isoTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm')
  .nullable();

export const extractedTaskSchema = z.object({
  has_actionable_information: z.boolean(),
  title: z.string().min(1).max(120).nullable(),
  description: z.string().max(500).nullable(),
  category: z
    .enum(['bills', 'appointments', 'travel', 'study', 'work', 'documents', 'personal', 'other'])
    .nullable(),
  amount: z.number().nonnegative().nullable(),
  currency: z.string().max(6).nullable(),
  due_date: isoDate,
  event_date: isoDate,
  event_time: isoTime,
  reminder_date: isoDate,
  reminder_time: isoTime,
  priority: z.enum(['low', 'medium', 'high']).nullable(),
  recurring: z.boolean(),
  confidence: z.number().min(0).max(1),
  source_type: z.enum(['image', 'pdf', 'text']),
});

export interface ValidationResult {
  ok: boolean;
  data: ExtractedTaskData | null;
  errors: string[];
}

/**
 * Validates raw AI output before it is ever allowed to touch the UI or the
 * database. Malformed JSON, missing fields, or out-of-range values are
 * caught here rather than crashing the app or silently creating a bad task.
 */
export function validateExtraction(raw: unknown): ValidationResult {
  const result = extractedTaskSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      data: null,
      errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  const data = result.data as ExtractedTaskData;

  // Consistency checks the schema alone can't express.
  const errors: string[] = [];
  if (data.has_actionable_information && !data.title) {
    errors.push('actionable extraction is missing a title');
  }
  if (data.amount != null && !data.currency) {
    errors.push('amount present without a currency');
  }

  if (errors.length > 0) {
    return { ok: false, data: null, errors };
  }

  return { ok: true, data, errors: [] };
}

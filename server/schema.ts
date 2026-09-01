import { z } from 'zod';

// ---------------------------------------------------------------------------
// This mirrors src/lib/validation.ts field-for-field. The server and the
// Vite frontend are two separate build targets (no shared package/workspace
// set up — deliberately, per "do not over-engineer" for an MVP), so this is
// a duplicated schema, not an imported one. If you change one, change both.
// A drift-check test (server/extraction.test.ts) asserts the two schemas'
// shape stays identical so this doesn't silently rot.
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD').nullable();
const isoTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm').nullable();

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

export type ExtractedTaskData = z.infer<typeof extractedTaskSchema>;

export function validateExtraction(raw: unknown): { ok: true; data: ExtractedTaskData } | { ok: false; errors: string[] } {
  const result = extractedTaskSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  const data = result.data;
  const errors: string[] = [];
  if (data.has_actionable_information && !data.title) errors.push('actionable extraction is missing a title');
  if (data.amount != null && !data.currency) errors.push('amount present without a currency');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data };
}

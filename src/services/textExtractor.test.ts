import { describe, it, expect } from 'vitest';
import { extractFromText } from './textExtractor';
import { validateExtraction } from '../lib/validation';

describe('extractFromText — scenario 1: bill with amount and due date', () => {
  it('extracts amount, currency, and due date', () => {
    const result = extractFromText('Electricity bill ₹1,850 due September 12.', 'text');
    expect(result.has_actionable_information).toBe(true);
    expect(result.amount).toBe(1850);
    expect(result.currency).toBe('INR');
    expect(result.due_date).toMatch(/-09-12$/);
    expect(result.category).toBe('bills');
  });
});

describe('extractFromText — scenario 2: appointment with event date and time', () => {
  it('extracts an event_date (not due_date) plus time', () => {
    const result = extractFromText('Appointment on September 18 at 4 PM.', 'text');
    expect(result.has_actionable_information).toBe(true);
    expect(result.event_date).toMatch(/-09-18$/);
    expect(result.due_date).toBeNull();
    expect(result.reminder_time).toBe('16:00');
  });
});

describe('extractFromText — scenario 3: no actionable information', () => {
  it('does not fabricate a task from a plain greeting', () => {
    const result = extractFromText('Happy Birthday Vikash!', 'text');
    expect(result.has_actionable_information).toBe(false);
    expect(result.title).toBeNull();
    expect(result.due_date).toBeNull();
  });
});

describe('extractFromText — scenario 4: incomplete information', () => {
  it('leaves fields null instead of guessing', () => {
    const result = extractFromText('Renew your gym membership soon.', 'text');
    // No explicit date or amount in the text -> should not be forced into actionable
    expect(result.amount).toBeNull();
    expect(result.due_date).toBeNull();
    expect(result.event_date).toBeNull();
  });
});

describe('validateExtraction — scenario 6: malformed AI output', () => {
  it('rejects an out-of-range confidence value instead of crashing', () => {
    const bad = { has_actionable_information: true, title: 'x', description: null, category: 'bills', amount: null, currency: null, due_date: null, event_date: null, reminder_date: null, reminder_time: null, priority: 'high', recurring: false, confidence: 4.2, source_type: 'text' };
    const result = validateExtraction(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects an actionable item missing a title', () => {
    const bad = { has_actionable_information: true, title: null, description: null, category: 'bills', amount: null, currency: null, due_date: '2026-09-12', event_date: null, reminder_date: null, reminder_time: null, priority: 'high', recurring: false, confidence: 0.9, source_type: 'text' };
    const result = validateExtraction(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects a completely malformed payload without throwing', () => {
    const result = validateExtraction('not even an object');
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
  });

  it('accepts a well-formed payload', () => {
    const good = extractFromText('Electricity bill ₹1,850 due September 12.', 'text');
    const result = validateExtraction(good);
    expect(result.ok).toBe(true);
    expect(result.data).not.toBeNull();
  });
});

describe('extractFromText — reminder suggestion', () => {
  it('suggests a reminder before a due date, not after it', () => {
    const result = extractFromText('Credit card bill payable by December 5.', 'text');
    expect(result.due_date).not.toBeNull();
    expect(result.reminder_date).not.toBeNull();
    expect(result.reminder_date! <= result.due_date!).toBe(true);
  });
});

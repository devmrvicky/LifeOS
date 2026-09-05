import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image as ImageIcon, FileText, Type, Loader2, Info } from 'lucide-react';
import { useCaptureStore } from '../store/captureStore';
import { useTaskStore, type NewTaskInput } from '../store/taskStore';
import { ConfirmationCard, type ConfirmationFormValue } from '../components/ConfirmationCard';
import { ErrorState } from '../components/ErrorState';
import { TaskFieldsForm, BLANK_TASK_FORM, type TaskFormValue } from '../components/TaskFieldsForm';
import { analytics } from '../services/analyticsService';

type Mode = 'choose' | 'text-input' | 'manual';

export default function CapturePage() {
  const navigate = useNavigate();
  const { status, currentCapture, error, usedFallback, usedOcrFallback, runCapture, reset } = useCaptureStore();
  const createTask = useTaskStore((s) => s.createTask);

  const [mode, setMode] = useState<Mode>('choose');
  const [pastedText, setPastedText] = useState('');
  const [manualValue, setManualValue] = useState<TaskFormValue>(BLANK_TASK_FORM);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  function handleImagePick(file: File | undefined) {
    if (!file) return;
    setMode('choose');
    runCapture({ sourceType: 'image', file });
  }

  function handlePdfPick(file: File | undefined) {
    if (!file) return;
    setMode('choose');
    runCapture({ sourceType: 'pdf', file });
  }

  function submitText() {
    if (!pastedText.trim()) return;
    runCapture({ sourceType: 'text', text: pastedText });
  }

  async function handleConfirm(value: ConfirmationFormValue) {
    analytics.track('capture_confirmed', { capture_id: currentCapture?.id ?? null });
    const task = await create(value, currentCapture?.id ?? null, currentCapture?.source_type ?? null, currentCapture?.extracted?.confidence ?? null);
    reset();
    navigate(`/tasks/${task.id}`);
  }

  async function handleManualSubmit() {
    if (!manualValue.title.trim()) return;
    const task = await create(manualValue, null, null, null);
    setManualValue(BLANK_TASK_FORM);
    setMode('choose');
    navigate(`/tasks/${task.id}`);
  }

  async function create(
    v: TaskFormValue,
    captureId: string | null,
    sourceType: NewTaskInput['source_type'],
    confidence: number | null
  ) {
    return createTask({
      title: v.title.trim() || 'Untitled reminder',
      description: v.description.trim() || null,
      category: v.category,
      amount: v.amount ? Number(v.amount) : null,
      currency: v.amount ? v.currency || 'INR' : null,
      due_date: v.due_date || null,
      event_date: v.event_date || null,
      event_time: v.event_time || null,
      reminder_date: v.reminder_date || null,
      reminder_time: v.reminder_time || null,
      priority: v.priority,
      recurring: false,
      capture_id: captureId,
      confidence,
      source_type: sourceType,
    });
  }

  // --- Processing state -----------------------------------------------
  if (status === 'processing') {
    return (
      <Screen title="Capture">
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <Loader2 className="animate-spin" size={28} color="var(--color-accent)" />
          <p className="text-sm text-ink-soft">LifeOS is understanding this…</p>
        </div>
      </Screen>
    );
  }

  // --- Failed state ------------------------------------------------------
  if (status === 'failed' && error) {
    return (
      <Screen title="Capture">
        <ErrorState
          error={error}
          onRetry={() => reset()}
          onAddManually={() => {
            reset();
            setMode('manual');
          }}
        />
      </Screen>
    );
  }

  // --- No actionable information -----------------------------------------
  if (status === 'no_action') {
    return (
      <Screen title="Capture">
        <div className="flex flex-col items-center gap-4 rounded-2xl border px-6 py-10 text-center" style={{ borderColor: 'var(--color-line)' }}>
          <Info size={26} color="var(--color-ink-soft)" strokeWidth={1.8} />
          <p className="text-sm text-ink">I couldn't find a clear action or deadline in that.</p>
          <div className="flex gap-2">
            <button onClick={() => reset()} className="rounded-full border px-4 py-2 text-sm font-medium text-ink" style={{ borderColor: 'var(--color-line)' }}>
              Try something else
            </button>
            <button
              onClick={() => {
                reset();
                setMode('manual');
              }}
              className="rounded-full px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              Create manually
            </button>
          </div>
        </div>
      </Screen>
    );
  }

  // --- Confirmation --------------------------------------------------------
  if (status === 'success' && currentCapture?.extracted) {
    return (
      <Screen title="Review">
        {usedFallback && (
          <p className="mb-3 rounded-lg px-3 py-2 text-xs text-ink-soft" style={{ backgroundColor: 'var(--color-accent-soft)' }}>
            The AI service wasn't reachable, so this was understood on-device instead — worth a closer look.
          </p>
        )}
        {!usedFallback && usedOcrFallback && (
          <p className="mb-3 rounded-lg px-3 py-2 text-xs text-ink-soft" style={{ backgroundColor: 'var(--color-accent-soft)' }}>
            This was read using OCR rather than a direct read — worth a closer look before you confirm.
          </p>
        )}
        <ConfirmationCard
          extraction={currentCapture.extracted}
          confidence={currentCapture.extracted.confidence}
          onConfirm={handleConfirm}
          onDiscard={() => reset()}
        />
      </Screen>
    );
  }

  // --- Manual entry --------------------------------------------------------
  if (mode === 'manual') {
    return (
      <Screen title="Add manually" onBack={() => setMode('choose')}>
        <TaskFieldsForm value={manualValue} onChange={setManualValue} titleAutoFocus />
        <button
          onClick={handleManualSubmit}
          disabled={!manualValue.title.trim()}
          className="mt-4 w-full rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          Create Reminder
        </button>
      </Screen>
    );
  }

  // --- Paste text ------------------------------------------------------
  if (mode === 'text-input') {
    return (
      <Screen title="Paste text" onBack={() => setMode('choose')}>
        <textarea
          autoFocus
          rows={8}
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Paste a message, an email, a bill — anything with a date or deadline in it."
          className="w-full rounded-xl border bg-surface p-4 text-sm text-ink outline-none focus:border-accent"
          style={{ borderColor: 'var(--color-line)' }}
        />
        <button
          onClick={submitText}
          disabled={!pastedText.trim()}
          className="mt-4 w-full rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          Understand this
        </button>
      </Screen>
    );
  }

  // --- Choose method (default) ---------------------------------------------
  return (
    <Screen title="Capture">
      <p className="mb-6 text-sm text-ink-soft">Got something you don't want to forget?</p>
      <div className="space-y-3">
        <CaptureOption
          icon={<ImageIcon size={20} />}
          title="Upload Image"
          subtitle="A screenshot, bill, or ticket"
          onClick={() => imageInputRef.current?.click()}
        />
        <CaptureOption
          icon={<FileText size={20} />}
          title="Upload PDF"
          subtitle="A statement, notice, or itinerary"
          onClick={() => pdfInputRef.current?.click()}
        />
        <CaptureOption
          icon={<Type size={20} />}
          title="Paste Text"
          subtitle="A message, email, or note"
          onClick={() => setMode('text-input')}
        />
      </div>
      <button onClick={() => setMode('manual')} className="mt-6 w-full text-center text-sm font-medium text-accent">
        Add manually instead
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic"
        className="hidden"
        onChange={(e) => handleImagePick(e.target.files?.[0])}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handlePdfPick(e.target.files?.[0])}
      />
    </Screen>
  );
}

function CaptureOption({ icon, title, subtitle, onClick }: { icon: ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl border bg-surface px-4 py-4 text-left"
      style={{ borderColor: 'var(--color-line)' }}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-soft">{subtitle}</span>
      </span>
    </button>
  );
}

function Screen({ title, onBack, children }: { title: string; onBack?: () => void; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-5 pb-28 pt-6">
      <div className="mb-5 flex items-center gap-2">
        {onBack && (
          <button onClick={onBack} className="text-sm text-ink-soft">
            ← Back
          </button>
        )}
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
      </div>
      {children}
    </div>
  );
}

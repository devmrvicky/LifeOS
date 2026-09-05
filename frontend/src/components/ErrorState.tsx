import { AlertCircle } from 'lucide-react';
import type { AppError } from '../types';

interface ErrorStateProps {
  error: AppError;
  onRetry?: () => void;
  onAddManually?: () => void;
}

export function ErrorState({ error, onRetry, onAddManually }: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl border px-6 py-10 text-center"
      style={{ borderColor: 'var(--color-urgent-soft)', backgroundColor: 'var(--color-urgent-soft)' }}
    >
      <AlertCircle size={28} color="var(--color-urgent)" strokeWidth={1.8} />
      <p className="max-w-xs text-sm leading-relaxed text-ink">{error.message}</p>
      <div className="flex gap-2 pt-1">
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded-full border px-4 py-2 text-sm font-medium text-ink"
            style={{ borderColor: 'var(--color-line)' }}
          >
            Try again
          </button>
        )}
        {onAddManually && (
          <button
            onClick={onAddManually}
            className="rounded-full px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            Add manually
          </button>
        )}
      </div>
    </div>
  );
}

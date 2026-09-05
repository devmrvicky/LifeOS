import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  headline: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState({ icon, headline, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-ink-soft">{icon}</div>}
      <h2 className="text-lg font-medium text-ink">{headline}</h2>
      <p className="max-w-xs text-sm leading-relaxed text-ink-soft">{body}</p>
      {action}
    </div>
  );
}

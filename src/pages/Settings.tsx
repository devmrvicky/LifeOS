import { useState, type ReactNode } from 'react';
import { Bell, Database, Trash2, Info } from 'lucide-react';
import { useTaskStore } from '../store/taskStore';
import { loadDemoData, clearDemoData } from '../data/seedData';
import { clearAllData } from '../lib/db';
import { notifier } from '../services/notificationService';
import { aiService } from '../services/aiService';

export default function SettingsPage() {
  const load = useTaskStore((s) => s.load);
  const [notifStatus, setNotifStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [busy, setBusy] = useState(false);

  async function handleLoadDemo() {
    setBusy(true);
    await loadDemoData();
    await load();
    setBusy(false);
  }

  async function handleClearDemo() {
    setBusy(true);
    await clearDemoData();
    await load();
    setBusy(false);
  }

  async function handleResetAll() {
    if (!confirm('Delete all captures and tasks? This cannot be undone.')) return;
    setBusy(true);
    await clearAllData();
    await load();
    setBusy(false);
  }

  async function handleEnableNotifications() {
    const granted = await notifier.requestPermission();
    setNotifStatus(granted ? 'granted' : 'denied');
  }

  return (
    <div className="mx-auto max-w-md px-5 pb-28 pt-8">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Settings</h1>

      <SettingsGroup title="Notifications">
        <SettingsRow
          icon={<Bell size={18} />}
          title="Reminder notifications"
          subtitle={
            notifStatus === 'granted'
              ? 'Enabled while LifeOS is open'
              : 'Ask your browser for permission to show reminders'
          }
          action={
            notifStatus !== 'granted' && (
              <button onClick={handleEnableNotifications} className="text-sm font-medium text-accent">
                Enable
              </button>
            )
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Demo data">
        <SettingsRow
          icon={<Database size={18} />}
          title="Load demo data"
          subtitle="Adds 5 sample tasks so you can try LifeOS immediately"
          action={
            <button disabled={busy} onClick={handleLoadDemo} className="text-sm font-medium text-accent disabled:opacity-40">
              Load
            </button>
          }
        />
        <SettingsRow
          icon={<Trash2 size={18} />}
          title="Remove demo data"
          subtitle="Removes only the sample tasks, keeps your real ones"
          action={
            <button disabled={busy} onClick={handleClearDemo} className="text-sm font-medium text-ink-soft disabled:opacity-40">
              Remove
            </button>
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Data">
        <SettingsRow
          icon={<Trash2 size={18} />}
          title="Reset everything"
          subtitle="Deletes all captures and tasks on this device"
          action={
            <button disabled={busy} onClick={handleResetAll} className="text-sm font-medium disabled:opacity-40" style={{ color: 'var(--color-urgent)' }}>
              Reset
            </button>
          }
        />
      </SettingsGroup>

      <SettingsGroup title="About">
        <div className="flex items-start gap-3 px-4 py-3 text-sm">
          <Info size={18} className="mt-0.5 shrink-0 text-ink-soft" />
          <p className="text-ink-soft">
            LifeOS is understanding captures on-device right now (provider: <span className="font-medium text-ink">{aiService.providerName}</span>),
            with no account or server required. Everything is stored only on this device unless you sign in later.
          </p>
        </div>
      </SettingsGroup>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-medium text-ink-soft">{title}</h2>
      <div className="divide-y rounded-2xl border bg-surface" style={{ borderColor: 'var(--color-line)' }}>
        {children}
      </div>
    </section>
  );
}

function SettingsRow({ icon, title, subtitle, action }: { icon: ReactNode; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-ink-soft">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-soft">{subtitle}</span>
      </span>
      {action}
    </div>
  );
}

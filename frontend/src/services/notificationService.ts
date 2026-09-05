/**
 * Reminder notifications, abstracted behind one interface.
 *
 * Phase 1 reality: this environment cannot register a service worker with a
 * push server or send platform push notifications, so `BrowserNotifier`
 * only does what a browser tab genuinely can — an in-page Notification API
 * call, and only while the app is open. It never claims to deliver a
 * background push it can't actually send.
 *
 * To enable real production notifications:
 *  1. Register a service worker and subscribe it to the Push API
 *     (or use FCM/APNs for a native/PWA wrapper).
 *  2. Store the push subscription against the user record server-side.
 *  3. Run a scheduler (cron / queue) that reads `reminder_events` where
 *     `scheduled_for <= now()` and `status = 'scheduled'`, and sends the
 *     push through that stored subscription.
 *  4. Mark the `reminder_events` row `fired` once delivered.
 * None of that backend exists yet — this service is the seam where it plugs in.
 */
export interface Notifier {
  readonly capability: 'in-page' | 'push';
  requestPermission(): Promise<boolean>;
  notify(title: string, body: string): Promise<void>;
}

export class BrowserNotifier implements Notifier {
  readonly capability = 'in-page';

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  async notify(title: string, body: string): Promise<void> {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // eslint-disable-next-line no-new
    new Notification(title, { body });
  }
}

export const notifier: Notifier = new BrowserNotifier();

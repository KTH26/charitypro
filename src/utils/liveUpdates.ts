/**
 * Live updates — makes CharityPro behave like a shared Google Sheet.
 *
 * How it works (in plain words):
 *   - The whole app keeps ONE tiny "has anything changed?" check running
 *     against /api/v3/live every 2 seconds.
 *   - The server answers with a version number that goes up every time
 *     anyone saves anything.
 *   - When the number changes, every page that is open refreshes its data
 *     quietly in the background — no reload, no flicker.
 *   - When the browser tab is hidden, checking pauses (saves battery and
 *     server cost). As soon as you come back to the tab, it checks right away.
 *   - As a safety net, open pages also refresh once every 30 seconds even if
 *     no change was detected.
 *
 * Pages use it with one line:
 *   useEffect(() => startLiveRefresh(() => void load(true)), [load]);
 */

type Listener = () => void;
export type LiveStatus = 'live' | 'connecting' | 'offline';

const CHECK_EVERY_MS = 2000;
const SAFETY_REFRESH_MS = 30000;

const listeners = new Set<Listener>();
const statusListeners = new Set<(status: LiveStatus) => void>();

let lastVersion: string | null = null;
let timer: number | null = null;
let checking = false;
let status: LiveStatus = 'connecting';
let lastNotifiedAt = 0;
let failures = 0;

const setStatus = (next: LiveStatus) => {
  if (next === status) return;
  status = next;
  statusListeners.forEach(fn => { try { fn(status); } catch { /* ignore */ } });
};

const notifyAll = () => {
  lastNotifiedAt = Date.now();
  listeners.forEach(fn => { try { fn(); } catch (error) { console.error('Live refresh failed', error); } });
};

const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

const check = async () => {
  if (checking || !isVisible() || listeners.size === 0) return;
  checking = true;
  try {
    const response = await fetch('/api/v3/live', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { success?: boolean; version?: string };
    if (!data.success || typeof data.version !== 'string') throw new Error('Bad live response');
    failures = 0;
    setStatus('live');
    if (lastVersion !== null && data.version !== lastVersion) {
      lastVersion = data.version;
      notifyAll();
      return;
    }
    lastVersion = data.version;
    if (Date.now() - lastNotifiedAt >= SAFETY_REFRESH_MS) notifyAll();
  } catch {
    failures += 1;
    if (failures >= 3) setStatus('offline');
  } finally {
    checking = false;
  }
};

const onVisibility = () => { if (isVisible()) void check(); };

const startLoop = () => {
  if (timer !== null || typeof window === 'undefined') return;
  lastNotifiedAt = Date.now();
  timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onVisibility);
  window.addEventListener('online', onVisibility);
  void check();
};

const stopLoop = () => {
  if (timer === null) return;
  window.clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', onVisibility);
  window.removeEventListener('online', onVisibility);
};

/**
 * Register a page's quiet-refresh function. Returns a cleanup function,
 * so it can be returned straight from a useEffect.
 */
export const startLiveRefresh = (refresh: Listener): (() => void) => {
  listeners.add(refresh);
  startLoop();
  return () => {
    listeners.delete(refresh);
    if (listeners.size === 0) stopLoop();
  };
};

/** Call right after this browser saves something, so the check happens immediately. */
export const pokeLiveUpdates = () => { void check(); };

/** Subscribe to the connection status (for the small "Live" badge). */
export const subscribeLiveStatus = (fn: (status: LiveStatus) => void): (() => void) => {
  statusListeners.add(fn);
  fn(status);
  return () => { statusListeners.delete(fn); };
};

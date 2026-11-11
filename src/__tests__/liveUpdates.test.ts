import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const respond = (version: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, version }) } as Response);

describe('live updates', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('refreshes open pages only when the server version changes', async () => {
    let version = '10-0';
    const fetchMock = vi.fn(() => respond(version));
    vi.stubGlobal('fetch', fetchMock);
    const { startLiveRefresh } = await import('../utils/liveUpdates');
    const refresh = vi.fn();
    const stop = startLiveRefresh(refresh);

    await vi.advanceTimersByTimeAsync(0);      // first check just records the version
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4000);   // no change -> no refresh
    expect(refresh).not.toHaveBeenCalled();

    version = '11-0';                          // partner saved something
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).toHaveBeenCalledTimes(1);

    stop();
    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);  // stopped -> no more checks
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('pauses while the tab is hidden', async () => {
    const fetchMock = vi.fn(() => respond('1-0'));
    vi.stubGlobal('fetch', fetchMock);
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { startLiveRefresh } = await import('../utils/liveUpdates');
    const stop = startLiveRefresh(() => undefined);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).not.toHaveBeenCalled();
    hidden.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalled();
    stop();
  });

  it('reports offline after repeated failures', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('down'))));
    const { startLiveRefresh, subscribeLiveStatus } = await import('../utils/liveUpdates');
    const seen: string[] = [];
    subscribeLiveStatus(s => seen.push(s));
    const stop = startLiveRefresh(() => undefined);
    await vi.advanceTimersByTimeAsync(7000);
    expect(seen.at(-1)).toBe('offline');
    stop();
  });
});

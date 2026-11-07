import { vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('coaction/adapter');
  vi.doUnmock('use-sync-external-store/shim');
  vi.resetModules();
});

test.each([-3_600_000, 3_600_000])(
  'cleanup deadlines follow elapsed time across a %i ms wall-clock jump',
  async (jump) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T00:00:00Z'));
    vi.resetModules();
    const releases: number[] = [];
    let trackers = 0;
    vi.doMock('coaction/adapter', async () => ({
      ...(await vi.importActual<object>('coaction/adapter')),
      createReactiveTracker: () => {
        const id = trackers++;
        return {
          dispose: () => releases.push(id),
          getSnapshot: () => 0,
          subscribe: () => () => undefined,
          track: (fn: () => unknown) => fn()
        };
      }
    }));
    vi.doMock('use-sync-external-store/shim', () => ({
      useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
        getSnapshot()
    }));
    const React = await import('react');
    const { render } = await import('@testing-library/react');
    const { observer } = await import('../src');
    const Probe = observer(() => React.createElement('span', null, 'probe'));
    const first = render(React.createElement(Probe));
    vi.advanceTimersByTime(5_000);
    vi.setSystemTime(Date.now() + jump);
    const second = render(React.createElement(Probe));
    try {
      vi.advanceTimersByTime(4_999);
      expect(releases).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(releases).toEqual([0]);
      vi.advanceTimersByTime(4_999);
      expect(releases).toEqual([0]);
      vi.advanceTimersByTime(1);
      expect(releases).toEqual([0, 1]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      first.unmount();
      second.unmount();
      vi.runAllTimers();
    }
  }
);

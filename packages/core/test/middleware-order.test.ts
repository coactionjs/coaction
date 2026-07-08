import { history } from '../../coaction-history/src';
import { logger } from '../../coaction-logger/src';
import { persist, type PersistStorage } from '../../coaction-persist/src';
import { vi } from 'vitest';
import { create } from '../src';

const nextTick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const createMemoryStorage = (): PersistStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (name: string) => map.get(name) ?? null,
    removeItem: (name: string) => {
      map.delete(name);
    },
    setItem: (name: string, value: string) => {
      map.set(name, value);
    }
  };
};

const createCounterStore = (middlewares: any[]) =>
  create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares
    }
  );

test('persist observes history undo regardless of middleware order', async () => {
  const storage = createMemoryStorage();
  const historyInsidePersist = createCounterStore([
    history(),
    persist({
      name: 'history-inside-persist',
      storage
    })
  ]);

  historyInsidePersist.getState().increment();
  await nextTick();
  (historyInsidePersist as any).history.undo();
  await nextTick();

  expect(historyInsidePersist.getState().count).toBe(0);
  expect(storage.getItem('history-inside-persist')).toContain('"count":0');

  const persistInsideHistory = createCounterStore([
    persist({
      name: 'persist-inside-history',
      storage
    }),
    history()
  ]);

  persistInsideHistory.getState().increment();
  await nextTick();
  (persistInsideHistory as any).history.undo();
  await nextTick();

  expect(persistInsideHistory.getState().count).toBe(0);
  expect(storage.getItem('persist-inside-history')).toContain('"count":0');
});

test('history ignores persist hydration regardless of middleware order', async () => {
  const storage = createMemoryStorage();
  storage.setItem(
    'history-before-persist-hydration',
    JSON.stringify({
      state: {
        count: 5
      },
      version: 0
    })
  );
  const historyBeforePersist = createCounterStore([
    history(),
    persist({
      name: 'history-before-persist-hydration',
      storage
    })
  ]);

  await nextTick();

  expect(historyBeforePersist.getState().count).toBe(5);
  expect((historyBeforePersist as any).history.getPast()).toEqual([]);
  expect((historyBeforePersist as any).history.undo()).toBe(false);
  expect(historyBeforePersist.getState().count).toBe(5);
  await nextTick();
  expect(storage.getItem('history-before-persist-hydration')).toContain(
    '"count":5'
  );

  storage.setItem(
    'persist-before-history-hydration',
    JSON.stringify({
      state: {
        count: 5
      },
      version: 0
    })
  );
  const persistBeforeHistory = createCounterStore([
    persist({
      name: 'persist-before-history-hydration',
      storage
    }),
    history()
  ]);

  await nextTick();

  expect(persistBeforeHistory.getState().count).toBe(5);
  expect((persistBeforeHistory as any).history.getPast()).toEqual([]);
  expect((persistBeforeHistory as any).history.undo()).toBe(false);
  expect(persistBeforeHistory.getState().count).toBe(5);
  await nextTick();
  expect(storage.getItem('persist-before-history-hydration')).toContain(
    '"count":5'
  );
});

test('history undo is only logged when logger is inside history', () => {
  const bypassedLogger = {
    group: vi.fn(),
    groupCollapsed: vi.fn(),
    groupEnd: vi.fn(),
    log: vi.fn(),
    trace: vi.fn()
  };
  const loggerInsideHistory = createCounterStore([
    history(),
    logger({
      logger: bypassedLogger as any,
      collapsed: false
    })
  ]);

  loggerInsideHistory.getState().increment();
  bypassedLogger.group.mockClear();
  bypassedLogger.groupEnd.mockClear();
  (loggerInsideHistory as any).history.undo();

  expect(loggerInsideHistory.getState().count).toBe(0);
  expect(bypassedLogger.group).not.toHaveBeenCalled();
  expect(bypassedLogger.groupEnd).not.toHaveBeenCalled();

  const wrappedLogger = {
    group: vi.fn(),
    groupCollapsed: vi.fn(),
    groupEnd: vi.fn(),
    log: vi.fn(),
    trace: vi.fn()
  };
  const historyInsideLogger = createCounterStore([
    logger({
      logger: wrappedLogger as any,
      collapsed: false
    }),
    history()
  ]);

  historyInsideLogger.getState().increment();
  wrappedLogger.group.mockClear();
  wrappedLogger.groupEnd.mockClear();
  wrappedLogger.log.mockClear();
  (historyInsideLogger as any).history.undo();

  expect(historyInsideLogger.getState().count).toBe(0);
  expect(wrappedLogger.group).toHaveBeenCalledTimes(1);
  expect(wrappedLogger.groupEnd).toHaveBeenCalledTimes(1);
  const stateCall = wrappedLogger.log.mock.calls.find(
    ([label]) => label === '[State]'
  );
  const nextStateCall = wrappedLogger.log.mock.calls.find(
    ([label]) => label === '[Next State]'
  );
  expect(stateCall?.[1]).toEqual({
    count: 1
  });
  expect(nextStateCall?.[1]).toEqual({
    count: 0
  });
});

test('circular history undo is logged when logger is inside history', () => {
  const createCircularState = (count: number) => {
    const node = {
      count,
      self: null as any
    };
    node.self = node;
    return {
      node
    };
  };
  const wrappedLogger = {
    group: vi.fn(),
    groupCollapsed: vi.fn(),
    groupEnd: vi.fn(),
    log: vi.fn(),
    trace: vi.fn()
  };
  const useStore = create(() => createCircularState(0), {
    middlewares: [
      logger({
        logger: wrappedLogger as any,
        collapsed: false
      }),
      history()
    ]
  });

  useStore.setState(createCircularState(1));
  wrappedLogger.group.mockClear();
  wrappedLogger.groupEnd.mockClear();
  wrappedLogger.log.mockClear();
  (useStore as any).history.undo();

  const node = useStore.getPureState().node;
  expect(node.count).toBe(0);
  expect(node.self).toBe(node);
  expect(wrappedLogger.group).toHaveBeenCalledTimes(1);
  expect(wrappedLogger.groupEnd).toHaveBeenCalledTimes(1);
  const stateCall = wrappedLogger.log.mock.calls.find(
    ([label]) => label === '[State]'
  );
  const nextStateCall = wrappedLogger.log.mock.calls.find(
    ([label]) => label === '[Next State]'
  );
  expect(stateCall?.[1].node.count).toBe(1);
  expect(nextStateCall?.[1].node.count).toBe(0);
});

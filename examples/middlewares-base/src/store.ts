import { create, type Store } from 'coaction';
import { history, type HistoryApi } from '@coaction/history';
import { logger } from '@coaction/logger';
import { createJSONStorage, persist } from '@coaction/persist';

export type CounterStore = {
  count: number;
  increment: () => void;
};

export type LogEvent = {
  method: string;
  label: string;
};

type PersistApi = {
  clearStorage: () => Promise<void>;
  rehydrate: () => Promise<void>;
  hasHydrated: () => boolean;
};

export type MiddlewareStore = ReturnType<typeof createMiddlewareStore>;

const storageName = 'coaction-middlewares-base';

const formatLogLabel = (args: unknown[]) =>
  args
    .map((arg) => (typeof arg === 'string' ? arg.replace(/%c/g, '') : 'value'))
    .join(' ')
    .trim();

export const createMiddlewareStore = () => {
  const events: LogEvent[] = [];
  const sink = {
    log: (...args: unknown[]) => {
      events.push({
        method: 'log',
        label: formatLogLabel(args)
      });
    },
    group: (...args: unknown[]) => {
      events.push({
        method: 'group',
        label: formatLogLabel(args)
      });
    },
    groupCollapsed: (...args: unknown[]) => {
      events.push({
        method: 'groupCollapsed',
        label: formatLogLabel(args)
      });
    },
    trace: (...args: unknown[]) => {
      events.push({
        method: 'trace',
        label: formatLogLabel(args)
      });
    },
    groupEnd: () => {
      events.push({
        method: 'groupEnd',
        label: 'groupEnd'
      });
    }
  };
  const store = create<CounterStore>(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      name: 'middlewares-base',
      middlewares: [
        logger({
          logger: sink,
          collapsed: true,
          stackTrace: false
        }),
        history(),
        persist({
          name: storageName,
          storage: createJSONStorage(() => localStorage)
        })
      ]
    }
  ) as unknown as Store<CounterStore> & {
    history: HistoryApi<CounterStore>;
    persist: PersistApi;
  };

  return {
    store,
    events,
    storageName
  };
};

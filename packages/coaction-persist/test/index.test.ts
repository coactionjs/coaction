import { create } from 'coaction';
import { makeAutoObservable } from 'mobx';
import { vi } from 'vitest';
import { createStore as createZustandStore } from 'zustand/vanilla';
import { bindMobx } from '../../coaction-mobx/src';
import { adapt as adaptZustand, bindZustand } from '../../coaction-zustand/src';
import { createJSONStorage, persist, PersistStorage } from '../src';

const nextTick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const createMemoryStorage = (): PersistStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    }
  };
};

const createTransportPair = () => {
  const mainListeners = new Map<string, (...args: any[]) => unknown>();
  const clientListeners = new Map<string, (...args: any[]) => unknown>();
  const runAsync = (callback: () => void) => {
    setTimeout(callback, 0);
  };
  return {
    main: {
      listen: (name: string, listener: (...args: any[]) => unknown) => {
        mainListeners.set(name, listener);
      },
      emit: (event: string | { name: string }, payload?: unknown) => {
        const name = typeof event === 'string' ? event : event.name;
        if (name === 'update') {
          return Promise.resolve(clientListeners.get('update')?.(payload));
        }
        return Promise.resolve(undefined);
      },
      onConnect: (callback: () => void) => {
        runAsync(callback);
      },
      dispose: () => undefined
    },
    client: {
      listen: (name: string, listener: (...args: any[]) => unknown) => {
        clientListeners.set(name, listener);
      },
      emit: (name: string, ...args: unknown[]) => {
        const listener = mainListeners.get(name);
        if (!listener) {
          return Promise.reject(new Error(`Missing listener: ${name}`));
        }
        return Promise.resolve(listener(...args));
      },
      onConnect: (callback: () => void) => {
        runAsync(callback);
      },
      dispose: () => undefined
    }
  };
};

const delay = () => new Promise((resolve) => setTimeout(resolve, 0));

test('persist and rehydrate', async () => {
  const storage = createMemoryStorage();
  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        persist({
          name: 'counter',
          storage
        })
      ]
    }
  );
  useStore.getState().increment();
  await nextTick();
  const cached = storage.getItem('counter')!;
  expect(cached).toContain('"count":1');
  const rehydratedStore = create(
    (set) => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'counter',
          storage
        })
      ]
    }
  );
  await nextTick();
  expect(rehydratedStore.getState().count).toBe(1);
});

test('persists mutable adapter updates from final store subscription', async () => {
  const writes: Array<{ state: { count: number } }> = [];
  const storage: PersistStorage = {
    getItem: () => null,
    setItem: (_name, value) => {
      writes.push(JSON.parse(value));
    },
    removeItem: () => undefined
  };
  const useStore = create(
    () =>
      makeAutoObservable(
        bindMobx({
          count: 0,
          increment() {
            this.count += 1;
          }
        })
      ),
    {
      middlewares: [
        persist({
          name: 'mobx-counter',
          storage,
          skipHydration: true
        })
      ]
    }
  );

  useStore.getState().increment();
  await nextTick();

  expect(writes).toHaveLength(1);
  expect(writes[0].state.count).toBe(1);
});

test('persists direct external zustand updates', async () => {
  const writes: Array<{ state: { count: number } }> = [];
  const storage: PersistStorage = {
    getItem: () => null,
    setItem: (_name, value) => {
      writes.push(JSON.parse(value));
    },
    removeItem: () => undefined
  };
  const external = createZustandStore(
    bindZustand(() => ({
      count: 0
    }))
  );
  const useStore = create(() => adaptZustand(external), {
    middlewares: [
      persist({
        name: 'zustand-counter',
        storage,
        skipHydration: true
      })
    ]
  });

  external.setState({
    count: 7
  });
  await nextTick();

  expect(useStore.getState().count).toBe(7);
  expect(writes).toHaveLength(1);
  expect(writes[0].state.count).toBe(7);
});

test('does not overwrite storage before automatic hydration runs', async () => {
  const storage = createMemoryStorage();
  storage.setItem(
    'counter',
    JSON.stringify({
      state: {
        count: 8
      },
      version: 0
    })
  );
  const setItemSpy = vi.spyOn(storage, 'setItem');
  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        persist({
          name: 'counter',
          storage
        })
      ]
    }
  );

  useStore.getState().increment();
  expect(storage.getItem('counter')).toContain('"count":8');
  expect(setItemSpy).not.toHaveBeenCalled();

  await nextTick();

  expect(useStore.getState().count).toBe(8);
  expect(storage.getItem('counter')).toContain('"count":8');
  expect(setItemSpy).toHaveBeenCalledTimes(1);
});

test('shared main broadcasts hydration that completes after client full sync', async () => {
  let resolveHydration!: (value: string) => void;
  const storage: PersistStorage = {
    getItem: () =>
      new Promise((resolve) => {
        resolveHydration = resolve;
      }),
    setItem: () => undefined,
    removeItem: () => undefined
  };
  const transport = createTransportPair();
  const createCounter = () => ({
    count: 0
  });
  const serverStore = create(createCounter, {
    name: 'persist-shared-hydration',
    transport: transport.main as any,
    middlewares: [
      persist({
        name: 'persist-shared-hydration',
        storage
      })
    ]
  });
  const clientStore = create(createCounter, {
    name: 'persist-shared-hydration',
    clientTransport: transport.client as any
  });

  await delay();
  await delay();
  expect(serverStore.getState().count).toBe(0);
  expect(clientStore.getState().count).toBe(0);

  resolveHydration(
    JSON.stringify({
      state: {
        count: 5
      },
      version: 0
    })
  );
  await nextTick();
  await delay();

  expect(serverStore.getState().count).toBe(5);
  expect(clientStore.getState().count).toBe(5);
});

test('supports version migration', async () => {
  const storage = createMemoryStorage();
  storage.setItem(
    'counter',
    JSON.stringify({
      state: {
        count: 2
      },
      version: 0
    })
  );
  const useStore = create(
    (set) => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'counter',
          storage,
          version: 1,
          migrate: (persistedState) => ({
            ...persistedState,
            count: (persistedState as any).count + 3
          })
        })
      ]
    }
  );
  await nextTick();
  expect(useStore.getState().count).toBe(5);
  await nextTick();
  expect(storage.getItem('counter')).toContain('"version":1');
});

test('rehydrate merge receives pure state without action functions', async () => {
  const storage = createMemoryStorage();
  storage.setItem(
    'pure-state-merge',
    JSON.stringify({
      state: {
        count: 7
      },
      version: 0
    })
  );
  const merge = vi.fn((persistedState, currentState) => ({
    ...currentState,
    ...persistedState
  }));

  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        persist({
          name: 'pure-state-merge',
          storage,
          merge
        })
      ]
    }
  );

  await nextTick();

  expect(merge).toHaveBeenCalledTimes(1);
  const currentState = merge.mock.calls[0]?.[1] as Record<string, unknown>;
  expect(currentState.count).toBe(0);
  expect(currentState.increment).toBeUndefined();
  expect(useStore.getState().count).toBe(7);
});

test('custom rehydrate merge can replace state exactly', async () => {
  const storage = createMemoryStorage();
  storage.setItem(
    'replace-state-merge',
    JSON.stringify({
      state: {
        a: 3
      },
      version: 0
    })
  );

  const useStore = create(
    () => ({
      a: 1,
      b: 2
    }),
    {
      middlewares: [
        persist({
          name: 'replace-state-merge',
          storage,
          merge: (persistedState) => persistedState
        })
      ]
    }
  );

  await nextTick();

  expect(useStore.getPureState()).toEqual({
    a: 3
  });
  expect(useStore.getState().a).toBe(3);
  expect(useStore.getState().b).toBeUndefined();
});

test('rehydrate writes back current version without migrate', async () => {
  const storage = createMemoryStorage();
  storage.setItem(
    'version-rewrite',
    JSON.stringify({
      state: {
        count: 4
      },
      version: 0
    })
  );

  const useStore = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'version-rewrite',
          storage,
          version: 2
        })
      ]
    }
  );

  await nextTick();

  expect(useStore.getState().count).toBe(4);
  expect(storage.getItem('version-rewrite')).toContain('"version":2');
});

test('supports skipHydration and manual rehydrate', async () => {
  const storage = createMemoryStorage();
  storage.setItem(
    'counter',
    JSON.stringify({
      state: {
        count: 8
      },
      version: 0
    })
  );
  const useStore = create(
    (set) => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'counter',
          storage,
          skipHydration: true
        })
      ]
    }
  );
  expect(useStore.getState().count).toBe(0);
  expect((useStore as any).persist.hasHydrated()).toBeFalsy();
  await (useStore as any).persist.rehydrate();
  expect(useStore.getState().count).toBe(8);
  expect((useStore as any).persist.hasHydrated()).toBeTruthy();
  await (useStore as any).persist.clearStorage();
  expect(storage.getItem('counter')).toBeNull();
});

test('clearStorage waits for queued persist writes', async () => {
  const storage = createMemoryStorage();
  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        persist({
          name: 'queued-clear',
          storage,
          skipHydration: true
        })
      ]
    }
  );

  useStore.getState().increment();
  await (useStore as any).persist.clearStorage();
  expect(storage.getItem('queued-clear')).toBeNull();

  await nextTick();
  expect(storage.getItem('queued-clear')).toBeNull();
});

test('createJSONStorage', () => {
  const map = new Map<string, string>();
  const storage = createJSONStorage(() => ({
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
    clear: () => map.clear(),
    key: () => null,
    length: 0
  }));
  storage.setItem('name', 'value');
  expect(storage.getItem('name')).toBe('value');
  storage.removeItem('name');
  expect(storage.getItem('name')).toBeNull();
});

test('calls onRehydrateStorage for empty storage and deserialize errors', async () => {
  const emptyStorage = createMemoryStorage();
  const emptyCallback = jest.fn();
  const emptyStore = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'empty',
          storage: emptyStorage,
          onRehydrateStorage: emptyCallback
        })
      ]
    }
  );
  await nextTick();
  expect(emptyStore.getState().count).toBe(0);
  expect((emptyStore as any).persist.hasHydrated()).toBeTruthy();
  expect(emptyCallback).toHaveBeenCalledWith(
    expect.objectContaining({
      count: 0
    })
  );

  const invalidStorage = createMemoryStorage();
  invalidStorage.setItem('invalid', '{bad-json');
  const errorCallback = jest.fn();
  const invalidStore = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'invalid',
          storage: invalidStorage,
          onRehydrateStorage: errorCallback
        })
      ]
    }
  );
  await nextTick();
  expect((invalidStore as any).persist.hasHydrated()).toBeTruthy();
  expect(errorCallback).toHaveBeenCalledWith(
    undefined,
    expect.any(SyntaxError)
  );
});

test('manual rehydrate marks hydration as completed even when it fails', async () => {
  const invalidStorage = createMemoryStorage();
  invalidStorage.setItem('invalid-manual', '{bad-json');
  const useStore = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'invalid-manual',
          storage: invalidStorage,
          skipHydration: true
        })
      ]
    }
  );
  expect((useStore as any).persist.hasHydrated()).toBeFalsy();
  await (useStore as any).persist.rehydrate();
  expect((useStore as any).persist.hasHydrated()).toBeTruthy();
});

test('deduplicates concurrent rehydrate calls', async () => {
  let resolveGetItem: ((value: string | null) => void) | undefined;
  const storage: PersistStorage = {
    getItem: vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveGetItem = resolve;
        })
    ),
    setItem: () => undefined,
    removeItem: () => undefined
  };
  const onRehydrateStorage = vi.fn();
  const useStore = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'dedupe-rehydrate',
          storage,
          skipHydration: true,
          onRehydrateStorage
        })
      ]
    }
  );

  const api = (useStore as any).persist;
  const first = api.rehydrate();
  const second = api.rehydrate();

  expect(first).toBe(second);
  expect(storage.getItem).toHaveBeenCalledTimes(1);

  if (!resolveGetItem) {
    throw new Error('Expected pending getItem resolver');
  }
  resolveGetItem(
    JSON.stringify({
      state: {
        count: 3
      },
      version: 0
    })
  );
  await Promise.all([first, second]);

  expect(useStore.getState().count).toBe(3);
  expect(onRehydrateStorage).toHaveBeenCalledTimes(1);
  expect(api.hasHydrated()).toBeTruthy();
});

test('serializes async persist writes to prevent stale overwrite', async () => {
  const map = new Map<string, string>();
  const pendingWrites: Array<{
    value: string;
    commit: () => void;
  }> = [];
  const storage: PersistStorage = {
    getItem: () => null,
    setItem: (name, value) =>
      new Promise<void>((resolve) => {
        pendingWrites.push({
          value,
          commit: () => {
            map.set(name, value);
            resolve();
          }
        });
      }),
    removeItem: () => undefined
  };
  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        persist({
          name: 'ordered-writes',
          storage,
          skipHydration: true
        })
      ]
    }
  );

  useStore.getState().increment();
  useStore.getState().increment();

  await nextTick();
  expect(pendingWrites).toHaveLength(1);
  pendingWrites[0].commit();
  await nextTick();

  expect(pendingWrites).toHaveLength(2);
  expect(pendingWrites[1].value).toContain('"count":2');
  pendingWrites[1].commit();
  await nextTick();

  expect(map.get('ordered-writes')).toContain('"count":2');
});

test('skips scheduled rehydrate after destroy', async () => {
  const getItem = vi.fn(() =>
    JSON.stringify({
      state: {
        count: 9
      },
      version: 0
    })
  );
  const onRehydrateStorage = vi.fn();
  const storage: PersistStorage = {
    getItem,
    setItem: () => undefined,
    removeItem: () => undefined
  };
  const useStore = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'destroyed-auto-rehydrate',
          storage,
          onRehydrateStorage
        })
      ]
    }
  );

  useStore.destroy();
  await nextTick();

  expect(getItem).not.toHaveBeenCalled();
  expect(useStore.getState().count).toBe(0);
  expect(onRehydrateStorage).not.toHaveBeenCalled();
});

test('destroy does not drop already queued persist writes', async () => {
  const writes: string[] = [];
  const storage: PersistStorage = {
    getItem: () => null,
    setItem: (_name, value) => {
      writes.push(value);
    },
    removeItem: () => undefined
  };
  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        persist({
          name: 'destroy-queued-write',
          storage,
          skipHydration: true
        })
      ]
    }
  );

  useStore.getState().increment();
  useStore.destroy();
  await nextTick();

  expect(writes).toHaveLength(1);
  expect(writes[0]).toContain('"count":1');
});

test('supports noop storage fallback when storage is nullish', async () => {
  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        persist({
          name: 'noop',
          storage: null as unknown as PersistStorage
        })
      ]
    }
  );
  useStore.getState().increment();
  await nextTick();
  await (useStore as any).persist.clearStorage();
  useStore.destroy();
  expect(useStore.getState().count).toBe(1);
});

test('uses default storage when localStorage is unavailable', async () => {
  vi.stubGlobal('localStorage', undefined);
  expect(typeof localStorage).toBe('undefined');
  try {
    const useStore = create(
      (set) => ({
        count: 0,
        increment() {
          set((draft) => {
            draft.count += 1;
          });
        }
      }),
      {
        middlewares: [
          persist({
            name: 'default-storage',
            skipHydration: true
          })
        ]
      }
    );
    useStore.getState().increment();
    await nextTick();
    await (useStore as any).persist.clearStorage();
    useStore.destroy();
    expect(useStore.getState().count).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

test('uses default localStorage when available', async () => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => map.get(name) ?? null,
    setItem: (name: string, value: string) => {
      map.set(name, value);
    },
    removeItem: (name: string) => {
      map.delete(name);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    }
  } as Storage);
  try {
    const useStore = create(
      (set) => ({
        count: 0,
        increment() {
          set((draft) => {
            draft.count += 1;
          });
        }
      }),
      {
        middlewares: [
          persist({
            name: 'browser-storage',
            skipHydration: true
          })
        ]
      }
    );
    useStore.getState().increment();
    await nextTick();
    expect(map.get('browser-storage')).toContain('"count":1');
    await (useStore as any).persist.clearStorage();
    expect(map.has('browser-storage')).toBeFalsy();
  } finally {
    vi.unstubAllGlobals();
  }
});

test('falls back when queueMicrotask is unavailable', async () => {
  const originalQueueMicrotask = globalThis.queueMicrotask;
  (globalThis as any).queueMicrotask = undefined;
  try {
    const storage = createMemoryStorage();
    storage.setItem(
      'counter-fallback',
      JSON.stringify({
        state: {
          count: 9
        },
        version: 0
      })
    );
    const useStore = create(
      () => ({
        count: 0
      }),
      {
        middlewares: [
          persist({
            name: 'counter-fallback',
            storage
          })
        ]
      }
    );
    await nextTick();
    expect(useStore.getState().count).toBe(9);
    expect((useStore as any).persist.hasHydrated()).toBeTruthy();
  } finally {
    (globalThis as any).queueMicrotask = originalQueueMicrotask;
  }
});

test('setState catches persist write errors', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const storage: PersistStorage = {
    getItem: () => null,
    setItem: () => Promise.reject(new Error('write failed')),
    removeItem: () => undefined
  };
  try {
    const useStore = create(
      (set) => ({
        count: 0,
        increment() {
          set((draft) => {
            draft.count += 1;
          });
        }
      }),
      {
        middlewares: [
          persist({
            name: 'write-error',
            storage,
            skipHydration: true
          })
        ]
      }
    );
    useStore.getState().increment();
    await nextTick();
    await new Promise((resolve) => {
      setTimeout(resolve);
    });
    expect(useStore.getState().count).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  } finally {
    process.env.NODE_ENV = prev;
    errorSpy.mockRestore();
  }
});

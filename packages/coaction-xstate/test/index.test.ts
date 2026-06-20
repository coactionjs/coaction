import { create, Slices } from 'coaction';
import { adapt, assign, bindXState, createActor, createMachine } from '../src';

const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

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

const createCounterActor = () => {
  const machine = createMachine({
    context: {
      count: 0
    },
    on: {
      increment: {
        actions: assign({
          count: ({ context }) => context.count + 1
        })
      }
    }
  });
  const actor = createActor(machine);
  actor.start();
  return actor;
};

test('base', () => {
  const actor = createCounterActor();
  const useStore = create(() => adapt(bindXState(actor)), {
    name: 'test'
  });
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "send": [Function],
}
`);
  useStore.getState().send({
    type: 'increment'
  });
  expect(useStore.getState().count).toBe(1);
  actor.send({
    type: 'increment'
  });
  expect(useStore.getState().count).toBe(2);
  expect(() =>
    useStore.setState({
      count: 100
    })
  ).toThrow(
    'setState is not supported with xstate binding. Please use actor events.'
  );
});

test('shared client ignores direct local actor updates', async () => {
  const transport = createTransportPair();
  const serverActor = createCounterActor();
  const clientActor = createCounterActor();
  const serverStore = create(() => adapt(bindXState(serverActor)), {
    name: 'test-xstate-client-local-actor',
    transport: transport.main as any
  });
  const clientStore = create(() => adapt(bindXState(clientActor)), {
    name: 'test-xstate-client-local-actor',
    clientTransport: transport.client as any
  });
  await wait();
  expect(serverStore.getState().count).toBe(0);
  expect(clientStore.getState().count).toBe(0);

  clientActor.send({
    type: 'increment'
  });
  await wait();
  expect(serverStore.getState().count).toBe(0);
  expect(clientStore.getState().count).toBe(0);

  await clientStore.getState().send({
    type: 'increment'
  });
  await wait();
  expect(serverStore.getState().count).toBe(1);
  expect(clientStore.getState().count).toBe(1);

  serverActor.stop();
  clientActor.stop();
});

test('actor snapshots replace stale context keys', () => {
  let listener!: (snapshot: { context: { a: number } }) => void;
  const actor = {
    getSnapshot: () => ({
      context: {
        a: 1,
        b: 2
      }
    }),
    subscribe: (observer: typeof listener) => {
      listener = observer;
      return {
        unsubscribe: () => undefined
      };
    },
    send: () => undefined
  };
  const useStore = create(() => adapt(bindXState(actor as any)), {
    name: 'test-xstate-exact-replace'
  });

  listener({
    context: {
      a: 3
    }
  });

  expect(useStore.getPureState()).toEqual({
    a: 3
  });
  expect(useStore.getState().send).toBeInstanceOf(Function);
});

test('handles actors that synchronously emit when subscribing', () => {
  let unsubscribed = false;
  const actor = {
    getSnapshot: () => ({
      context: {
        count: 0
      }
    }),
    subscribe: (
      observer: (snapshot: { context: { count: number } }) => void
    ) => {
      observer({
        context: {
          count: 2
        }
      });
      return {
        unsubscribe: () => {
          unsubscribed = true;
        }
      };
    },
    send: () => undefined
  };

  const useStore = create<{
    count: number;
    send: (event: unknown) => void;
  }>(() => adapt(bindXState(actor as any)), {
    name: 'test-xstate-sync-subscribe'
  });

  expect(useStore.getState().count).toBe(2);
  useStore.destroy();
  expect(unsubscribed).toBe(true);
});

describe('Slices', () => {
  test('base - unsupported', () => {
    const machine = createMachine({
      context: {
        count: 0
      },
      on: {
        increment: {
          actions: assign({
            count: ({ context }) => context.count + 1
          })
        }
      }
    });
    const actor = createActor(machine);
    actor.start();
    expect(() => {
      create<{
        counter: Slices<
          {
            counter: {
              count: number;
              send: (event: { type: 'increment' }) => void;
            };
          },
          'counter'
        >;
      }>(
        {
          counter: () => adapt(bindXState(actor))
        },
        {
          name: 'test',
          sliceMode: 'slices'
        }
      );
    }).toThrow(
      'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
    );
  });
});

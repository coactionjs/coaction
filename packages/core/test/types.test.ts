import { expectTypeOf } from 'vitest';
import type {
  ClientStoreOptions,
  PatchTransform,
  Store,
  StoreOptions,
  StoreTraceEvent,
  AsyncStore
} from '../src';
import { create } from '../src';

test('preserves deprecated public compatibility fields', () => {
  type CounterStore = Store<{ count: number }>;

  expectTypeOf<CounterStore['patch']>().toEqualTypeOf<
    ((option: PatchTransform) => PatchTransform) | undefined
  >();
  expectTypeOf<CounterStore['trace']>().toEqualTypeOf<
    ((options: StoreTraceEvent) => void) | undefined
  >();
  expectTypeOf<StoreOptions<{ count: number }>['workerType']>().toEqualTypeOf<
    'SharedWorkerInternal' | 'WebWorkerInternal' | undefined
  >();
  expectTypeOf<
    ClientStoreOptions<{ count: number }>['workerType']
  >().toEqualTypeOf<'SharedWorkerClient' | 'WebWorkerClient' | undefined>();
  expectTypeOf<
    ClientStoreOptions<{ count: number }>['executeSyncTimeoutMs']
  >().toEqualTypeOf<number | undefined>();
});

test('types object inputs as single stores when not using slices mode', () => {
  const objectStore = create({
    count: 0
  });
  const methodStore = create<{ ping: () => string }>(
    {
      ping() {
        return 'pong';
      }
    },
    {
      sliceMode: 'single'
    }
  );
  const clientMethodStore = create<{ ping: () => string }>(
    {
      ping() {
        return 'pong';
      }
    },
    {
      sliceMode: 'single',
      clientTransport: {
        dispose: () => undefined,
        emit: () => Promise.resolve(undefined),
        listen: () => undefined,
        onConnect: () => undefined
      } as unknown as NonNullable<
        ClientStoreOptions<{ ping: () => string }>['clientTransport']
      >
    }
  );

  type MethodPing = ReturnType<typeof methodStore.getState>['ping'];
  type ClientMethodPing = ReturnType<typeof clientMethodStore.getState>['ping'];

  expectTypeOf(objectStore.getState().count).toEqualTypeOf<number>();
  expectTypeOf<MethodPing>().toEqualTypeOf<() => string>();
  expectTypeOf<ClientMethodPing>().toEqualTypeOf<() => Promise<string>>();
  clientMethodStore.destroy();
});

test('types async client methods with awaited return values', () => {
  type Counter = {
    load: () => Promise<number>;
    nested: {
      load: () => Promise<string>;
    };
  };

  type AsyncCounterState = ReturnType<AsyncStore<Counter>['getState']>;
  type AsyncCounterSlicesState = ReturnType<
    AsyncStore<Counter, true>['getState']
  >;

  expectTypeOf<AsyncCounterState['load']>().toEqualTypeOf<
    () => Promise<number>
  >();
  expectTypeOf<AsyncCounterSlicesState['nested']['load']>().toEqualTypeOf<
    () => Promise<string>
  >();
});

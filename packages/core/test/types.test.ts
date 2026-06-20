import { expectTypeOf } from 'vitest';
import type {
  ClientStoreOptions,
  PatchTransform,
  Store,
  StoreOptions,
  StoreTraceEvent,
  StoreWithAsyncFunction
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
  const methodStore = create(
    {
      ping() {
        return 'pong';
      }
    },
    {
      sliceMode: 'single'
    }
  );
  const clientMethodStore = create(
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
      } as NonNullable<
        ClientStoreOptions<{ ping: () => string }>['clientTransport']
      >
    }
  );

  expectTypeOf(objectStore.getState().count).toEqualTypeOf<number>();
  expectTypeOf(methodStore.getState().ping).toEqualTypeOf<() => string>();
  expectTypeOf(clientMethodStore.getState().ping).toEqualTypeOf<
    () => Promise<string>
  >();
  clientMethodStore.destroy();
});

test('types async client methods with awaited return values', () => {
  type Counter = {
    load: () => Promise<number>;
    nested: {
      load: () => Promise<string>;
    };
  };

  expectTypeOf<
    StoreWithAsyncFunction<Counter>['getState'] extends () => infer State
      ? State['load']
      : never
  >().toEqualTypeOf<() => Promise<number>>();
  expectTypeOf<
    StoreWithAsyncFunction<Counter, true>['getState'] extends () => infer State
      ? State['nested']['load']
      : never
  >().toEqualTypeOf<() => Promise<string>>();
});

import { expectTypeOf } from 'vitest';
import { runBinderAdapterContract } from '../../core/test/binderAdapterContract';
import { adapt, bindValtio, proxy } from '../src';

type Counter = {
  count: number;
  increment: () => void;
};

const createCounterStore = () =>
  proxy(
    bindValtio({
      count: 0,
      increment() {
        this.count += 1;
      }
    })
  );

runBinderAdapterContract({
  packageName: '@coaction/valtio',
  createLocalContract: () => {
    const external = createCounterStore();
    return {
      createState: () => adapt(external),
      readValue: (store) => store.getState().count,
      invokeUpdate: (store) => store.getState().increment(),
      expectedValueAfterUpdate: 1,
      writeExternal: () => {
        external.count = 7;
      },
      expectedValueAfterExternalWrite: 7
    };
  },
  createWorkerContract: () => {
    const serverExternal = createCounterStore();
    const clientExternal = createCounterStore();
    return {
      createServerState: () => adapt(serverExternal),
      createClientState: () => adapt(clientExternal),
      readValue: (store) => store.getState().count,
      readClientExternal: () => clientExternal.count,
      invokeServer: (store) => store.getState().increment(),
      expectedValueAfterServerUpdate: 1,
      invokeClient: (store) => store.getState().increment(),
      expectedValueAfterClientUpdate: 2,
      writeServerExternal: () => {
        serverExternal.count = 7;
      },
      expectedValueAfterServerExternalWrite: 7,
      writeClientExternal: () => {
        clientExternal.count = 9;
      }
    };
  }
});

test('type expectations', () => {
  const external = createCounterStore();
  expectTypeOf(adapt(external)).toMatchTypeOf<Counter>();
});

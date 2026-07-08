import { create } from 'coaction';
import { adapt, bindPinia, defineStore } from '@coaction/pinia';

type PiniaState = {
  count: number;
  increment: () => void;
};

export const runExample = () => {
  const id = 'pinia-example-' + Math.random().toString(16).slice(2);

  const rawUseCounterStore = defineStore(
    id,
    bindPinia({
      state: () => ({
        count: 0
      }),
      actions: {
        increment() {
          this.count += 1;
        }
      }
    })
  );
  const useCounterStore = adapt<PiniaState>(
    rawUseCounterStore
  ) as unknown as typeof rawUseCounterStore;

  const piniaStore = useCounterStore();

  const store = create<PiniaState>(() => useCounterStore as any, {
    name: id
  });

  store.getState().increment();
  const afterCoactionIncrement = store.getState().count;

  piniaStore.increment();
  const afterPiniaIncrement = store.getState().count;

  piniaStore.$state.count = 7;
  const afterPiniaStateWrite = store.getState().count;

  store.setState({
    count: 10
  });

  const result = {
    afterCoactionIncrement,
    afterPiniaIncrement,
    afterPiniaStateWrite,
    finalCoactionCount: store.getState().count,
    finalPiniaCount: piniaStore.$state.count
  };
  store.destroy();

  return result;
};

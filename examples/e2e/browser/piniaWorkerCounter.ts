import {
  adapt,
  bindPinia,
  defineStore
} from '../../../packages/coaction-pinia/src/index';

export type PiniaWorkerCounterState = {
  count: number;
  add: (step?: number) => number;
  addAsync: (step?: number) => Promise<number>;
  fail: (message?: string) => never;
};

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// pinia (like zustand) has its own store constructor separate from
// coaction's factory: the coaction state IS the store hook itself, and
// calling that hook returns the live pinia store instance for direct reads.
export const createPiniaWorkerCounter = (id: string) => {
  const rawUseCounterStore = defineStore(
    id,
    bindPinia({
      state: () => ({ count: 0 }),
      actions: {
        add(step = 1) {
          this.count += step;
          return this.count;
        },
        async addAsync(step = 1) {
          this.count += step;
          await wait(20);
          this.count += step;
          return this.count;
        },
        fail(message = 'pinia worker exploded') {
          throw new Error(message);
        }
      }
    })
  );
  const useCounterStore = adapt<PiniaWorkerCounterState>(
    rawUseCounterStore
  ) as unknown as typeof rawUseCounterStore;
  return {
    factory: () => useCounterStore as any,
    getInstance: () => useCounterStore()
  };
};

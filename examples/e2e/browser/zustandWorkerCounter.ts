import { create as createWithZustand, type StateCreator } from 'zustand';
import {
  adapt,
  bindZustand
} from '../../../packages/coaction-zustand/src/index';

export type ZustandWorkerCounterState = {
  count: number;
  add: (step?: number) => number;
  addAsync: (step?: number) => Promise<number>;
  fail: (message?: string) => never;
};

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const counterInitializer: StateCreator<ZustandWorkerCounterState, [], []> = (
  set,
  get
) => ({
  count: 0,
  add(step = 1) {
    set((state) => ({ count: state.count + step }));
    return get().count;
  },
  async addAsync(step = 1) {
    set((state) => ({ count: state.count + step }));
    await wait(20);
    set((state) => ({ count: state.count + step }));
    return get().count;
  },
  fail(message = 'zustand worker exploded') {
    throw new Error(message);
  }
});

export const createZustandCounterStore = () =>
  createWithZustand(bindZustand(counterInitializer));

export const zustandWorkerCounter = () => adapt(createZustandCounterStore());

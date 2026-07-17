import { makeAutoObservable } from 'mobx';
import { bindMobx } from '../../../packages/coaction-mobx/src/index';

export type MobxWorkerCounterState = {
  count: number;
  add: (step?: number) => number;
  addAsync: (step?: number) => Promise<number>;
  fail: (message?: string) => never;
};

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// mobx has no separate "raw store" constructor like zustand's create(): the
// bound observable object IS the state. Capture the instance a factory call
// produces so callers can read the underlying mobx object directly, not just
// through coaction's own snapshot.
export const createMobxWorkerCounter = () => {
  let instance: MobxWorkerCounterState | undefined;
  const factory = (set: any): MobxWorkerCounterState => {
    void set;
    instance = makeAutoObservable(
      bindMobx({
        count: 0,
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
        fail(message = 'mobx worker exploded') {
          throw new Error(message);
        }
      })
    );
    return instance;
  };
  return {
    factory,
    getInstance: () => instance
  };
};

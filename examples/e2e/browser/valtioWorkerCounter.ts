import {
  adapt,
  bindValtio,
  proxy
} from '../../../packages/coaction-valtio/src/index';

export type ValtioWorkerCounterState = {
  count: number;
  add: (step?: number) => number;
  addAsync: (step?: number) => Promise<number>;
  fail: (message?: string) => never;
};

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const createValtioCounterStore = () =>
  proxy(
    bindValtio({
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
      fail(message = 'valtio worker exploded') {
        throw new Error(message);
      }
    })
  );

export const valtioWorkerCounter = () => adapt(createValtioCounterStore());

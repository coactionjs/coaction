import { create } from '../../../packages/core/local';

export const createCounter = () =>
  create((set) => ({
    count: 0,
    increment() {
      set({ count: this.count + 1 });
    }
  }));

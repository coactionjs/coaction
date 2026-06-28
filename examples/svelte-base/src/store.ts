import { create } from '@coaction/svelte';

type CounterStore = {
  count: number;
  step: number;
  history: string[];
  readonly double: number;
  increment: () => void;
  decrement: () => void;
  setStep: (step: number) => void;
  reset: () => void;
};

export const counterStore = create<CounterStore>((set) => ({
  count: 0,
  step: 1,
  history: ['Store created'],
  get double() {
    return this.count * 2;
  },
  increment() {
    set(() => {
      this.count += this.step;
      this.history.push(`+${this.step} -> ${this.count}`);
    });
  },
  decrement() {
    set(() => {
      this.count -= this.step;
      this.history.push(`-${this.step} -> ${this.count}`);
    });
  },
  setStep(step) {
    set(() => {
      this.step = step;
      this.history.push(`step = ${step}`);
    });
  },
  reset() {
    set(() => {
      this.count = 0;
      this.step = 1;
      this.history = ['Reset'];
    });
  }
}));

export const count = counterStore.select((state) => state.count);
export const double = counterStore.select((state) => state.double);
export const step = counterStore.select((state) => state.step);
export const history = counterStore.select((state) => state.history);

import { create } from '@coaction/vue';

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

export const useCounterStore = create<CounterStore>((set) => ({
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

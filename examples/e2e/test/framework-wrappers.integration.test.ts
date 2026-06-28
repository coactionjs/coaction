import { effectScope } from 'vue';
import { create as createNg } from '@coaction/ng';
import { create as createReact } from '@coaction/react';
import { create as createSolid } from '@coaction/solid';
import { create as createSvelte } from '@coaction/svelte';
import { create as createVue } from '@coaction/vue';

type CounterState = {
  count: number;
  readonly double: number;
  increment: () => void;
};

const createCounter = (set: (next: (draft: CounterState) => void) => void) => ({
  count: 0,
  get double() {
    return this.count * 2;
  },
  increment() {
    set((draft) => {
      draft.count += 1;
    });
  }
});

describe('framework wrapper integration contracts', () => {
  test('react wrapper exposes core store updates and subscriptions', () => {
    const useStore = createReact<CounterState>(createCounter);
    const notifications: number[] = [];
    const unsubscribe = useStore.subscribe(() => {
      notifications.push(useStore.getState().count);
    });

    useStore.getState().increment();

    expect(useStore.getState().count).toBe(1);
    expect(useStore.getState().double).toBe(2);
    expect(notifications).toEqual([1]);
    unsubscribe();
    useStore.destroy();
  });

  test('vue wrapper updates state proxy and computed selectors', () => {
    const useStore = createVue<CounterState>(createCounter);
    const scope = effectScope();

    scope.run(() => {
      const state = useStore();
      const count = useStore((current) => current.count);
      const double = useStore((current) => current.double);

      state.increment();

      expect(state.count).toBe(1);
      expect(count.value).toBe(1);
      expect(double.value).toBe(2);
    });

    scope.stop();
    useStore.destroy();
  });

  test('solid wrapper updates state and selector accessors', () => {
    const useStore = createSolid<CounterState>(createCounter);
    const state = useStore();
    const count = useStore((current) => current.count);
    const double = useStore((current) => current.double);

    useStore.getState().increment();

    expect(state().count).toBe(1);
    expect(count()).toBe(1);
    expect(double()).toBe(2);
    useStore.destroy();
  });

  test('svelte wrapper updates readable store selectors', () => {
    const store = createSvelte<CounterState>(createCounter);
    const selectedValues: number[] = [];
    const selectedDouble = store((current) => current.double);
    const unsubscribe = selectedDouble.subscribe((value) => {
      selectedValues.push(value);
    });

    store.getState().increment();
    unsubscribe();

    expect(store().count).toBe(1);
    expect(selectedValues).toEqual([0, 2]);
    store.destroy();
  });

  test('angular wrapper updates signals and selectors', () => {
    const store = createNg<CounterState>(createCounter);
    const count = store.select((current) => current.count);
    const double = store.select((current) => current.double);

    store.getState().increment();

    expect(store.state().count).toBe(1);
    expect(count()).toBe(1);
    expect(double()).toBe(2);
    store.destroy();
  });
});

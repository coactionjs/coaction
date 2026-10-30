import React, { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { expectTypeOf, vi } from 'vitest';
import type { Middleware } from 'coaction';
import { create, observer } from '../src';

type Row = { id: number; done: boolean };

type Rows = {
  rows: Row[];
  other: number;
  toggle: (index: number) => void;
  touchOther: () => void;
};

const h = React.createElement;

const createRows = (middlewares: Middleware<Rows>[] = []) =>
  create<Rows>(
    (set) => ({
      rows: [
        { id: 1, done: false },
        { id: 2, done: true }
      ],
      other: 0,
      toggle(index) {
        set(() => {
          this.rows[index].done = !this.rows[index].done;
        });
      },
      touchOther() {
        set(() => {
          this.other += 1;
        });
      }
    }),
    { middlewares }
  );

test('a whole selector reads the plain data and renders only when its result changes', () => {
  const useStore = createRows();
  const given: unknown[] = [];
  let renders = 0;
  const Done = () => {
    renders += 1;
    const done = useStore(
      (state) => {
        given.push(state);
        return state.rows.filter((row) => row.done).length;
      },
      { whole: true }
    );
    return h('span', { 'data-testid': 'done' }, done);
  };
  render(h(StrictMode, null, h(Done)));
  expect(screen.getByTestId('done').textContent).toBe('1');
  // The store's own data, not a readonly view of it.
  expect(given.every((state) => state === useStore.getPureState())).toBe(true);
  const rendersAfterMount = renders;
  const runsAfterMount = given.length;

  // Every commit runs the selector again; an equal result renders nothing.
  act(() => useStore.getState().touchOther());
  expect(given.length).toBe(runsAfterMount + 1);
  expect(given[given.length - 1]).toBe(useStore.getPureState());
  expect(renders).toBe(rendersAfterMount);

  act(() => useStore.getState().toggle(0));
  expect(screen.getByTestId('done').textContent).toBe('2');
  expect(renders).toBeGreaterThan(rendersAfterMount);
  useStore.destroy();
});

test('equals keeps the earlier result, across renders and across commits', () => {
  const useStore = createRows();
  const sameIds = (previous: number[], next: number[]) =>
    previous.length === next.length &&
    previous.every((id, index) => id === next[index]);
  const seen: number[][] = [];
  let renders = 0;
  const Ids = ({ label }: { label: string }) => {
    renders += 1;
    // A new selector on every render.
    const ids = useStore((state) => state.rows.map((row) => row.id), {
      whole: true,
      equals: sameIds
    });
    seen.push(ids);
    return h('span', { 'data-testid': 'ids' }, `${label}:${ids.join()}`);
  };
  const view = render(h(Ids, { label: 'a' }));
  view.rerender(h(Ids, { label: 'b' }));
  expect(screen.getByTestId('ids').textContent).toBe('b:1,2');
  expect(seen[1]).toBe(seen[0]);

  const rendersBefore = renders;
  act(() => useStore.getState().toggle(1));
  expect(renders).toBe(rendersBefore);

  act(() => {
    useStore.setState((state) => {
      state.rows.push({ id: 3, done: false });
    });
  });
  expect(screen.getByTestId('ids').textContent).toBe('b:1,2,3');
  useStore.destroy();
});

test('a store read only through whole selectors writes without patches', () => {
  let patchCalls = 0;
  const countPatches: Middleware<Rows> = (store) => {
    store.patch = (transition) => {
      patchCalls += 1;
      return transition;
    };
    return store;
  };
  const useStore = createRows([countPatches]);
  const Done = () =>
    h(
      'span',
      { 'data-testid': 'done' },
      useStore((state) => state.rows.filter((row) => row.done).length, {
        whole: true
      })
    );
  render(h(Done));
  act(() => useStore.getState().toggle(0));
  act(() => useStore.getState().touchOther());
  expect(screen.getByTestId('done').textContent).toBe('2');
  expect(patchCalls).toBe(0);
  useStore.destroy();
});

test('an unmounted whole selector stops running', () => {
  const useStore = createRows();
  let runs = 0;
  const Count = () =>
    h(
      'span',
      null,
      useStore(
        (state) => {
          runs += 1;
          return state.rows.length;
        },
        { whole: true }
      )
    );
  const view = render(h(Count));
  view.unmount();
  const runsAfterUnmount = runs;
  act(() => useStore.getState().touchOther());
  expect(runs).toBe(runsAfterUnmount);
  useStore.destroy();
});

test('a whole selector reads every slice of a slice store', () => {
  const useStore = create(
    {
      counter: (set) => ({
        count: 0,
        increment() {
          set(() => {
            this.count += 1;
          });
        }
      }),
      settings: () => ({ step: 2 })
    },
    { sliceMode: 'slices' }
  );
  const Sum = () =>
    h(
      'span',
      { 'data-testid': 'sum' },
      useStore((state) => state.counter.count + state.settings.step, {
        whole: true
      })
    );
  render(h(Sum));
  expect(screen.getByTestId('sum').textContent).toBe('2');
  act(() => useStore.getState().counter.increment());
  expect(screen.getByTestId('sum').textContent).toBe('3');
  useStore.destroy();
});

test('a whole selector inside an observer renders with it', () => {
  const useStore = createRows();
  const Both = observer(() => {
    const other = useStore().other;
    const done = useStore(
      (state) => state.rows.filter((row) => row.done).length,
      { whole: true }
    );
    return h('span', { 'data-testid': 'both' }, `${other}:${done}`);
  });
  render(h(Both));
  expect(screen.getByTestId('both').textContent).toBe('0:1');
  act(() => useStore.getState().toggle(0));
  expect(screen.getByTestId('both').textContent).toBe('0:2');
  act(() => useStore.getState().touchOther());
  expect(screen.getByTestId('both').textContent).toBe('1:2');
  useStore.destroy();
});

test('a whole selector that throws fails the render, not the write', () => {
  const useStore = createRows();
  class Boundary extends React.Component<
    { children: React.ReactNode },
    { failed: boolean }
  > {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    render() {
      return this.state.failed
        ? h('span', { 'data-testid': 'failed' }, 'failed')
        : this.props.children;
    }
  }
  const Strict = () =>
    h(
      'span',
      null,
      useStore(
        (state) => {
          if (state.other > 0) throw new Error('no other');
          return state.other;
        },
        { whole: true }
      )
    );
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(h(Boundary, null, h(Strict)));
    expect(() => act(() => useStore.getState().touchOther())).not.toThrow();
    expect(screen.getByTestId('failed').textContent).toBe('failed');
  } finally {
    error.mockRestore();
  }
  useStore.destroy();
});

test('whole selector options are typed by the result', () => {
  const useStore = createRows();
  const Typed = () => {
    const count = useStore((state) => state.rows.length, { whole: true });
    expectTypeOf(count).toEqualTypeOf<number>();
    const ids = useStore((state) => state.rows.map((row) => row.id), {
      whole: true,
      equals: (previous, next) => previous.length === next.length
    });
    expectTypeOf(ids).toEqualTypeOf<number[]>();
    // @ts-expect-error -- a whole read needs a selector.
    useStore({ whole: true });
    return null;
  };
  expect(typeof Typed).toBe('function');
  useStore.destroy();
});

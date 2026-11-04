import { create } from '../src';

const createFactory = () => {
  const user = { name: 'Ada', tags: ['x'] };
  const methods = {
    rename(this: { user: { name: string } }, name: string) {
      this.user.name = name;
    }
  };
  return { user, methods };
};

test('the initial state is the store’s first root, shaped like the factory’s object', () => {
  const { methods } = createFactory();
  let factoryState: Record<PropertyKey, unknown> | undefined;
  const hidden = Symbol('hidden');
  const store = create((set) => {
    factoryState = {
      count: 1,
      user: { name: 'Ada', tags: ['x'] },
      list: [{ id: 1 }],
      [hidden]: 'symbol data',
      get double() {
        return (this as { count: number }).count * 2;
      },
      rename(name: string) {
        set(() => {
          (this as { user: { name: string } }).user.name = name;
        });
      },
      helper: methods.rename
    };
    Object.defineProperty(factoryState, 'secret', {
      value: 'not enumerable',
      enumerable: false,
      writable: true,
      configurable: true
    });
    return factoryState;
  });
  const initial = store.getInitialState() as Record<PropertyKey, any>;
  expect(initial).not.toBe(factoryState);
  expect(initial).toBe(store.getInitialState());
  expect(Reflect.ownKeys(initial)).toEqual(Reflect.ownKeys(factoryState!));
  expect(initial.count).toBe(1);
  expect(initial.user).toEqual({ name: 'Ada', tags: ['x'] });
  expect(initial.list).toEqual([{ id: 1 }]);
  expect(initial[hidden]).toBe('symbol data');
  expect(initial.double).toBe(2);
  expect(Object.getOwnPropertyDescriptor(initial, 'secret')).toEqual(
    Object.getOwnPropertyDescriptor(factoryState!, 'secret')
  );
  // The factory's own functions, not the store's actions.
  expect(initial.rename).toBe(factoryState!.rename);
  expect(initial.helper).toBe(methods.rename);
  expect(initial.rename).not.toBe(store.getState().rename);
  // Neither side reaches the other.
  store.getState().rename('Lin');
  expect(store.getState().user.name).toBe('Lin');
  expect(initial.user.name).toBe('Ada');
  initial.user.name = 'changed';
  initial.list.push({ id: 2 });
  expect(store.getPureState().list).toEqual([{ id: 1 }]);
  expect(store.getState().user.name).toBe('Lin');
  store.destroy();
});

test('a slice store reads each slice’s initial state the same way', () => {
  const store = create(
    {
      counter: () => ({
        count: 0,
        increment() {
          this.count += 1;
        }
      }),
      profile: () => ({ user: { name: 'Ada' }, list: [1, 2] })
    },
    { sliceMode: 'slices' }
  );
  const initial = store.getInitialState() as any;
  expect(initial.counter.count).toBe(0);
  expect(typeof initial.counter.increment).toBe('function');
  expect(initial.profile).toEqual({ user: { name: 'Ada' }, list: [1, 2] });
  store.setState({ profile: { user: { name: 'Lin' } } } as any);
  expect(store.getState().profile.user.name).toBe('Lin');
  expect((store.getInitialState() as any).profile.user.name).toBe('Ada');
  store.destroy();
});

test('resetting to the initial state restores it', () => {
  const store = create(() => ({ count: 0, user: { name: 'Ada' } }));
  store.setState({ count: 5, user: { name: 'Lin' } });
  store.setState(store.getInitialState());
  expect(store.getPureState()).toEqual({ count: 0, user: { name: 'Ada' } });
  store.destroy();
});

test('a store with methods, getters and computed values resets to its initial state', () => {
  const store = create((set, get) => ({
    count: 1,
    todos: [{ title: 'a' }],
    get double() {
      return this.count * 2;
    },
    total: get(
      (state) => [state.todos],
      (todos) => todos.length
    ),
    bump() {
      set(() => {
        this.count += 1;
        this.todos.push({ title: 'b' });
      });
    }
  }));
  const reset = [
    () => store.setState(store.getInitialState()),
    () => store.setState(() => store.getInitialState())
  ];
  for (const resetStore of reset) {
    store.getState().bump();
    expect(store.getState().double).toBe(4);
    expect(store.getState().total).toBe(2);
    resetStore();
    expect(store.getPureState()).toEqual({ count: 1, todos: [{ title: 'a' }] });
    expect(store.getState().double).toBe(2);
    expect(store.getState().total).toBe(1);
  }
  // The methods are still the store's.
  store.getState().bump();
  expect(store.getPureState().count).toBe(2);
  // The object is the caller's to change, and is checked as it stands.
  const initial = store.getInitialState() as any;
  initial.count = 5;
  initial.extra = 1;
  expect(() => store.setState(initial)).toThrow("Unknown state key 'extra'");
  delete initial.extra;
  store.setState(initial);
  expect(store.getPureState().count).toBe(5);
  store.destroy();
});

test('a slice store resets each slice to its initial state', () => {
  const store = create(
    {
      counter: (set) => ({
        count: 0,
        increment() {
          set(() => {
            this.count += 1;
          });
        }
      }),
      profile: () => ({ user: { name: 'Ada' } })
    },
    { sliceMode: 'slices' }
  );
  store.getState().counter.increment();
  store.setState({ profile: { user: { name: 'Lin' } } } as any);
  store.setState(store.getInitialState());
  expect(store.getPureState()).toEqual({
    counter: { count: 0 },
    profile: { user: { name: 'Ada' } }
  });
  store.getState().counter.increment();
  expect(store.getPureState().counter.count).toBe(1);
  store.destroy();
});

test('a key the factory made a method is still not state', () => {
  const store = create((set) => ({
    count: 0,
    bump() {
      set(() => {
        this.count += 1;
      });
    }
  }));
  expect(() => store.setState({ bump: () => undefined } as any)).toThrow(
    "Unknown state key 'bump'"
  );
  expect(store.getPureState()).toEqual({ count: 0 });
  store.destroy();
});

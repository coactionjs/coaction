import { create } from 'coaction';
import { adapt, atom, bindJotai, createStore } from '@coaction/jotai';
import {
  adapt as adaptRedux,
  bindRedux,
  configureStore,
  createSlice,
  withCoactionReducer
} from '@coaction/redux';
import { adapt as adaptValtio, bindValtio, proxy } from '@coaction/valtio';
import {
  adapt as adaptXState,
  assign,
  bindXState,
  createActor,
  createMachine
} from '@coaction/xstate';

export type AdapterDemo = {
  id: string;
  title: string;
  sourceLabel: string;
  getCount: () => number;
  incrementViaCoaction: () => void;
  incrementViaSource: () => void;
  subscribe: (listener: () => void) => () => void;
  destroy: () => void;
};

export const createReduxDemo = (): AdapterDemo => {
  const counterSlice = createSlice({
    name: 'counter',
    initialState: {
      count: 0
    },
    reducers: {
      increment(state) {
        state.count += 1;
      }
    }
  });
  const reduxStore = configureStore({
    reducer: withCoactionReducer(counterSlice.reducer)
  });
  const store = create(() => adaptRedux(bindRedux(reduxStore)), {
    name: 'adapters-redux'
  });

  return {
    id: 'redux',
    title: 'Redux Toolkit',
    sourceLabel: 'Redux dispatch',
    getCount: () => store.getState().count,
    incrementViaCoaction: () => {
      store.getState().dispatch(counterSlice.actions.increment());
    },
    incrementViaSource: () => {
      reduxStore.dispatch(counterSlice.actions.increment());
    },
    subscribe: store.subscribe,
    destroy: store.destroy
  };
};

export const createJotaiDemo = (): AdapterDemo => {
  const countAtom = atom(0);
  const jotaiStore = createStore();
  const store = create(
    () =>
      adapt(
        bindJotai({
          store: jotaiStore,
          atoms: {
            count: countAtom
          },
          actions: ({ store: atomStore, atoms }) => ({
            increment() {
              atomStore.set(atoms.count, atomStore.get(atoms.count) + 1);
            }
          })
        })
      ),
    {
      name: 'adapters-jotai'
    }
  );

  return {
    id: 'jotai',
    title: 'Jotai',
    sourceLabel: 'Atom write',
    getCount: () => store.getState().count,
    incrementViaCoaction: () => {
      store.getState().increment();
    },
    incrementViaSource: () => {
      jotaiStore.set(countAtom, jotaiStore.get(countAtom) + 1);
    },
    subscribe: store.subscribe,
    destroy: store.destroy
  };
};

export const createValtioDemo = (): AdapterDemo => {
  const source = proxy(
    bindValtio({
      count: 0,
      increment() {
        this.count += 1;
      }
    })
  );
  const store = create(() => adaptValtio(source), {
    name: 'adapters-valtio'
  });

  return {
    id: 'valtio',
    title: 'Valtio',
    sourceLabel: 'Proxy mutation',
    getCount: () => store.getState().count,
    incrementViaCoaction: () => {
      store.getState().increment();
    },
    incrementViaSource: () => {
      source.increment();
    },
    subscribe: store.subscribe,
    destroy: store.destroy
  };
};

export const createXStateDemo = (): AdapterDemo => {
  const machine = createMachine({
    context: {
      count: 0
    },
    on: {
      increment: {
        actions: assign({
          count: ({ context }) => context.count + 1
        })
      }
    }
  });
  const actor = createActor(machine);
  actor.start();
  const store = create(() => adaptXState(bindXState(actor)), {
    name: 'adapters-xstate'
  });

  return {
    id: 'xstate',
    title: 'XState',
    sourceLabel: 'Actor event',
    getCount: () => store.getState().count,
    incrementViaCoaction: () => {
      store.getState().send({
        type: 'increment'
      });
    },
    incrementViaSource: () => {
      actor.send({
        type: 'increment'
      });
    },
    subscribe: store.subscribe,
    destroy: () => {
      actor.stop();
      store.destroy();
    }
  };
};

export const createAdapterDemos = () => [
  createReduxDemo(),
  createJotaiDemo(),
  createValtioDemo(),
  createXStateDemo()
];

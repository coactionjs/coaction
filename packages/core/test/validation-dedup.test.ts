import { vi } from 'vitest';
import { createStore } from '../src/storeFactory';

const createValidationStore = (withPatchHook = false) => {
  const validatePatches = vi.fn();
  const validateState = vi.fn();
  const patch = vi.fn((value) => value);
  const { store } = createStore(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: withPatchHook
        ? [
            (middlewareStore) => {
              middlewareStore.patch = patch;
              return middlewareStore;
            }
          ]
        : []
    },
    {
      share: 'main',
      validatePatches,
      validateState
    }
  );
  validatePatches.mockClear();
  validateState.mockClear();
  return { patch, store, validatePatches, validateState };
};

test('native shared updates validate each committed representation once', () => {
  const { store, validatePatches, validateState } = createValidationStore();

  store.getState().increment();

  expect(store.getState().count).toBe(1);
  expect(validatePatches).toHaveBeenCalledTimes(1);
  expect(validateState).toHaveBeenCalledTimes(1);

  validatePatches.mockClear();
  validateState.mockClear();
  store.setState({ count: 2 });

  expect(store.getState().count).toBe(2);
  expect(validatePatches).toHaveBeenCalledTimes(1);
  expect(validateState).toHaveBeenCalledTimes(2);
});

test('patch-hook updates validate both pre-hook and transformed state boundaries', () => {
  const { patch, store, validatePatches, validateState } =
    createValidationStore(true);

  store.getState().increment();

  expect(store.getState().count).toBe(1);
  expect(patch).toHaveBeenCalledTimes(1);
  expect(validatePatches).toHaveBeenCalledTimes(1);
  expect(validateState).toHaveBeenCalledTimes(2);
});

test('public apply keeps the full untrusted patch validation path', () => {
  const { store, validatePatches, validateState } = createValidationStore();

  store.apply(store.getPureState(), [
    {
      op: 'replace',
      path: ['count'],
      value: 1
    }
  ]);

  expect(store.getState().count).toBe(1);
  expect(validatePatches).toHaveBeenCalledTimes(1);
  expect(validateState).toHaveBeenCalledTimes(1);
});

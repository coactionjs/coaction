import * as core from '../src';
import * as adapter from '../adapter';
import * as local from '../local';
import * as shared from '../shared';
import { create } from '../src/create';
import { createLocal } from '../src/createLocal';

test('re-exports runtime APIs from package entry', () => {
  expect(core.create).toBe(create);
  expect(shared.create).toBeInstanceOf(Function);
  expect(local.create).not.toBe(create);
  expect(adapter.createBinder).toBeInstanceOf(Function);
  expect(adapter.defineExternalStoreAdapter).toBeInstanceOf(Function);
  expect(adapter.createReactiveTracker).toBeInstanceOf(Function);
  expect(adapter.wrapStore).toBeInstanceOf(Function);
  expect(core.signal).toBeInstanceOf(Function);
  expect(core.computed).toBeInstanceOf(Function);
  expect(core.effect).toBeInstanceOf(Function);
  expect(core.trigger).toBeInstanceOf(Function);
});

test('local entry creates local stores and rejects shared options', () => {
  const store = local.create(() => ({ count: 0 }));
  const directStore = createLocal(() => ({ count: 1 }));
  expect(store.share).toBe(false);
  expect(store.getState().count).toBe(0);
  expect(directStore.getState().count).toBe(1);

  expect(() =>
    createLocal(() => ({ count: 0 }), {
      transport: {}
    } as any)
  ).toThrow("Option 'transport' requires the coaction/shared entry point.");
});

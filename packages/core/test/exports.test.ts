import * as core from '../src';
import * as adapter from '../adapter';
import * as local from '../local';
import * as shared from '../shared';
import { create } from '../src/create';
import { createBinder, defineExternalStoreAdapter } from '../src/binder';
import { createReactiveTracker } from '../src/reactiveTracker';
import { wrapStore } from '../src/wrapStore';

test('re-exports runtime APIs from package entry', () => {
  expect(core.create).toBe(create);
  expect(shared.create).toBe(create);
  expect(local.create).not.toBe(create);
  expect(adapter.createBinder).toBe(createBinder);
  expect(adapter.defineExternalStoreAdapter).toBe(defineExternalStoreAdapter);
  expect(adapter.createReactiveTracker).toBe(createReactiveTracker);
  expect(adapter.wrapStore).toBe(wrapStore);
  expect(core.signal).toBeInstanceOf(Function);
  expect(core.computed).toBeInstanceOf(Function);
  expect(core.effect).toBeInstanceOf(Function);
  expect(core.trigger).toBeInstanceOf(Function);
});

test('local entry creates local stores and rejects shared options', () => {
  const store = local.create(() => ({ count: 0 }));
  expect(store.share).toBe(false);
  expect(store.getState().count).toBe(0);

  expect(() =>
    local.create(() => ({ count: 0 }), {
      transport: {}
    } as any)
  ).toThrow("Option 'transport' requires the coaction/shared entry point.");
});

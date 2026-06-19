import * as core from '../src';
import { create } from '../src/create';
import { createBinder, defineExternalStoreAdapter } from '../src/binder';
import { createReactiveTracker } from '../src/reactiveTracker';
import { wrapStore } from '../src/wrapStore';

test('re-exports runtime APIs from package entry', () => {
  expect(core.create).toBe(create);
  expect(core.createBinder).toBe(createBinder);
  expect(core.defineExternalStoreAdapter).toBe(defineExternalStoreAdapter);
  expect(core.createReactiveTracker).toBe(createReactiveTracker);
  expect(core.wrapStore).toBe(wrapStore);
  expect(core.signal).toBeInstanceOf(Function);
  expect(core.computed).toBeInstanceOf(Function);
  expect(core.effect).toBeInstanceOf(Function);
  expect(core.trigger).toBeInstanceOf(Function);
});

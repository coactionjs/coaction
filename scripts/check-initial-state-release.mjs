#!/usr/bin/env node
/**
 * GC check against the published runtime: a store keeps its own copy of the
 * initial data, and `getInitialState()` reads that copy, so the object its
 * factory returned is not kept alive beside it.
 */
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { create } from '../packages/core/dist/index.mjs';

assert.equal(typeof global.gc, 'function', 'Run with node --expose-gc');

const rows = () => Array.from({ length: 100 }, (_, id) => ({ id }));

// The factory hands its data out through `made`, and nothing else holds it.
const setup = (sliced) => {
  let made;
  const factory = () => {
    made = { rows: rows() };
    return {
      data: made,
      read() {
        return 1;
      }
    };
  };
  const store = sliced
    ? create({ slice: factory }, { sliceMode: 'slices' })
    : create(factory);
  const reference = new WeakRef(made);
  made = undefined;
  return { sliced, store, reference };
};

const held = [setup(false), setup(true)];
for (let i = 0; i < 20; i++) {
  await setImmediate();
  global.gc();
}
for (const { sliced, store, reference } of held) {
  const name = sliced ? 'slice store' : 'store';
  assert.equal(
    reference.deref(),
    undefined,
    `${name} keeps its factory's data`
  );
  const initial = sliced
    ? store.getInitialState().slice
    : store.getInitialState();
  assert.deepEqual(initial.data, { rows: rows() });
  assert.equal(initial.read(), 1);
  store.destroy();
}
console.log(
  "Stores read their initial state from their own root and release their factory's data."
);

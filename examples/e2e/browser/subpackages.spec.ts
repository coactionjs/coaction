import { expect, test, type Page } from '@playwright/test';

const harnessPath = '/examples/e2e/browser/index.html';

const gotoHarness = async (page: Page) => {
  await page.goto(harnessPath);
  await expect(page.locator('#status')).toHaveText('ready');
};

test('subpackage examples run in a real browser bundle', async ({ page }) => {
  await gotoHarness(page);

  const result = await page.evaluate(() =>
    window.__subpackageHarness.runAllExamples()
  );

  expect(result.core).toEqual({
    before: 0,
    after: 1
  });
  expect(result.logger.count).toBe(1);
  expect(result.logger.eventCount).toBeGreaterThan(0);
  expect(result.history).toEqual({
    afterIncrement: 2,
    undone: true,
    afterUndo: 1,
    redone: true,
    afterRedo: 2,
    canUndo: true,
    canRedo: false
  });
  expect(result.persist).toEqual({
    count: 1,
    persistedCount: 1
  });
  expect(result.jotai).toEqual({
    countAfterCoactionIncrement: 1,
    atomCountAfterCoactionIncrement: 1,
    countAfterAtomWrite: 4,
    atomCountAfterAtomWrite: 4
  });
  expect(result.mobx).toEqual({
    count: 1,
    double: 2
  });
  expect(result.ng).toEqual({
    count: 1,
    double: 2
  });
  expect(result.pinia).toEqual({
    afterCoactionIncrement: 1,
    afterPiniaIncrement: 2,
    afterPiniaStateWrite: 7,
    finalCoactionCount: 10,
    finalPiniaCount: 10
  });
  expect(result.react).toEqual({
    before: 0,
    after: 1
  });
  expect(result.redux).toEqual({
    afterCoactionDispatch: 1,
    afterReduxDispatch: 2,
    finalCoactionCount: 10,
    finalReduxCount: 10
  });
  expect(result.solid).toEqual({
    before: 0,
    after: 1
  });
  expect(result.svelte).toEqual({
    count: 1,
    selectedValues: [0, 1]
  });
  expect(result.valtio).toEqual({
    afterCoactionIncrement: 1,
    afterSourceIncrement: 2,
    finalCoactionCount: 10,
    finalSourceCount: 10
  });
  expect(result.vue).toEqual({
    count: 1,
    double: 2
  });
  expect(result.xstate).toEqual({
    afterCoactionSend: 1,
    afterActorSend: 2
  });
  expect(result.yjs).toEqual({
    countAfterLocalIncrement: 1,
    syncedCountFromLocalIncrement: 1,
    countAfterRemoteWrite: 6
  });
  expect(result.zustand).toEqual({
    afterCoactionIncrement: 1,
    afterZustandWrite: 7,
    finalCoactionCount: 10,
    finalZustandCount: 10
  });
});

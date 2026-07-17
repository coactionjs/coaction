import { expect, test, type Page } from '@playwright/test';

const harnessPath = '/examples/e2e/browser/index.html';

const createScenarioName = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const gotoHarness = async (page: Page) => {
  await page.goto(harnessPath);
  await expect(page.locator('#status')).toHaveText('ready');
};

const connectWorker = (
  page: Page,
  kind: 'shared' | 'web',
  name: string,
  expectedCount?: number
) =>
  page.evaluate(
    ({ kind, name, expectedCount: nextExpectedCount }) =>
      window.__mobxWorkerHarness.connect({
        kind,
        name,
        expectedCount: nextExpectedCount
      }),
    { kind, name, expectedCount }
  );

const addInWorker = (
  page: Page,
  kind: 'shared' | 'web',
  name: string,
  step = 1
) =>
  page.evaluate(
    ({ kind, name, step: nextStep }) =>
      window.__mobxWorkerHarness.add({
        kind,
        name,
        step: nextStep
      }),
    { kind, name, step }
  );

const addAsyncInWorker = (
  page: Page,
  kind: 'shared' | 'web',
  name: string,
  step = 1
) =>
  page.evaluate(
    ({ kind, name, step: nextStep }) =>
      window.__mobxWorkerHarness.addAsync({
        kind,
        name,
        step: nextStep
      }),
    { kind, name, step }
  );

const failInWorker = (
  page: Page,
  kind: 'shared' | 'web',
  name: string,
  message: string
) =>
  page.evaluate(
    ({ kind, name, message: nextMessage }) =>
      window.__mobxWorkerHarness.fail({
        kind,
        name,
        message: nextMessage
      }),
    { kind, name, message }
  );

const waitForWorkerCount = (
  page: Page,
  kind: 'shared' | 'web',
  name: string,
  expectedCount: number
) =>
  page.evaluate(
    ({ kind, name, expectedCount }) =>
      window.__mobxWorkerHarness.waitForCount({
        kind,
        name,
        expectedCount
      }),
    { kind, name, expectedCount }
  );

const disconnectWorker = (page: Page, kind: 'shared' | 'web', name: string) =>
  page.evaluate(
    ({ kind, name }) =>
      window.__mobxWorkerHarness.disconnect({
        kind,
        name
      }),
    { kind, name }
  );

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    if ('__mobxWorkerHarness' in window) {
      await window.__mobxWorkerHarness.disconnectAll();
    }
  });
});

test('mobx shared worker: cross-page sync reaches the bound observable', async ({
  browser
}) => {
  const name = createScenarioName('mobx-shared-sync');
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await gotoHarness(pageA);
  await gotoHarness(pageB);

  await connectWorker(pageA, 'shared', name, 0);
  await addInWorker(pageA, 'shared', name, 2);

  const pageBInitial = await connectWorker(pageB, 'shared', name, 2);
  expect(pageBInitial.count).toBe(2);
  // Unique to a binder adapter: the underlying mobx observable itself (not
  // just coaction's snapshot) must reflect the value synced from the worker.
  expect(pageBInitial.underlyingCount).toBe(2);

  await addInWorker(pageB, 'shared', name, 1);

  const pageAObserved = await waitForWorkerCount(pageA, 'shared', name, 3);
  expect(pageAObserved.count).toBe(3);
  expect(pageAObserved.underlyingCount).toBe(3);

  await disconnectWorker(pageB, 'shared', name);

  const pageAAfterDisconnect = await addInWorker(pageA, 'shared', name, 2);
  expect(pageAAfterDisconnect).toEqual({
    result: 5,
    count: 5
  });

  const reconnectPage = await context.newPage();
  await gotoHarness(reconnectPage);
  const reconnected = await connectWorker(reconnectPage, 'shared', name, 5);
  expect(reconnected.count).toBe(5);
  expect(reconnected.underlyingCount).toBe(5);

  await reconnectPage.evaluate(async () => {
    await window.__mobxWorkerHarness.disconnectAll();
  });
  await context.close();
});

test('mobx web worker: async action + error redaction through the promise-returning proxy', async ({
  page
}) => {
  const name = createScenarioName('mobx-web-actions');
  const secretMessage = 'mobx-worker-error';
  await gotoHarness(page);

  await connectWorker(page, 'web', name, 0);

  const syncResult = await addInWorker(page, 'web', name, 1);
  expect(syncResult).toEqual({
    result: 1,
    count: 1
  });

  const asyncResult = await addAsyncInWorker(page, 'web', name, 2);
  expect(asyncResult).toEqual({
    result: 5,
    count: 5
  });

  const errorResult = await failInWorker(page, 'web', name, secretMessage);
  expect(errorResult.message).toBe('Remote action failed');
  expect(errorResult.message).not.toContain(secretMessage);
});

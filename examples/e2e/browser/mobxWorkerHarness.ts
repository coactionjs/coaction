import { create, type AsyncStore } from '../../../packages/core/src/index';
import {
  createMobxWorkerCounter,
  type MobxWorkerCounterState
} from './mobxWorkerCounter';

type WorkerKind = 'shared' | 'web';

type WorkerConnectOptions = {
  kind: WorkerKind;
  name: string;
  expectedCount?: number;
};

type WorkerActionOptions = WorkerConnectOptions & {
  step?: number;
};

type WorkerErrorOptions = WorkerConnectOptions & {
  message?: string;
};

type WorkerClient = {
  kind: WorkerKind;
  name: string;
  store: AsyncStore<MobxWorkerCounterState>;
  mobxState: MobxWorkerCounterState;
  worker: SharedWorker | Worker;
};

export type WorkerScenarioResult = {
  count: number;
  underlyingCount: number;
};

export type WorkerActionResult = {
  result: number;
  count: number;
};

export type WorkerErrorResult = {
  message: string;
};

export type MobxWorkerHarness = {
  connect: (options: WorkerConnectOptions) => Promise<WorkerScenarioResult>;
  add: (options: WorkerActionOptions) => Promise<WorkerActionResult>;
  addAsync: (options: WorkerActionOptions) => Promise<WorkerActionResult>;
  fail: (options: WorkerErrorOptions) => Promise<WorkerErrorResult>;
  read: (options: WorkerConnectOptions) => Promise<WorkerScenarioResult>;
  waitForCount: (
    options: WorkerConnectOptions
  ) => Promise<WorkerScenarioResult>;
  disconnect: (options: WorkerConnectOptions) => Promise<boolean>;
  disconnectAll: () => Promise<void>;
};

const clients = new Map<string, WorkerClient>();

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 3000,
  intervalMs = 20
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await wait(intervalMs);
  }
  throw new Error('Timed out waiting for mobx worker scenario condition.');
};

const getClientKey = ({ kind, name }: WorkerConnectOptions) =>
  `${kind}:${name}`;

const getWorkerUrl = (name: string) => {
  const url = new URL('./mobx.worker.ts', import.meta.url);
  url.searchParams.set('name', name);
  return url;
};

const disposeClient = (client: WorkerClient) => {
  client.store.destroy();
  if (client.worker instanceof Worker) {
    client.worker.terminate();
    return;
  }
  client.worker.port.close();
};

const ensureClient = async (
  options: WorkerConnectOptions
): Promise<WorkerClient> => {
  const key = getClientKey(options);
  const existing = clients.get(key);
  if (existing) {
    return existing;
  }
  const workerUrl = getWorkerUrl(options.name);
  const worker =
    options.kind === 'shared'
      ? new SharedWorker(workerUrl, {
          type: 'module',
          name: options.name
        })
      : new Worker(workerUrl, {
          type: 'module',
          name: options.name
        });
  const { factory, getInstance } = createMobxWorkerCounter();
  const store = create<MobxWorkerCounterState>(factory, {
    name: options.name,
    worker
  });
  const mobxState = getInstance();
  if (!mobxState) {
    throw new Error('mobx worker counter factory did not run synchronously.');
  }
  const client: WorkerClient = {
    kind: options.kind,
    name: options.name,
    store,
    mobxState,
    worker
  };
  clients.set(key, client);
  return client;
};

const readCount = (client: WorkerClient) => client.store.getState().count;
// The read path that's unique to a binder adapter: the underlying mobx
// observable itself must reflect the synced value too, not just coaction's
// snapshot.
const readUnderlyingCount = (client: WorkerClient) => client.mobxState.count;

const readResult = (client: WorkerClient): WorkerScenarioResult => ({
  count: readCount(client),
  underlyingCount: readUnderlyingCount(client)
});

const connect = async (
  options: WorkerConnectOptions
): Promise<WorkerScenarioResult> => {
  const client = await ensureClient(options);
  await client.store.getState().add(0);
  if (typeof options.expectedCount === 'number') {
    await waitFor(() => readCount(client) === options.expectedCount);
  }
  return readResult(client);
};

const add = async (
  options: WorkerActionOptions
): Promise<WorkerActionResult> => {
  const client = await ensureClient(options);
  const result = await client.store.getState().add(options.step);
  return {
    result,
    count: readCount(client)
  };
};

const addAsync = async (
  options: WorkerActionOptions
): Promise<WorkerActionResult> => {
  const client = await ensureClient(options);
  const result = await client.store.getState().addAsync(options.step);
  await waitFor(() => readCount(client) === result);
  return {
    result,
    count: readCount(client)
  };
};

const fail = async (
  options: WorkerErrorOptions
): Promise<WorkerErrorResult> => {
  const client = await ensureClient(options);
  try {
    await client.store.getState().fail(options.message);
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error)
    };
  }
  throw new Error('Expected mobx worker action to fail.');
};

const read = async (
  options: WorkerConnectOptions
): Promise<WorkerScenarioResult> => {
  const client = await ensureClient(options);
  return readResult(client);
};

const waitForCount = async (
  options: WorkerConnectOptions
): Promise<WorkerScenarioResult> => {
  const client = await ensureClient(options);
  if (typeof options.expectedCount !== 'number') {
    throw new Error('expectedCount is required');
  }
  await waitFor(() => readCount(client) === options.expectedCount);
  await waitFor(() => readUnderlyingCount(client) === options.expectedCount);
  return readResult(client);
};

const disconnect = async (options: WorkerConnectOptions) => {
  const key = getClientKey(options);
  const client = clients.get(key);
  if (!client) {
    return false;
  }
  clients.delete(key);
  disposeClient(client);
  return true;
};

const disconnectAll = async () => {
  for (const client of clients.values()) {
    disposeClient(client);
  }
  clients.clear();
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void disconnectAll();
  });
}

export const createMobxWorkerHarness = (): MobxWorkerHarness => ({
  connect,
  add,
  addAsync,
  fail,
  read,
  waitForCount,
  disconnect,
  disconnectAll
});

import { create } from '../../../packages/coaction-svelte/src/index';
import type { StoreWithAsyncFunction } from '../../../packages/coaction-svelte/src/index';
import { workerCounter, type WorkerCounterState } from './workerCounter';

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
  useStore: StoreWithAsyncFunction<WorkerCounterState>;
  worker: SharedWorker | Worker;
  unsubscribe: () => void;
  log: number[];
};

export type WorkerScenarioResult = {
  count: number;
  log: number[];
};

export type WorkerActionResult = {
  result: number;
  count: number;
};

export type WorkerErrorResult = {
  message: string;
};

export type SvelteWorkerHarness = {
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
  throw new Error('Timed out waiting for svelte worker scenario condition.');
};

const getClientKey = ({ kind, name }: WorkerConnectOptions) =>
  `${kind}:${name}`;

const getWorkerUrl = (name: string) => {
  const url = new URL('./counter.worker.ts', import.meta.url);
  url.searchParams.set('name', name);
  return url;
};

const disposeClient = (client: WorkerClient) => {
  client.unsubscribe();
  client.useStore.destroy();
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
  const useStore = create<WorkerCounterState>(workerCounter, {
    name: options.name,
    worker
  });
  const log: number[] = [];
  // Svelte's store contract: subscribe fires synchronously with the current
  // value, then again on every subsequent update.
  const unsubscribe = useStore((state) => state.count).subscribe((value) => {
    log.push(value);
  });
  const client: WorkerClient = {
    kind: options.kind,
    name: options.name,
    useStore,
    worker,
    unsubscribe,
    log
  };
  clients.set(key, client);
  return client;
};

const readCount = (client: WorkerClient) =>
  client.log[client.log.length - 1] ?? 0;
const readResult = (client: WorkerClient): WorkerScenarioResult => ({
  count: readCount(client),
  log: [...client.log]
});

const connect = async (
  options: WorkerConnectOptions
): Promise<WorkerScenarioResult> => {
  const client = await ensureClient(options);
  await client.useStore.getState().add(0);
  if (typeof options.expectedCount === 'number') {
    await waitFor(() => readCount(client) === options.expectedCount);
  }
  return readResult(client);
};

const add = async (
  options: WorkerActionOptions
): Promise<WorkerActionResult> => {
  const client = await ensureClient(options);
  const result = await client.useStore.getState().add(options.step);
  return {
    result,
    count: readCount(client)
  };
};

const addAsync = async (
  options: WorkerActionOptions
): Promise<WorkerActionResult> => {
  const client = await ensureClient(options);
  const result = await client.useStore.getState().addAsync(options.step);
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
    await client.useStore.getState().fail(options.message);
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error)
    };
  }
  throw new Error('Expected svelte worker action to fail.');
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

export const createSvelteWorkerHarness = (): SvelteWorkerHarness => ({
  connect,
  add,
  addAsync,
  fail,
  read,
  waitForCount,
  disconnect,
  disconnectAll
});

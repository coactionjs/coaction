import { create } from '../../../packages/core/src/index';
import { createJotaiWorkerCounter } from './jotaiWorkerCounter';

const workerUrl = new URL(globalThis.location.href);
const storeName =
  workerUrl.searchParams.get('name') ?? 'browser-worker-e2e-jotai';

const { factory } = createJotaiWorkerCounter();

create(factory, {
  name: storeName
});

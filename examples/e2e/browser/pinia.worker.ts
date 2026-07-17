import { create } from '../../../packages/core/src/index';
import { createPiniaWorkerCounter } from './piniaWorkerCounter';

const workerUrl = new URL(globalThis.location.href);
const storeName =
  workerUrl.searchParams.get('name') ?? 'browser-worker-e2e-pinia';

const { factory } = createPiniaWorkerCounter(storeName);

create(factory, {
  name: storeName
});

import { create } from '../../../packages/core/src/index';
import { createMobxWorkerCounter } from './mobxWorkerCounter';

const workerUrl = new URL(globalThis.location.href);
const storeName =
  workerUrl.searchParams.get('name') ?? 'browser-worker-e2e-mobx';

const { factory } = createMobxWorkerCounter();

create(factory, {
  name: storeName
});

import { create } from '../../../packages/core/src/index';
import { adapt } from '../../../packages/coaction-valtio/src/index';
import {
  createValtioCounterStore,
  type ValtioWorkerCounterState
} from './valtioWorkerCounter';

const workerUrl = new URL(globalThis.location.href);
const storeName =
  workerUrl.searchParams.get('name') ?? 'browser-worker-e2e-valtio';

create<ValtioWorkerCounterState>(() => adapt(createValtioCounterStore()), {
  name: storeName
});

import { create } from '../../../packages/core/src/index';
import {
  createZustandCounterStore,
  type ZustandWorkerCounterState
} from './zustandWorkerCounter';
import { adapt } from '../../../packages/coaction-zustand/src/index';

const workerUrl = new URL(globalThis.location.href);
const storeName =
  workerUrl.searchParams.get('name') ?? 'browser-worker-e2e-zustand';

create<ZustandWorkerCounterState>(() => adapt(createZustandCounterStore()), {
  name: storeName
});

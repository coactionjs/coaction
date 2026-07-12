import { createAsyncClientStore } from './asyncClientStore';
import { WorkerType } from './constant';
import { createClientAction } from './getRawStateClientAction';
import { handleMainTransport } from './handleMainTransport';
import type {
  ClientStoreOptions,
  CreateState,
  Creator,
  Slice,
  StoreOptions
} from './interface';
import {
  validateSharedActionPaths,
  validateSharedStateSerializable
} from './sharedState';
import { createStore } from './storeFactory';
import { wrapStore } from './wrapStore';

const isMainWorkerType = (
  workerType:
    | StoreOptions<any>['workerType']
    | ClientStoreOptions<any>['workerType']
    | null
) =>
  workerType === 'SharedWorkerInternal' || workerType === 'WebWorkerInternal';

const isClientWorkerType = (
  workerType:
    | StoreOptions<any>['workerType']
    | ClientStoreOptions<any>['workerType']
    | null
) => workerType === 'SharedWorkerClient' || workerType === 'WebWorkerClient';

const validateCreateModeOptions = <T extends CreateState>(
  options: StoreOptions<T> | ClientStoreOptions<T>
) => {
  const storeTransport = (options as StoreOptions<T>).transport;
  const clientTransport = (options as ClientStoreOptions<T>).clientTransport;
  const worker = (options as ClientStoreOptions<T>).worker;
  const explicitWorkerType = options.workerType;

  if (storeTransport && clientTransport) {
    throw new Error(
      'transport and clientTransport cannot be used together, please use one authority model per store.'
    );
  }
  if (storeTransport && worker) {
    throw new Error(
      'transport and worker cannot be used together, please use one authority model per store.'
    );
  }
  if (clientTransport && worker) {
    throw new Error(
      'clientTransport and worker cannot be used together, please use one client transport source.'
    );
  }
  if (isMainWorkerType(explicitWorkerType) && (clientTransport || worker)) {
    throw new Error(
      'main workerType cannot be combined with client transport settings.'
    );
  }
  if (isClientWorkerType(explicitWorkerType) && storeTransport) {
    throw new Error('client workerType cannot be combined with transport.');
  }
};

/**
 * Create a local store, the main side of a shared store, or a client mirror of
 * a shared store.
 *
 * @remarks
 * Prefer the static `coaction/local` entry when transport support is not
 * required. It excludes the JSON protocol and reconnect runtime from the
 * consumer dependency graph.
 */
export const create: Creator = <T extends CreateState>(
  createState: Slice<T> | T,
  options: StoreOptions<T> | ClientStoreOptions<T> = {}
) => {
  const checkEnablePatches =
    Object.hasOwnProperty.call(options, 'enablePatches') &&
    !(options as StoreOptions<T>).enablePatches;
  validateCreateModeOptions(options);
  const workerType = options.workerType ?? WorkerType;
  const storeTransport = (options as StoreOptions<T>).transport;
  const share =
    isMainWorkerType(workerType) || storeTransport ? 'main' : undefined;
  const buildStore = ({ share }: { share?: 'client' | 'main' }) =>
    createStore(createState, options, {
      share,
      clientAction: share === 'client' ? createClientAction : undefined,
      collectActionPaths:
        share === 'main' ? validateSharedActionPaths : undefined,
      validateState: share ? validateSharedStateSerializable : undefined
    });

  if (
    (options as ClientStoreOptions<T>).clientTransport ||
    (options as ClientStoreOptions<T>).worker ||
    isClientWorkerType(options.workerType)
  ) {
    if (checkEnablePatches) {
      throw new Error('enablePatches: true is required for the async store');
    }
    return wrapStore(
      createAsyncClientStore(buildStore, options as ClientStoreOptions<T>)
    );
  }

  const { store, internal } = buildStore({ share });
  handleMainTransport(
    store,
    internal,
    storeTransport,
    workerType,
    checkEnablePatches,
    (options as StoreOptions<T>).transportPolicy
  );
  return wrapStore(store);
};

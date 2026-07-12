import type {
  CreateState,
  LocalCreator,
  LocalStoreOptions,
  Slice
} from './interface';
import { markStoreReady } from './lifecycle';
import { createStore } from './storeFactory';
import { wrapStore } from './wrapStore';

/**
 * Create a store without linking the shared transport runtime.
 *
 * @remarks
 * The public `coaction/local` entry exports this implementation as `create`.
 * `createLocal` is only its internal and documentation name; it is not
 * exported by the root `coaction` entry.
 */
export const createLocal: LocalCreator = <T extends CreateState>(
  createState: Slice<T> | T,
  options: LocalStoreOptions<T> = {}
) => {
  for (const key of [
    'clientTransport',
    'executeSyncTimeoutMs',
    'transport',
    'transportPolicy',
    'worker',
    'workerType'
  ]) {
    if (Object.hasOwnProperty.call(options, key)) {
      throw new Error(
        `Option '${key}' requires the coaction/shared entry point.`
      );
    }
  }
  const { store, internal } = createStore(createState, options);
  try {
    markStoreReady(store);
    internal.assertAlive?.('store initialization');
  } catch (error) {
    try {
      store.destroy();
    } catch (destroyError) {
      if (process.env.NODE_ENV === 'development') {
        console.error(destroyError);
      }
    }
    throw error;
  }
  return wrapStore(store);
};

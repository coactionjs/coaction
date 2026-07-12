import type {
  CreateState,
  LocalCreator,
  LocalStoreOptions,
  Slice
} from './interface';
import { createStore } from './storeFactory';
import { wrapStore } from './wrapStore';

/** Create a store without linking the shared transport runtime. */
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
  return wrapStore(createStore(createState, options).store);
};

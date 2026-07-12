import type { CreateState, MiddlewareStore } from './interface';
import type { Internal } from './internal';
import {
  decodeExecuteResponse,
  encodeExecuteRequest
} from './transportProtocol';
import { uuid } from './utils';

type CreateClientActionOptions<T extends CreateState> = {
  clientExecuteSyncTimeoutMs: number;
  internal: Internal<T>;
  key: string;
  store: MiddlewareStore<T>;
  sliceKey?: PropertyKey;
};

export const createClientAction = <T extends CreateState>({
  clientExecuteSyncTimeoutMs,
  internal,
  key,
  store,
  sliceKey
}: CreateClientActionOptions<T>) => {
  return (...args: unknown[]) => {
    internal.assertAlive?.(`action ${key}`);
    let actionId: string | undefined;
    let done: ((result: unknown) => void) | undefined;
    if (store.trace) {
      actionId = uuid();
      store.trace({ method: key, parameters: args, id: actionId, sliceKey });
      done = (result) => {
        store.trace!({ method: key, id: actionId!, result, sliceKey });
      };
    }
    const traceAction = <R>(run: () => R): R => {
      try {
        const result = run();
        if (result instanceof Promise) {
          return result.then(
            (value) => {
              done?.(value);
              return value;
            },
            (error) => {
              done?.(error);
              throw error;
            }
          ) as R;
        }
        done?.(result);
        return result;
      } catch (error) {
        done?.(error);
        throw error;
      }
    };

    if (typeof sliceKey === 'symbol') {
      throw new Error(
        'Symbol-keyed slice actions are not supported in client store mode.'
      );
    }
    const action =
      typeof sliceKey === 'undefined' ? [key] : [String(sliceKey), key];
    const encoded = encodeExecuteRequest(action, args);

    return traceAction(() => {
      const emitted = store.transport!.emit('execute', encoded);
      const pending = internal.awaitClientTransport
        ? internal.awaitClientTransport(emitted)
        : emitted;
      return pending.then(async (payload) => {
        const response = decodeExecuteResponse(payload);
        internal.assertAlive?.(`action ${key}`);
        const syncClientState = internal.syncClientState;
        if (!syncClientState) {
          throw new Error('Client fullSync is not available');
        }

        if (response.epoch !== internal.transportEpoch) {
          await syncClientState(response.epoch, response.sequence);
          internal.assertAlive?.(`action ${key}`);
        } else if (response.sequence > internal.sequence) {
          await new Promise<void>((resolve, reject) => {
            let settled = false;
            let unsubscribe = () => {};
            let timeout: ReturnType<typeof setTimeout> | undefined;
            const cancel = () =>
              finish(new Error('Client transport was destroyed'));
            const finish = (error?: unknown) => {
              if (settled) {
                return;
              }
              settled = true;
              unsubscribe();
              internal.destroyCallbacks?.delete(cancel);
              if (timeout) {
                clearTimeout(timeout);
              }
              if (typeof error === 'undefined') {
                resolve();
              } else {
                reject(error);
              }
            };
            unsubscribe = store.subscribe(() => {
              if (
                internal.transportEpoch === response.epoch &&
                internal.sequence >= response.sequence
              ) {
                finish();
              }
            });
            internal.destroyCallbacks?.add(cancel);
            timeout = setTimeout(() => {
              void syncClientState(response.epoch, response.sequence).then(
                () => finish(),
                (error) => finish(error)
              );
            }, clientExecuteSyncTimeoutMs);
            if (
              internal.transportEpoch === response.epoch &&
              internal.sequence >= response.sequence
            ) {
              finish();
            }
          });
          internal.assertAlive?.(`action ${key}`);
        }

        if (!response.ok) {
          throw new Error(response.error);
        }
        return response.value;
      });
    });
  };
};

export type ClientActionFactory = typeof createClientAction;

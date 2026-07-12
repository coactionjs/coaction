import { createTransport, type Transport } from 'data-transport';
import type {
  CreateState,
  ExternalEvents,
  InternalEvents,
  Store,
  StoreTransport,
  TransportPolicy,
  TransportPolicyRequest
} from './interface';
import type { Internal } from './internal';
import { emit } from './asyncClientStore';
import { validateSharedStateSerializable } from './sharedState';
import {
  decodeExecuteRequest,
  decodeFullSyncRequest,
  encodeExecuteResponse,
  encodeFullSyncResponse
} from './transportProtocol';
import { isUnsafePathSegment, uuid } from './utils';

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const message = String(error);
  return message || 'Unknown transport error';
};

export const handleMainTransport = <T extends CreateState>(
  store: Store<T>,
  internal: Internal<T>,
  storeTransport?: Transport<{
    emit: InternalEvents;
    listen: ExternalEvents;
  }>,
  workerType?:
    | 'SharedWorkerInternal'
    | 'WebWorkerInternal'
    | 'WebWorkerClient'
    | 'SharedWorkerClient'
    | null,
  checkEnablePatches?: boolean,
  policy?: TransportPolicy
) => {
  const transport: StoreTransport | undefined =
    storeTransport ??
    (workerType === 'SharedWorkerInternal' || workerType === 'WebWorkerInternal'
      ? createTransport(workerType, { prefix: store.name })
      : undefined);
  if (!transport) {
    return;
  }
  if (checkEnablePatches) {
    throw new Error('enablePatches: true is required for the transport');
  }

  const epoch = uuid();
  internal.transportEpoch = epoch;
  let destroyed = false;
  const disposers = new Set<() => void>();
  const registerDisposer = (value: unknown) => {
    if (typeof value === 'function') {
      disposers.add(value as () => void);
    }
  };
  const cleanup = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    const callbacks = [...disposers];
    disposers.clear();
    for (const dispose of callbacks) {
      try {
        dispose();
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error(error);
        }
      }
    }
  };
  const assertActive = () => {
    if (destroyed) {
      throw new Error('Transport request was cancelled after store destroy');
    }
  };

  store.transport = transport;
  internal.emitPatches = (patches) => emit(store, internal, patches);
  internal.destroyCallbacks?.add(cleanup);
  try {
    registerDisposer(
      transport.listen('execute', async (encoded) => {
        try {
          assertActive();
          const request = decodeExecuteRequest(encoded);
          if (
            !internal.sharedActionPaths?.has(JSON.stringify(request.action))
          ) {
            throw new Error('Remote action is not allowed');
          }
          if (
            policy?.allowedActions &&
            !policy.allowedActions.some(
              (allowed) =>
                allowed.length === request.action.length &&
                allowed.every((key, index) => key === request.action[index])
            )
          ) {
            throw new Error('Remote action is not allowed');
          }
          const policyRequest: TransportPolicyRequest = {
            ...request,
            type: 'execute'
          };
          if (
            policy?.authorize &&
            (await policy.authorize(policyRequest)) !== true
          ) {
            throw new Error('Transport request is not authorized');
          }
          assertActive();

          let action: unknown = store.getState();
          let receiver: unknown;
          for (const key of request.action) {
            if (
              isUnsafePathSegment(key) ||
              (typeof action !== 'object' && typeof action !== 'function') ||
              action === null ||
              !Object.prototype.hasOwnProperty.call(action, key)
            ) {
              throw new Error('The function is not found');
            }
            receiver = action;
            action = (action as Record<string, unknown>)[key];
          }
          if (typeof action !== 'function') {
            throw new Error('The function is not found');
          }
          const value = await Reflect.apply(action, receiver, request.args);
          assertActive();
          return encodeExecuteResponse({
            epoch,
            ok: true,
            sequence: internal.sequence,
            ...(typeof value === 'undefined' ? {} : { value })
          });
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error(error);
          }
          return encodeExecuteResponse({
            epoch,
            error: getErrorMessage(error),
            ok: false,
            sequence: internal.sequence
          });
        }
      })
    );

    registerDisposer(
      transport.listen('fullSync', async (encoded) => {
        assertActive();
        decodeFullSyncRequest(encoded);
        if (
          policy?.authorize &&
          (await policy.authorize({ type: 'fullSync' })) !== true
        ) {
          throw new Error('Transport request is not authorized');
        }
        assertActive();
        const state = internal.getTransportState?.() ?? internal.rootState;
        validateSharedStateSerializable(state);
        if (
          typeof state !== 'object' ||
          state === null ||
          Array.isArray(state)
        ) {
          throw new TypeError('Shared store state must be a JSON object');
        }
        return encodeFullSyncResponse({
          epoch,
          sequence: internal.sequence,
          state
        });
      })
    );
  } catch (error) {
    internal.destroyCallbacks?.delete(cleanup);
    cleanup();
    store.transport = undefined;
    try {
      transport.dispose?.();
    } catch (disposeError) {
      if (process.env.NODE_ENV === 'development') {
        console.error(disposeError);
      }
    }
    throw error;
  }
};

import { createTransport } from 'data-transport';
import type { Patches } from 'mutative';
import type {
  ClientTransportOptions,
  CreateState,
  ClientTransport,
  MiddlewareStore
} from './interface';
import type { Internal } from './internal';
import { wrapStore } from './wrapStore';
import { validateSharedStateSerializable } from './sharedState';
import {
  assertSafePatches,
  sanitizePatches,
  sanitizeReplacementState
} from './utils';

const parseFullSyncState = (state: string) => {
  const parsed = JSON.parse(state);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid fullSync payload');
  }
  return sanitizeReplacementState(parsed);
};

const clientApplyErrorMessage =
  'apply() cannot be called in the client store. Client stores are mirrors; use a store method to update the main store instead.';

export const createAsyncClientStore = <T extends CreateState>(
  createStore: (options: { share?: 'client' }) => {
    store: MiddlewareStore<T>;
    internal: Internal<T>;
  },
  asyncStoreClientOption: ClientTransportOptions
) => {
  const { store: asyncClientStore, internal } = createStore({
    share: 'client'
  });
  let isApplyingClientState = false;
  const previousAssertMutationAllowed = internal.assertMutationAllowed;
  internal.assertMutationAllowed = (operation) => {
    if (operation === 'apply' && !isApplyingClientState) {
      throw new Error(clientApplyErrorMessage);
    }
    previousAssertMutationAllowed?.(operation);
  };
  const baseApply = asyncClientStore.apply.bind(asyncClientStore);
  asyncClientStore.apply = (state, patches) => {
    if (!isApplyingClientState) {
      throw new Error(clientApplyErrorMessage);
    }
    return baseApply(state, patches);
  };
  internal.applyClientState = (
    ...args: Parameters<MiddlewareStore<T>['apply']>
  ) => {
    isApplyingClientState = true;
    try {
      baseApply(...args);
    } finally {
      isApplyingClientState = false;
    }
  };
  // the transport is in the worker or shared worker, and the client is in the main thread.
  // This store can't be directly executed by any of the store's methods
  // its methods are proxied to the worker or share worker for execution.
  // and the executed patch is sent to the store to be applied to synchronize the state.
  const isSharedWorker =
    typeof SharedWorker !== 'undefined' &&
    asyncStoreClientOption.worker instanceof SharedWorker;
  const transport: ClientTransport = asyncStoreClientOption.worker
    ? createTransport(
        isSharedWorker ? 'SharedWorkerClient' : 'WebWorkerClient',
        {
          worker: asyncStoreClientOption.worker as SharedWorker,
          prefix: asyncClientStore.name
        }
      )
    : asyncStoreClientOption.clientTransport;
  if (!transport) {
    throw new Error('transport is required');
  }
  asyncClientStore.transport = transport;
  let syncingPromise: Promise<void> | null = null;
  let awaitingReconnectSync = false;
  let reconnectSequenceBaseline: number | null = null;
  const fullSync = async (allowLowerSequence = false) => {
    if (!syncingPromise) {
      syncingPromise = (async () => {
        const latest = await transport.emit('fullSync');
        if (
          typeof latest !== 'object' ||
          latest === null ||
          typeof latest.sequence !== 'number' ||
          typeof latest.state !== 'string'
        ) {
          throw new Error('Invalid fullSync payload');
        }
        const canApplyLowerSequence =
          allowLowerSequence &&
          awaitingReconnectSync &&
          reconnectSequenceBaseline !== null &&
          reconnectSequenceBaseline === internal.sequence;
        if (latest.sequence < internal.sequence && !canApplyLowerSequence) {
          return;
        }
        internal.applyClientState!(parseFullSyncState(latest.state));
        internal.sequence = latest.sequence;
        awaitingReconnectSync = false;
        reconnectSequenceBaseline = null;
      })().finally(() => {
        syncingPromise = null;
      });
    }
    return syncingPromise;
  };
  if (typeof transport.onConnect !== 'function') {
    throw new Error('transport.onConnect is required');
  }
  transport.onConnect?.(() => {
    awaitingReconnectSync = true;
    reconnectSequenceBaseline = internal.sequence;
    void fullSync(true).catch((error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error(error);
      }
    });
  });
  transport.listen('update', async (options) => {
    let shouldFullSync = false;
    let allowLowerSequence = false;
    try {
      if (typeof options.sequence !== 'number') {
        shouldFullSync = true;
      } else if (options.sequence <= internal.sequence) {
        if (awaitingReconnectSync) {
          shouldFullSync = true;
          allowLowerSequence = true;
        } else if (options.sequence === 0 && internal.sequence > 0) {
          awaitingReconnectSync = true;
          reconnectSequenceBaseline = internal.sequence;
          shouldFullSync = true;
          allowLowerSequence = true;
        } else {
          return;
        }
      } else if (options.sequence === internal.sequence + 1) {
        assertSafePatches(options.patches, 'client transport update');
        internal.applyClientState!(undefined, options.patches);
        internal.sequence = options.sequence;
        awaitingReconnectSync = false;
        reconnectSequenceBaseline = null;
        return;
      } else {
        shouldFullSync = true;
        allowLowerSequence = awaitingReconnectSync;
      }

      if (shouldFullSync) {
        await fullSync(allowLowerSequence);
      }
    } catch (error) {
      if (!shouldFullSync) {
        try {
          await fullSync(awaitingReconnectSync);
        } catch (syncError) {
          if (process.env.NODE_ENV === 'development') {
            console.error(syncError);
          }
        }
      }
      if (process.env.NODE_ENV === 'development') {
        console.error(error);
      }
    }
  });
  return wrapStore(asyncClientStore, () => asyncClientStore.getState());
};

export const emit = <T extends CreateState>(
  store: MiddlewareStore<T>,
  internal: Internal<T>,
  patches?: Patches
) => {
  const safePatches = sanitizePatches(patches, {
    source: 'transport emit',
    warnOnDropped: true
  });
  if (store.transport && safePatches?.length) {
    validateSharedStateSerializable(internal.rootState);
    internal.sequence += 1;
    // it is not necessary to respond to the update event
    store.transport.emit(
      {
        name: 'update',
        respond: false
      },
      {
        patches: safePatches,
        sequence: internal.sequence
      }
    );
  }
};

export const handleDraft = <T extends CreateState>(
  store: MiddlewareStore<T>,
  internal: Internal<T>
) => {
  internal.rootState = internal.backupState;
  const [nextState, patches, inversePatches] = internal.finalizeDraft();
  if (store.share === 'main') {
    validateSharedStateSerializable(nextState);
  }
  const finalPatches = store.patch
    ? store.patch({ patches, inversePatches })
    : { patches, inversePatches };
  const safePatches =
    sanitizePatches(finalPatches.patches, {
      source: 'store.patch()',
      warnOnDropped: true
    }) ?? [];
  if (safePatches.length) {
    store.apply(internal.rootState as T, safePatches);
    // 3rd party model will send update notifications on its own after `store.apply` in mutableInstance mode
    emit(store, internal, safePatches);
  }
};

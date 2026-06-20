import {
  createBinder,
  onStoreReady,
  replaceExternalStoreState
} from 'coaction';

export * from 'xstate';

type XStateActor<TContext extends object = object, TEvent = any> = {
  getSnapshot: () => {
    context: TContext;
  };
  subscribe: (observer: (snapshot: { context: TContext }) => void) => {
    unsubscribe: () => void;
  };
  send: (event: TEvent) => void;
};

const actorMap = new WeakMap<object, XStateActor<any, any>>();

/**
 * Bind an XState actor to Coaction.
 */
export const bindXState = createBinder<
  <TContext extends object, TEvent>(
    actor: XStateActor<TContext, TEvent>
  ) => {
    [K in keyof TContext]: TContext[K];
  } & {
    send: (event: TEvent) => void;
  }
>({
  handleStore: (store, rawState, _state, internal) => {
    const actor = actorMap.get(rawState);
    if (!actor) {
      throw new Error('xstate actor is not found');
    }
    store.setState = () => {
      throw new Error(
        'setState is not supported with xstate binding. Please use actor events.'
      );
    };
    if (store.share === 'client') {
      return;
    }
    let subscription: { unsubscribe: () => void } | undefined;
    const cancelReadySubscription = onStoreReady(store, () => {
      subscription = actor.subscribe((snapshot) => {
        replaceExternalStoreState(
          store,
          internal,
          snapshot.context as Record<PropertyKey, unknown>
        );
      });
    });
    const baseDestroy = store.destroy;
    store.destroy = () => {
      cancelReadySubscription();
      subscription?.unsubscribe();
      baseDestroy();
    };
  },
  handleState: ((actor: XStateActor<any, any>) => {
    const snapshot = actor.getSnapshot();
    const state = Object.assign({}, snapshot.context, {
      send: actor.send.bind(actor)
    });
    const descriptors = Object.getOwnPropertyDescriptors(state);
    const copyState = Object.defineProperties({}, descriptors);
    const rawState = Object.defineProperties({}, descriptors);
    actorMap.set(rawState, actor);
    return {
      copyState,
      bind: () => rawState
    };
  }) as any
}) as <TContext extends object, TEvent>(
  actor: XStateActor<TContext, TEvent>
) => {
  [K in keyof TContext]: TContext[K];
} & {
  send: (event: TEvent) => void;
};

/**
 * Adapt a state type for Coaction create function.
 */
export const adapt = <T extends object>(store: T) => store as T;

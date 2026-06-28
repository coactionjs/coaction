import { create } from 'coaction';
import {
  applyUpdate,
  Array as YArray,
  bindYjs,
  Doc,
  encodeStateAsUpdate,
  Map as YMap,
  type YjsBinding
} from '@coaction/yjs';

export type WorkspaceState = {
  count: number;
  title: string;
  notes: string[];
  increment: () => void;
  setTitle: (title: string) => void;
  addNote: (note: string) => void;
};

export type Peer = {
  id: 'a' | 'b';
  label: string;
  doc: Doc;
  store: ReturnType<typeof createWorkspaceStore>;
  binding: YjsBinding<WorkspaceState>;
};

type RelayStats = {
  aToB: number;
  bToA: number;
};

type DocRelay = {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
  getStats: () => RelayStats;
  destroy: () => void;
};

const roomKey = 'workspace';

const createWorkspaceStore = (name: string) =>
  create<WorkspaceState>(
    (set) => ({
      count: 0,
      title: 'Launch plan',
      notes: ['Draft the plan'],
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      },
      setTitle(title) {
        set((draft) => {
          draft.title = title;
        });
      },
      addNote(note) {
        set((draft) => {
          draft.notes.push(note);
        });
      }
    }),
    {
      name
    }
  );

const createPeer = (id: 'a' | 'b', label: string, doc: Doc): Peer => {
  const store = createWorkspaceStore(`peer-${id}`);
  const binding = bindYjs(store, {
    doc,
    key: roomKey
  });

  return {
    id,
    label,
    doc,
    store,
    binding
  };
};

const createDocRelay = (
  docA: Doc,
  docB: Doc,
  onUpdate: () => void
): DocRelay => {
  const originA = { id: 'provider-a' };
  const originB = { id: 'provider-b' };
  const stats = {
    aToB: 0,
    bToA: 0
  };
  let connected = true;

  const relayAtoB = (update: Uint8Array, origin: unknown) => {
    if (!connected || origin === originA) {
      return;
    }
    stats.aToB += 1;
    setTimeout(() => {
      if (!connected) {
        return;
      }
      applyUpdate(docB, update, originB);
      onUpdate();
    }, 30);
  };

  const relayBtoA = (update: Uint8Array, origin: unknown) => {
    if (!connected || origin === originB) {
      return;
    }
    stats.bToA += 1;
    setTimeout(() => {
      if (!connected) {
        return;
      }
      applyUpdate(docA, update, originA);
      onUpdate();
    }, 30);
  };

  const syncNow = () => {
    applyUpdate(docB, encodeStateAsUpdate(docA), originB);
    applyUpdate(docA, encodeStateAsUpdate(docB), originA);
    onUpdate();
  };

  docA.on('update', relayAtoB);
  docB.on('update', relayBtoA);

  return {
    connect() {
      if (connected) {
        return;
      }
      connected = true;
      syncNow();
    },
    disconnect() {
      connected = false;
    },
    isConnected: () => connected,
    getStats: () => ({ ...stats }),
    destroy() {
      docA.off('update', relayAtoB);
      docB.off('update', relayBtoA);
    }
  };
};

const readYValue = (value: unknown): unknown => {
  if (value instanceof YMap) {
    const next: Record<string, unknown> = {};
    value.forEach((item, key) => {
      next[key] = readYValue(item);
    });
    return next;
  }
  if (value instanceof YArray) {
    return value.toArray().map((item) => readYValue(item));
  }
  return value;
};

export const readDocState = (doc: Doc) => {
  const state = doc.getMap<unknown>(roomKey).get('state');
  return readYValue(state);
};

export const createCollaboration = (onUpdate: () => void) => {
  const docA = new Doc();
  const docB = new Doc();
  const relay = createDocRelay(docA, docB, onUpdate);
  const peerA = createPeer('a', 'Peer A', docA);
  const peerB = createPeer('b', 'Peer B', docB);
  const unsubscribeA = peerA.store.subscribe(onUpdate);
  const unsubscribeB = peerB.store.subscribe(onUpdate);

  relay.connect();

  return {
    peerA,
    peerB,
    relay,
    destroy() {
      unsubscribeA();
      unsubscribeB();
      peerA.binding.destroy();
      peerB.binding.destroy();
      peerA.store.destroy();
      peerB.store.destroy();
      relay.destroy();
      docA.destroy();
      docB.destroy();
    }
  };
};

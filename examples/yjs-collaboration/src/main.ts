import { createCollaboration, readDocState, type Peer } from './store';
import './style.css';

const getElement = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
};

type PeerElements = {
  count: HTMLElement;
  title: HTMLInputElement;
  increment: HTMLButtonElement;
  rename: HTMLButtonElement;
  noteForm: HTMLFormElement;
  noteInput: HTMLInputElement;
  notes: HTMLUListElement;
};

const statusElement = getElement<HTMLElement>('status');
const statsElement = getElement<HTMLElement>('stats');
const connectButton = getElement<HTMLButtonElement>('connect');
const disconnectButton = getElement<HTMLButtonElement>('disconnect');
const docAElement = getElement<HTMLPreElement>('doc-a');
const docBElement = getElement<HTMLPreElement>('doc-b');

const peerElements = {
  a: {
    count: getElement<HTMLElement>('peer-a-count'),
    title: getElement<HTMLInputElement>('peer-a-title-input'),
    increment: getElement<HTMLButtonElement>('peer-a-increment'),
    rename: getElement<HTMLButtonElement>('peer-a-rename'),
    noteForm: getElement<HTMLFormElement>('peer-a-note-form'),
    noteInput: getElement<HTMLInputElement>('peer-a-note'),
    notes: getElement<HTMLUListElement>('peer-a-notes')
  },
  b: {
    count: getElement<HTMLElement>('peer-b-count'),
    title: getElement<HTMLInputElement>('peer-b-title-input'),
    increment: getElement<HTMLButtonElement>('peer-b-increment'),
    rename: getElement<HTMLButtonElement>('peer-b-rename'),
    noteForm: getElement<HTMLFormElement>('peer-b-note-form'),
    noteInput: getElement<HTMLInputElement>('peer-b-note'),
    notes: getElement<HTMLUListElement>('peer-b-notes')
  }
} satisfies Record<'a' | 'b', PeerElements>;

let renderQueued = false;
const scheduleRender = () => {
  if (renderQueued) {
    return;
  }
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
};

const collaboration = createCollaboration(scheduleRender);

const renderPeer = (peer: Peer, elements: PeerElements) => {
  const state = peer.store.getState();
  elements.count.textContent = String(state.count);
  if (document.activeElement !== elements.title) {
    elements.title.value = state.title;
  }
  elements.notes.replaceChildren(
    ...state.notes.map((note) => {
      const item = document.createElement('li');
      item.textContent = note;
      return item;
    })
  );
};

function render() {
  renderPeer(collaboration.peerA, peerElements.a);
  renderPeer(collaboration.peerB, peerElements.b);

  const stats = collaboration.relay.getStats();
  const connected = collaboration.relay.isConnected();
  statusElement.textContent = connected ? 'connected' : 'offline';
  statusElement.dataset.state = connected ? 'connected' : 'offline';
  statsElement.textContent = `${stats.aToB + stats.bToA} updates relayed`;
  connectButton.disabled = connected;
  disconnectButton.disabled = !connected;
  docAElement.textContent = JSON.stringify(
    readDocState(collaboration.peerA.doc),
    null,
    2
  );
  docBElement.textContent = JSON.stringify(
    readDocState(collaboration.peerB.doc),
    null,
    2
  );
}

const bindPeerControls = (peer: Peer, elements: PeerElements) => {
  elements.increment.addEventListener('click', () => {
    peer.store.getState().increment();
    scheduleRender();
  });

  elements.rename.addEventListener('click', () => {
    peer.store.getState().setTitle(elements.title.value.trim() || 'Untitled');
    elements.title.blur();
    scheduleRender();
  });

  elements.noteForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const state = peer.store.getState();
    const note =
      elements.noteInput.value.trim() ||
      `${peer.label} note ${state.notes.length + 1}`;
    state.addNote(note);
    elements.noteInput.value = '';
    scheduleRender();
  });
};

bindPeerControls(collaboration.peerA, peerElements.a);
bindPeerControls(collaboration.peerB, peerElements.b);

disconnectButton.addEventListener('click', () => {
  collaboration.relay.disconnect();
  scheduleRender();
});

connectButton.addEventListener('click', () => {
  collaboration.relay.connect();
  scheduleRender();
});

render();

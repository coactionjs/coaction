import { createMiddlewareStore } from './store';
import './style.css';

const getElement = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
};

const countElement = getElement<HTMLSpanElement>('count');
const persistedElement = getElement<HTMLElement>('persisted');
const eventCountElement = getElement<HTMLElement>('event-count');
const eventsElement = getElement<HTMLOListElement>('events');
const incrementButton = getElement<HTMLButtonElement>('increment');
const undoButton = getElement<HTMLButtonElement>('undo');
const redoButton = getElement<HTMLButtonElement>('redo');
const clearButton = getElement<HTMLButtonElement>('clear');
const { events, storageName, store } = createMiddlewareStore();

const readPersistedCount = () => {
  const raw = localStorage.getItem(storageName);
  if (!raw) {
    return 'none';
  }
  try {
    const parsed = JSON.parse(raw) as { state?: { count?: number } };
    return String(parsed.state?.count ?? 'none');
  } catch {
    return 'invalid';
  }
};

const render = () => {
  countElement.textContent = String(store.getState().count);
  persistedElement.textContent = `persisted ${readPersistedCount()}`;
  undoButton.disabled = !store.history.canUndo();
  redoButton.disabled = !store.history.canRedo();
  eventCountElement.textContent = `${events.length} events`;
  eventsElement.replaceChildren(
    ...events
      .slice(-6)
      .reverse()
      .map((event) => {
        const item = document.createElement('li');
        item.textContent = `${event.method}: ${event.label}`;
        return item;
      })
  );
};

const renderAfterPersistence = () => {
  render();
  queueMicrotask(render);
};

incrementButton.addEventListener('click', () => {
  store.getState().increment();
  renderAfterPersistence();
});

undoButton.addEventListener('click', () => {
  store.history.undo();
  renderAfterPersistence();
});

redoButton.addEventListener('click', () => {
  store.history.redo();
  renderAfterPersistence();
});

clearButton.addEventListener('click', async () => {
  await store.persist.clearStorage();
  render();
});

store.subscribe(renderAfterPersistence);
void store.persist.rehydrate().then(renderAfterPersistence);
render();

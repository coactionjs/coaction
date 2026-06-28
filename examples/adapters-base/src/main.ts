import { createAdapterDemos, type AdapterDemo } from './adapters';
import './style.css';

const root = document.getElementById('adapters');

if (!root) {
  throw new Error('Missing #adapters element');
}

const createCard = (demo: AdapterDemo) => {
  const card = document.createElement('article');
  card.className = 'card';
  card.innerHTML = `
    <div>
      <p>${demo.id}</p>
      <h2>${demo.title}</h2>
    </div>
    <div class="count" aria-live="polite">0</div>
    <div class="actions">
      <button type="button" data-action="coaction">Coaction action</button>
      <button type="button" data-action="source">${demo.sourceLabel}</button>
    </div>
  `;
  const count = card.querySelector<HTMLDivElement>('.count');
  const coactionButton = card.querySelector<HTMLButtonElement>(
    '[data-action="coaction"]'
  );
  const sourceButton = card.querySelector<HTMLButtonElement>(
    '[data-action="source"]'
  );

  if (!count || !coactionButton || !sourceButton) {
    throw new Error(`Adapter card for ${demo.id} did not render correctly`);
  }

  const render = () => {
    count.textContent = String(demo.getCount());
  };
  coactionButton.addEventListener('click', () => {
    demo.incrementViaCoaction();
    render();
  });
  sourceButton.addEventListener('click', () => {
    demo.incrementViaSource();
    render();
  });
  const unsubscribe = demo.subscribe(render);
  render();

  return {
    card,
    destroy() {
      unsubscribe();
      demo.destroy();
    }
  };
};

const cards = createAdapterDemos().map(createCard);
root.replaceChildren(...cards.map((entry) => entry.card));

globalThis.addEventListener('pagehide', () => {
  cards.forEach((entry) => entry.destroy());
});

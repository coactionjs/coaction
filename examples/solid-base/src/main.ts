import { createEffect, createRoot } from 'solid-js';
import { useCounterStore } from './store';
import './style.css';

const getElement = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
};

const countElement = getElement<HTMLSpanElement>('count');
const doubleElement = getElement<HTMLElement>('double');
const historyElement = getElement<HTMLOListElement>('history');
const incrementButton = getElement<HTMLButtonElement>('increment');
const decrementButton = getElement<HTMLButtonElement>('decrement');
const resetButton = getElement<HTMLButtonElement>('reset');
const stepInput = getElement<HTMLInputElement>('step');

createRoot(() => {
  const count = useCounterStore((state) => state.count);
  const double = useCounterStore((state) => state.double);
  const history = useCounterStore((state) => state.history);
  const auto = useCounterStore({ autoSelector: true });

  incrementButton.addEventListener('click', auto.increment);
  decrementButton.addEventListener('click', auto.decrement);
  resetButton.addEventListener('click', auto.reset);
  stepInput.addEventListener('input', () => {
    auto.setStep(Number(stepInput.value));
  });

  createEffect(() => {
    const step = auto.step();
    countElement.textContent = String(count());
    doubleElement.textContent = `double ${double()}`;
    incrementButton.textContent = `+${step}`;
    decrementButton.textContent = `-${step}`;
    stepInput.value = String(step);
  });

  createEffect(() => {
    historyElement.replaceChildren(
      ...history()
        .slice(-4)
        .reverse()
        .map((entry) => {
          const item = document.createElement('li');
          item.textContent = entry;
          return item;
        })
    );
  });
});

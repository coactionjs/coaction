import { count, counterStore, double, history, step } from './store';
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
const actions = counterStore.getState();

const render = () => {
  const currentStep = step();
  countElement.textContent = String(count());
  doubleElement.textContent = `double ${double()}`;
  incrementButton.textContent = `+${currentStep}`;
  decrementButton.textContent = `-${currentStep}`;
  stepInput.value = String(currentStep);
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
};

incrementButton.addEventListener('click', actions.increment);
decrementButton.addEventListener('click', actions.decrement);
resetButton.addEventListener('click', actions.reset);
stepInput.addEventListener('input', () => {
  actions.setStep(Number(stepInput.value));
});

counterStore.subscribe(render);
render();

<script lang="ts">
  import { count, counterStore, double, history, step } from './store';

  const actions = counterStore.getState();

  const setStep = (event: Event) => {
    const input = event.target as HTMLInputElement;
    actions.setStep(Number(input.value));
  };
</script>

<main class="shell">
  <section class="panel">
    <div class="heading">
      <p>@coaction/svelte</p>
      <h1>Svelte readable stores from Coaction selectors</h1>
    </div>

    <div class="readout" aria-live="polite">
      <span>{$count}</span>
      <small>double {$double}</small>
    </div>

    <div class="controls">
      <button type="button" on:click={actions.decrement}>-{$step}</button>
      <button type="button" on:click={actions.increment}>+{$step}</button>
      <button type="button" class="secondary" on:click={actions.reset}>
        Reset
      </button>
    </div>

    <label class="step-control">
      <span>Step</span>
      <input value={$step} min="1" max="10" type="range" on:input={setStep} />
    </label>
  </section>

  <section class="panel side">
    <h2>Recent updates</h2>
    <ol>
      {#each $history.slice(-4).reverse() as entry}
        <li>{entry}</li>
      {/each}
    </ol>
  </section>
</main>

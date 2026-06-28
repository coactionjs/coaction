<script setup lang="ts">
import { computed } from 'vue';
import { useCounterStore } from './store';

const state = useCounterStore();
const count = useCounterStore((current) => current.count);
const double = useCounterStore((current) => current.double);
const auto = useCounterStore({ autoSelector: true });
const recentHistory = computed(() => state.history.slice(-4).reverse());

const setStep = (event: Event) => {
  const input = event.target as HTMLInputElement;
  auto.setStep(Number(input.value));
};
</script>

<template>
  <main class="shell">
    <section class="panel">
      <div class="heading">
        <p>@coaction/vue</p>
        <h1>Vue counter with signal-backed selectors</h1>
      </div>

      <div class="readout" aria-live="polite">
        <span>{{ count }}</span>
        <small>double {{ double }}</small>
      </div>

      <div class="controls">
        <button type="button" @click="auto.decrement">
          -{{ auto.step.value }}
        </button>
        <button type="button" @click="auto.increment">
          +{{ auto.step.value }}
        </button>
        <button type="button" class="secondary" @click="auto.reset">
          Reset
        </button>
      </div>

      <label class="step-control">
        <span>Step</span>
        <input
          :value="auto.step.value"
          min="1"
          max="10"
          type="range"
          @input="setStep"
        />
      </label>
    </section>

    <section class="panel side">
      <h2>Recent updates</h2>
      <ol>
        <li v-for="entry in recentHistory" :key="entry">{{ entry }}</li>
      </ol>
    </section>
  </main>
</template>

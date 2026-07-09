# @coaction/pinia

![Node CI](https://github.com/coactionjs/coaction/workflows/Node%20CI/badge.svg) [![npm](https://img.shields.io/npm/v/@coaction/pinia.svg)](https://www.npmjs.com/package/@coaction/pinia) ![license](https://img.shields.io/npm/l/@coaction/pinia)

A Coaction integration tool for Pinia

## Installation

Install it with pnpm:

```sh
pnpm add coaction @coaction/pinia
```

## Usage

```js
import { create } from 'coaction';
import { adapt, bindPinia } from '@coaction/pinia';
import { defineStore } from 'pinia';

const useStore = create(() =>
  adapt(
    defineStore(
      'test',
      bindPinia({
        state: () => ({ count: 0 }),
        getters: {
          double: (state) => state.count * 2
        },
        actions: {
          increment(state) {
            state.count += 1;
          }
        }
      })
    )
  )
);
```

## Limitations

- `@coaction/pinia` only supports binding a whole Pinia store.
- Coaction `Slices` mode is not supported in this adapter.
- `bindPinia()` does not set Pinia's global active instance. Use `adapt()` for
  Coaction-owned Pinia definitions, or provide your own active Pinia when using
  raw Pinia store definitions directly.
- Unknown root properties written directly to the Pinia store are ignored by
  Coaction's fixed schema. They are not promoted into Coaction raw/public state,
  and this adapter does not guarantee pruning them from the Pinia store.

## Documentation

You can find the documentation [here](https://github.com/coactionjs/coaction).

# @coaction/persist

![Node CI](https://github.com/coactionjs/coaction/workflows/Node%20CI/badge.svg) [![npm](https://img.shields.io/npm/v/@coaction/persist.svg)](https://www.npmjs.com/package/@coaction/persist) ![license](https://img.shields.io/npm/l/@coaction/persist)

A persist middleware for Coaction.

## Installation

Install it with pnpm:

```sh
pnpm add coaction @coaction/persist
```

## Usage

```ts
import { create } from 'coaction';
import { persist } from '@coaction/persist';

const store = create(
  (set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }),
  {
    middlewares: [
      persist({
        name: 'counter'
      })
    ]
  }
);
```

## Documentation

You can find the documentation [here](https://github.com/coactionjs/coaction).

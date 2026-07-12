# @coaction/jotai

![Node CI](https://github.com/coactionjs/coaction/workflows/Node%20CI/badge.svg) [![npm](https://img.shields.io/npm/v/@coaction/jotai.svg)](https://www.npmjs.com/package/@coaction/jotai) ![license](https://img.shields.io/npm/l/@coaction/jotai)

[English documentation](https://coactionjs.github.io/coaction/en/docs/) · [中文文档](https://coactionjs.github.io/coaction/zh/docs/)

A Coaction integration tool for Jotai.

## Installation

Install it with pnpm:

```sh
pnpm add coaction @coaction/jotai jotai
```

## Usage

```ts
import { create } from 'coaction';
import { adapt, atom, bindJotai, createStore } from '@coaction/jotai';

const countAtom = atom(0);
const jotaiStore = createStore();

const store = create(() =>
  adapt(
    bindJotai({
      store: jotaiStore,
      atoms: {
        count: countAtom
      },
      actions: ({ store, atoms }) => ({
        increment() {
          store.set(atoms.count, store.get(atoms.count) + 1);
        }
      })
    })
  )
);
```

## Limitations

- `@coaction/jotai` only supports binding a whole Jotai store.
- Coaction `Slices` mode is not supported in this adapter.
- Shared main/client mode is supported for Coaction method execution; direct
  writes to client-side atoms are rejected.

## Documentation

You can find the documentation [here](https://github.com/coactionjs/coaction).

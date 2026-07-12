# @coaction/svelte

![Node CI](https://github.com/coactionjs/coaction/workflows/Node%20CI/badge.svg) [![npm](https://img.shields.io/npm/v/@coaction/svelte.svg)](https://www.npmjs.com/package/@coaction/svelte) ![license](https://img.shields.io/npm/l/@coaction/svelte)

[English documentation](https://coactionjs.github.io/coaction/en/docs/) · [中文文档](https://coactionjs.github.io/coaction/zh/docs/)

A Coaction integration tool for Svelte.

## Installation

Install it with pnpm:

```sh
pnpm add coaction @coaction/svelte
```

## Usage

```ts
import { create } from '@coaction/svelte';

const store = create((set) => ({
  count: 0,
  increment() {
    set((draft) => {
      draft.count += 1;
    });
  }
}));

const count = store((state) => state.count);
count.subscribe((value) => {
  console.log(value);
});
```

## Documentation

You can find the documentation [here](https://github.com/coactionjs/coaction).

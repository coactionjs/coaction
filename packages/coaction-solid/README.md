# @coaction/solid

![Node CI](https://github.com/coactionjs/coaction/workflows/Node%20CI/badge.svg) [![npm](https://img.shields.io/npm/v/@coaction/solid.svg)](https://www.npmjs.com/package/@coaction/solid) ![license](https://img.shields.io/npm/l/@coaction/solid)

[English documentation](https://coactionjs.github.io/coaction/en/docs/) · [中文文档](https://coactionjs.github.io/coaction/zh/docs/)

A Coaction integration tool for Solid.

## Installation

Install it with pnpm:

```sh
pnpm add coaction @coaction/solid
```

## Usage

```tsx
import { create } from '@coaction/solid';

const store = create((set) => ({
  count: 0,
  increment() {
    set((draft) => {
      draft.count += 1;
    });
  }
}));

const count = store((state) => state.count);
console.log(count());
```

## Documentation

You can find the documentation [here](https://github.com/coactionjs/coaction).

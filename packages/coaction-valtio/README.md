# @coaction/valtio

![Node CI](https://github.com/coactionjs/coaction/workflows/Node%20CI/badge.svg) [![npm](https://img.shields.io/npm/v/@coaction/valtio.svg)](https://www.npmjs.com/package/@coaction/valtio) ![license](https://img.shields.io/npm/l/@coaction/valtio)

A Coaction integration tool for Valtio.

## Installation

Install it with pnpm:

```sh
pnpm add coaction @coaction/valtio valtio
```

## Usage

```ts
import { create } from 'coaction';
import { adapt, bindValtio, proxy } from '@coaction/valtio';

const state = proxy(
  bindValtio({
    count: 0,
    increment() {
      this.count += 1;
    }
  })
);

const store = create(() => adapt(state));
store.getState().increment();
```

## Limitations

- `@coaction/valtio` only supports binding a whole Valtio store.
- Coaction `Slices` mode is not supported in this adapter.
- Shared main/client mode is supported for Coaction method execution; direct
  writes to the client-side Valtio proxy are restored to the authoritative
  snapshot.

## Documentation

You can find the documentation [here](https://github.com/coactionjs/coaction).

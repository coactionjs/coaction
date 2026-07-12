import type { Transport } from 'data-transport';
import { create } from '../../../packages/core/shared';

export const createSharedCounter = (transport: Transport) =>
  create(
    (set) => ({
      count: 0,
      increment() {
        set({ count: this.count + 1 });
      }
    }),
    { transport }
  );

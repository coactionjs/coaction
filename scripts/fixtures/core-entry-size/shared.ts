import { create, type StoreOptions } from '../../../packages/core/shared';

export const createSharedCounter = (
  transport: NonNullable<StoreOptions<any>['transport']>
) =>
  create(
    (set) => ({
      count: 0,
      increment() {
        set({ count: this.count + 1 });
      }
    }),
    { transport }
  );

import { create } from '../src';

describe.each(['own property', 'getter', 'null prototype'])(
  'scan callbacks with %s',
  (kind) => {
    test.each([
      'map',
      'filter',
      'flatMap',
      'forEach',
      'reduce',
      'reduceRight'
    ] as const)('%s preserves native callable semantics', (method) => {
      const callback = (a: number, b: number) => a + b;
      if (kind === 'null prototype') Object.setPrototypeOf(callback, null);
      else if (kind === 'getter') {
        Object.defineProperty(callback, 'apply', {
          get() {
            throw new Error('Callback invocation must not read apply');
          }
        });
      } else Object.defineProperty(callback, 'apply', { value: undefined });
      const store = create({ items: [1, 2] });
      const expected = Reflect.apply(
        Array.prototype[method],
        [1, 2],
        [callback, 0]
      );
      const items = store.getState().items;
      expect(Reflect.apply(items[method], items, [callback, 0])).toEqual(
        expected
      );
      store.destroy();
    });
  }
);

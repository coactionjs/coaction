import {
  assertSharedJsonValue,
  decodeSharedJson,
  encodeSharedJson
} from '../src/sharedState';

test('shared JSON values round trip exactly', () => {
  const value = {
    active: true,
    count: 1.5,
    empty: null,
    nested: [{ text: 'coaction' }, 0, false]
  };

  expect(decodeSharedJson(encodeSharedJson(value))).toEqual(value);
});

test.each([
  ['undefined', { value: undefined }, 'Undefined-valued state'],
  ['BigInt', { value: 1n }, 'BigInt-valued state'],
  ['NaN', { value: Number.NaN }, 'NaN or infinite number state'],
  ['Infinity', { value: Infinity }, 'NaN or infinite number state'],
  ['negative zero', { value: -0 }, 'Negative zero state'],
  ['function', { value: () => undefined }, 'Function-valued state'],
  ['symbol', { value: Symbol('value') }, 'Symbol-valued state'],
  ['Date', { value: new Date(0) }, 'Non-plain object state'],
  ['Map', { value: new Map() }, 'Non-plain object state'],
  ['sparse array', { value: Array(1) }, 'Sparse array state']
])('shared JSON rejects %s', (_, value, message) => {
  expect(() => assertSharedJsonValue(value)).toThrow(message);
});

test('shared JSON rejects repeated and circular references', () => {
  const child = { value: 1 };
  expect(() => assertSharedJsonValue({ left: child, right: child })).toThrow(
    'Repeated state reference'
  );

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  expect(() => assertSharedJsonValue(circular)).toThrow(
    'Repeated state reference'
  );
});

test('shared JSON rejects unsafe and symbol keys', () => {
  expect(() =>
    assertSharedJsonValue(JSON.parse('{"__proto__":{"polluted":true}}'))
  ).toThrow('Unsafe-keyed state');

  expect(() => assertSharedJsonValue({ [Symbol('key')]: 1 })).toThrow(
    'Symbol-keyed state'
  );
});

test('shared JSON rejects accessors without executing them', () => {
  let reads = 0;
  const value = {};
  Object.defineProperty(value, 'secret', {
    enumerable: true,
    get() {
      reads += 1;
      return 1;
    }
  });

  expect(() => assertSharedJsonValue(value)).toThrow('Accessor-backed state');
  expect(reads).toBe(0);
});

test('shared JSON rejects inherited toJSON functions', () => {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
  Object.defineProperty(Object.prototype, 'toJSON', {
    configurable: true,
    value: () => ({ changed: true })
  });

  try {
    expect(() => encodeSharedJson({ safe: true })).toThrow(
      'Inherited toJSON state'
    );
  } finally {
    if (previous) {
      Object.defineProperty(Object.prototype, 'toJSON', previous);
    } else {
      delete (Object.prototype as { toJSON?: unknown }).toJSON;
    }
  }
});

test('shared JSON rejects inherited toJSON accessors without executing them', () => {
  const previous = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
  let reads = 0;
  Object.defineProperty(Array.prototype, 'toJSON', {
    configurable: true,
    get() {
      reads += 1;
      return () => [];
    }
  });

  try {
    expect(() => encodeSharedJson([1])).toThrow('Inherited toJSON state');
    expect(reads).toBe(0);
  } finally {
    if (previous) {
      Object.defineProperty(Array.prototype, 'toJSON', previous);
    } else {
      delete (Array.prototype as unknown as { toJSON?: unknown }).toJSON;
    }
  }
});

test('shared JSON rejects non-enumerable data', () => {
  const value = {};
  Object.defineProperty(value, 'hidden', { value: 1 });

  expect(() => assertSharedJsonValue(value)).toThrow(
    'Non-enumerable data state'
  );
});

test('shared JSON decoder rejects non-string and invalid payloads', () => {
  expect(() => decodeSharedJson({})).toThrow(
    'Shared transport payload must be a JSON string.'
  );
  expect(() => decodeSharedJson('{')).toThrow(
    'Shared transport payload is not valid JSON.'
  );
});

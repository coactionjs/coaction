import {
  areShallowEqualWithArray,
  mergeObject,
  replaceOwnEnumerable,
  uuid
} from '../src/utils';

test('areShallowEqualWithArray handles null, NaN and signed zero', () => {
  expect(areShallowEqualWithArray(null, [1] as any)).toBeFalsy();
  expect(areShallowEqualWithArray([NaN], [NaN])).toBeTruthy();
  expect(areShallowEqualWithArray([0], [-0])).toBeFalsy();
});

test('mergeObject handles slice and plain merge paths', () => {
  const target = {
    user: {
      name: 'coaction'
    },
    count: 1
  };
  mergeObject(
    target,
    {
      user: {
        name: 'next'
      },
      count: 2
    },
    true
  );
  expect(target).toEqual({
    user: {
      name: 'next'
    },
    count: 1
  });

  mergeObject(target, null as any, true);
  expect(target.count).toBe(1);

  mergeObject(target, {
    count: 3
  });
  expect(target.count).toBe(3);
});

test('mergeObject ignores unknown and inherited slice keys', () => {
  const proto = {
    inherited: {
      name: 'bad'
    }
  };
  const source = Object.create(proto) as {
    user: {
      name: string;
    };
    unknown: {
      value: number;
    };
  };
  source.user = {
    name: 'next'
  };
  source.unknown = {
    value: 1
  };
  const target = {
    user: {
      name: 'coaction'
    }
  };

  expect(() => {
    mergeObject(target, source, true);
  }).not.toThrow();
  expect(target).toEqual({
    user: {
      name: 'next'
    }
  });
  expect((target as any).inherited).toBeUndefined();
  expect((target as any).unknown).toBeUndefined();
});

test('mergeObject copies enumerable symbol keys and skips non-enumerable keys', () => {
  const token = Symbol('token');
  const hidden = Symbol('hidden');
  const target = {} as Record<PropertyKey, unknown>;
  const source = {
    [token]: 1
  } as Record<PropertyKey, unknown>;
  Object.defineProperty(source, hidden, {
    value: 2,
    enumerable: false
  });

  mergeObject(target, source);

  expect(target[token]).toBe(1);
  expect(target[hidden]).toBeUndefined();

  const nestedToken = Symbol('nested-token');
  const nestedHidden = Symbol('nested-hidden');
  const sliceTarget = {
    user: {
      [nestedToken]: 1
    } as Record<PropertyKey, unknown>
  };
  const sliceSource = {
    user: {
      [nestedToken]: 2
    } as Record<PropertyKey, unknown>
  };
  Object.defineProperty(sliceSource.user, nestedHidden, {
    value: 3,
    enumerable: false
  });

  mergeObject(sliceTarget, sliceSource, true);

  expect(sliceTarget.user[nestedToken]).toBe(2);
  expect(sliceTarget.user[nestedHidden]).toBeUndefined();
});

test('replaceOwnEnumerable replaces data keys without copying functions or unsafe keys', () => {
  const token = Symbol('token');
  const target = {
    stale: true,
    keep: 1
  } as Record<PropertyKey, unknown>;
  const source = JSON.parse(
    '{"keep":2,"nested":{"value":3,"__proto__":{"nested":true},"constructor":{"value":4}},"__proto__":{"polluted":true}}'
  ) as Record<PropertyKey, unknown>;
  source[token] = 3;
  source.action = () => undefined;

  replaceOwnEnumerable(target, source);

  expect(target.keep).toBe(2);
  expect(target.nested).toEqual({
    value: 3
  });
  expect(Object.getPrototypeOf(target.nested)).toBe(Object.prototype);
  expect(target[token]).toBe(3);
  expect(target.stale).toBeUndefined();
  expect(target.action).toBeUndefined();
  expect((target as Record<string, unknown>).polluted).toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(target.nested, '__proto__')).toBe(
    false
  );
  expect(
    Object.prototype.hasOwnProperty.call(target.nested, 'constructor')
  ).toBe(false);
});

test('mergeObject ignores unsafe prototype keys', () => {
  const pollutedKey = '__coactionPolluted__';
  const objectPrototype = Object.prototype as Record<string, unknown>;
  delete objectPrototype[pollutedKey];

  try {
    const plainTarget = {
      count: 1
    };
    const plainSource = JSON.parse(
      '{"__proto__":{"polluted":true},"count":2,"nested":{"value":1,"__proto__":{"nested":true},"constructor":{"value":2}}}'
    ) as Record<string, unknown>;

    mergeObject(plainTarget, plainSource);
    expect(plainTarget).toEqual({
      count: 2,
      nested: {
        value: 1
      }
    });
    expect(Object.getPrototypeOf(plainTarget)).toBe(Object.prototype);
    expect(Object.getPrototypeOf((plainTarget as any).nested)).toBe(
      Object.prototype
    );
    expect((plainTarget as Record<string, unknown>).polluted).toBeUndefined();
    expect(
      Object.prototype.hasOwnProperty.call(
        (plainTarget as any).nested,
        '__proto__'
      )
    ).toBe(false);

    const sliceTarget = {
      nested: {
        value: 1
      }
    };
    const sliceSource = {
      nested: JSON.parse(
        `{"value":2,"__proto__":{"${pollutedKey}":true},"constructor":{"value":3}}`
      ) as Record<string, unknown>
    };

    mergeObject(sliceTarget, sliceSource, true);
    expect(sliceTarget).toEqual({
      nested: {
        value: 2
      }
    });
    expect(Object.getPrototypeOf(sliceTarget.nested)).toBe(Object.prototype);
    expect(
      Object.prototype.hasOwnProperty.call(sliceTarget.nested, '__proto__')
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(sliceTarget.nested, 'constructor')
    ).toBe(false);
    expect(objectPrototype[pollutedKey]).toBeUndefined();
  } finally {
    delete objectPrototype[pollutedKey];
  }
});

test('uuid returns v4-like identifier', () => {
  const value = uuid();
  expect(value).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});

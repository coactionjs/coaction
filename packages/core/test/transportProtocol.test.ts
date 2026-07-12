import {
  decodeExecuteRequest,
  decodeExecuteResponse,
  decodeFullSyncRequest,
  decodeFullSyncResponse,
  decodeUpdateMessage,
  encodeExecuteRequest,
  encodeExecuteResponse,
  encodeFullSyncRequest,
  encodeFullSyncResponse,
  encodeUpdateMessage
} from '../src/transportProtocol';

test('execute messages round trip JSON arguments and void results', () => {
  const request = encodeExecuteRequest(
    ['counter', 'increment'],
    [{ amount: 2 }]
  );
  expect(decodeExecuteRequest(request)).toEqual({
    action: ['counter', 'increment'],
    args: [{ amount: 2 }]
  });

  expect(
    decodeExecuteResponse(
      encodeExecuteResponse({ epoch: 'epoch-1', ok: true, sequence: 3 })
    )
  ).toEqual({ epoch: 'epoch-1', ok: true, sequence: 3 });
});

test('execute errors remain distinct from successful data', () => {
  const encoded = encodeExecuteResponse({
    epoch: 'epoch-1',
    error: 'denied',
    ok: false,
    sequence: 0
  });

  expect(decodeExecuteResponse(encoded)).toEqual({
    epoch: 'epoch-1',
    error: 'denied',
    ok: false,
    sequence: 0
  });
});

test('full sync messages round trip one encoded JSON envelope', () => {
  expect(() => decodeFullSyncRequest(encodeFullSyncRequest())).not.toThrow();
  expect(
    decodeFullSyncResponse(
      encodeFullSyncResponse({
        epoch: 'epoch-1',
        sequence: 2,
        state: { count: 2 }
      })
    )
  ).toEqual({ epoch: 'epoch-1', sequence: 2, state: { count: 2 } });
});

test('update messages validate operations, paths and JSON values', () => {
  const encoded = encodeUpdateMessage('epoch-1', 4, [
    { op: 'replace', path: ['count'], value: 4 },
    { op: 'remove', path: ['obsolete'] }
  ]);

  expect(decodeUpdateMessage(encoded)).toEqual({
    epoch: 'epoch-1',
    patches: [
      { op: 'replace', path: ['count'], value: 4 },
      { op: 'remove', path: ['obsolete'] }
    ],
    sequence: 4
  });
});

test.each([
  [
    'unknown version',
    '{"v":2,"type":"full-sync"}',
    'Invalid transport message'
  ],
  ['unknown type', '{"v":1,"type":"unknown"}', 'Invalid transport message'],
  ['non JSON', '{', 'Shared transport payload is not valid JSON'],
  ['object input', {}, 'Shared transport payload must be a JSON string']
])('protocol rejects %s', (_, payload, message) => {
  expect(() => decodeFullSyncRequest(payload)).toThrow(message);
});

test('protocol rejects unsafe action and patch paths', () => {
  expect(() =>
    decodeExecuteRequest(
      '{"v":1,"type":"execute","action":["constructor"],"args":[]}'
    )
  ).toThrow('Invalid transport action');

  expect(() =>
    decodeUpdateMessage(
      '{"v":1,"type":"update","epoch":"e","sequence":1,"patches":[{"op":"replace","path":["__proto__"],"value":1}]}'
    )
  ).toThrow('Invalid transport patch path');
});

test('protocol rejects invalid epochs and sequences', () => {
  expect(() =>
    decodeExecuteResponse(
      '{"v":1,"type":"execute-result","ok":true,"epoch":"","sequence":0}'
    )
  ).toThrow('Invalid transport epoch');
  expect(() =>
    decodeExecuteResponse(
      '{"v":1,"type":"execute-result","ok":true,"epoch":"e","sequence":-1}'
    )
  ).toThrow('Invalid transport sequence');
});

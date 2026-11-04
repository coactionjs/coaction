/**
 * Whether a key is an array index as `String(index)` writes one.
 *
 * A module of its own: the reactive path trie classifies the key of each node
 * it creates, and an entry that only tracks reads -- `coaction/derived` --
 * should not take in the rest of the state utilities to do so.
 */
export const isArrayIndexKey = (key: PropertyKey) => {
  if (typeof key !== 'string') {
    return false;
  }
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 2 ** 32 - 1 &&
    String(index) === key
  );
};

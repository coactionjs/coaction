import { highlight } from 'fumadocs-core/highlight';

/** Line ranges (1-based, inclusive) tagged with `data-mark` for styling. */
export type CodeMarks = Record<string, readonly [number, number]>;

/** Finds the lines of a method `name(` … `},` in a code sample. */
export function methodLines(
  code: string,
  name: string
): readonly [number, number] {
  const lines = code.split('\n');
  const start = lines.findIndex((line) =>
    line.trimStart().startsWith(`${name}(`)
  );
  if (start < 0) throw new Error(`No method ${name} in the sample`);
  const indent = lines[start].length - lines[start].trimStart().length;
  const end = lines.findIndex(
    (line, index) =>
      index > start &&
      line.length - line.trimStart().length === indent &&
      line.trim().startsWith('}')
  );
  return [start + 1, end + 1];
}

/** Code highlighted by Shiki at build time with the documentation's themes. */
export async function HighlightedCode({
  code,
  lang,
  marks = {}
}: {
  code: string;
  lang: 'ts' | 'tsx' | 'bash';
  marks?: CodeMarks;
}) {
  return highlight(code, {
    lang,
    transformers: [
      {
        line(node, line) {
          for (const [name, [from, to]] of Object.entries(marks)) {
            if (line >= from && line <= to) node.properties['data-mark'] = name;
          }
        }
      }
    ]
  });
}

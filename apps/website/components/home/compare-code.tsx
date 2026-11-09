import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { CoactionMark } from '@/components/logo';
import type { Locale } from '@/lib/i18n';
import { localePath } from '@/lib/site';
import { HighlightedCode, linesWith, methodLines } from './highlighted-code';
import { SectionHeader } from './section';

// Both samples are the README's 30-second example.
const coactionCode = `import { create, observer } from '@coaction/react';

const useCounter = create((set) => ({
  count: 0,
  step: 1,

  // Cached automatically. Recomputed only when a dependency changes.
  get doubled() {
    return this.count * 2;
  },

  increment() {
    set(() => {
      this.count += this.step; // mutable-looking recipe, immutable next state
    });
  }
}));

const Counter = observer(() => {
  const store = useCounter(); // tracks only the fields this render reads

  return (
    <button onClick={store.increment}>
      {store.count} × 2 = {store.doubled}
    </button>
  );
});`;

const zustandCode = `import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';

const useCounter = create((set) => ({
  count: 0,
  step: 1,
  increment: () => set((s) => ({ count: s.count + s.step }))
}));

function Counter() {
  const { count, step } = useCounter(
    useShallow((s) => ({ count: s.count, step: s.step }))
  );
  const doubled = useMemo(() => count * 2, [count]);

  return (
    <button onClick={() => useCounter.getState().increment()}>
      {count} × 2 = {doubled}
    </button>
  );
}`;

const copy = {
  en: {
    eyebrow: 'Less glue',
    title: (
      <>
        The same counter, <em>minus the selector plumbing.</em>
      </>
    ),
    lede: 'A Coaction store reads like a Zustand store. What goes away is the code that only exists to stop extra renders: selectors, shallow equality and hand-written memoization.',
    gains: [
      'No selector in the component',
      'No dependency array for doubled',
      'No manual memoization'
    ],
    note: 'Selectors, createSelector() and useStore(selector) stay available whenever you want them.',
    migrate: 'Migrating from Zustand'
  },
  zh: {
    eyebrow: '更少的胶水代码',
    title: (
      <>
        同一个计数器，<em>省掉选择器的管道。</em>
      </>
    ),
    lede: 'Coaction 的 store 读起来就像 Zustand 的 store。消失的是那些只为避免多余渲染而写的代码：选择器、浅比较和手写的记忆化。',
    gains: ['组件里没有选择器', 'doubled 不需要依赖数组', '不用手写记忆化'],
    note: '需要时，选择器、createSelector() 与 useStore(selector) 依然可用。',
    migrate: '从 Zustand 迁移'
  }
} as const;

export function CompareCode({ lang }: { lang: Locale }) {
  const text = copy[lang];
  const coactionMarks = {
    gain: methodLines(coactionCode, 'get doubled'),
    ...linesWith(coactionCode, 'observer(', 'gain')
  };
  const zustandMarks = {
    ...linesWith(zustandCode, 'useShallow', 'glue'),
    ...linesWith(zustandCode, 'useMemo', 'glue'),
    ...linesWith(zustandCode, 's.count, step: s.step', 'glue')
  };

  return (
    <section className="section compare" aria-labelledby="compare-title">
      <SectionHeader
        id="compare-title"
        eyebrow={text.eyebrow}
        title={text.title}
        lede={text.lede}
      />
      <div className="compare__panels" data-reveal="stagger">
        <figure className="code-panel compare__panel" data-library="coaction">
          <figcaption className="code-panel__bar">
            <CoactionMark className="compare__mark" />
            <span className="compare__name">Coaction</span>
            <span className="code-panel__file">counter.tsx</span>
          </figcaption>
          <HighlightedCode
            code={coactionCode}
            lang="tsx"
            marks={coactionMarks}
          />
        </figure>
        <figure className="code-panel compare__panel" data-library="zustand">
          <figcaption className="code-panel__bar">
            <span className="compare__name">Zustand</span>
            <span className="code-panel__file">counter.tsx</span>
          </figcaption>
          <HighlightedCode code={zustandCode} lang="tsx" marks={zustandMarks} />
        </figure>
      </div>
      <div className="compare__footer">
        <ul className="compare__gains">
          {text.gains.map((gain) => (
            <li key={gain}>
              <Check size={16} aria-hidden="true" />
              {gain}
            </li>
          ))}
        </ul>
        <p className="compare__note">
          {text.note}{' '}
          <Link href={localePath(lang, 'docs/guides/from-zustand')}>
            {text.migrate}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      </div>
    </section>
  );
}

'use client';

import { create, observer } from '@coaction/react';
import { RotateCcw } from 'lucide-react';
import { memo, useRef, useState, type ReactNode } from 'react';
import type { Locale } from '@/lib/i18n';

type Item = { name: string; price: number };
type Theme = 'light' | 'dark';

const names = ['Ada', 'Grace', 'Alan', 'Barbara', 'Edsger'];
const goods: readonly Item[] = [
  { name: 'Pen', price: 3 },
  { name: 'Ink', price: 5 },
  { name: 'Lamp', price: 24 },
  { name: 'Chair', price: 80 }
];

/** How many times `total` actually ran; reads served from its cache don't count. */
let totalRuns = 0;
/** Renders per column since the page loaded, to report what each commit cost. */
const renders = { tracked: 0, whole: 0 };

interface Shop {
  user: { name: string; age: number };
  cart: { items: Item[] };
  theme: Theme;
  readonly total: number;
  rename(name: string): void;
  birthday(): void;
  addItem(item: Item): void;
  setTheme(theme: Theme): void;
}

// The store shown in the code panel, run by the Coaction in this repository.
const useShop = create<Shop>((set) => ({
  user: { name: 'Ada', age: 36 },
  cart: { items: [{ name: 'Notebook', price: 12 }] },
  theme: 'light',

  get total() {
    totalRuns += 1;
    return this.cart.items.reduce((sum, item) => sum + item.price, 0);
  },

  rename(name: string) {
    set(() => {
      this.user.name = name;
    });
  },
  birthday() {
    set(() => {
      this.user.age += 1;
    });
  },
  addItem(item: Item) {
    set(() => {
      this.cart.items.push(item);
    });
  },
  setTheme(theme: Theme) {
    set(() => {
      this.theme = theme;
    });
  }
}));

type Column = keyof typeof renders;
type ActionId = 'rename' | 'birthday' | 'addItem' | 'setTheme';

const rows: ReadonlyArray<{
  component: string;
  reads: string;
  read: (shop: Shop) => ReactNode;
}> = [
  {
    component: '<Avatar />',
    reads: 'user.name',
    read: (shop) => shop.user.name
  },
  {
    component: '<AgeBadge />',
    reads: 'user.age',
    read: (shop) => shop.user.age
  },
  {
    component: '<CartTotal />',
    reads: 'total',
    read: (shop) => `$${shop.total}`
  },
  {
    component: '<ItemList />',
    reads: 'cart.items',
    read: (shop) => shop.cart.items.map((item) => item.name).join(', ')
  }
];

/** Commits so far; a render belongs to the commit it shows. */
let commits = 0;
useShop.subscribe(() => {
  commits += 1;
});

/**
 * Counts the renders of the component that calls it, at most once per
 * commit, so StrictMode's double render in development counts once too.
 */
function useRenderCount(column: Column) {
  const count = useRef(0);
  const seen = useRef(-1);
  // Counting renders is what this demo shows, so it writes during render.
  if (seen.current !== commits) {
    seen.current = commits;
    count.current += 1;
    renders[column] += 1;
  }
  return count.current;
}

function Cell({ value, count }: { value: ReactNode; count: number }) {
  return (
    <span className="pg-cell">
      <span className="pg-cell__value">{value}</span>
      <span
        className="pg-cell__count"
        key={count}
        data-flash={count > 1 || undefined}
      >
        {count}
      </span>
    </span>
  );
}

/** Tracked: re-renders only when what `read` touched changes. */
const TrackedCell = observer(function TrackedCell({
  read
}: {
  read: (shop: Shop) => ReactNode;
}) {
  const shop = useShop();
  const count = useRenderCount('tracked');
  return <Cell value={read(shop)} count={count} />;
});

/** Untracked: a plain hook outside observer() subscribes to the whole store. */
const WholeCell = memo(function WholeCell({
  read
}: {
  read: (shop: Shop) => ReactNode;
}) {
  const shop = useShop();
  const count = useRenderCount('whole');
  return <Cell value={read(shop)} count={count} />;
});

const copy = {
  en: {
    component: 'Component',
    reads: 'Reads',
    tracked: 'observer()',
    whole: 'plain useShop()',
    run: 'Run an action',
    reset: 'Reset',
    idle: 'Run an action to see which components re-render.',
    last: 'Last commit',
    rerenders: (count: number) =>
      `${count} ${count === 1 ? 're-render' : 're-renders'}`,
    cached: 'get total() reused its cache',
    recomputed: 'get total() ran again',
    renderHint: 'Numbers count each cell’s renders.',
    totals: (tracked: number, whole: number) =>
      `So far: ${tracked} renders with observer(), ${whole} without.`
  },
  zh: {
    component: '组件',
    reads: '读取',
    tracked: 'observer()',
    whole: '普通 useShop()',
    run: '执行一个 action',
    reset: '重置',
    idle: '执行一个 action，看看哪些组件会重渲染。',
    last: '上一次提交',
    rerenders: (count: number) => `${count} 次重渲染`,
    cached: 'get total() 命中缓存',
    recomputed: 'get total() 重新计算',
    renderHint: '数字为每个单元格的渲染次数。',
    totals: (tracked: number, whole: number) =>
      `累计：observer() 渲染 ${tracked} 次，普通 useShop() 渲染 ${whole} 次。`
  }
} as const;

const Table = memo(function Table({ lang }: { lang: Locale }) {
  const text = copy[lang];
  return (
    <table className="pg-table">
      <thead>
        <tr>
          <th scope="col">{text.component}</th>
          <th scope="col" data-column="tracked">
            {text.tracked}
          </th>
          <th scope="col" data-column="whole">
            {text.whole}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.component}>
            <th scope="row">
              <code className="pg-table__component">{row.component}</code>
              <span className="pg-table__reads">
                {text.reads} <code>{row.reads}</code>
              </span>
            </th>
            <td data-column="tracked">
              <TrackedCell read={row.read} />
            </td>
            <td data-column="whole">
              <WholeCell read={row.read} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});

interface Result {
  action: ActionId;
  call: string;
  tracked: number;
  whole: number;
  recomputed: boolean;
  /** Renders since the last reset, including the first. */
  totals: { tracked: number; whole: number };
}

export function Playground({
  lang,
  code
}: {
  lang: Locale;
  code: { store: ReactNode; components: ReactNode };
}) {
  const text = copy[lang];
  const [tab, setTab] = useState<'store' | 'components'>('store');
  const [result, setResult] = useState<Result | null>(null);
  const [generation, setGeneration] = useState(0);
  const [cursor, setCursor] = useState({ name: 0, item: 0 });
  const [theme, setTheme] = useState<Theme>('light');
  const baseline = useRef({ tracked: 0, whole: 0 });

  const nextName = names[(cursor.name + 1) % names.length];
  const nextItem = goods[cursor.item % goods.length];
  const nextTheme: Theme = theme === 'light' ? 'dark' : 'light';

  const actions: ReadonlyArray<{
    id: ActionId;
    call: string;
    run: () => void;
  }> = [
    {
      id: 'rename',
      call: `rename('${nextName}')`,
      run: () => {
        useShop.getState().rename(nextName);
        setCursor((value) => ({ ...value, name: value.name + 1 }));
      }
    },
    {
      id: 'birthday',
      call: 'birthday()',
      run: () => useShop.getState().birthday()
    },
    {
      id: 'addItem',
      call: `addItem(${nextItem.name.toLowerCase()})`,
      run: () => {
        useShop.getState().addItem({ ...nextItem });
        setCursor((value) => ({ ...value, item: value.item + 1 }));
      }
    },
    {
      id: 'setTheme',
      call: `setTheme('${nextTheme}')`,
      run: () => {
        useShop.getState().setTheme(nextTheme);
        setTheme(nextTheme);
      }
    }
  ];

  const perform = (action: (typeof actions)[number]) => {
    const before = { ...renders };
    const runs = totalRuns;
    action.run();
    // React has rendered the commit by the next frame; report what it cost.
    requestAnimationFrame(() => {
      setResult({
        action: action.id,
        call: action.call,
        tracked: renders.tracked - before.tracked,
        whole: renders.whole - before.whole,
        recomputed: totalRuns > runs,
        totals: {
          tracked: renders.tracked - baseline.current.tracked,
          whole: renders.whole - baseline.current.whole
        }
      });
    });
  };

  const reset = () => {
    useShop.setState(useShop.getInitialState());
    // The remounted cells render once more; start the totals from there.
    requestAnimationFrame(() => {
      baseline.current = {
        tracked: renders.tracked - rows.length,
        whole: renders.whole - rows.length
      };
    });
    setResult(null);
    setCursor({ name: 0, item: 0 });
    setTheme('light');
    setGeneration((value) => value + 1);
  };

  return (
    <div className="playground" data-reveal>
      <div
        className="code-panel pg-code"
        data-active={result?.action}
        data-recomputed={result?.recomputed || undefined}
      >
        <div className="code-panel__bar">
          <span className="code-panel__dot" />
          <span className="code-panel__dot" />
          <span className="code-panel__dot" />
          <div className="code-panel__tabs" role="tablist">
            {(['store', 'components'] as const).map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                className="code-panel__tab"
                aria-selected={tab === name}
                onClick={() => setTab(name)}
              >
                {name === 'store' ? 'store.ts' : 'components.tsx'}
              </button>
            ))}
          </div>
        </div>
        <div className="pg-code__body" role="tabpanel">
          {tab === 'store' ? code.store : code.components}
        </div>
      </div>

      <div className="pg-panel">
        <div className="pg-actions">
          <div className="pg-actions__head">
            <span>{text.run}</span>
            <button type="button" className="pg-reset" onClick={reset}>
              <RotateCcw size={13} aria-hidden="true" /> {text.reset}
            </button>
          </div>
          <div className="pg-actions__list">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="pg-action"
                data-active={result?.action === action.id || undefined}
                onClick={() => perform(action)}
              >
                <code>{action.call}</code>
              </button>
            ))}
          </div>
        </div>

        <Table key={generation} lang={lang} />

        <div className="pg-result" aria-live="polite">
          {result ? (
            <>
              <span className="pg-result__label">
                {text.last} <code>{result.call}</code>
              </span>
              <span className="pg-result__stat" data-column="tracked">
                {text.tracked} <b>{text.rerenders(result.tracked)}</b>
              </span>
              <span className="pg-result__stat" data-column="whole">
                {text.whole} <b>{text.rerenders(result.whole)}</b>
              </span>
              <span className="pg-result__stat" data-column="getter">
                {result.recomputed ? text.recomputed : text.cached}
              </span>
              <span className="pg-result__totals">
                {text.totals(result.totals.tracked, result.totals.whole)}
              </span>
            </>
          ) : (
            <span className="pg-result__label">{text.idle}</span>
          )}
        </div>
        <p className="pg-hint">{text.renderHint}</p>
      </div>
    </div>
  );
}

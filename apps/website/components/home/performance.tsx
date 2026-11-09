import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';
import { githubUrl, localePath } from '@/lib/site';
import { SectionHeader } from './section';

type Series = 'coaction' | 'zustand';
interface Row {
  id: string;
  series: Series;
  value: number;
  rme: string;
  /** Drawn in the chart; the rest appear in the note and the table. */
  drawn: boolean;
}

// docs/benchmarking/4.0-measurements.md: Apple M1 Max, Node 24.16.0,
// runtime 12ae616, 2026-09-11.
const stableReads: Row[] = [
  {
    id: 'getter',
    series: 'coaction',
    value: 66_109_753,
    rme: '±1.67%',
    drawn: true
  },
  {
    id: 'manual',
    series: 'coaction',
    value: 33_809_569,
    rme: '±1.27%',
    drawn: true
  },
  {
    id: 'selector',
    series: 'zustand',
    value: 787_472,
    rme: '±0.13%',
    drawn: true
  },
  {
    id: 'maintained',
    series: 'zustand',
    value: 112_062_542,
    rme: '±0.25%',
    drawn: true
  }
];

const updateThenRead: Row[] = [
  {
    id: 'getter',
    series: 'coaction',
    value: 48_480,
    rme: '±0.81%',
    drawn: true
  },
  {
    id: 'manual',
    series: 'coaction',
    value: 48_318,
    rme: '±0.66%',
    drawn: true
  },
  {
    id: 'replace',
    series: 'coaction',
    value: 169,
    rme: '±4.15%',
    drawn: false
  },
  {
    id: 'selector',
    series: 'zustand',
    value: 88_113,
    rme: '±0.48%',
    drawn: true
  },
  {
    id: 'maintained',
    series: 'zustand',
    value: 2_897_112,
    rme: '±0.53%',
    drawn: false
  }
];

const copy = {
  en: {
    eyebrow: 'Honest numbers',
    title: (
      <>
        Fast where it counts. <em>Upfront about the cost.</em>
      </>
    ),
    lede: 'Coaction is built for immutable state, cached derived reads and fine-grained invalidation. It does not claim to win every microbenchmark, so here are both sides, measured with the repository’s own benchmarks.',
    unit: '1,000-item cart · ops/sec · higher is better',
    reads: {
      title: 'Reading derived state',
      claim: 'faster than a selector that recomputes the total on every read',
      note: 'A hand-maintained total is faster still, because the application does the consistency work itself.',
      rows: {
        getter: 'Coaction cached accessor getter',
        manual: 'Coaction computed with manual deps',
        selector: 'Zustand selector recompute',
        maintained: 'Zustand maintained total field'
      }
    },
    updates: {
      title: 'Update, then read',
      claim:
        'of Zustand’s selector throughput when every update is followed by a read',
      note: 'Not drawn: a hand-maintained Zustand total reaches 2,897,112 ops/sec, and replacing large objects drops Coaction to 169, so prefer a focused draft recipe for big collections.',
      rows: {
        getter: 'Coaction mutable update + cached getter',
        manual: 'Coaction mutable update + manual deps',
        replace: 'Coaction object replacement + cached getter',
        selector: 'Zustand immutable update + selector recompute',
        maintained: 'Zustand immutable update + maintained total'
      }
    },
    table: 'All results as a table',
    columns: ['Case', 'ops/sec', 'RME'],
    source:
      'Apple M1 Max, Node 24.16.0, runtime 12ae616, measured 2026-09-11. Single-machine numbers, not release floors; no React rendering is timed.',
    method: 'Methodology',
    guide: 'Performance guide'
  },
  zh: {
    eyebrow: '坦诚的数字',
    title: (
      <>
        该快的地方快，<em>代价也摆在明处。</em>
      </>
    ),
    lede: 'Coaction 为不可变状态、缓存的派生读取与细粒度失效而优化，并不宣称赢下每一个微基准。两边的数据都在这里，来自仓库自带的基准测试。',
    unit: '1,000 件商品的购物车 · 每秒操作数 · 越高越好',
    reads: {
      title: '读取派生状态',
      claim: '对比每次读取都重新计算总价的选择器',
      note: '手动维护的总价字段更快，因为一致性工作由应用自己承担。',
      rows: {
        getter: 'Coaction 缓存的访问器 getter',
        manual: 'Coaction 手动声明依赖的计算值',
        selector: 'Zustand 选择器重新计算',
        maintained: 'Zustand 手动维护的总价字段'
      }
    },
    updates: {
      title: '先更新，再读取',
      claim: '每次更新后都读取时，相当于 Zustand 选择器吞吐量的比例',
      note: '图中未画出：Zustand 手动维护总价可达每秒 2,897,112 次；整体替换大对象会让 Coaction 降到每秒 169 次，大集合请用聚焦的草稿修改。',
      rows: {
        getter: 'Coaction 可变式更新 + 缓存 getter',
        manual: 'Coaction 可变式更新 + 手动依赖',
        replace: 'Coaction 整体替换对象 + 缓存 getter',
        selector: 'Zustand 不可变更新 + 选择器重新计算',
        maintained: 'Zustand 不可变更新 + 手动维护总价'
      }
    },
    table: '以表格查看全部结果',
    columns: ['用例', '每秒操作数', '误差'],
    source:
      'Apple M1 Max，Node 24.16.0，运行时 12ae616，测于 2026-09-11。单机数据，并非发布门槛；不包含 React 渲染。',
    method: '测试方法',
    guide: '性能指南'
  }
} as const;

const compact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1
});
const full = new Intl.NumberFormat('en');

/** Round tick steps (1, 2, 2.5, 3 or 5 × 10ⁿ) that cover the largest value. */
function ticks(max: number) {
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 3, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const count = Math.ceil(max / step);
  return Array.from({ length: count + 1 }, (_, index) => index * step);
}

function Chart({
  headline,
  claim,
  title,
  unit,
  note,
  rows,
  names
}: {
  headline: string;
  claim: string;
  title: string;
  unit: string;
  note: string;
  rows: Row[];
  names: Record<string, string>;
}) {
  const drawn = rows
    .filter((row) => row.drawn)
    .sort((a, b) => b.value - a.value);
  const scale = ticks(Math.max(...drawn.map((row) => row.value)));
  const domain = scale[scale.length - 1];
  return (
    <figure className="perf-chart">
      <figcaption className="perf-chart__head">
        <p className="perf-chart__figure">
          <span className="perf-chart__headline">{headline}</span>
          <span className="perf-chart__claim">{claim}</span>
        </p>
        <h3>{title}</h3>
        <p className="perf-chart__unit">{unit}</p>
      </figcaption>
      <div className="perf-chart__plot">
        <div className="perf-chart__grid" aria-hidden="true">
          {scale.map((tick) => (
            <span
              key={tick}
              className="perf-chart__tick"
              style={{ left: `${(tick / domain) * 100}%` }}
            >
              <span>{compact.format(tick)}</span>
            </span>
          ))}
        </div>
        <ul className="perf-chart__bars">
          {drawn.map((row) => (
            <li
              key={row.id}
              className="perf-bar"
              data-series={row.series}
              aria-label={`${names[row.id]}: ${full.format(row.value)} ops/sec`}
            >
              <span className="perf-bar__label">{names[row.id]}</span>
              <span className="perf-bar__track">
                <span
                  className="perf-bar__fill"
                  style={{ width: `${(row.value / domain) * 100}%` }}
                />
                <span className="perf-bar__value">
                  {compact.format(row.value)}
                </span>
              </span>
              <span className="perf-bar__tip" aria-hidden="true">
                <strong>{full.format(row.value)}</strong> ops/sec · {row.rme}
                <span>{names[row.id]}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="perf-chart__note">{note}</p>
    </figure>
  );
}

export function Performance({ lang }: { lang: Locale }) {
  const text = copy[lang];
  const ratio = (a: number, b: number) => a / b;
  const readsGain = Math.round(
    ratio(stableReads[0].value, stableReads[2].value)
  );
  const updateShare = ratio(updateThenRead[0].value, updateThenRead[3].value);
  return (
    <section className="section perf" aria-labelledby="perf-title">
      <SectionHeader
        id="perf-title"
        eyebrow={text.eyebrow}
        title={text.title}
        lede={text.lede}
      />
      <p className="perf__legend">
        <span data-series="coaction">Coaction</span>
        <span data-series="zustand">Zustand</span>
      </p>
      <div className="perf__charts" data-reveal="stagger">
        <Chart
          headline={`${readsGain}×`}
          claim={text.reads.claim}
          title={text.reads.title}
          unit={text.unit}
          note={text.reads.note}
          rows={stableReads}
          names={text.reads.rows}
        />
        <Chart
          headline={`${updateShare.toFixed(2)}×`}
          claim={text.updates.claim}
          title={text.updates.title}
          unit={text.unit}
          note={text.updates.note}
          rows={updateThenRead}
          names={text.updates.rows}
        />
      </div>
      <details className="perf__table">
        <summary>{text.table}</summary>
        {(
          [
            [text.reads.title, stableReads, text.reads.rows],
            [text.updates.title, updateThenRead, text.updates.rows]
          ] as const
        ).map(([caption, rows, names]) => (
          <table key={caption}>
            <caption>{caption}</caption>
            <thead>
              <tr>
                {text.columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{names[row.id as keyof typeof names]}</th>
                  <td>{full.format(row.value)}</td>
                  <td>{row.rme}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </details>
      <p className="perf__source">
        {text.source}{' '}
        <a
          href={`${githubUrl}/blob/main/docs/benchmarking/4.0-measurements.md`}
          target="_blank"
          rel="noreferrer"
        >
          {text.method}
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>{' '}
        <Link href={localePath(lang, 'docs/guides/performance')}>
          {text.guide}
        </Link>
      </p>
    </section>
  );
}

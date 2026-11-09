import Link from 'next/link';
import { ArrowRight, Check, Minus } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { localePath } from '@/lib/site';
import { SectionHeader } from './section';

/** yes, partly or no, or `about` for a plain description; every cell also says it in words. */
type Level = 'yes' | 'partly' | 'no' | 'about';
type Cell = readonly [Level, string];
type Row = readonly [string, Cell, Cell, Cell];
type Rows = readonly Row[];

const copy = {
  en: {
    eyebrow: 'Fit',
    title: (
      <>
        Coaction, Zustand <em>or MobX?</em>
      </>
    ),
    lede: 'Getters, this and automatic tracking are not new: MobX has shipped them for a decade. What is uncommon is having them on an immutable substrate, behind a Zustand-style create(), across five frameworks.',
    honest: 'Honest answer',
    headline: 'Most apps don’t need it.',
    intro:
      'For plain single-tab state with a few values, Zustand or Jotai is a smaller dependency with a bigger ecosystem. Coaction earns its place when you want several of these at once:',
    wants: [
      'Immutable snapshots with automatic deep render tracking',
      'Cached derived state without hand-written memoization',
      'Mutable-looking writes that produce an immutable result',
      'Undo, persistence or sync built on the same transitions',
      'A Worker or SharedWorker as the authority for one state',
      'Local-first remote synchronization',
      'One model that grows without a second runtime'
    ],
    costs:
      'Know the costs: about 10.7 KiB gzip for the coaction consumer fixture with dependencies externalized, and roughly half of Zustand’s throughput when every update is followed by a read.',
    whenNot: 'When not to use Coaction',
    columns: ['', 'Coaction', 'Zustand', 'MobX'],
    rows: [
      [
        'Model',
        ['about', 'Immutable reactive state'],
        ['about', 'Minimal external store'],
        ['about', 'Mutable observable graph']
      ],
      [
        'Render tracking without selectors',
        ['yes', 'observer(), or selectors'],
        ['no', 'Selectors + useShallow'],
        ['yes', 'observer()']
      ],
      ['get value() and this', ['yes', 'Yes'], ['no', 'No'], ['yes', 'Yes']],
      [
        'Memoized derived values',
        ['yes', 'Across independent reads'],
        ['no', 'useMemo or reselect'],
        ['partly', 'While observed, by default']
      ],
      [
        'Frozen snapshots, structural sharing',
        ['yes', 'Yes'],
        ['partly', 'Via Immer or Mutative'],
        ['no', 'Mutable observables']
      ],
      [
        'Transition and patch substrate',
        ['yes', 'Core capability'],
        ['no', 'Not core'],
        ['partly', 'mobx-state-tree']
      ],
      [
        'Worker or SharedWorker authority',
        ['yes', 'Built-in shared runtime'],
        ['no', 'Application concern'],
        ['no', 'Application concern']
      ],
      [
        'Local-first sync',
        ['yes', '@coaction/sync'],
        ['no', 'External'],
        ['partly', 'Library-dependent']
      ],
      [
        'Runtime cost',
        ['partly', 'Pays for immutable transitions'],
        ['yes', 'Very small'],
        ['yes', 'Tuned for observable mutation']
      ]
    ] satisfies Rows
  },
  zh: {
    eyebrow: '适用场景',
    title: (
      <>
        Coaction、Zustand <em>还是 MobX？</em>
      </>
    ),
    lede: 'getter、this 和自动追踪并不新鲜，MobX 已经提供了十年。少见的是把它们放在不可变的底座上、藏在 Zustand 风格的 create() 后面，并且横跨五个框架。',
    honest: '坦白说',
    headline: '大多数应用并不需要它。',
    intro:
      '如果只是单个标签页里的少量状态，Zustand 或 Jotai 依赖更小、生态更大。当你同时需要下面其中几项时，Coaction 才值得引入：',
    wants: [
      '带自动深度渲染追踪的不可变快照',
      '无需手写记忆化的缓存派生状态',
      '写法像可变、结果却不可变的更新',
      '建立在同一套状态转换上的撤销、持久化或同步',
      '以 Worker 或 SharedWorker 作为同一份状态的权威',
      '本地优先的远程同步',
      '一套能持续生长、无需第二个运行时的模型'
    ],
    costs:
      '先了解代价：在依赖外置的情况下，coaction 使用方测试包约 10.7 KiB（gzip）；在“每次更新后都读取”的场景中，吞吐量约为 Zustand 的一半。',
    whenNot: '何时不该使用 Coaction',
    columns: ['', 'Coaction', 'Zustand', 'MobX'],
    rows: [
      [
        '模型',
        ['about', '不可变响应式状态'],
        ['about', '极简外部 store'],
        ['about', '可变的可观察对象图']
      ],
      [
        '无需选择器的渲染追踪',
        ['yes', 'observer() 或选择器'],
        ['no', '选择器 + useShallow'],
        ['yes', 'observer()']
      ],
      [
        'get value() 与 this',
        ['yes', '支持'],
        ['no', '不支持'],
        ['yes', '支持']
      ],
      [
        '派生值记忆化',
        ['yes', '跨独立读取缓存'],
        ['no', 'useMemo 或 reselect'],
        ['partly', '默认仅在被观察时']
      ],
      [
        '冻结快照与结构共享',
        ['yes', '支持'],
        ['partly', '借助 Immer 或 Mutative'],
        ['no', '可变的可观察对象']
      ],
      [
        '状态转换与补丁底座',
        ['yes', '核心能力'],
        ['no', '非核心'],
        ['partly', 'mobx-state-tree']
      ],
      [
        'Worker / SharedWorker 权威',
        ['yes', '内置共享运行时'],
        ['no', '由应用自行处理'],
        ['no', '由应用自行处理']
      ],
      [
        '本地优先同步',
        ['yes', '@coaction/sync'],
        ['no', '外部方案'],
        ['partly', '取决于所用库']
      ],
      [
        '运行时开销',
        ['partly', '为不可变状态转换付出代价'],
        ['yes', '非常小'],
        ['yes', '为可观察对象的修改而优化']
      ]
    ] satisfies Rows
  }
} as const;

function Mark({ level }: { level: Level }) {
  if (level === 'yes') return <Check size={14} aria-hidden="true" />;
  if (level === 'no') return <Minus size={14} aria-hidden="true" />;
  if (level === 'about') return null;
  return <span className="fit-table__partly" aria-hidden="true" />;
}

export function Fit({ lang }: { lang: Locale }) {
  const text = copy[lang];
  return (
    <section className="section fit" aria-labelledby="fit-title">
      <SectionHeader
        id="fit-title"
        eyebrow={text.eyebrow}
        title={text.title}
        lede={text.lede}
      />
      <div className="fit__layout" data-reveal="stagger">
        <aside className="fit-card" data-tilt="4">
          <p className="fit-card__kicker">{text.honest}</p>
          <p className="fit-card__headline">{text.headline}</p>
          <p className="fit-card__intro">{text.intro}</p>
          <ul className="fit-card__wants">
            {text.wants.map((want) => (
              <li key={want}>
                <Check size={15} aria-hidden="true" />
                {want}
              </li>
            ))}
          </ul>
          <p className="fit-card__costs">{text.costs}</p>
          <Link
            className="fit-card__link"
            href={localePath(lang, 'docs/guides/when-not-to-use')}
          >
            {text.whenNot}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </aside>
        <div className="fit-table__wrap">
          <table className="fit-table">
            <thead>
              <tr>
                {text.columns.map((column, index) => (
                  <th
                    key={column || index}
                    scope="col"
                    data-column={index === 1 ? 'coaction' : undefined}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {text.rows.map(([feature, ...cells]) => (
                <tr key={feature}>
                  <th scope="row">{feature}</th>
                  {cells.map(([level, value], index) => (
                    <td
                      key={index}
                      data-level={level}
                      data-column={index === 0 ? 'coaction' : undefined}
                    >
                      <Mark level={level} />
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

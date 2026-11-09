import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { CoactionMark } from '@/components/logo';
import type { Locale } from '@/lib/i18n';
import { githubUrl, localePath } from '@/lib/site';
import { SectionHeader } from './section';

type Package = readonly [name: string, folder: string, entry: string];

const frameworks: readonly Package[] = [
  ['React', 'coaction-react', '@coaction/react'],
  ['Vue', 'coaction-vue', '@coaction/vue'],
  ['Angular', 'coaction-ng', '@coaction/ng'],
  ['Svelte', 'coaction-svelte', '@coaction/svelte'],
  ['Solid', 'coaction-solid', '@coaction/solid']
];

const adapters: readonly Package[] = [
  ['Zustand', 'coaction-zustand', '@coaction/zustand'],
  ['MobX', 'coaction-mobx', '@coaction/mobx'],
  ['Redux Toolkit', 'coaction-redux', '@coaction/redux'],
  ['Pinia', 'coaction-pinia', '@coaction/pinia'],
  ['Jotai', 'coaction-jotai', '@coaction/jotai'],
  ['Valtio', 'coaction-valtio', '@coaction/valtio'],
  ['XState', 'coaction-xstate', '@coaction/xstate']
];

const middleware: readonly Package[] = [
  ['Logger', 'coaction-logger', '@coaction/logger'],
  ['Persist', 'coaction-persist', '@coaction/persist'],
  ['History', 'coaction-history', '@coaction/history'],
  ['Sync', 'coaction-sync', '@coaction/sync'],
  ['Yjs', 'coaction-yjs', '@coaction/yjs']
];

const copy = {
  en: {
    eyebrow: 'Ecosystem',
    title: (
      <>
        Bring your framework. <em>Or keep your store.</em>
      </>
    ),
    lede: 'The core is framework-agnostic. Bindings cover five frameworks, and whole-store adapters let Zustand, MobX, Redux Toolkit, Pinia, Jotai, Valtio and XState stores join the same model.',
    groups: [
      'Framework bindings',
      'State adapters',
      'Middleware and collaboration'
    ],
    docs: ['frameworks', 'adapters', 'middleware'],
    note: 'Support boundaries are documented, not implied: slices are core-only, and adapters bind a whole store.',
    matrix: 'Support matrix',
    guide: 'Guide'
  },
  zh: {
    eyebrow: '生态',
    title: (
      <>
        带上你的框架，<em>或者留下你的 store。</em>
      </>
    ),
    lede: '核心与框架无关。官方绑定覆盖五个框架；整库适配器让 Zustand、MobX、Redux Toolkit、Pinia、Jotai、Valtio 与 XState 的 store 也能接入同一套模型。',
    groups: ['框架绑定', '状态库适配器', '中间件与协同'],
    docs: ['frameworks', 'adapters', 'middleware'],
    note: '支持边界写在文档里，而不是靠猜：slices 仅限核心 store，适配器绑定整个 store。',
    matrix: '支持矩阵',
    guide: '指南'
  }
} as const;

function Orbit() {
  const ring = (items: readonly Package[], kind: 'inner' | 'outer') =>
    items.map(([name], index) => (
      <span
        key={name}
        className="orbit__item"
        data-ring={kind}
        style={
          { '--angle': `${(index * 360) / items.length}deg` } as CSSProperties
        }
      >
        {name}
      </span>
    ));

  return (
    <div className="orbit" aria-hidden="true">
      <div className="orbit__scene">
        <div className="orbit__track orbit__track--inner" />
        <div className="orbit__track orbit__track--outer" />
        <div className="orbit__core">
          <CoactionMark />
        </div>
        <div className="orbit__ring orbit__ring--inner">
          {ring(frameworks, 'inner')}
        </div>
        <div className="orbit__ring orbit__ring--outer">
          {ring(adapters, 'outer')}
        </div>
      </div>
    </div>
  );
}

export function Ecosystem({ lang }: { lang: Locale }) {
  const text = copy[lang];
  const groups = [frameworks, adapters, middleware];
  return (
    <section className="section ecosystem" aria-labelledby="ecosystem-title">
      <div className="ecosystem__layout">
        <div>
          <SectionHeader
            id="ecosystem-title"
            eyebrow={text.eyebrow}
            title={text.title}
            lede={text.lede}
          />
          <div className="ecosystem__groups">
            {groups.map((items, index) => (
              <div key={text.groups[index]} className="ecosystem__group">
                <h3>
                  {text.groups[index]}
                  <Link
                    href={localePath(
                      lang,
                      `docs/integrations/${text.docs[index]}`
                    )}
                  >
                    {text.guide}
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </h3>
                <ul>
                  {items.map(([name, folder, entry]) => (
                    <li key={entry}>
                      <a
                        href={`${githubUrl}/tree/main/packages/${folder}`}
                        target="_blank"
                        rel="noreferrer"
                        title={entry}
                      >
                        <span>{name}</span>
                        <code>{entry}</code>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="ecosystem__note">
            {text.note}{' '}
            <Link href={localePath(lang, 'docs/reference/support-matrix')}>
              {text.matrix}
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </p>
        </div>
        <Orbit />
      </div>
    </section>
  );
}

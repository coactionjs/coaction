import {
  Cloud,
  Cpu,
  HardDrive,
  History,
  ScanSearch,
  Users
} from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { SectionHeader } from './section';

const copy = {
  en: {
    eyebrow: 'Transitions',
    title: (
      <>
        Every write is a transition <em>you can reuse.</em>
      </>
    ),
    lede: 'set() turns a recipe into the next snapshot and a commit. When a feature needs them, the commit carries patches and inverse patches, and undo, persistence, sync and shared runtimes all build on it instead of inventing their own write semantics.',
    commit: 'commit',
    patches: 'patches + inverse patches',
    outputs: [
      [
        'Reactivity',
        'coaction',
        'Invalidates only the readers of what changed.'
      ],
      [
        'Undo / redo',
        '@coaction/history',
        'Steps back and forth with inverse patches.'
      ],
      [
        'Persistence',
        '@coaction/persist',
        'Saves commits; late hydration never overwrites new edits.'
      ],
      [
        'Local-first sync',
        '@coaction/sync',
        'A durable outbox, rebased over pulled remote changes.'
      ],
      ['Collaboration', '@coaction/yjs', 'Binds the store to a Yjs document.'],
      [
        'Shared runtime',
        'coaction/shared',
        'One authority in a Worker, a mirror in every tab.'
      ]
    ],
    backends: 'Sync backends'
  },
  zh: {
    eyebrow: '状态转换',
    title: (
      <>
        每一次写入，<em>都是可复用的状态转换。</em>
      </>
    ),
    lede: 'set() 把一段修改配方变成下一份快照和一次提交。功能需要时，提交会携带补丁与逆向补丁；撤销重做、持久化、同步和共享运行时都建立在它之上，不必各自发明写入语义。',
    commit: '提交',
    patches: '补丁 + 逆向补丁',
    outputs: [
      ['响应式追踪', 'coaction', '只让读取了变化部分的消费者失效。'],
      ['撤销 / 重做', '@coaction/history', '用逆向补丁前进与后退。'],
      ['持久化', '@coaction/persist', '保存提交；迟到的恢复不会覆盖新的编辑。'],
      [
        '本地优先同步',
        '@coaction/sync',
        '持久化发件箱，在拉取的远端变更之上变基。'
      ],
      ['协同编辑', '@coaction/yjs', '把 store 绑定到 Yjs 文档。'],
      [
        '共享运行时',
        'coaction/shared',
        'Worker 中唯一的权威，每个标签页一份镜像。'
      ]
    ],
    backends: '同步后端'
  }
} as const;

const icons = [ScanSearch, History, HardDrive, Cloud, Users, Cpu];
const backends = [
  'Fetch',
  'CRUD',
  'Supabase',
  'Firestore',
  'TanStack Query',
  'IndexedDB'
];

/** Centres of the six equal card columns, in the diagram's 1000 units. */
const columns = [83, 250, 417, 583, 750, 917];

export function Transitions({ lang }: { lang: Locale }) {
  const text = copy[lang];
  return (
    <section
      className="section transitions"
      aria-labelledby="transitions-title"
    >
      <SectionHeader
        id="transitions-title"
        eyebrow={text.eyebrow}
        title={text.title}
        lede={text.lede}
        align="center"
      />
      <div className="fanout" data-reveal>
        <div className="fanout__top">
          <svg
            className="fanout__wires"
            viewBox="0 0 1000 300"
            aria-hidden="true"
          >
            <path className="fanout__stem" d="M500 52 V136" />
            {columns.map((x, index) => (
              <g key={x}>
                <path
                  id={`fanout-${index}`}
                  className="fanout__wire"
                  d={`M500 168 C500 232 ${x} 214 ${x} 292`}
                />
                <circle className="fanout__pulse" r="4.5">
                  <animateMotion
                    dur="2.6s"
                    begin={`${index * 0.18}s`}
                    repeatCount="indefinite"
                    keyPoints="0;1;1"
                    keyTimes="0;0.55;1"
                    calcMode="linear"
                  >
                    <mpath href={`#fanout-${index}`} />
                  </animateMotion>
                </circle>
              </g>
            ))}
          </svg>
          <code className="fanout__call">
            set(() =&gt; {'{'} this.todos.push(todo) {'}'})
          </code>
          <div className="fanout__commit">
            <span className="fanout__commit-ring" aria-hidden="true" />
            <span className="fanout__commit-label">{text.commit}</span>
            <span className="fanout__patches">{text.patches}</span>
          </div>
        </div>
        <ul className="fanout__outputs">
          {text.outputs.map(([name, pkg, body], index) => {
            const Icon = icons[index];
            return (
              <li key={pkg} className="fanout__output" data-tilt="8">
                <Icon size={18} aria-hidden="true" />
                <strong>{name}</strong>
                <code>{pkg}</code>
                <p>{body}</p>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="fanout__backends">
        <span>{text.backends}</span>
        {backends.map((name) => (
          <code key={name}>{name}</code>
        ))}
      </p>
    </section>
  );
}

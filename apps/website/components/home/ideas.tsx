import { Boxes, GitCommitHorizontal, ScanSearch, Sigma } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/i18n';
import { SectionHeader } from './section';

const copy = {
  en: {
    eyebrow: 'The model',
    title: (
      <>
        Immutable state. <em>Signal-level reactivity.</em> Transactional
        updates.
      </>
    ),
    lede: 'Coaction keeps React-style immutable snapshots and adds what they usually lack: fine-grained tracking on reads and reusable transitions on writes.',
    snapshots: {
      title: 'Immutable snapshots, natural writes',
      body: 'Write this.user.age += 1 inside set(). Mutative turns the draft into a new frozen snapshot, and untouched branches stay shared.',
      before: 'snapshot N',
      after: 'snapshot N+1',
      shared: 'shared'
    },
    paths: {
      title: 'Signal-level precision on plain objects',
      body: 'Reads build a path graph on alien-signals. A reader of user.profile.name ignores a change to age, and your model needs no Signal<T> or Atom<T>.',
      none: 'no readers'
    },
    derived: {
      title: 'Getters that cache themselves',
      body: 'A plain get total() is a cached computed value. Its dependencies are found automatically, and every reader shares one result.',
      cached: 'cached'
    },
    transitions: {
      title: 'Every write is a transition',
      body: 'set() produces the next snapshot and a commit, with patches when a feature needs them. Undo, persistence, sync and workers all build on it.'
    }
  },
  zh: {
    eyebrow: '核心模型',
    title: (
      <>
        不可变状态，<em>信号级响应，</em>事务式更新。
      </>
    ),
    lede: 'Coaction 保留 React 式的不可变快照，并补上它通常缺少的两件事：读取时的细粒度依赖追踪，写入时可复用的状态转换。',
    snapshots: {
      title: '不可变快照，自然的写法',
      body: '在 set() 里直接写 this.user.age += 1。Mutative 把草稿变成新的冻结快照，没有改动的分支原样共享。',
      before: '快照 N',
      after: '快照 N+1',
      shared: '共享'
    },
    paths: {
      title: '普通对象，信号级精度',
      body: '读取会在 alien-signals 上构建路径依赖图。读取 user.profile.name 的组件不会因 age 的变化而更新，模型里也不需要 Signal<T> 或 Atom<T>。',
      none: '无人读取'
    },
    derived: {
      title: '会自己缓存的 getter',
      body: '普通的 get total() 就是带缓存的计算值。依赖自动发现，所有读取者共享同一个结果。',
      cached: '已缓存'
    },
    transitions: {
      title: '每次写入都是一次状态转换',
      body: 'set() 产出下一份快照和一次提交，按需附带补丁。撤销重做、持久化、同步和 Worker 都建立在它之上。'
    }
  }
} as const;

type Copy = (typeof copy)[Locale];

function Card({
  icon,
  title,
  body,
  wide = false,
  children
}: {
  icon: ReactNode;
  title: string;
  body: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <article className="idea" data-wide={wide || undefined} data-tilt="5">
      <div className="idea__visual" aria-hidden="true">
        {children}
      </div>
      <div className="idea__text">
        <span className="idea__icon">{icon}</span>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </article>
  );
}

/**
 * Two snapshots after `this.user.age += 1`: root, user and age are new
 * objects, while cart and profile are the very same objects in both.
 */
function SnapshotTrees({ text }: { text: Copy['snapshots'] }) {
  const node = (
    x: number,
    y: number,
    label: string,
    tone: 'old' | 'new' | 'shared'
  ) => (
    <g className={`tree-node tree-node--${tone}`}>
      <rect x={x - 38} y={y - 12} width="76" height="24" rx="12" />
      <text x={x} y={y + 4}>
        {label}
      </text>
    </g>
  );
  return (
    <svg className="snapshot-trees" viewBox="0 0 440 176">
      <text className="tree-caption" x="62" y="14">
        {text.before}
      </text>
      <text className="tree-caption tree-caption--new" x="378" y="14">
        {text.after}
      </text>
      <path className="tree-link" d="M62 44 V92 V142" />
      <path className="tree-link tree-link--new" d="M378 44 V92 V142" />
      <path
        className="tree-link tree-link--shared"
        d="M62 44 H220 M62 92 L220 142"
      />
      <path
        className="tree-link tree-link--shared"
        d="M378 44 H220 M378 92 L220 142"
      />
      {node(62, 44, 'root', 'old')}
      {node(62, 92, 'user', 'old')}
      {node(62, 142, 'age: 36', 'old')}
      {node(378, 44, 'root', 'new')}
      {node(378, 92, 'user', 'new')}
      {node(378, 142, 'age: 37', 'new')}
      {node(220, 44, 'cart', 'shared')}
      {node(220, 142, 'profile', 'shared')}
      <text className="tree-shared-label" x="220" y="96">
        {text.shared}
      </text>
    </svg>
  );
}

/** A path tree whose `name` leaf feeds a component and `age` feeds nothing. */
function PathTree({ text }: { text: Copy['paths'] }) {
  return (
    <div className="path-tree">
      <code className="path-tree__row">user</code>
      <code className="path-tree__row" data-depth="1">
        <span className="path-tree__branch">└─</span> profile
      </code>
      <code className="path-tree__row path-tree__row--hit" data-depth="2">
        <span className="path-tree__branch">├─</span> name
        <span className="path-tree__wire" />
        <span className="path-tree__reader">&lt;UserName /&gt;</span>
      </code>
      <code className="path-tree__row path-tree__row--miss" data-depth="2">
        <span className="path-tree__branch">└─</span> age
        <span className="path-tree__none">{text.none}</span>
      </code>
    </div>
  );
}

/** items → subtotal → total ← taxRate, with the derived nodes cached. */
function DerivedGraph({ text }: { text: Copy['derived'] }) {
  return (
    <svg className="derived-graph" viewBox="0 0 300 150">
      <defs>
        <marker
          id="derived-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 Z" />
        </marker>
      </defs>
      <g className="derived-graph__edges">
        <path d="M78 40 L118 40" markerEnd="url(#derived-arrow)" />
        <path
          d="M206 40 C 226 40 232 52 236 66"
          markerEnd="url(#derived-arrow)"
        />
        <path
          d="M78 116 C 150 116 214 112 236 92"
          markerEnd="url(#derived-arrow)"
        />
      </g>
      <circle className="derived-graph__pulse" r="4">
        <animateMotion
          dur="3.2s"
          repeatCount="indefinite"
          path="M78 116 C 150 116 214 112 236 92"
        />
      </circle>
      <g className="derived-graph__node">
        <rect x="8" y="26" width="70" height="28" rx="14" />
        <text x="43" y="44">
          items
        </text>
      </g>
      <g className="derived-graph__node derived-graph__node--derived">
        <rect x="120" y="26" width="86" height="28" rx="14" />
        <text x="163" y="44">
          subtotal
        </text>
      </g>
      <g className="derived-graph__node">
        <rect x="8" y="102" width="70" height="28" rx="14" />
        <text x="43" y="120">
          taxRate
        </text>
      </g>
      <g className="derived-graph__node derived-graph__node--derived derived-graph__node--total">
        <rect x="222" y="66" width="70" height="28" rx="14" />
        <text x="257" y="84">
          total
        </text>
      </g>
      <text className="derived-graph__badge" x="163" y="16">
        {text.cached}
      </text>
    </svg>
  );
}

/** set() → draft → next snapshot → commit, fanning out to its consumers. */
function TransitionRail() {
  const outputs = ['history', 'persist', 'sync', 'shared'];
  return (
    <div className="transition-rail">
      <div className="transition-rail__steps">
        <code>set()</code>
        <span className="transition-rail__arrow" />
        <code>draft</code>
        <span className="transition-rail__arrow" />
        <code>snapshot N+1</code>
        <span className="transition-rail__arrow" />
        <code className="transition-rail__commit">commit</code>
      </div>
      <div className="transition-rail__outputs">
        {outputs.map((name, index) => (
          <code key={name} style={{ animationDelay: `${index * 0.35}s` }}>
            {name}
          </code>
        ))}
      </div>
    </div>
  );
}

export function Ideas({ lang }: { lang: Locale }) {
  const text = copy[lang];
  return (
    <section className="section ideas" aria-labelledby="ideas-title">
      <SectionHeader
        id="ideas-title"
        eyebrow={text.eyebrow}
        title={text.title}
        lede={text.lede}
      />
      <div className="ideas__grid">
        <Card
          wide
          icon={<Boxes size={18} />}
          title={text.snapshots.title}
          body={text.snapshots.body}
        >
          <SnapshotTrees text={text.snapshots} />
        </Card>
        <Card
          icon={<ScanSearch size={18} />}
          title={text.paths.title}
          body={text.paths.body}
        >
          <PathTree text={text.paths} />
        </Card>
        <Card
          icon={<Sigma size={18} />}
          title={text.derived.title}
          body={text.derived.body}
        >
          <DerivedGraph text={text.derived} />
        </Card>
        <Card
          wide
          icon={<GitCommitHorizontal size={18} />}
          title={text.transitions.title}
          body={text.transitions.body}
        >
          <TransitionRail />
        </Card>
      </div>
    </section>
  );
}

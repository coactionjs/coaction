'use client';

import { Check } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Locale } from '@/lib/i18n';

type Mode = 'local' | 'worker' | 'shared';

const copy = {
  en: {
    modes: {
      local: [
        'Local',
        'The default entry. No transport code is even reachable from it.'
      ],
      worker: [
        'Worker',
        'The worker owns the state. The page proxies actions and mirrors commits.'
      ],
      shared: [
        'SharedWorker',
        'One authority for every tab: mirrors, not peer replicas.'
      ]
    },
    main: 'Main thread',
    tab: 'Tab',
    store: 'store',
    mirror: 'mirror',
    authority: 'authority',
    action: 'action',
    patches: 'patches',
    facts: [
      'The same counter source in every mode',
      'Actions on a client return promises',
      'Shared state is a strict JSON tree'
    ]
  },
  zh: {
    modes: {
      local: ['本地', '默认入口，连传输层代码都不会被引入。'],
      worker: ['Worker', 'Worker 持有状态，页面代理 action 并镜像每次提交。'],
      shared: ['SharedWorker', '所有标签页共用一个权威：是镜像，不是对等副本。']
    },
    main: '主线程',
    tab: '标签页',
    store: 'store',
    mirror: '镜像',
    authority: '权威',
    action: 'action',
    patches: '补丁',
    facts: [
      '每种模式都用同一份 counter 代码',
      '客户端上的 action 返回 Promise',
      '共享状态是严格的 JSON 树'
    ]
  }
} as const;

export function RuntimeStage({
  lang,
  code
}: {
  lang: Locale;
  code: Record<Mode, ReactNode>;
}) {
  const text = copy[lang];
  const [mode, setMode] = useState<Mode>('worker');

  return (
    <div className="runtime" data-mode={mode}>
      <div className="runtime__visual">
        <div className="runtime__switch" role="tablist" aria-label="Runtime">
          {(Object.keys(text.modes) as Mode[]).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={mode === name}
              onClick={() => setMode(name)}
            >
              {text.modes[name][0]}
            </button>
          ))}
        </div>

        <div className="layers" aria-hidden="true">
          <div className="layers__scene">
            <div className="layer layer--main">
              <span className="layer__label">
                {mode === 'shared' ? `${text.tab} A` : text.main}
              </span>
              <span className="layer__chip layer__chip--ui">
                &lt;Counter /&gt;
              </span>
              <span className="layer__chip layer__chip--store">
                {mode === 'local' ? text.store : text.mirror}
              </span>
            </div>
            <div className="layer layer--tab layer--tab-b">
              <span className="layer__label">{text.tab} B</span>
              <span className="layer__chip layer__chip--store">
                {text.mirror}
              </span>
            </div>
            <div className="layer layer--tab layer--tab-c">
              <span className="layer__label">{text.tab} C</span>
              <span className="layer__chip layer__chip--store">
                {text.mirror}
              </span>
            </div>
            <div className="layer layer--worker">
              <span className="layer__label">
                {mode === 'shared' ? 'SharedWorker' : 'Worker'}
              </span>
              <span className="layer__chip layer__chip--authority">
                {text.store} · {text.authority}
              </span>
            </div>
            <span className="packet packet--action" />
            <span className="packet packet--patch" />
            <span className="packet packet--patch packet--patch-b" />
            <span className="packet packet--patch packet--patch-c" />
            <span className="packet packet--local" />
          </div>
        </div>

        <p className="runtime__legend">
          <span data-kind="action">{text.action}</span>
          <span data-kind="patch">{text.patches}</span>
        </p>
        <p className="runtime__caption" aria-live="polite">
          {text.modes[mode][1]}
        </p>
      </div>

      <div className="runtime__code">
        <div className="code-panel">
          <div className="code-panel__bar">
            <span className="code-panel__dot" />
            <span className="code-panel__dot" />
            <span className="code-panel__dot" />
            <span className="code-panel__file">{text.modes[mode][0]}</span>
          </div>
          {code[mode]}
        </div>
        <ul className="runtime__facts">
          {text.facts.map((fact) => (
            <li key={fact}>
              <Check size={15} aria-hidden="true" />
              {fact}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import type { Locale } from '@/lib/i18n';
import { HighlightedCode } from './highlighted-code';
import { RuntimeStage } from './runtime-stage';
import { SectionHeader } from './section';

// From the README: one counter, three places to run it.
const localCode = `// counter.ts
export const counter = (set) => ({
  count: 0,
  increment() {
    set(() => {
      this.count += 1;
    });
  }
});

// App.tsx
import { create } from '@coaction/react';
import { counter } from './counter';

const useCounter = create(counter);`;

const workerCode = `// worker.ts
import { create } from '@coaction/react/shared';
import { counter } from './counter';

create(counter);

// App.tsx
import { create } from '@coaction/react/shared';
import { counter } from './counter';

const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module'
});
const useCounter = create(counter, { worker });`;

const sharedCode = `// store.ts runs on the page and inside the SharedWorker
import { create } from 'coaction/shared';
import { counter } from './counter';

const worker = globalThis.SharedWorker
  ? new SharedWorker(new URL('./store.js', import.meta.url), {
      type: 'module'
    })
  : undefined;

export const store = create(counter, { worker });`;

const copy = {
  en: {
    eyebrow: 'Shared runtime',
    title: (
      <>
        Start local. <em>Move execution when you need to.</em>
      </>
    ),
    lede: 'The same store source moves off the UI thread without a rewrite. A Worker becomes the authority, the page keeps a mirror for reads, and Coaction handles sequencing, patch sync and reconnects.'
  },
  zh: {
    eyebrow: '共享运行时',
    title: (
      <>
        先在本地开始，<em>需要时再迁移执行。</em>
      </>
    ),
    lede: '同一份 store 代码无需重写就能移出 UI 线程。Worker 成为唯一的权威，页面保留一份用于读取的镜像，排序、补丁同步与断线重连都由 Coaction 处理。'
  }
} as const;

export function Runtime({ lang }: { lang: Locale }) {
  const text = copy[lang];
  return (
    <section className="section" aria-labelledby="runtime-title">
      <SectionHeader
        id="runtime-title"
        eyebrow={text.eyebrow}
        title={text.title}
        lede={text.lede}
      />
      <RuntimeStage
        lang={lang}
        code={{
          local: <HighlightedCode code={localCode} lang="ts" />,
          worker: <HighlightedCode code={workerCode} lang="ts" />,
          shared: <HighlightedCode code={sharedCode} lang="ts" />
        }}
      />
    </section>
  );
}

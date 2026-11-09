import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { GitHubIcon } from '@/components/icons';
import type { Locale } from '@/lib/i18n';
import { githubUrl, localePath } from '@/lib/site';
import { CopyButton } from './copy-button';
import { OctopusStage } from './octopus-stage';

const install = 'npm install coaction @coaction/react';

const copy = {
  en: {
    badge: 'Coaction 4.2',
    badgeText: 'Immutable reactive state for TypeScript',
    title: ['State that', 'follows your reads.'],
    lede: 'Components re-render only for the paths they read. Getters cache themselves. Every write becomes a transition you can undo, persist, sync, or hand to a Worker — behind a Zustand-style create().',
    start: 'Get started',
    github: 'GitHub',
    copy: 'Copy install command',
    copied: 'Copied',
    worksWith: 'Works with'
  },
  zh: {
    badge: 'Coaction 4.2',
    badgeText: '面向 TypeScript 的不可变响应式状态',
    title: ['状态', '随读取而动。'],
    lede: '组件只因自己读取的路径而重渲染，getter 自动缓存，每一次写入都是可撤销、可持久化、可同步、可交给 Worker 的状态转换——用的仍是 Zustand 风格的 create()。',
    start: '开始使用',
    github: 'GitHub',
    copy: '复制安装命令',
    copied: '已复制',
    worksWith: '支持'
  }
} as const;

const frameworks = ['React', 'Vue', 'Angular', 'Svelte', 'Solid'];

export function Hero({ lang }: { lang: Locale }) {
  const text = copy[lang];

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__backdrop" aria-hidden="true">
        <div className="hero__grid" />
        <div className="hero__orb hero__orb--coral" />
        <div className="hero__orb hero__orb--sea" />
      </div>

      <div className="hero__copy">
        <a
          className="hero__badge"
          href={`${githubUrl}/releases`}
          target="_blank"
          rel="noreferrer"
        >
          <span className="hero__badge-tag">{text.badge}</span>
          <span>{text.badgeText}</span>
          <ArrowRight size={14} aria-hidden="true" />
        </a>

        <h1 id="hero-title" className="hero__title">
          {text.title[0]}
          {lang === 'en' ? ' ' : null}
          <span className="hero__title-accent">{text.title[1]}</span>
        </h1>
        <p className="hero__lede">{text.lede}</p>

        <div className="hero__actions">
          <Link
            className="button button--primary"
            href={localePath(lang, 'docs/getting-started/quick-start')}
          >
            {text.start}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <a
            className="button button--secondary"
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            <GitHubIcon width={17} height={17} />
            {text.github}
          </a>
        </div>

        <div className="hero__install">
          <span className="hero__install-prompt" aria-hidden="true">
            $
          </span>
          <code>{install}</code>
          <CopyButton
            text={install}
            label={text.copy}
            copiedLabel={text.copied}
          />
        </div>

        <p className="hero__frameworks">
          <span>{text.worksWith}</span>
          {frameworks.map((name) => (
            <span key={name} className="hero__framework">
              {name}
            </span>
          ))}
        </p>
      </div>

      <OctopusStage lang={lang} />
    </section>
  );
}

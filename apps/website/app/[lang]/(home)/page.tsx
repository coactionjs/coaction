import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Boxes, Cpu, Gauge, ScanSearch } from 'lucide-react';
import { isLocale } from '@/lib/i18n';
import { githubUrl, localePath, npmUrl } from '@/lib/site';

const copy = {
  en: {
    eyebrow: 'State that follows your reads',
    title: 'Write naturally. Render precisely. Scale when you need to.',
    description:
      'A Zustand-style store with automatic render tracking and cached computed state built in. Start local; move the same model into workers or shared tabs later.',
    getStarted: 'Get started',
    github: 'View on GitHub',
    install: 'npm install coaction @coaction/react',
    features: [
      [
        'Automatic tracking',
        'Components update for the fields they actually read.',
        ScanSearch
      ],
      [
        'Cached computed',
        'Getter dependencies are tracked and invalidated automatically.',
        Gauge
      ],
      [
        'Natural updates',
        'Write mutable-looking code and receive immutable state.',
        Boxes
      ],
      [
        'Shared when needed',
        'Use an explicit JSON boundary for workers and shared tabs.',
        Cpu
      ]
    ]
  },
  zh: {
    eyebrow: '状态随读取而动',
    title: '自然地写入，精准地渲染，需要时再扩展。',
    description:
      '一个内置自动渲染追踪与缓存计算状态的 Zustand 风格 store。先从本地模式开始，未来可将同一模型迁移到 Worker 或多标签页。',
    getStarted: '开始使用',
    github: '在 GitHub 查看',
    install: 'npm install coaction @coaction/react',
    features: [
      ['自动追踪', '组件只会因它实际读取的字段而更新。', ScanSearch],
      ['缓存计算', 'Getter 依赖会被自动追踪并按需失效。', Gauge],
      ['自然更新', '用可变式写法，获得不可变状态结果。', Boxes],
      ['按需共享', '通过明确的 JSON 边界连接 Worker 与多标签页。', Cpu]
    ]
  }
} as const;

export default async function LandingPage({
  params
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const text = copy[lang];

  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero__glow" />
        <div className="landing-hero__content">
          <p className="landing-eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p className="landing-description">{text.description}</p>
          <div className="landing-actions">
            <Link
              className="landing-button landing-button--primary"
              href={localePath(lang, 'docs')}
            >
              {text.getStarted} <ArrowRight size={17} />
            </Link>
            <a
              className="landing-button"
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              {text.github}
            </a>
          </div>
          <a
            className="install-pill"
            href={npmUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span>$</span> {text.install}
          </a>
        </div>
        <div className="landing-code" aria-label="Coaction store example">
          <div className="landing-code__bar">
            <span />
            <span />
            <span />
            <small>counter.ts</small>
          </div>
          <pre>
            <code>{`const store = create((set) => ({
  count: 0,

  get doubled() {
    return this.count * 2
  },

  increment() {
    set(() => this.count++)
  }
}))`}</code>
          </pre>
        </div>
      </section>

      <section className="feature-grid" aria-label="Features">
        {text.features.map(([title, description, Icon]) => (
          <article key={title}>
            <Icon size={22} />
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

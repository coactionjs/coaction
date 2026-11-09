import { Boxes, Cpu, Gauge, ScanSearch } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { Hero } from './hero';
import { PlaygroundSection } from './playground-section';

const copy = {
  en: {
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
    features: [
      ['自动追踪', '组件只会因它实际读取的字段而更新。', ScanSearch],
      ['缓存计算', 'Getter 依赖会被自动追踪并按需失效。', Gauge],
      ['自然更新', '用可变式写法，获得不可变状态结果。', Boxes],
      ['按需共享', '通过明确的 JSON 边界连接 Worker 与多标签页。', Cpu]
    ]
  }
} as const;

export function LandingPage({ lang }: { lang: Locale }) {
  const text = copy[lang];

  return (
    <main className="home-page">
      <Hero lang={lang} />
      <PlaygroundSection lang={lang} />

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

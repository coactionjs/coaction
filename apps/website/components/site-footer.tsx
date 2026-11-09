import Link from 'next/link';
import { CoactionLogo } from '@/components/logo';
import type { Locale } from '@/lib/i18n';
import { githubUrl, localePath, npmUrl } from '@/lib/site';

const copy = {
  en: {
    tagline: 'State that follows your reads.',
    groups: [
      [
        'Documentation',
        [
          ['Quick start', 'docs/getting-started/quick-start'],
          ['State and actions', 'docs/concepts/state-and-actions'],
          ['Computed state', 'docs/concepts/computed'],
          ['Shared runtime', 'docs/shared/overview'],
          ['Performance', 'docs/guides/performance']
        ]
      ],
      [
        'Project',
        [
          ['GitHub', githubUrl],
          ['npm', npmUrl],
          ['Examples', `${githubUrl}/tree/main/examples`],
          ['Releases', `${githubUrl}/releases`],
          ['Contributing', 'docs/reference/contributing']
        ]
      ]
    ],
    language: 'Language',
    legal: 'Released under the MIT License. Built with Next.js and Fumadocs.'
  },
  zh: {
    tagline: '状态随读取而动。',
    groups: [
      [
        '文档',
        [
          ['快速上手', 'docs/getting-started/quick-start'],
          ['状态与 action', 'docs/concepts/state-and-actions'],
          ['计算状态', 'docs/concepts/computed'],
          ['共享运行时', 'docs/shared/overview'],
          ['性能', 'docs/guides/performance']
        ]
      ],
      [
        '项目',
        [
          ['GitHub', githubUrl],
          ['npm', npmUrl],
          ['示例', `${githubUrl}/tree/main/examples`],
          ['版本发布', `${githubUrl}/releases`],
          ['参与贡献', 'docs/reference/contributing']
        ]
      ]
    ],
    language: '语言',
    legal: '基于 MIT 许可证发布。使用 Next.js 与 Fumadocs 构建。'
  }
} as const;

export function SiteFooter({ lang }: { lang: Locale }) {
  const text = copy[lang];
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link href={localePath(lang)} aria-label="Coaction">
            <CoactionLogo />
          </Link>
          <p>{text.tagline}</p>
        </div>
        {text.groups.map(([title, links]) => (
          <nav key={title} className="site-footer__group" aria-label={title}>
            <h2>{title}</h2>
            <ul>
              {links.map(([label, target]) => (
                <li key={label}>
                  {target.startsWith('https://') ? (
                    <a href={target} target="_blank" rel="noreferrer">
                      {label}
                    </a>
                  ) : (
                    <Link href={localePath(lang, target)}>{label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <nav className="site-footer__group" aria-label={text.language}>
          <h2>{text.language}</h2>
          <ul>
            <li>
              <Link
                href={localePath('en')}
                hrefLang="en"
                aria-current={lang === 'en' ? 'page' : undefined}
              >
                English
              </Link>
            </li>
            <li>
              <Link
                href={localePath('zh')}
                hrefLang="zh-CN"
                aria-current={lang === 'zh' ? 'page' : undefined}
              >
                简体中文
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <p className="site-footer__legal">{text.legal}</p>
    </footer>
  );
}

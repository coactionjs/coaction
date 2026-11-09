import type { Metadata } from 'next';
import type { Locale } from './i18n';
import { localizedAlternates, localePath, siteUrl } from './site';

const metadataByLocale = {
  en: {
    title: 'Coaction — State that follows your reads',
    description:
      'Zustand-style state management with automatic render tracking, cached computed state, and an optional shared runtime.'
  },
  zh: {
    title: 'Coaction — 状态随读取而动',
    description:
      '内置自动渲染追踪、缓存计算状态与可选共享运行时的 Zustand 风格状态管理库。'
  }
} as const;

/**
 * Metadata for a locale's pages. The site root renders the English homepage
 * as well, so it shares these values and names `/en/` as its canonical URL.
 */
export function localeMetadata(lang: Locale): Metadata {
  const copy = metadataByLocale[lang];

  return {
    metadataBase: new URL(siteUrl),
    applicationName: 'Coaction',
    title: copy.title,
    description: copy.description,
    alternates: localizedAlternates(lang),
    openGraph: {
      type: 'website',
      siteName: 'Coaction',
      title: copy.title,
      description: copy.description,
      url: localePath(lang),
      locale: lang === 'zh' ? 'zh_CN' : 'en_US',
      alternateLocale: lang === 'zh' ? ['en_US'] : ['zh_CN']
    },
    twitter: {
      card: 'summary',
      title: copy.title,
      description: copy.description
    }
  };
}

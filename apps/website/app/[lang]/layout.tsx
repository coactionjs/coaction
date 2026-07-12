import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Provider } from '@/components/provider';
import { isLocale, locales } from '@/lib/i18n';
import { localizedAlternates, localePath, siteUrl } from '@/lib/site';
import '../global.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

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

export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
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

export default async function LocaleLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <html lang={lang === 'zh' ? 'zh-CN' : 'en'} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider locale={lang}>{children}</Provider>
      </body>
    </html>
  );
}

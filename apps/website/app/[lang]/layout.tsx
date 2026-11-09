import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Provider } from '@/components/provider';
import { fontVariables } from '@/lib/fonts';
import { isLocale, locales } from '@/lib/i18n';
import { localeMetadata } from '@/lib/metadata';
import '../global.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return localeMetadata(lang);
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
    <html
      lang={lang === 'zh' ? 'zh-CN' : 'en'}
      className={fontVariables}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <Provider locale={lang}>{children}</Provider>
      </body>
    </html>
  );
}

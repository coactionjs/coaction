import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { SiteFooter } from '@/components/site-footer';
import { baseOptions } from '@/lib/layout.shared';
import { isLocale } from '@/lib/i18n';

export default async function LandingLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <>
      <HomeLayout {...baseOptions(lang)}>{children}</HomeLayout>
      <SiteFooter lang={lang} />
    </>
  );
}

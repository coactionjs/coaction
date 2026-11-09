import { notFound } from 'next/navigation';
import { LandingPage } from '@/components/home/landing-page';
import { isLocale } from '@/lib/i18n';

export default async function LocaleLandingPage({
  params
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return <LandingPage lang={lang} />;
}

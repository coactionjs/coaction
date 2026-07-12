import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { absoluteUrl, siteUrl } from '@/lib/site';
import '../global.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Coaction',
  title: 'Coaction — State that follows your reads',
  description:
    'Zustand-style state management with automatic render tracking, cached computed state, and an optional shared runtime.',
  alternates: {
    canonical: siteUrl,
    languages: {
      en: absoluteUrl('/en'),
      'zh-CN': absoluteUrl('/zh'),
      'x-default': absoluteUrl('/en')
    }
  },
  openGraph: {
    type: 'website',
    siteName: 'Coaction',
    title: 'Coaction — State that follows your reads',
    description:
      'Automatic render tracking, cached computed state, and an optional shared runtime.',
    url: siteUrl
  },
  twitter: {
    card: 'summary',
    title: 'Coaction — State that follows your reads',
    description:
      'Automatic render tracking, cached computed state, and an optional shared runtime.'
  }
};

export default function RootLandingLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

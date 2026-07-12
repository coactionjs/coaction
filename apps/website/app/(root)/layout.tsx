import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import '../global.css';

export const metadata: Metadata = {
  title: 'Coaction — State that follows your reads',
  description:
    'Zustand-style state management with automatic render tracking, cached computed state, and an optional shared runtime.'
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

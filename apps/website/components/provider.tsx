'use client';

import type { ReactNode } from 'react';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { RootProvider } from 'fumadocs-ui/provider/next';
import StaticSearchDialog from './search';
import { translations } from '@/lib/layout.shared';
import type { Locale } from '@/lib/i18n';

export function Provider({
  children,
  locale
}: {
  children: ReactNode;
  locale: Locale;
}) {
  return (
    <RootProvider
      i18n={i18nProvider(translations, locale)}
      search={{ SearchDialog: StaticSearchDialog }}
    >
      {children}
    </RootProvider>
  );
}

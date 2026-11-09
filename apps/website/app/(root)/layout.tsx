import type { ReactNode } from 'react';
import { Provider } from '@/components/provider';
import { localeMetadata } from '@/lib/metadata';
import '../global.css';

// The site root opens straight on the English homepage. `/en/` stays the
// canonical address, and the header's language menu leads to `/zh/`.
export const metadata = localeMetadata('en');

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider locale="en">{children}</Provider>
      </body>
    </html>
  );
}

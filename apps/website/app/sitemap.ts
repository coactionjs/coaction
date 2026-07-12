import type { MetadataRoute } from 'next';
import { locales } from '@/lib/i18n';
import { absoluteUrl, localePath } from '@/lib/site';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const landingPages: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl(),
      changeFrequency: 'monthly',
      priority: 0.8
    },
    ...locales.map((locale) => ({
      url: absoluteUrl(localePath(locale)),
      changeFrequency: 'weekly' as const,
      priority: 1
    }))
  ];
  const documentationPages: MetadataRoute.Sitemap = locales.flatMap((locale) =>
    source.getPages(locale).map((page) => ({
      url: absoluteUrl(page.url),
      changeFrequency: 'weekly' as const,
      priority: page.slugs.length === 0 ? 0.9 : 0.7
    }))
  );

  return [...landingPages, ...documentationPages];
}

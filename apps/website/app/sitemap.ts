import type { MetadataRoute } from 'next';
import { locales } from '@/lib/i18n';
import { absoluteUrl, localePath } from '@/lib/site';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  // The site root repeats the English homepage under the canonical `/en/`,
  // so only the localized homepages are listed.
  const landingPages: MetadataRoute.Sitemap = locales.map((locale) => ({
    url: absoluteUrl(localePath(locale)),
    changeFrequency: 'weekly' as const,
    priority: 1
  }));
  const documentationPages: MetadataRoute.Sitemap = locales.flatMap((locale) =>
    source.getPages(locale).map((page) => ({
      url: absoluteUrl(page.url),
      changeFrequency: 'weekly' as const,
      priority: page.slugs.length === 0 ? 0.9 : 0.7
    }))
  );

  return [...landingPages, ...documentationPages];
}

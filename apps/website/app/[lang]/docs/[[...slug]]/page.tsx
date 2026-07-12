import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle
} from 'fumadocs-ui/layouts/docs/page';
import { getMDXComponents } from '@/components/mdx';
import { isLocale } from '@/lib/i18n';
import { localizedAlternates, localePath } from '@/lib/site';
import { source } from '@/lib/source';

type PageParameters = Promise<{ lang: string; slug?: string[] }>;

export default async function DocumentationPage({
  params
}: {
  params: PageParameters;
}) {
  const { lang, slug } = await params;
  const page = source.getPage(slug, lang);
  if (!page) notFound();

  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page)
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params
}: {
  params: PageParameters;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const page = source.getPage(slug, lang);
  if (!page) notFound();
  const path = ['docs', ...(slug ?? [])].join('/');
  const title = `${page.data.title} — Coaction`;

  return {
    title,
    description: page.data.description,
    alternates: localizedAlternates(lang, path),
    openGraph: {
      type: 'article',
      siteName: 'Coaction',
      title,
      description: page.data.description,
      url: localePath(lang, path),
      locale: lang === 'zh' ? 'zh_CN' : 'en_US',
      alternateLocale: lang === 'zh' ? ['en_US'] : ['zh_CN']
    }
  };
}

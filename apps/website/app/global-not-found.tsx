import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, House } from 'lucide-react';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { ExtrudedOctopus } from '@/components/extruded-octopus';
import { Provider } from '@/components/provider';
import { SiteFooter } from '@/components/site-footer';
import { fontVariables } from '@/lib/fonts';
import { baseOptions } from '@/lib/layout.shared';
import { localePath } from '@/lib/site';
import './global.css';

export const metadata: Metadata = {
  title: 'Page not found — Coaction',
  description: 'The page you asked for is not here.'
};

const DEPTH = 8;

/** A "4" stacked back in depth. */
function Four() {
  return (
    <span className="not-found__digit">
      {Array.from({ length: DEPTH }, (_, layer) => (
        <span key={layer} style={{ '--layer': layer } as CSSProperties}>
          4
        </span>
      ))}
    </span>
  );
}

// An unmatched address has no locale, so the page speaks both languages.
export default function GlobalNotFound() {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider locale="en">
          <HomeLayout {...baseOptions('en')}>
            <div className="not-found">
              {/* 4, the octopus as the 0, 4 */}
              <div className="not-found__stage" aria-hidden="true">
                <Four />
                <ExtrudedOctopus className="not-found__octopus" />
                <Four />
              </div>
              <p className="not-found__eyebrow">Error 404</p>
              <h1>This page swam off.</h1>
              <p className="not-found__copy">
                The address may have changed, or the link is out of date. The
                octopus checked every arm and came back empty-handed.
              </p>
              <p className="not-found__copy" lang="zh-CN">
                页面游走了：地址可能已经变更，或者链接已经过期。
              </p>
              <nav className="not-found__links" aria-label="Where to go">
                <Link className="button button--primary" href="/">
                  <House size={17} aria-hidden="true" /> Homepage
                </Link>
                <Link
                  className="button button--secondary"
                  href={localePath('en', 'docs')}
                >
                  <BookOpen size={17} aria-hidden="true" /> Documentation
                </Link>
                <Link
                  className="not-found__zh"
                  href={localePath('zh')}
                  hrefLang="zh-CN"
                  lang="zh-CN"
                >
                  中文首页
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
                <Link
                  className="not-found__zh"
                  href={localePath('zh', 'docs')}
                  hrefLang="zh-CN"
                  lang="zh-CN"
                >
                  中文文档
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </nav>
            </div>
          </HomeLayout>
          <SiteFooter lang="en" />
        </Provider>
      </body>
    </html>
  );
}

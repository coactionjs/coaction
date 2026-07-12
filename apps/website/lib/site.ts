import type { Locale } from './i18n';

export const githubUrl = 'https://github.com/coactionjs/coaction';
export const npmUrl = 'https://www.npmjs.com/package/coaction';
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://coactionjs.github.io/coaction'
).replace(/\/+$/, '');

export function localePath(locale: Locale, path = '') {
  const suffix = path.length > 0 ? `/${path.replace(/^\//, '')}` : '';
  return `/${locale}${suffix}`;
}

export function withBasePath(path: string) {
  return `${basePath}${path.startsWith('/') ? path : `/${path}`}`;
}

export function absoluteUrl(path = '') {
  if (path.length === 0 || path === '/') return siteUrl;
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function localizedAlternates(locale: Locale, path = '') {
  return {
    canonical: absoluteUrl(localePath(locale, path)),
    languages: {
      en: absoluteUrl(localePath('en', path)),
      'zh-CN': absoluteUrl(localePath('zh', path)),
      'x-default': absoluteUrl(localePath('en', path))
    }
  };
}

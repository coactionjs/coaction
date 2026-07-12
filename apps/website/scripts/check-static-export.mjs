#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(websiteDir, 'out');
const contentDir = join(websiteDir, 'content', 'docs');
const repositoryName =
  process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'coaction';
const siteUrl = (
  process.env.SITE_URL ?? `https://coactionjs.github.io/${repositoryName}`
).replace(/\/+$/, '');

if (!existsSync(outDir)) {
  console.error('Missing apps/website/out. Run the website build first.');
  process.exit(1);
}

function walkFiles(directory, predicate = () => true) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(file, predicate));
    else if (predicate(file)) files.push(file);
  }
  return files;
}

function normalizeBasePath(value) {
  if (!value || value === '/') return '';
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

function detectBasePath() {
  const configured = process.env.SITE_BASE_PATH;
  if (configured !== undefined) return normalizeBasePath(configured);
  if (process.env.GITHUB_ACTIONS === 'true') {
    return normalizeBasePath(repositoryName);
  }

  const rootHtml = readFileSync(join(outDir, 'index.html'), 'utf8');
  const asset = rootHtml.match(/(?:href|src)=["']([^"']*)\/_next\//);
  return normalizeBasePath(asset?.[1] ?? '');
}

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"');
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function fileCandidates(target) {
  return [target, `${target}.html`, join(target, 'index.html')];
}

function isFile(target) {
  return existsSync(target) && statSync(target).isFile();
}

const basePath = detectBasePath();
const errors = [];
const requiredFiles = [
  'index.html',
  '404.html',
  'en/index.html',
  'zh/index.html',
  'en/docs/index.html',
  'zh/docs/index.html',
  'api/search',
  'robots.txt',
  'sitemap.xml'
];

for (const file of requiredFiles) {
  if (!isFile(join(outDir, file))) errors.push(`Missing export: ${file}`);
}

const contentFiles = (locale) =>
  walkFiles(join(contentDir, locale), (file) => /\.(?:json|mdx)$/.test(file))
    .map((file) => relative(join(contentDir, locale), file))
    .sort();
const englishContent = contentFiles('en');
const chineseContent = contentFiles('zh');
const missingInChinese = englishContent.filter(
  (file) => !chineseContent.includes(file)
);
const missingInEnglish = chineseContent.filter(
  (file) => !englishContent.includes(file)
);

for (const file of missingInChinese) {
  errors.push(`Chinese content is missing: ${file}`);
}
for (const file of missingInEnglish) {
  errors.push(`English content is missing: ${file}`);
}

const searchPath = join(outDir, 'api', 'search');
if (isFile(searchPath)) {
  try {
    const search = JSON.parse(readFileSync(searchPath, 'utf8'));
    if (search.type !== 'i18n' || !search.data?.en || !search.data?.zh) {
      errors.push('Static search index does not contain both en and zh data.');
    }
  } catch (error) {
    errors.push(`Static search index is invalid JSON: ${error.message}`);
  }
}

const htmlFiles = walkFiles(outDir, (file) => file.endsWith('.html'));
const sitemapUrls = new Set(
  [
    ...readFileSync(join(outDir, 'sitemap.xml'), 'utf8').matchAll(
      /<loc>([^<]+)<\/loc>/g
    )
  ].map((match) => match[1].replace(/\/+$/, ''))
);

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const relativeFile = relative(outDir, file);

  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
    const original = decodeHtml(match[1]);
    if (
      /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(original) ||
      original.length === 0
    ) {
      continue;
    }

    const withoutFragment = original.split('#', 1)[0].split('?', 1)[0];
    if (!withoutFragment) continue;
    let target;

    if (withoutFragment.startsWith('/')) {
      if (
        basePath &&
        withoutFragment !== basePath &&
        !withoutFragment.startsWith(`${basePath}/`)
      ) {
        errors.push(`${relativeFile}: missing base path in ${original}`);
        continue;
      }
      const sitePath = basePath
        ? withoutFragment.slice(basePath.length) || '/'
        : withoutFragment;
      target = join(outDir, decodePath(sitePath));
    } else {
      target = resolve(dirname(file), decodePath(withoutFragment));
    }

    if (!target.startsWith(`${outDir}${sep}`) && target !== outDir) {
      errors.push(
        `${relativeFile}: link escapes export directory: ${original}`
      );
      continue;
    }
    if (!fileCandidates(target).some(isFile)) {
      errors.push(`${relativeFile}: unresolved local target ${original}`);
    }
  }

  const pageMatch = relativeFile.match(/^(en|zh)(?:\/(.*))?\/index\.html$/);
  if (!pageMatch) continue;
  const locale = pageMatch[1];
  const suffix = pageMatch[2] ? `/${pageMatch[2]}` : '';
  const canonical = `${siteUrl}/${locale}${suffix}/`;
  const counterpart = `${siteUrl}/${locale === 'en' ? 'zh' : 'en'}${suffix}/`;

  if (!html.includes(`rel="canonical" href="${canonical}"`)) {
    errors.push(`${relativeFile}: missing canonical ${canonical}`);
  }
  if (!html.includes(`rel="alternate"`) || !html.includes(counterpart)) {
    errors.push(`${relativeFile}: missing localized alternate ${counterpart}`);
  }
  if (!sitemapUrls.has(canonical.replace(/\/+$/, ''))) {
    errors.push(`${relativeFile}: canonical URL is missing from sitemap`);
  }
}

if (errors.length > 0) {
  console.error(`Static export verification failed (${errors.length}):`);
  for (const error of [...new Set(errors)]) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Static export verified: ${htmlFiles.length} HTML files, ` +
    `${englishContent.length} mirrored content files per locale, ` +
    `base path ${basePath || '(root)'}.`
);

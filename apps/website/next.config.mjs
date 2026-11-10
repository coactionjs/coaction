import { createMDX } from 'fumadocs-mdx/next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

const repositoryName =
  process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'coaction';
const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';
const basePath =
  process.env.SITE_BASE_PATH ?? (isGitHubPages ? `/${repositoryName}` : '');
const siteUrl = (
  process.env.SITE_URL ?? `https://coactionjs.github.io/${repositoryName}`
).replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const config = {
  basePath,
  experimental: {
    // The site has two root layouts (the root and /[lang]), so its 404 page
    // comes from app/global-not-found.tsx.
    globalNotFound: true
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_URL: siteUrl
  },
  images: {
    unoptimized: true
  },
  reactStrictMode: true,
  trailingSlash: true,
  // The homepage demos run the workspace's own Coaction. Compiling its
  // sources (as tsconfig.json's paths do for types) means the website builds
  // without building the packages first.
  turbopack: {
    resolveAlias: {
      coaction: '../../packages/core/index.ts',
      'coaction/adapter': '../../packages/core/adapter.ts',
      '@coaction/react': '../../packages/coaction-react/index.ts'
    }
  }
};

const withMDX = createMDX();

export default function nextConfig(phase) {
  return withMDX({
    ...config,
    // In export mode, next dev throws before unknown locales can return a 404.
    output: phase === PHASE_DEVELOPMENT_SERVER ? undefined : 'export'
  });
}

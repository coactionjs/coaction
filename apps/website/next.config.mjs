import { createMDX } from 'fumadocs-mdx/next';

const repositoryName =
  process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'coaction';
const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';
const basePath =
  process.env.SITE_BASE_PATH ?? (isGitHubPages ? `/${repositoryName}` : '');

/** @type {import('next').NextConfig} */
const config = {
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_URL: `https://coactionjs.github.io${basePath}`
  },
  images: {
    unoptimized: true
  },
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true
};

export default createMDX()(config);

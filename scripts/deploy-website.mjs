import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function read(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options
  }).trim();
}

const remote = read('git', ['remote', 'get-url', '--push', 'origin']);
const repository = read('gh', [
  'repo',
  'view',
  remote,
  '--json',
  'nameWithOwner',
  '--jq',
  '.nameWithOwner'
]);
const endpoint = `repos/${repository}/pages`;
const pages = JSON.parse(read('gh', ['api', endpoint]));
const site = new URL(pages.html_url);
const env = {
  ...process.env,
  SITE_URL: site.href.replace(/\/$/, ''),
  SITE_BASE_PATH: site.pathname.replace(/\/$/, '')
};

for (const task of ['typecheck', 'build', 'check:export']) {
  execFileSync('pnpm', ['--filter', 'coaction-website', task], {
    env,
    stdio: 'inherit'
  });
}

const out = resolve('apps/website/out');
writeFileSync(join(out, '.nojekyll'), '');
if (pages.cname) writeFileSync(join(out, 'CNAME'), pages.cname + '\n');

// Stage only the export. A separate index leaves the developer's index and
// checked-out branch intact, including any uncommitted website changes.
const gitDir = read('git', ['rev-parse', '--absolute-git-dir']);
const temp = mkdtempSync(join(tmpdir(), 'coaction-pages-'));
let tree;
try {
  const index = {
    cwd: out,
    env: { ...process.env, GIT_INDEX_FILE: join(temp, 'index') }
  };
  const paths = [`--git-dir=${gitDir}`, `--work-tree=${out}`];
  read('git', [...paths, 'add', '--force', '--all', '.'], index);
  tree = read('git', [...paths, 'write-tree'], index);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const branch = 'refs/heads/gh-pages';
const parent = read('git', ['ls-remote', remote, branch]).split(/\s+/)[0];
if (parent)
  read('git', ['fetch', '--no-tags', '--no-write-fetch-head', remote, parent]);
if (!parent || read('git', ['rev-parse', `${parent}^{tree}`]) !== tree) {
  const parents = parent ? ['-p', parent] : [];
  const commit = read('git', [
    'commit-tree',
    tree,
    ...parents,
    '-m',
    'Deploy website'
  ]);
  execFileSync('git', ['push', remote, `${commit}:${branch}`], {
    stdio: 'inherit'
  });
}

// GitHub requires the publishing branch to exist before selecting it.
if (
  pages.build_type !== 'legacy' ||
  pages.source?.branch !== 'gh-pages' ||
  pages.source?.path !== '/'
) {
  execFileSync(
    'gh',
    [
      'api',
      '--method',
      'PUT',
      endpoint,
      '-f',
      'build_type=legacy',
      '-f',
      'source[branch]=gh-pages',
      '-f',
      'source[path]=/'
    ],
    { stdio: 'inherit' }
  );
}
console.log(
  `GitHub Pages source ready at ${repository}:gh-pages for ${site.href}`
);

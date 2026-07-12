'use strict';

const fs = require('fs');
const path = require('path');
const { getPackagesSync } = require('@manypkg/get-packages');

const rootDir = path.join(__dirname, '..');
const changesetDir = path.join(rootDir, '.changeset');

const coactionPackages = getPackagesSync(rootDir).packages.filter(
  (pkg) =>
    pkg.packageJson.name === 'coaction' ||
    pkg.packageJson.name.startsWith('@coaction/')
);
const packageNames = new Set(
  coactionPackages.map((pkg) => pkg.packageJson.name)
);

const corePackage = coactionPackages.find(
  (pkg) => pkg.packageJson.name === 'coaction'
);
const coreMajor = Number.parseInt(
  String(corePackage?.packageJson.version).split('.')[0],
  10
);

const hasCanonicalSameMajorRange = (range, major) => {
  const normalized = range.replace(/\s+/g, ' ').trim();
  const prerelease = '(?:-[0-9A-Za-z.-]+)?';
  const caret = new RegExp(`^\\^${major}\\.\\d+\\.\\d+${prerelease}$`);
  const bounded = new RegExp(
    `^>= ?${major}\\.\\d+\\.\\d+${prerelease} < ?${major + 1}(?:\\.0\\.0)?$`
  );
  return caret.test(normalized) || bounded.test(normalized);
};

const invalidCorePeerRanges = coactionPackages
  .filter((pkg) => pkg.packageJson.name !== 'coaction')
  .map((pkg) => ({
    name: pkg.packageJson.name,
    range: pkg.packageJson.peerDependencies?.coaction
  }))
  .filter(
    ({ range }) =>
      typeof range !== 'string' ||
      !Number.isSafeInteger(coreMajor) ||
      !hasCanonicalSameMajorRange(range, coreMajor)
  );

if (invalidCorePeerRanges.length) {
  console.error(
    '[changeset validation] Coaction peer ranges must stay within the current core major.'
  );
  for (const { name, range } of invalidCorePeerRanges) {
    console.error(`  - ${name}: ${range}`);
  }
  console.error(
    `Use ^${coreMajor}.x.y or >=${coreMajor}.x.y <${coreMajor + 1}.`
  );
  process.exit(1);
}

const changesetFiles = fs
  .readdirSync(changesetDir)
  .filter((file) => file.endsWith('.md') && file !== 'README.md');

const bumpByPackage = new Map();

for (const file of changesetFiles) {
  const filePath = path.join(changesetDir, file);
  const raw = fs.readFileSync(filePath, 'utf8');
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    continue;
  }
  const lines = frontmatterMatch[1].split('\n');
  for (const line of lines) {
    const match = line.match(
      /^\s*["']?([^"']+)["']?\s*:\s*(major|minor|patch)\s*$/
    );
    if (!match) {
      continue;
    }
    const [, name, bump] = match;
    if (!packageNames.has(name)) {
      continue;
    }
    const current = bumpByPackage.get(name);
    if (!current) {
      bumpByPackage.set(name, bump);
      continue;
    }
    const rank = {
      patch: 1,
      minor: 2,
      major: 3
    };
    if (rank[bump] > rank[current]) {
      bumpByPackage.set(name, bump);
    }
  }
}

const bumpTypes = Array.from(new Set(bumpByPackage.values()));

if (bumpTypes.length === 0) {
  process.exit(0);
}

if (bumpTypes.length > 1) {
  console.error(
    '[changeset validation] Mixed bump types detected for coaction packages.'
  );
  for (const [name, bump] of bumpByPackage.entries()) {
    console.error(`  - ${name}: ${bump}`);
  }
  console.error(
    'Use a single bump type (patch/minor/major) across the release plan.'
  );
  process.exit(1);
}

if (bumpTypes[0] === 'major' && process.env.ALLOW_MAJOR_RELEASE !== '1') {
  console.error(
    '[changeset validation] Major bump detected. Set ALLOW_MAJOR_RELEASE=1 to proceed intentionally.'
  );
  for (const [name, bump] of bumpByPackage.entries()) {
    console.error(`  - ${name}: ${bump}`);
  }
  process.exit(1);
}

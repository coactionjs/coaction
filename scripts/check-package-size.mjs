#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const packagesDir = join(rootDir, 'packages');
const budgetsPath = join(scriptDir, 'package-size-budgets.json');
const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
const requiredDistFiles = [
  'dist/index.mjs',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/index.d.mts'
];

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;

const readPackages = () =>
  readdirSync(packagesDir)
    .map((dir) => join(packagesDir, dir, 'package.json'))
    .filter(existsSync)
    .map((packageJsonPath) => {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

      return {
        dir: dirname(packageJsonPath),
        json: packageJson
      };
    })
    .filter(({ json }) => !json.private)
    .sort((a, b) => a.json.name.localeCompare(b.json.name));

let failed = false;

for (const { dir, json } of readPackages()) {
  const budget = budgets[json.name];

  if (!budget?.files) {
    console.error(`Missing size budget for ${json.name}`);
    failed = true;
    continue;
  }

  for (const file of requiredDistFiles) {
    const filePath = join(dir, file);

    if (!existsSync(filePath)) {
      console.error(`${json.name} is missing ${file}`);
      failed = true;
    }
  }

  for (const [file, fileBudget] of Object.entries(budget.files)) {
    const filePath = join(dir, file);

    if (!existsSync(filePath)) {
      console.error(`${json.name} is missing budgeted file ${file}`);
      failed = true;
      continue;
    }

    const gzipBytes = gzipSync(readFileSync(filePath)).length;
    const maxGzipBytes = fileBudget.maxGzipBytes;
    const baselineGzipBytes = fileBudget.baselineGzipBytes;
    const status = gzipBytes <= maxGzipBytes ? 'OK' : 'FAIL';
    const deltaBytes = gzipBytes - baselineGzipBytes;
    const deltaPercent =
      baselineGzipBytes === 0 ? 0 : (deltaBytes / baselineGzipBytes) * 100;

    console.log(
      `${status} ${json.name} ${file}: ${formatBytes(gzipBytes)} / ${formatBytes(
        maxGzipBytes
      )} (${deltaBytes >= 0 ? '+' : ''}${deltaBytes} B, ${deltaPercent.toFixed(
        1
      )}% from baseline)`
    );

    if (gzipBytes > maxGzipBytes) {
      failed = true;
    }
  }
}

if (failed) {
  console.error('Package size check failed.');
  process.exit(1);
}

console.log('Package size budgets passed.');

#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const packageDir = process.cwd();
const watch = process.argv.includes('--watch');
const configPath = join(rootDir, 'rolldown.config.mjs');
const distDir = join(packageDir, 'dist');

const run = (command, args) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: {
        ...process.env,
        COACTION_PACKAGE_DIR: packageDir
      },
      stdio: 'inherit'
    });

    child.on('error', rejectRun);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(
        new Error(
          signal
            ? `${command} exited with signal ${signal}`
            : `${command} exited with code ${code ?? 1}`
        )
      );
    });
  });

const normalizeDeclarations = () => {
  try {
    if (!existsSync(distDir)) {
      return;
    }

    const files = readdirSync(distDir);
    for (const file of files.filter((name) => name.endsWith('.d.ts'))) {
      const dtsPath = join(distDir, file);
      if (!existsSync(dtsPath)) {
        continue;
      }
      if (readFileSync(dtsPath, 'utf8').trim() !== 'export { };') {
        continue;
      }
      const base = file.slice(0, -'.d.ts'.length);
      const realDts = files
        .filter((candidate) => {
          const suffix = candidate.slice(base.length, -'.d.ts'.length);
          return (
            candidate.startsWith(base) &&
            candidate.endsWith('.d.ts') &&
            /^\d+$/.test(suffix)
          );
        })
        .sort()[0];
      if (realDts) {
        copyFileSync(join(distDir, realDts), dtsPath);
        rmSync(join(distDir, realDts), { force: true });
      }
    }

    for (const file of readdirSync(distDir).filter((name) =>
      name.endsWith('.d.ts')
    )) {
      const dtsPath = join(distDir, file);
      const dmtsPath = join(distDir, file.replace(/\.d\.ts$/, '.d.mts'));
      copyFileSync(dtsPath, dmtsPath);
    }
  } catch (error) {
    if (!watch) {
      throw error;
    }
  }
};

if (!watch) {
  rmSync(distDir, { recursive: true, force: true });
  await run('pnpm', ['--dir', rootDir, 'exec', 'rolldown', '-c', configPath]);
  normalizeDeclarations();
  process.exit(0);
}

rmSync(distDir, { recursive: true, force: true });

const child = spawn(
  'pnpm',
  ['--dir', rootDir, 'exec', 'rolldown', '-c', configPath, '--watch'],
  {
    cwd: rootDir,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      COACTION_PACKAGE_DIR: packageDir
    },
    stdio: 'inherit'
  }
);

const normalizeInterval = setInterval(normalizeDeclarations, 500);
normalizeInterval.unref();

let stopping = false;
const stop = (signal) => {
  if (stopping) {
    return;
  }

  stopping = true;
  clearInterval(normalizeInterval);

  if (!child.pid) {
    return;
  }

  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
};

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

child.on('exit', (code, signal) => {
  clearInterval(normalizeInterval);
  normalizeDeclarations();
  process.exit(code ?? (signal === 'SIGINT' ? 130 : 0));
});

import { builtinModules, createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

const require = createRequire(import.meta.url);
const rootDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(process.env.COACTION_PACKAGE_DIR ?? process.cwd());
const packageJson = require(join(packageDir, 'package.json'));
const input = join(packageDir, 'index.ts');
const distDir = join(packageDir, 'dist');

const dependencies = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {})
]);

const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`)
]);

const isExternal = (id) => {
  if (builtins.has(id)) {
    return true;
  }

  for (const dependency of dependencies) {
    if (id === dependency || id.startsWith(`${dependency}/`)) {
      return true;
    }
  }

  return false;
};

const dtsCompilerOptions = {
  target: 'ESNext',
  module: 'ESNext',
  moduleResolution: 'Bundler',
  jsx: 'react-jsx',
  strict: true,
  skipLibCheck: true,
  stripInternal: true,
  resolveJsonModule: true,
  allowImportingTsExtensions: true,
  lib: ['ES2019', 'ESNext.Promise', 'DOM'],
  baseUrl: rootDir,
  rootDir: packageDir,
  paths: {
    coaction: ['packages/core/index.ts']
  }
};

export default defineConfig([
  {
    input,
    external: isExternal,
    platform: 'neutral',
    treeshake: true,
    tsconfig: join(rootDir, 'tsconfig.json'),
    output: [
      {
        file: join(distDir, 'index.mjs'),
        format: 'esm',
        codeSplitting: false,
        sourcemap: false
      },
      {
        file: join(distDir, 'index.js'),
        format: 'cjs',
        exports: 'named',
        codeSplitting: false,
        sourcemap: false
      }
    ]
  },
  {
    input,
    external: isExternal,
    platform: 'neutral',
    treeshake: true,
    plugins: [
      dts({
        cwd: rootDir,
        tsconfig: join(rootDir, 'tsconfig.json'),
        compilerOptions: dtsCompilerOptions,
        emitDtsOnly: true
      })
    ],
    output: {
      dir: distDir,
      entryFileNames: 'index.d.ts',
      chunkFileNames: '[name].d.ts',
      format: 'esm',
      sourcemap: false
    }
  }
]);

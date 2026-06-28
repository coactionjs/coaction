import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packagesDir = join(rootDir, 'packages');

type BinderAdapterPackage = {
  packageDir: string;
  packageName: string;
};

const binderAdapterPackages: BinderAdapterPackage[] = [
  {
    packageDir: 'coaction-jotai',
    packageName: '@coaction/jotai'
  },
  {
    packageDir: 'coaction-mobx',
    packageName: '@coaction/mobx'
  },
  {
    packageDir: 'coaction-pinia',
    packageName: '@coaction/pinia'
  },
  {
    packageDir: 'coaction-redux',
    packageName: '@coaction/redux'
  },
  {
    packageDir: 'coaction-valtio',
    packageName: '@coaction/valtio'
  },
  {
    packageDir: 'coaction-xstate',
    packageName: '@coaction/xstate'
  },
  {
    packageDir: 'coaction-zustand',
    packageName: '@coaction/zustand'
  }
];

const readContractTestSource = (packageDir: string) =>
  readFileSync(join(packagesDir, packageDir, 'test/contract.test.ts'), 'utf8');

describe('binder adapter contract registry', () => {
  test('tracks every package that uses the shared binder contract', () => {
    const packagesUsingContract = readdirSync(packagesDir, {
      withFileTypes: true
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((packageDir) =>
        existsSync(join(packagesDir, packageDir, 'test/contract.test.ts'))
      )
      .filter((packageDir) =>
        readContractTestSource(packageDir).includes('runBinderAdapterContract')
      )
      .sort();

    expect(packagesUsingContract).toEqual(
      binderAdapterPackages.map((entry) => entry.packageDir).sort()
    );
  });

  test.each(binderAdapterPackages)(
    '$packageName runs the shared binder adapter contract',
    ({ packageDir, packageName }) => {
      const contractPath = join(
        packagesDir,
        packageDir,
        'test/contract.test.ts'
      );
      expect(existsSync(contractPath)).toBe(true);

      const source = readContractTestSource(packageDir);
      expect(source).toContain('runBinderAdapterContract({');
      expect(source).toContain(`packageName: '${packageName}'`);
      expect(source).toContain('createLocalContract');
    }
  );
});

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT } from '../helpers/examples';

const read = (f: string): string => fs.readFileSync(path.join(ROOT, f), 'utf8');
const version: string = JSON.parse(read('package.json')).version;

describe('version is written the same way everywhere', () => {
  it('package-lock.json uses the package.json version', () => {
    const lock = JSON.parse(read('package-lock.json'));
    assert.strictEqual(lock.version, version);
    assert.strictEqual(lock.packages[''].version, version);
  });

  it('CHANGELOG.md has a section for the current version', () => {
    assert.match(read('CHANGELOG.md'), new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'));
  });

  it('both READMEs name the .vsix of the current version and no other', () => {
    for (const f of ['README.md', 'README.ko.md']) {
      const names = [...read(f).matchAll(/chatlines-(\d+\.\d+\.\d+)\.vsix/g)].map((m) => m[1]);
      assert.ok(names.length > 0, f);
      for (const n of names) assert.strictEqual(n, version, f);
    }
  });
});

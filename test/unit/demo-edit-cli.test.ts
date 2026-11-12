import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { ROOT } from '../helpers/examples';

// Regression (Q-6): a missing file is a localized tool error, not a Node stack trace.
describe('demo:edit missing file', () => {
  for (const [lang, expected] of [
    ['en', 'Cannot read the file'],
    ['ko', '파일을 읽을 수 없습니다'],
  ] as const) {
    it(`prints a localized message and exits 1 (${lang})`, () => {
      const r = spawnSync(
        process.execPath,
        [path.join(ROOT, 'scripts/demo-edit.mjs'), 'no-such-file.jsonl', '--line', '1', '--message', '1', '--text', 'x', '--lang', lang],
        { encoding: 'utf8' },
      );
      assert.strictEqual(r.status, 1);
      assert.ok(r.stderr.includes(expected), r.stderr);
      assert.ok(r.stderr.includes('ENOENT'), r.stderr);
      assert.ok(!/\n\s+at /.test(r.stderr), 'no stack trace');
    });
  }
});

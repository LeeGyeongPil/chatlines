import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyMessageEdit } from '../../src/core/edit';
import { encodeString, resolveStyle, emptyHints } from '../../src/core/style';
import { ROOT } from '../helpers/examples';

interface Case {
  style: string;
  before: string;
  textPath: Array<string | number>;
  newText: string;
  afterText: string;
  argsPath: Array<string | number>;
  newArgs: string;
  afterArgs: string;
}

// Expected bytes come from the real Python json.dumps (scripts/gen-examples.py).
const CASES: Case[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'python-style.json'), 'utf8'));

describe('AC-3 the line keeps its original serialization style', () => {
  it('has the four styles', () => {
    assert.deepStrictEqual(CASES.map((c) => c.style), ['ascii-default', 'utf8-default', 'ascii-compact', 'utf8-compact']);
  });

  for (const c of CASES) {
    it(`message text equals what Python writes (${c.style})`, () => {
      const out = applyMessageEdit(c.before, c.textPath, c.newText);
      assert.strictEqual(out, c.afterText);
      assert.strictEqual(JSON.parse(out).messages[2].content, c.newText);
    });

    it(`tool arguments are re-serialized in the original arguments style (${c.style})`, () => {
      const out = applyMessageEdit(c.before, c.argsPath, c.newArgs, 'arguments');
      assert.strictEqual(out, c.afterArgs);
      const args = JSON.parse(JSON.parse(out).messages[1].tool_calls[0].function.arguments);
      assert.deepStrictEqual(args, { city: 'Busan', unit: 'C' });
    });
  }

  it('writes surrogate pairs as lowercase \\u escapes in ASCII style', () => {
    const ascii = CASES[0];
    assert.ok(applyMessageEdit(ascii.before, ascii.textPath, '🌤').includes('\\ud83c\\udf24'));
  });

  it('keeps upper-case hex when the line used it', () => {
    const line = '{"messages": [{"role": "user", "content": "\\uC11C"}, {"role": "assistant", "content": "x"}]}';
    const out = applyMessageEdit(line, ['messages', 1, 'content'], '서');
    assert.ok(out.includes('"\\uC11C"'));
    assert.strictEqual(out.split('\\uC11C').length, 3);
  });

  it('uses evidence from the rest of the file for a line that has none', () => {
    const plain = '{"messages": [{"role": "user", "content": "hi"}]}';
    const fallback = { ...emptyHints(), ascii: true, hexUpper: false };
    assert.ok(applyMessageEdit(plain, ['messages', 0, 'content'], '서', 'text', fallback).includes('\\uc11c'));
    assert.ok(applyMessageEdit(plain, ['messages', 0, 'content'], '서').includes('"서"'));
  });

  it('follows the slash escaping of the line', () => {
    const line = '{"a":"x\\/y"}';
    assert.strictEqual(applyMessageEdit(line, ['a'], 'p/q'), '{"a":"p\\/q"}');
  });

  it('encodeString handles control characters and lone surrogates', () => {
    const st = resolveStyle(emptyHints());
    assert.strictEqual(encodeString('\u0001\u001f', st), '"\\u0001\\u001f"');
    assert.strictEqual(encodeString('\ud800', st), '"\\ud800"');
    assert.strictEqual(JSON.parse(encodeString('a b', st)), 'a b');
  });
});

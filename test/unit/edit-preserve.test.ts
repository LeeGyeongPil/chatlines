import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { applyEditToText, applyMessageEdit, EditError, splitLines } from '../../src/core/edit';
import { nodeAt, parseSpan } from '../../src/core/jsonSpan';

const LINE_A = '{"messages": [{"role": "user", "content": "hello"}], "n": 12345678901234567890, "f": 1.0, "z": -0, "e": 1e5, "d": 1, "d": 2}';
const LINE_B = '{"messages": [{"role": "user", "content": "second"}]}';
const PATH = ['messages', 0, 'content'];

/** Compare before/after around the one string token that was replaced. */
function assertOnlyTokenChanged(before: string, after: string, path: ReadonlyArray<string | number>) {
  const r = parseSpan(before);
  assert.ok(r.ok);
  const node = nodeAt(r.root, path)!;
  assert.strictEqual(after.slice(0, node.start), before.slice(0, node.start), 'bytes before the token');
  const tail = before.slice(node.end);
  assert.ok(after.endsWith(tail), 'bytes after the token');
  const token = after.slice(node.start, after.length - tail.length);
  assert.ok(token.startsWith('"') && token.endsWith('"'), 'a single string token');
  return token;
}

describe('AC-2 edits leave everything except the target string untouched', () => {
  for (const [name, eol, bom, finalEol] of [
    ['LF', '\n', '', '\n'],
    ['CRLF', '\r\n', '', '\r\n'],
    ['no final newline', '\n', '', ''],
    ['BOM on the first line', '\n', '﻿', '\n'],
  ] as const) {
    it(`other lines stay byte-identical (${name})`, () => {
      const text = bom + [LINE_A, LINE_B, LINE_A].join(eol) + finalEol;
      const out = applyEditToText(text, 1, PATH, 'changed "quoted" text');
      const before = splitLines(text);
      const after = splitLines(out);
      assert.strictEqual(after.length, before.length);
      for (let i = 0; i < before.length; i++) {
        assert.strictEqual(after[i].eol, before[i].eol, `eol of line ${i}`);
        if (i !== 1) assert.strictEqual(after[i].text, before[i].text, `line ${i}`);
      }
      assertOnlyTokenChanged(before[1].text, after[1].text, PATH);
      assert.strictEqual(out.charCodeAt(0) === 0xfeff, bom !== '');
    });
  }

  it('keeps big integers, 1.0, -0, 1e5 and duplicate keys exactly as written', () => {
    const out = applyMessageEdit(LINE_A, PATH, 'new');
    assertOnlyTokenChanged(LINE_A, out, PATH);
    for (const raw of ['12345678901234567890', '"f": 1.0', '"z": -0', '"e": 1e5', '"d": 1, "d": 2']) {
      assert.ok(out.includes(raw), raw);
    }
  });

  it('works on a line that starts with a BOM', () => {
    const out = applyMessageEdit('﻿' + LINE_B, PATH, 'x');
    assert.ok(out.startsWith('﻿{"messages"'));
    assert.strictEqual(JSON.parse(out.slice(1)).messages[0].content, 'x');
  });

  it('round-trips awkward text', () => {
    for (const text of ['', 'tab\there', 'line\nbreak', 'back\\slash', 'quote"', '\u0001control', 'emoji 🌤 and é', 'a/b']) {
      const out = applyMessageEdit(LINE_B, PATH, text);
      assert.strictEqual(JSON.parse(out).messages[0].content, text);
    }
  });

  it('refuses edits it cannot do and says why', () => {
    assert.throws(() => applyMessageEdit('{"a":', PATH, 'x'), (e: unknown) => e instanceof EditError && e.code === 'invalidJson');
    assert.throws(() => applyMessageEdit('{"messages":[{"role":"a","content":null}]}', PATH, 'x'), (e: unknown) => e instanceof EditError && e.code === 'notString');
    assert.throws(() => applyMessageEdit(LINE_B, ['messages', 0, 'role'], '{bad', 'arguments'), (e: unknown) => e instanceof EditError && e.code === 'badArguments');
    assert.throws(() => applyEditToText(LINE_B, 5, PATH, 'x'), (e: unknown) => e instanceof EditError);
  });
});

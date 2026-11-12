import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { nodeAt, parseSpan } from '../../src/core/jsonSpan';

describe('jsonSpan parser', () => {
  it('agrees with JSON.parse on what is valid', () => {
    const samples = [
      '{"a":1}', '[]', '{}', '"x"', '12', '-0', '1e5', '1.5E-3', 'true', 'null', ' [1, 2 ] ',
      '{"a":1,}', '[1,]', "{'a':1}", '{"a":01}', '"\\x"', '"a\nb"', '"\\ud800"', '{"a":1}{', '', '   ',
      '"\\u12"', '[1 2]', '{"a" 1}', '.5', '1.', '+1', 'tru', '"unterminated', '{"a":{"b":[1,2,{"c":null}]}}',
      '"\\u00e9\\ud83c\\udf24"', '\t{"a":\r\n1}\n',
    ];
    for (const s of samples) {
      let jsOk = true;
      try {
        JSON.parse(s);
      } catch {
        jsOk = false;
      }
      assert.strictEqual(parseSpan(s).ok, jsOk, `mismatch for ${JSON.stringify(s)}`);
    }
  });

  it('records token positions and keeps numbers verbatim', () => {
    const text = '{"id": 12345678901234567890, "x": 1.0, "s": "a\\u00e9"}';
    const r = parseSpan(text);
    assert.ok(r.ok);
    const id = nodeAt(r.root, ['id']);
    assert.ok(id && id.t === 'number');
    assert.strictEqual(text.slice(id.start, id.end), '12345678901234567890');
    const s = nodeAt(r.root, ['s']);
    assert.ok(s && s.t === 'string');
    assert.strictEqual(text.slice(s.start, s.end), '"a\\u00e9"');
    assert.strictEqual(s.value, 'aé');
  });

  it('lets the last duplicate key win, like JSON.parse', () => {
    const r = parseSpan('{"a":1,"a":2}');
    assert.ok(r.ok);
    const n = nodeAt(r.root, ['a']);
    assert.ok(n && n.t === 'number' && n.raw === '2');
  });

  it('reports the position of a syntax error', () => {
    const r = parseSpan('{"a": [1, 2');
    assert.ok(!r.ok);
    assert.strictEqual(r.pos, 11);
  });

  it('rejects absurd nesting instead of overflowing the stack', () => {
    assert.strictEqual(parseSpan('['.repeat(5000) + ']'.repeat(5000)).ok, false);
  });
});

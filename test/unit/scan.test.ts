import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { effectiveLineCount, filterKey, isEmptyFilter, scan, type CancelToken } from '../../src/core/scan';
import { lineSource, mergedLines } from '../helpers/examples';

// Merged order: openai-chat 0-2, openai-tools 3-5, sharegpt 6-7, alpaca 8-10, batch-request 11-12,
// batch-response 13-14, python-style 15-17, mixed-problems 18-23.
const STATS = {
  lines: 24,
  perFormat: { 'openai-chat': 12, sharegpt: 2, alpaca: 3, 'batch-request': 2, 'batch-response': 3, invalid: 1, unknown: 1 },
  perRole: { system: 4, user: 21, assistant: 23, tool: 5 },
  toolCalls: 3,
  problemLines: 4,
  toolNames: ['convert_units', 'get_weather'],
};

describe('AC-8 filters, search and statistics', () => {
  for (const lang of ['en', 'ko'] as const) {
    it(`filters and statistics match the expected values (${lang})`, async () => {
      const src = lineSource(mergedLines(lang));
      assert.deepStrictEqual((await scan(src, { role: 'tool' }))!.matches, [3, 4, 7, 21]);
      assert.deepStrictEqual((await scan(src, { toolName: 'get_weather' }))!.matches, [3]);
      assert.deepStrictEqual((await scan(src, { toolName: 'convert_units' }))!.matches, [4]);
      assert.deepStrictEqual((await scan(src, { problemsOnly: true }))!.matches, [19, 20, 21, 22]);
      const query = lang === 'ko' ? '서울' : 'weather';
      const expected = lang === 'ko' ? [3, 15, 16, 21] : [3, 7, 15, 16, 21];
      assert.deepStrictEqual((await scan(src, { query }))!.matches, expected);
      assert.deepStrictEqual((await scan(src, { query: query.toUpperCase() }))!.matches, expected, 'case-insensitive');
      assert.deepStrictEqual((await scan(src, { role: 'tool', problemsOnly: true }))!.matches, [21], 'filters combine');
      assert.deepStrictEqual((await scan(src, {}))!.stats, STATS);
    });
  }

  it('discards a scan that was cancelled while it was running', async () => {
    const lines = Array.from({ length: 2000 }, () => '{"messages":[{"role":"user","content":"x"}]}');
    const token: CancelToken = { cancelled: false };
    const result = await scan(lineSource(lines), {}, {
      token,
      chunk: 100,
      yieldFn: async () => {
        token.cancelled = true; // the document changed while we yielded
      },
    });
    assert.strictEqual(result, null);
  });

  it('yields to the event loop between chunks', async () => {
    const lines = Array.from({ length: 1000 }, () => '{"messages":[]}');
    let yields = 0;
    await scan(lineSource(lines), {}, { chunk: 250, yieldFn: async () => void yields++ });
    assert.strictEqual(yields, 3);
  });

  it('helpers: empty filter, key and trailing blank lines', () => {
    assert.ok(isEmptyFilter({}));
    assert.ok(!isEmptyFilter({ query: 'a' }));
    assert.notStrictEqual(filterKey({ role: 'user' }), filterKey({ role: 'tool' }));
    assert.strictEqual(effectiveLineCount(lineSource(['{}', '', ''])), 1);
  });
});

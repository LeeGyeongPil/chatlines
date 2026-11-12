// Builds a synthetic ~8 MB chat file in memory and times a full scan and one page parse.
// Exit code 1 when the budget is missed. Run through `npm run bench` (which builds first).
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const { scan } = require(resolve(root, 'out/src/core/scan.js'));
const { buildLineView } = require(resolve(root, 'out/src/core/formats.js'));

const LINES = 10000;
const SCAN_BUDGET_MS = 3000;
const PAGE_BUDGET_MS = 100;
const PAGE_SIZE = 50;

const filler = 'The quick brown fox jumps over the lazy dog. '.repeat(1);
function makeLine(i) {
  const n = 6 + (i % 7); // 6..12 messages
  const messages = [{ role: 'system', content: 'You are a helpful assistant.' }];
  for (let k = 1; k < n; k++) {
    if (k % 4 === 2) {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{ id: `call_${i}_${k}`, type: 'function', function: { name: 'lookup', arguments: JSON.stringify({ q: `item ${k}`, n: k }) } }],
      });
      messages.push({ role: 'tool', content: filler + k, tool_call_id: `call_${i}_${k}` });
    } else {
      messages.push({ role: k % 2 ? 'user' : 'assistant', content: `${filler}#${i}-${k}` });
    }
  }
  return JSON.stringify({ messages });
}

const lines = Array.from({ length: LINES }, (_, i) => makeLine(i));
const bytes = lines.reduce((s, l) => s + Buffer.byteLength(l) + 1, 0);
const source = { lineCount: lines.length, lineText: (i) => lines[i] };

const t0 = performance.now();
const result = await scan(source, {});
const scanMs = performance.now() - t0;

const t1 = performance.now();
for (let i = 0; i < PAGE_SIZE; i++) buildLineView(lines[5000 + i], 5000 + i);
const pageMs = performance.now() - t1;

const pass = result !== null && scanMs < SCAN_BUDGET_MS && pageMs < PAGE_BUDGET_MS;
console.log(
  JSON.stringify(
    {
      lines: LINES,
      megabytes: Number((bytes / 1e6).toFixed(1)),
      scanMs: Math.round(scanMs),
      pageParseMs: Number(pageMs.toFixed(1)),
      toolCalls: result?.stats.toolCalls ?? 0,
      budgetMs: { scan: SCAN_BUDGET_MS, page: PAGE_BUDGET_MS },
      pass,
    },
    null,
    2,
  ),
);
process.exit(pass ? 0 : 1);

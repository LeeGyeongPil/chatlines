import * as fs from 'node:fs';
import * as path from 'node:path';

/** Repository root, found from out/test/helpers. */
export const ROOT = path.resolve(__dirname, '../../..');

export const EXAMPLE_NAMES = [
  'openai-chat',
  'openai-tools',
  'sharegpt',
  'alpaca',
  'batch-request',
  'batch-response',
  'python-style',
  'mixed-problems',
] as const;

export type ExampleName = (typeof EXAMPLE_NAMES)[number];

export function exampleText(lang: 'en' | 'ko', name: ExampleName): string {
  return fs.readFileSync(path.join(ROOT, 'examples', lang, `${name}.jsonl`), 'utf8');
}

export function exampleLines(lang: 'en' | 'ko', name: ExampleName): string[] {
  const lines = exampleText(lang, name).split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** All examples of one language, one after the other, in EXAMPLE_NAMES order. */
export function mergedLines(lang: 'en' | 'ko'): string[] {
  return EXAMPLE_NAMES.flatMap((n) => exampleLines(lang, n));
}

export function lineSource(lines: string[]) {
  return { lineCount: lines.length, lineText: (i: number) => lines[i] };
}

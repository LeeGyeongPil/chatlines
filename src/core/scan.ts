/**
 * Whole-document scan: filters, text search and statistics.
 * The scan works in chunks and gives the event loop back between chunks, so a large file
 * does not freeze the extension host; a cancelled scan returns null and is discarded.
 */
import { buildLineView, type FormatId, type LineView } from './formats';

export interface Filter {
  role?: string;
  toolName?: string;
  query?: string;
  problemsOnly?: boolean;
}

export interface Stats {
  /** Non-blank lines. */
  lines: number;
  perFormat: Partial<Record<FormatId, number>>;
  perRole: Record<string, number>;
  toolCalls: number;
  problemLines: number;
  /** Distinct tool names seen (capped), for the filter menu. */
  toolNames: string[];
}

export interface ScanResult {
  /** 0-based line numbers that match the filter, in document order. */
  matches: number[];
  stats: Stats;
}

export interface LineSource {
  readonly lineCount: number;
  lineText(index: number): string;
}

export interface CancelToken {
  cancelled: boolean;
}

export function isEmptyFilter(f: Filter): boolean {
  return !f.role && !f.toolName && !(f.query && f.query !== '') && !f.problemsOnly;
}

export function filterKey(f: Filter): string {
  return JSON.stringify([f.role ?? '', f.toolName ?? '', f.query ?? '', f.problemsOnly ? 1 : 0]);
}

/** Does this line view satisfy the filter? (Blank lines never reach this function.) */
export function matchesFilter(v: LineView, f: Filter): boolean {
  if (f.problemsOnly && v.problems.length === 0) return false;
  if (f.role && !v.messages.some((m) => m.role === f.role)) return false;
  if (f.toolName && !v.messages.some((m) => m.toolCalls.some((c) => c.name === f.toolName) || m.name === f.toolName)) return false;
  if (f.query) {
    const q = f.query.toLowerCase();
    const hit =
      v.messages.some(
        (m) =>
          m.parts.some((p) => p.text.toLowerCase().includes(q)) ||
          m.toolCalls.some((c) => c.name.toLowerCase().includes(q) || (c.argumentsRaw ?? '').toLowerCase().includes(q)),
      ) ||
      (v.raw !== null && v.raw.toLowerCase().includes(q)) ||
      (v.meta.customId !== null && v.meta.customId.toLowerCase().includes(q));
    if (!hit) return false;
  }
  return true;
}

const TOOL_NAME_CAP = 200;
const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export interface ScanOptions {
  token?: CancelToken;
  chunk?: number;
  yieldFn?: () => Promise<void>;
}

/** Scan every line once: collect the matches for `filter` and the statistics. */
export async function scan(source: LineSource, filter: Filter, opts: ScanOptions = {}): Promise<ScanResult | null> {
  const chunk = opts.chunk ?? 500;
  const yieldFn = opts.yieldFn ?? defaultYield;
  const token = opts.token;
  const matches: number[] = [];
  const stats: Stats = { lines: 0, perFormat: {}, perRole: {}, toolCalls: 0, problemLines: 0, toolNames: [] };
  const names = new Set<string>();

  for (let i = 0; i < source.lineCount; i++) {
    if (i > 0 && i % chunk === 0) {
      await yieldFn();
      if (token?.cancelled) return null;
    }
    const v = buildLineView(source.lineText(i), i);
    if (v === null) continue;
    stats.lines++;
    stats.perFormat[v.format] = (stats.perFormat[v.format] ?? 0) + 1;
    if (v.problems.length > 0) stats.problemLines++;
    for (const m of v.messages) {
      stats.perRole[m.role] = (stats.perRole[m.role] ?? 0) + 1;
      stats.toolCalls += m.toolCalls.length;
      for (const c of m.toolCalls) if (c.name && names.size < TOOL_NAME_CAP) names.add(c.name);
    }
    if (matchesFilter(v, filter)) matches.push(i);
  }
  if (token?.cancelled) return null;
  stats.toolNames = [...names].sort();
  return { matches, stats };
}

/** Number of lines up to and including the last non-blank one. */
export function effectiveLineCount(source: LineSource): number {
  let n = source.lineCount;
  while (n > 0 && source.lineText(n - 1).trim() === '') n--;
  return n;
}

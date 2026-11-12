/** Messages exchanged between the extension host and the webview. Plain JSON only. */
import type { LineView } from '../core/formats';
import type { Filter, Stats } from '../core/scan';
import type { Lang } from '../i18n';

export type { Filter, Stats, LineView, Lang };

export type Path = Array<string | number>;

export interface PageLine {
  /** 0-based line number. */
  line: number;
  lineHash: string;
  view: LineView;
}

// webview -> host
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'requestPage'; page: number; filter: Filter }
  | {
      type: 'edit';
      line: number;
      docVersion: number;
      lineHash: string;
      path: Path;
      newText: string;
      kind: 'text' | 'arguments';
    }
  | { type: 'setLanguage'; lang: Lang }
  | { type: 'openAsText'; line: number };

// host -> webview
export type HostToWebview =
  | { type: 'init'; lang: Lang; strings: Record<string, string>; pageSize: number; docVersion: number }
  | {
      type: 'page';
      docVersion: number;
      page: number;
      totalPages: number;
      matchCount: number;
      lines: PageLine[];
    }
  | { type: 'linesUpdated'; docVersion: number; lines: PageLine[] }
  | { type: 'stats'; docVersion: number; stats: Stats; matchCount: number; totalPages: number }
  | { type: 'editResult'; ok: boolean; line: number; reason?: 'stale' | 'failed' | 'invalid' }
  | { type: 'toolError'; code: string; messageKey: string; args: Array<string | number>; line?: number }
  | { type: 'strings'; lang: Lang; strings: Record<string, string> };

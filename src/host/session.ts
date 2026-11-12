/**
 * Per-document state of the chat view: paging, filtering, scanning and edits.
 * It knows nothing about VS Code; everything it needs comes through `SessionBackend`, so the
 * same code runs inside the extension and inside the browser preview.
 */
import { applyMessageEdit, EditError } from '../core/edit';
import { buildLineView } from '../core/formats';
import { lineHash } from '../core/hash';
import { parseSpan } from '../core/jsonSpan';
import { effectiveLineCount, filterKey, isEmptyFilter, scan, type CancelToken, type Filter, type LineSource, type Stats } from '../core/scan';
import { detectStyle, mergeHints, emptyHints, type StyleHints } from '../core/style';
import { table, type Lang } from '../i18n';
import type { HostToWebview, PageLine, WebviewToHost } from '../shared/protocol';
import { toolError, type ErrorLog, type ToolErrorCode } from './errors';

export interface SessionDocument extends LineSource {
  readonly version: number;
}

export interface SessionBackend {
  doc: SessionDocument;
  post(msg: HostToWebview): void;
  /** Replace the whole text of one line. Resolve false (or throw) when VS Code refused. */
  replaceLine(line: number, newText: string): Promise<boolean>;
  getLanguage(): Lang;
  setLanguage(lang: Lang): Promise<void>;
  getPageSize(): number;
  openAsText(line: number): void;
  log: ErrorLog;
}

/** A change reported by the editor: lines `startLine..endLine` (old numbering) were replaced. */
export interface DocChange {
  startLine: number;
  endLine: number;
  lineDelta: number;
}

const STYLE_SCAN_LINES = 200;

export class Session {
  private filter: Filter = {};
  private page = 0;
  private scanToken: CancelToken | null = null;
  private scanKey = '';
  private matches: number[] | null = null; // null = every non-blank line, no scan needed
  private stats: Stats | null = null;
  private disposed = false;

  constructor(private readonly b: SessionBackend) {}

  dispose(): void {
    this.disposed = true;
    if (this.scanToken) this.scanToken.cancelled = true;
  }

  /** Entry point for every message from the webview. Never throws. */
  async handle(msg: WebviewToHost): Promise<void> {
    try {
      switch (msg.type) {
        case 'ready':
          this.page = 0;
          this.filter = {};
          this.matches = null;
          this.post({
            type: 'init',
            lang: this.b.getLanguage(),
            strings: table(this.b.getLanguage()),
            pageSize: this.pageSize(),
            docVersion: this.b.doc.version,
          });
          await this.sendPage(0, {});
          return;
        case 'requestPage':
          await this.sendPage(msg.page, msg.filter ?? {});
          return;
        case 'edit':
          await this.edit(msg);
          return;
        case 'setLanguage':
          await this.b.setLanguage(msg.lang);
          this.sendStrings();
          return;
        case 'openAsText':
          this.b.openAsText(msg.line);
          return;
      }
    } catch (e) {
      this.fail('INTERNAL', e);
    }
  }

  /** The configured language changed (menu in the webview or VS Code settings). */
  sendStrings(): void {
    const lang = this.b.getLanguage();
    this.post({ type: 'strings', lang, strings: table(lang) });
  }

  /** The document text changed (our own edit, undo, or another editor). */
  onDocumentChanged(changes: DocChange[]): void {
    if (this.disposed) return;
    this.restartScan(); // matches and statistics are stale now
    const structural = changes.some((c) => c.lineDelta !== 0);
    if (structural) {
      void this.sendPage(this.page, this.filter).catch((e) => this.fail('INTERNAL', e));
      return;
    }
    const changed = new Set<number>();
    for (const c of changes) for (let l = c.startLine; l <= c.endLine; l++) changed.add(l);
    const visible = new Set(this.pageLineNumbers());
    const lines: PageLine[] = [];
    for (const l of [...changed].sort((a, z) => a - z)) {
      if (!visible.has(l)) continue;
      const pl = this.pageLine(l);
      if (pl) lines.push(pl);
    }
    this.post({ type: 'linesUpdated', docVersion: this.b.doc.version, lines });
    void this.refreshStats().catch((e) => this.fail('INTERNAL', e));
  }

  // ---- paging -------------------------------------------------------------------------

  private pageSize(): number {
    const n = this.b.getPageSize();
    return Math.min(200, Math.max(10, Number.isFinite(n) ? Math.floor(n) : 50));
  }

  private lineCount(): number {
    return effectiveLineCount(this.b.doc);
  }

  private totalMatches(): number {
    return this.matches ? this.matches.length : this.lineCount();
  }

  private totalPages(): number {
    return Math.max(1, Math.ceil(this.totalMatches() / this.pageSize()));
  }

  /** 0-based line numbers shown on the current page. */
  private pageLineNumbers(): number[] {
    const size = this.pageSize();
    const from = this.page * size;
    if (this.matches) return this.matches.slice(from, from + size);
    const out: number[] = [];
    const end = Math.min(this.lineCount(), from + size);
    for (let i = from; i < end; i++) out.push(i);
    return out;
  }

  private pageLine(line: number): PageLine | null {
    if (line < 0 || line >= this.b.doc.lineCount) return null;
    const text = this.b.doc.lineText(line);
    const view = buildLineView(text, line);
    if (view === null) return null; // blank line
    return { line, lineHash: lineHash(text), view };
  }

  private async sendPage(page: number, filter: Filter): Promise<void> {
    const key = filterKey(filter);
    this.filter = filter;
    if (isEmptyFilter(filter)) {
      this.matches = null;
      this.scanKey = '';
    } else if (this.matches === null || key !== this.scanKey) {
      // The matching lines are only known after a scan; show the page when it is done.
      this.restartScan();
      const done = await this.runScan();
      if (!done) return; // cancelled by a newer request
    }
    this.page = Math.min(Math.max(0, Math.floor(page) || 0), this.totalPages() - 1);
    const lines: PageLine[] = [];
    for (const l of this.pageLineNumbers()) {
      const pl = this.pageLine(l);
      if (pl) lines.push(pl);
    }
    this.post({
      type: 'page',
      docVersion: this.b.doc.version,
      page: this.page,
      totalPages: this.totalPages(),
      matchCount: this.totalMatches(),
      lines,
    });
    if (this.stats) this.postStats();
    else void this.refreshStats().catch((e) => this.fail('INTERNAL', e));
  }

  // ---- scanning -----------------------------------------------------------------------

  private restartScan(): void {
    if (this.scanToken) this.scanToken.cancelled = true;
    this.scanToken = null;
    this.stats = null;
    this.scanKey = '';
  }

  /** Scan with the current filter; stores matches and stats. False when cancelled. */
  private async runScan(): Promise<boolean> {
    const token: CancelToken = { cancelled: false };
    this.scanToken = token;
    const result = await scan(this.b.doc, this.filter, { token });
    if (result === null || token.cancelled || this.disposed) return false;
    this.stats = result.stats;
    this.matches = isEmptyFilter(this.filter) ? null : result.matches;
    this.scanKey = filterKey(this.filter);
    return true;
  }

  /** Recompute matches and statistics for the current filter and tell the webview. */
  private async refreshStats(): Promise<void> {
    const ok = await this.runScan();
    if (!ok || this.stats === null) return;
    this.page = Math.min(this.page, this.totalPages() - 1);
    this.postStats();
  }

  private postStats(): void {
    if (this.stats === null) return;
    this.post({
      type: 'stats',
      docVersion: this.b.doc.version,
      stats: this.stats,
      matchCount: this.totalMatches(),
      totalPages: this.totalPages(),
    });
  }

  // ---- editing ------------------------------------------------------------------------

  private async edit(msg: Extract<WebviewToHost, { type: 'edit' }>): Promise<void> {
    const doc = this.b.doc;
    const exists = msg.line >= 0 && msg.line < doc.lineCount;
    const current = exists ? doc.lineText(msg.line) : null;
    if (current === null || msg.docVersion !== doc.version || lineHash(current) !== msg.lineHash) {
      // The text changed after the webview drew it. Never apply an edit to unknown content.
      this.post({ type: 'editResult', ok: false, line: msg.line, reason: 'stale' });
      this.post({ type: 'toolError', ...toolError('EDIT_STALE'), line: msg.line });
      await this.sendPage(this.page, this.filter);
      return;
    }
    let next: string;
    try {
      next = applyMessageEdit(current, msg.path, msg.newText, msg.kind, this.fallbackHints());
    } catch (e) {
      if (e instanceof EditError) {
        // The value or the line does not allow this edit. Not a tool failure; nothing is logged.
        this.post({ type: 'editResult', ok: false, line: msg.line, reason: 'invalid' });
        this.post({ type: 'toolError', ...toolError('EDIT_INVALID'), line: msg.line });
        return;
      }
      throw e;
    }
    if (next === current) {
      this.post({ type: 'editResult', ok: true, line: msg.line });
      return;
    }
    let applied = false;
    try {
      applied = await this.b.replaceLine(msg.line, next);
    } catch (e) {
      this.b.log.error('EDIT_FAILED', e instanceof Error ? (e.stack ?? e.message) : String(e));
    }
    if (!applied) {
      this.b.log.error('EDIT_FAILED', `applyEdit was not applied for line ${msg.line + 1}`);
      this.post({ type: 'editResult', ok: false, line: msg.line, reason: 'failed' });
      this.post({ type: 'toolError', ...toolError('EDIT_FAILED'), line: msg.line });
      return;
    }
    this.post({ type: 'editResult', ok: true, line: msg.line });
  }

  /** Style evidence from the first lines of the file, for lines that carry none of their own. */
  private fallbackHints(): StyleHints {
    let hints = emptyHints();
    const n = Math.min(this.b.doc.lineCount, STYLE_SCAN_LINES);
    for (let i = 0; i < n; i++) {
      const text = this.b.doc.lineText(i);
      const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
      const r = parseSpan(body);
      if (!r.ok) continue;
      hints = mergeHints(hints, detectStyle(body, r.root));
      if (hints.ascii !== null && hints.itemSep !== null && hints.keySep !== null && hints.hexUpper !== null) break;
    }
    return hints;
  }

  // ---- helpers ------------------------------------------------------------------------

  private post(msg: HostToWebview): void {
    if (!this.disposed) this.b.post(msg);
  }

  private fail(code: ToolErrorCode, e: unknown): void {
    const detail = e instanceof Error ? (e.stack ?? e.message) : String(e);
    this.b.log.error(code, detail);
    this.post({ type: 'toolError', ...toolError(code, [code]) });
  }
}

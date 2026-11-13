/** Webview entry: owns the state, builds the toolbar and draws pages sent by the host. */
import type { Stats } from '../core/scan';
import { format, LANGS, type Lang } from '../i18n';
import type { HostToWebview, PageLine, WebviewToHost } from '../shared/protocol';
import { el } from './dom';
import type { EditorHandle } from './editor';
import { renderCard, type CardContext } from './render';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface SavedState {
  page: number;
  role: string;
  toolName: string;
  query: string;
  problemsOnly: boolean;
  statsOpen: boolean;
}

interface ErrorBanner {
  messageKey: string;
  args: Array<string | number>;
  line?: number;
  /** A hint about the user's own request (line jump); it gets no "Open as Text" button. */
  notice?: boolean;
}

const api = acquireVsCodeApi();
const app = document.getElementById('app') as HTMLElement;

const saved = (api.getState() as Partial<SavedState> | null) ?? {};
const ui: SavedState = {
  page: saved.page ?? 0,
  role: saved.role ?? '',
  toolName: saved.toolName ?? '',
  query: saved.query ?? '',
  problemsOnly: saved.problemsOnly ?? false,
  statsOpen: saved.statsOpen ?? false,
};

let lang: Lang = 'en';
let strings: Record<string, string> = {};
let docVersion = 0;
let page = 0;
let totalPages = 1;
let matchCount = 0;
let lines: PageLine[] = [];
let stats: Stats | null = null;
let banner: ErrorBanner | null = null;
let loaded = false;
let focusLine: number | null = null;
const editors = new Map<number, { handle: EditorHandle; close: () => void }>();

const tr = (key: string, ...args: Array<string | number>): string => format(strings[key] ?? key, args);
/** Split a message template so that substituted values become `.data` spans. */
function trNodes(key: string, ...args: Array<string | number>): Node[] {
  const template = strings[key] ?? key;
  const out: Node[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\d+)\}/g)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(document.createTextNode(template.slice(last, idx)));
    const i = Number(m[1]);
    out.push(i < args.length ? el('span', 'data', String(args[i])) : document.createTextNode(m[0]));
    last = idx + m[0].length;
  }
  if (last < template.length) out.push(document.createTextNode(template.slice(last)));
  return out;
}
const post = (msg: WebviewToHost): void => api.postMessage(msg);

function save(): void {
  api.setState({ ...ui, page });
}

// ---- elements that live as long as one language ----------------------------------------
let toolbar: HTMLElement;
let bannerSlot: HTMLElement;
let statsPanel: HTMLElement;
let cardsBox: HTMLElement;
let roleSelect: HTMLSelectElement;
let toolSelect: HTMLSelectElement;
let searchInput: HTMLInputElement;
let problemsBox: HTMLInputElement;
let prevBtn: HTMLButtonElement;
let nextBtn: HTMLButtonElement;
let gotoInput: HTMLInputElement;
let pageLabel: HTMLElement;
let matchLabel: HTMLElement;

function currentFilter() {
  return {
    role: ui.role || undefined,
    toolName: ui.toolName || undefined,
    query: ui.query || undefined,
    problemsOnly: ui.problemsOnly || undefined,
  };
}

function requestPage(n: number): void {
  banner = null;
  renderBanner();
  ui.page = n;
  save();
  post({ type: 'requestPage', page: n, filter: currentFilter() });
}

/** The one place where the 1-based number the user types becomes the 0-based protocol line. */
function requestLine(text: string): void {
  const trimmed = text.trim();
  const n = /^\d+$/.test(trimmed) ? Number(trimmed) : 0;
  if (!Number.isSafeInteger(n) || n < 1) {
    banner = { messageKey: 'msg.lineNotNumber', args: [], notice: true };
    renderBanner();
    return;
  }
  banner = null;
  renderBanner();
  post({ type: 'requestLine', line: n - 1, filter: currentFilter() });
}

function filterChanged(): void {
  requestPage(0);
}

const ctx: CardContext = {
  tr,
  trNodes,
  edit(pl, path, newText, kind) {
    post({ type: 'edit', line: pl.line, docVersion, lineHash: pl.lineHash, path: [...path], newText, kind });
  },
  openAsText(line) {
    post({ type: 'openAsText', line });
  },
  registerEditor(line, handle, close) {
    editors.set(line, { handle, close });
  },
};

function option(value: string, text: string, selected: boolean): HTMLOptionElement {
  const o = el('option', undefined, text, { value });
  o.selected = selected;
  return o;
}

function buildToolbar(): void {
  app.textContent = '';
  editors.clear();
  document.documentElement.lang = lang;

  toolbar = el('div', 'toolbar', undefined, { role: 'toolbar' });

  searchInput = el('input', 'search', undefined, { type: 'search', placeholder: tr('label.search'), 'aria-label': tr('label.search') });
  searchInput.value = ui.query;
  let timer: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ui.query = searchInput.value;
      filterChanged();
    }, 250);
  });
  searchInput.addEventListener('change', () => {
    clearTimeout(timer);
    ui.query = searchInput.value;
    filterChanged();
  });

  gotoInput = el('input', 'goto-line', undefined, {
    type: 'text',
    inputmode: 'numeric',
    placeholder: tr('label.gotoLinePlaceholder'),
    'aria-label': tr('label.gotoLine'),
  });
  gotoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') requestLine(gotoInput.value);
  });

  roleSelect = el('select', 'role-select', undefined, { 'aria-label': tr('label.role') });
  roleSelect.append(option('', tr('label.allRoles'), ui.role === ''));
  for (const r of ['system', 'user', 'assistant', 'tool']) roleSelect.append(option(r, tr(`label.role.${r}`), ui.role === r));
  roleSelect.addEventListener('change', () => {
    ui.role = roleSelect.value;
    filterChanged();
  });

  toolSelect = el('select', 'tool-select', undefined, { 'aria-label': tr('label.toolName') });
  fillToolSelect();
  toolSelect.addEventListener('change', () => {
    ui.toolName = toolSelect.value;
    filterChanged();
  });

  const problemsLabel = el('label', 'check');
  problemsBox = el('input', 'problems-only', undefined, { type: 'checkbox' });
  problemsBox.checked = ui.problemsOnly;
  problemsBox.addEventListener('change', () => {
    ui.problemsOnly = problemsBox.checked;
    filterChanged();
  });
  problemsLabel.append(problemsBox, el('span', undefined, tr('label.problemsOnly')));

  const statsBtn = el('button', 'btn stats-btn', tr('label.stats'), { type: 'button', 'aria-label': tr('label.stats') });
  statsBtn.addEventListener('click', () => {
    ui.statsOpen = !ui.statsOpen;
    save();
    renderStats();
  });

  const langSelect = el('select', 'lang-select', undefined, { 'aria-label': tr('label.language') });
  for (const l of LANGS) {
    // Language names stay in their own language so a user can always find theirs.
    const o = option(l, l === 'en' ? 'English' : '한국어', l === lang);
    o.setAttribute('data-autonym', '');
    langSelect.append(o);
  }
  langSelect.addEventListener('change', () => {
    post({ type: 'setLanguage', lang: langSelect.value as Lang });
  });

  prevBtn = el('button', 'btn prev', tr('label.previous'), { type: 'button', 'aria-label': tr('label.previous') });
  nextBtn = el('button', 'btn next', tr('label.next'), { type: 'button', 'aria-label': tr('label.next') });
  prevBtn.addEventListener('click', () => requestPage(page - 1));
  nextBtn.addEventListener('click', () => requestPage(page + 1));
  pageLabel = el('span', 'page-label');
  matchLabel = el('span', 'match-label');

  const filters = el('div', 'tb-group');
  filters.append(searchInput, gotoInput, roleSelect, toolSelect, problemsLabel, statsBtn);
  const pager = el('div', 'tb-group pager');
  pager.append(prevBtn, pageLabel, nextBtn, matchLabel, langSelect);
  toolbar.append(filters, pager);

  bannerSlot = el('div', 'banner-slot');
  statsPanel = el('section', 'stats-panel');
  cardsBox = el('div', 'cards');
  app.append(toolbar, bannerSlot, statsPanel, cardsBox);
  updateToolbar();
  renderBanner();
  renderStats();
}

function fillToolSelect(): void {
  toolSelect.textContent = '';
  toolSelect.append(option('', tr('label.allTools'), ui.toolName === ''));
  const names = new Set(stats?.toolNames ?? []);
  if (ui.toolName) names.add(ui.toolName);
  for (const n of [...names].sort()) {
    const o = option(n, n, ui.toolName === n);
    o.className = 'data'; // tool names come from the file, not from the message table
    toolSelect.append(o);
  }
}

function updateToolbar(): void {
  pageLabel.textContent = tr('label.page', page + 1, totalPages);
  matchLabel.textContent = tr('label.matches', matchCount);
  prevBtn.disabled = page <= 0;
  nextBtn.disabled = page >= totalPages - 1;
}

function renderBanner(): void {
  bannerSlot.textContent = '';
  if (!banner) return;
  const box = el('div', 'tool-error', undefined, { role: 'alert' });
  box.append(el('span', 'tool-error-text', tr(banner.messageKey, ...banner.args)));
  if (!banner.notice) {
    const open = el('button', 'btn', tr('label.openAsText'), { type: 'button' });
    const line = banner.line ?? 0;
    open.addEventListener('click', () => post({ type: 'openAsText', line }));
    box.append(open);
  }
  bannerSlot.append(box);
}

function renderStats(): void {
  statsPanel.textContent = '';
  statsPanel.hidden = !ui.statsOpen;
  if (!ui.statsOpen) return;
  if (!stats) {
    statsPanel.append(el('p', 'scanning', tr('label.stats.scanning')));
    return;
  }
  const dl = el('dl', 'stat-list');
  const add = (k: string, v: string | number): void => {
    dl.append(el('dt', undefined, k), el('dd', undefined, String(v)));
  };
  add(tr('label.stats.lines'), stats.lines);
  add(tr('label.stats.problemLines'), stats.problemLines);
  add(tr('label.stats.toolCalls'), stats.toolCalls);
  add(
    tr('label.stats.byFormat'),
    Object.entries(stats.perFormat)
      .map(([f, n]) => `${tr(`label.format.${f}`)} ${n}`)
      .join(' · '),
  );
  add(
    tr('label.stats.byRole'),
    Object.entries(stats.perRole)
      .map(([r, n]) => `${tr(`label.role.${r}`)} ${n}`)
      .join(' · '),
  );
  statsPanel.append(dl);
}

function renderPage(): void {
  cardsBox.textContent = '';
  editors.clear();
  if (lines.length === 0) {
    cardsBox.append(el('p', 'empty', tr(matchCount === 0 && lineFilterActive() ? 'msg.noMatches' : 'msg.noLines')));
    return;
  }
  for (const pl of lines) cardsBox.append(renderCard(ctx, pl));
  if (focusLine !== null) {
    const card = cardsBox.querySelector<HTMLElement>(`[data-line="${focusLine}"]`);
    focusLine = null;
    if (card) {
      card.classList.add('focused');
      card.setAttribute('tabindex', '-1');
      if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'center' });
      card.focus();
    }
  }
}

function lineFilterActive(): boolean {
  return !!(ui.role || ui.toolName || ui.query || ui.problemsOnly);
}

// ---- messages from the host ------------------------------------------------------------
window.addEventListener('message', (event: MessageEvent<HostToWebview>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'init':
      lang = msg.lang;
      strings = msg.strings;
      docVersion = msg.docVersion;
      loaded = true;
      buildToolbar();
      if (msg.jump) {
        // The host opens the page of a requested line: drop the old page and filters so the screen matches it.
        Object.assign(ui, { page: 0, role: '', toolName: '', query: '', problemsOnly: false });
        save();
        buildToolbar();
      } else if (ui.page !== 0 || lineFilterActive()) post({ type: 'requestPage', page: ui.page, filter: currentFilter() });
      break;
    case 'page':
      if (!loaded) return;
      docVersion = msg.docVersion;
      page = msg.page;
      totalPages = msg.totalPages;
      matchCount = msg.matchCount;
      lines = msg.lines;
      focusLine = msg.focusLine ?? null;
      ui.page = page;
      save();
      updateToolbar();
      renderPage();
      break;
    case 'linesUpdated':
      if (!loaded) return;
      docVersion = msg.docVersion;
      for (const pl of msg.lines) {
        const idx = lines.findIndex((x) => x.line === pl.line);
        if (idx < 0) continue;
        lines[idx] = pl;
        const old = cardsBox.querySelector(`[data-line="${pl.line}"]`);
        const fresh = renderCard(ctx, pl);
        editors.delete(pl.line);
        if (old) old.replaceWith(fresh);
      }
      break;
    case 'stats':
      if (!loaded) return;
      stats = msg.stats;
      matchCount = msg.matchCount;
      totalPages = msg.totalPages;
      fillToolSelect();
      updateToolbar();
      renderStats();
      break;
    case 'editResult': {
      const ed = editors.get(msg.line);
      if (msg.ok) {
        banner = null;
        renderBanner();
        if (ed) {
          ed.close();
          editors.delete(msg.line);
        }
      } else if (msg.reason === 'invalid' && ed) {
        ed.handle.showError(tr('error.editInvalid'));
      }
      break;
    }
    case 'toolError':
      banner = { messageKey: msg.messageKey, args: msg.args, line: msg.line, notice: msg.code === 'LINE_NOTICE' };
      if (loaded) renderBanner();
      break;
    case 'strings':
      lang = msg.lang;
      strings = msg.strings;
      if (!loaded) return;
      buildToolbar();
      renderPage();
      break;
  }
});

post({ type: 'ready' });

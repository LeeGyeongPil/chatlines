/**
 * Stand-in for the VS Code extension host. It is NOT VS Code: it implements only the few API
 * members chatlines uses, so the default test suite can run anywhere (including sandboxes
 * that cannot start Electron). `npm run test:integration` runs the same flow in real VS Code.
 */
import './env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { JSDOM, type DOMWindow } from 'jsdom';
import { ROOT } from './examples';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export interface FakeRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

class Range {
  start: { line: number; character: number };
  end: { line: number; character: number };
  constructor(sl: number, sc: number, el: number, ec: number) {
    this.start = { line: sl, character: sc };
    this.end = { line: el, character: ec };
  }
}

class WorkspaceEdit {
  ops: Array<{ uri: Any; range: FakeRange; newText: string }> = [];
  replace(uri: Any, range: FakeRange, newText: string): void {
    this.ops.push({ uri, range, newText });
  }
}

export class FakeDoc {
  version = 1;
  uri: Any;
  constructor(
    public text: string,
    name = 'sample.jsonl',
  ) {
    this.uri = { toString: () => `file:///${name}`, fsPath: `/${name}`, path: `/${name}` };
  }
  private cache: { text: string; lines: string[] } | null = null;
  private split(): string[] {
    if (!this.cache || this.cache.text !== this.text) this.cache = { text: this.text, lines: this.text.split(/\r\n|\n|\r/) };
    return this.cache.lines;
  }
  get lineCount(): number {
    return this.split().length;
  }
  lineAt(i: number): { text: string; range: FakeRange } {
    const text = this.split()[i];
    return { text, range: new Range(i, 0, i, text.length) };
  }
  getText(): string {
    return this.text;
  }
}

export interface StubState {
  language: string;
  config: Record<string, unknown>;
  configUpdates: Array<{ key: string; value: unknown; target: number }>;
  applyEditCalls: WorkspaceEdit[];
  applyEditMode: 'ok' | 'false' | 'throw';
  outputLines: string[];
  errorMessages: string[];
  shownDocuments: Array<{ viewColumn?: number; selection?: FakeRange }>;
  providers: Array<{ viewType: string; provider: Any; options: Any }>;
  commands: Map<string, (...a: Any[]) => Any>;
  changeListeners: Array<(e: Any) => void>;
  configListeners: Array<(e: Any) => void>;
  docs: FakeDoc[];
  fileSize: number;
  activeEditor?: { document: Any; selection: { active: { line: number } } };
}

function createStub(state: StubState): Any {
  const Uri = {
    file: (p: string) => ({ fsPath: p, path: p, toString: () => `file://${p}` }),
    joinPath: (base: Any, ...parts: string[]) => {
      const p = path.posix.join(base.path, ...parts);
      return { fsPath: p, path: p, toString: () => `file://${p}` };
    },
  };
  return {
    Uri,
    Range,
    WorkspaceEdit,
    ViewColumn: { Beside: -2 },
    ConfigurationTarget: { Global: 1 },
    env: {
      get language() {
        return state.language;
      },
    },
    workspace: {
      getConfiguration: (section: string) => ({
        get: (key: string, def?: unknown) => (`${section}.${key}` in state.config ? state.config[`${section}.${key}`] : def),
        update: async (key: string, value: unknown, target: number) => {
          state.configUpdates.push({ key, value, target });
          state.config[`${section}.${key}`] = value;
          for (const l of state.configListeners) l({ affectsConfiguration: (s: string) => s === `${section}.${key}` });
        },
      }),
      onDidChangeConfiguration: (cb: (e: Any) => void) => {
        state.configListeners.push(cb);
        return { dispose() {} };
      },
      onDidChangeTextDocument: (cb: (e: Any) => void) => {
        state.changeListeners.push(cb);
        return { dispose() {} };
      },
      applyEdit: async (edit: WorkspaceEdit) => {
        state.applyEditCalls.push(edit);
        if (state.applyEditMode === 'throw') throw new Error('stub: applyEdit exploded');
        if (state.applyEditMode === 'false') return false;
        const doc = state.docs[0];
        const lines = doc.text.split(/(\r\n|\n|\r)/); // keeps terminators at odd indexes
        const changes: Any[] = [];
        for (const op of edit.ops) {
          lines[op.range.start.line * 2] = op.newText;
          changes.push({ range: op.range, text: op.newText });
        }
        doc.text = lines.join('');
        doc.version++;
        for (const l of state.changeListeners) l({ document: doc, contentChanges: changes });
        return true;
      },
      fs: { stat: async () => ({ size: state.fileSize }) },
      openTextDocument: async (uri: Any) => state.docs.find((d) => d.uri.toString() === uri.toString()) ?? state.docs[0],
    },
    window: {
      registerCustomEditorProvider: (viewType: string, provider: Any, options: Any) => {
        state.providers.push({ viewType, provider, options });
        return { dispose() {} };
      },
      createOutputChannel: () => ({ appendLine: (l: string) => state.outputLines.push(l), dispose() {} }),
      showErrorMessage: async (m: string) => {
        state.errorMessages.push(m);
      },
      showTextDocument: async (_doc: Any, opts: Any) => {
        state.shownDocuments.push({ viewColumn: opts?.viewColumn, selection: opts?.selection });
      },
      get activeTextEditor() {
        return state.activeEditor;
      },
    },
    commands: {
      registerCommand: (id: string, fn: (...a: Any[]) => Any) => {
        state.commands.set(id, fn);
        return { dispose() {} };
      },
      executeCommand: async () => undefined,
    },
  };
}

export interface Harness {
  state: StubState;
  doc: FakeDoc;
  readonly window: DOMWindow;
  readonly document: Document;
  /** How many times the host asked VS Code to bring the chat view to the front. */
  readonly revealCalls: number;
  /** Hide the chat view (its page is destroyed and host messages are dropped). */
  hide(): void;
  /** Show it again: the page starts over and restores its saved page and filters. */
  show(): void;
  /** Messages the webview posted to the host. */
  toHost: Any[];
  /** Messages the host posted to the webview. */
  fromHost: Any[];
  panelHtml: string;
  provider: Any;
  waitFor(fn: () => boolean, ms?: number): Promise<void>;
  /** Let pending timers and promises run. */
  settle(ms?: number): Promise<void>;
  /** Wait until the first page and the statistics have arrived. */
  ready(): Promise<void>;
  send(msg: Any): void;
  cleanup(): void;
}

export interface OpenOptions {
  language?: string;
  config?: Record<string, unknown>;
  fileName?: string;
  /** Run "Open as Chat" from a text editor with the cursor on this 0-based line before the view starts. */
  cursorLine?: number;
}

let current: Any = null;
let hooked = false;

function installHook(): void {
  if (hooked) return;
  hooked = true;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require('node:module');
  const orig = Module._load;
  Module._load = function (request: string, ...rest: Any[]) {
    if (request === 'vscode') return current;
    return orig.call(this, request, ...rest);
  };
}

export function newState(opts: OpenOptions = {}): StubState {
  return {
    language: opts.language ?? 'en',
    config: { ...(opts.config ?? {}) },
    configUpdates: [],
    applyEditCalls: [],
    applyEditMode: 'ok',
    outputLines: [],
    errorMessages: [],
    shownDocuments: [],
    providers: [],
    commands: new Map(),
    changeListeners: [],
    configListeners: [],
    docs: [],
    fileSize: 1000,
  };
}

/** Load a fresh copy of the compiled extension against the stub and call activate(). */
export function activateExtension(state: StubState): Any {
  installHook();
  current = createStub(state);
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(ROOT, 'out', 'src'))) delete require.cache[key];
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ext = require(path.join(ROOT, 'out', 'src', 'extension.js'));
  const context = { subscriptions: [] as Any[], extensionUri: current.Uri.file(ROOT) };
  ext.activate(context);
  return { ext, context };
}

const WEBVIEW_JS = (): string => fs.readFileSync(path.join(ROOT, 'media', 'webview.js'), 'utf8');

export async function openChat(text: string, opts: OpenOptions = {}): Promise<Harness> {
  const state = newState(opts);
  activateExtension(state);
  const doc = new FakeDoc(text, opts.fileName);
  state.docs.push(doc);
  if (opts.cursorLine !== undefined) {
    state.activeEditor = { document: doc, selection: { active: { line: opts.cursorLine } } };
    await state.commands.get("chatlines.openAsChat")!();
    state.activeEditor = undefined;
  }
  const provider = state.providers[0].provider;

  const toHost: Any[] = [];
  const fromHost: Any[] = [];
  let hostReceive: ((m: Any) => unknown) | null = null;
  let win: DOMWindow | null = null;
  let disposeCb: (() => void) | null = null;

  let revealCalls = 0;
  let lateDelivery = false;
  const panel = {
    visible: true,
    reveal: () => {
      revealCalls++;
    },
    webview: {
      options: {} as Any,
      html: '',
      cspSource: 'vscode-webview://stub',
      asWebviewUri: (u: Any) => ({ toString: () => `vscode-webview://stub${u.path}` }),
      onDidReceiveMessage: (cb: (m: Any) => unknown) => {
        hostReceive = cb;
        return { dispose() {} };
      },
      postMessage: async (msg: Any) => {
        if (!panel.visible) return false; // hidden view: VS Code drops the message
        const clone = JSON.parse(JSON.stringify(msg));
        fromHost.push(clone);
        const target = win;
        if (!target) return true;
        const deliver = (): boolean => target.dispatchEvent(new target.MessageEvent('message', { data: clone }));
        // After show() the page gets messages a moment later, like in VS Code (the default stays synchronous).
        if (lateDelivery) setTimeout(deliver, 0);
        else deliver();
        return true;
      },
    },
    onDidDispose: (cb: () => void) => {
      disposeCb = cb;
      return { dispose() {} };
    },
  };
  await provider.resolveCustomTextEditor(doc, panel, {});

  let saved: unknown = null; // what the page keeps with setState; survives a hide and show
  const startPage = (): void => {
    const dom = new JSDOM(panel.webview.html, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    win = dom.window;
    (win as Any).acquireVsCodeApi = () => ({
      postMessage: (m: Any) => {
        const clone = JSON.parse(JSON.stringify(m));
        toHost.push(clone);
        if (hostReceive) void hostReceive(clone);
      },
      getState: () => saved,
      setState: (s: unknown) => {
        saved = s;
      },
    });
    win.eval(WEBVIEW_JS());
  };
  startPage();

  const settle = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms));
  const waitFor = async (fn: () => boolean, ms = 30000): Promise<void> => {
    const t0 = Date.now();
    while (!fn()) {
      if (Date.now() - t0 > ms) throw new Error('waitFor timed out');
      await settle(5);
    }
  };

  return {
    state,
    doc,
    get window() {
      return win as DOMWindow;
    },
    get document() {
      return (win as DOMWindow).document;
    },
    get revealCalls() {
      return revealCalls;
    },
    hide: () => {
      panel.visible = false;
      win?.close(); // without retainContextWhenHidden the page is destroyed
    },
    show: () => {
      panel.visible = true;
      lateDelivery = true;
      startPage(); // the page starts again, with the state it saved before
    },
    toHost,
    fromHost,
    panelHtml: panel.webview.html,
    provider,
    waitFor,
    settle,
    ready: async () => {
      await waitFor(() => fromHost.some((m) => m.type === 'page') && fromHost.some((m) => m.type === 'stats'));
    },
    send: (msg: Any) => {
      toHost.push(JSON.parse(JSON.stringify(msg)));
      void hostReceive?.(msg);
    },
    cleanup: () => {
      disposeCb?.();
      win?.close();
    },
  };
}

/** Click an edit button; returns the textarea of the edit box that opened. */
export function openEditor(h: Harness, selector: string): HTMLTextAreaElement {
  const btn = h.document.querySelector<HTMLButtonElement>(selector);
  if (!btn) throw new Error('no element for ' + selector);
  btn.click();
  const area = h.document.querySelector<HTMLTextAreaElement>('.editbox textarea');
  if (!area) throw new Error('edit box did not open');
  return area;
}

export function saveEditor(h: Harness, area: HTMLTextAreaElement, value: string): void {
  area.value = value;
  h.document.querySelector<HTMLButtonElement>('.editbox .save')!.click();
}

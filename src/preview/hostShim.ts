/**
 * Browser stand-in for the VS Code host, used only by `npm run preview`.
 * It runs the SAME Session class as the extension; only the document, the settings and the
 * message channel are replaced by plain in-memory versions. It is not a VS Code window.
 */
import { splitLines } from '../core/edit';
import { Session } from '../host/session';
import { resolveLanguage } from '../host/lang';
import { isLang, type Lang } from '../i18n';
import type { HostToWebview, WebviewToHost } from '../shared/protocol';
import en_openai_chat from '../../examples/en/openai-chat.jsonl';
import en_openai_tools from '../../examples/en/openai-tools.jsonl';
import en_sharegpt from '../../examples/en/sharegpt.jsonl';
import en_alpaca from '../../examples/en/alpaca.jsonl';
import en_batch_request from '../../examples/en/batch-request.jsonl';
import en_batch_response from '../../examples/en/batch-response.jsonl';
import en_python_style from '../../examples/en/python-style.jsonl';
import en_mixed_problems from '../../examples/en/mixed-problems.jsonl';
import ko_openai_chat from '../../examples/ko/openai-chat.jsonl';
import ko_openai_tools from '../../examples/ko/openai-tools.jsonl';
import ko_sharegpt from '../../examples/ko/sharegpt.jsonl';
import ko_alpaca from '../../examples/ko/alpaca.jsonl';
import ko_batch_request from '../../examples/ko/batch-request.jsonl';
import ko_batch_response from '../../examples/ko/batch-response.jsonl';
import ko_python_style from '../../examples/ko/python-style.jsonl';
import ko_mixed_problems from '../../examples/ko/mixed-problems.jsonl';

const FIXTURES: Record<Lang, Record<string, string>> = {
  en: {
  'openai-chat': en_openai_chat,
  'openai-tools': en_openai_tools,
  'sharegpt': en_sharegpt,
  'alpaca': en_alpaca,
  'batch-request': en_batch_request,
  'batch-response': en_batch_response,
  'python-style': en_python_style,
  'mixed-problems': en_mixed_problems,
  },
  ko: {
  'openai-chat': ko_openai_chat,
  'openai-tools': ko_openai_tools,
  'sharegpt': ko_sharegpt,
  'alpaca': ko_alpaca,
  'batch-request': ko_batch_request,
  'batch-response': ko_batch_response,
  'python-style': ko_python_style,
  'mixed-problems': ko_mixed_problems,
  },
};

const params = new URLSearchParams(location.search);
const fixtureName = params.get('fixture') && params.get('fixture')! in FIXTURES.en ? params.get('fixture')! : 'openai-tools';
const STORE_KEY = 'chatlines.lang';

function readStoredLang(): string | undefined {
  try {
    return localStorage.getItem(STORE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

// ?lang=ko wins, then the saved choice, then the browser language (first visit only).
const queryLang = params.get('lang');
let lang: Lang = isLang(queryLang) ? queryLang : resolveLanguage(readStoredLang() ?? 'auto', navigator.language);

const themeLink = document.getElementById('theme') as HTMLLinkElement | null;
if (themeLink) themeLink.href = params.get('theme') === 'light' ? 'theme-light.css' : 'theme-dark.css';

let lines = splitLines(FIXTURES[lang][fixtureName]).map((l) => l.text);
if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
let version = 1;

const deliver = (msg: HostToWebview): void => {
  setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: msg })), 0);
};

const session = new Session({
  doc: {
    get version() {
      return version;
    },
    get lineCount() {
      return lines.length;
    },
    lineText: (i) => lines[i],
  },
  post: deliver,
  replaceLine: async (line, newText) => {
    lines[line] = newText;
    version++;
    setTimeout(() => session.onDocumentChanged([{ startLine: line, endLine: line, lineDelta: 0 }]), 0);
    return true;
  },
  getLanguage: () => lang,
  setLanguage: async (next) => {
    lang = next;
    try {
      localStorage.setItem(STORE_KEY, next);
    } catch {
      /* storage may be unavailable; the choice then lasts for this page only */
    }
    if (version === 1) {
      // Nothing edited yet: show the example in the chosen language too.
      const old = lines.length;
      lines = splitLines(FIXTURES[next][fixtureName]).map((l) => l.text);
      if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      version++;
      setTimeout(() => session.onDocumentChanged([{ startLine: 0, endLine: old - 1, lineDelta: lines.length - old || 1 }]), 0);
    }
  },
  getPageSize: () => 50,
  openAsText: (line) => {
    console.log(`openAsText: line ${line + 1}`);
  },
  log: { error: (code, detail) => console.error(`[chatlines] ${code}: ${detail}`) },
});

// Initial webview state from the address (for screenshots): ?problems=1&stats=1&role=tool&q=text
const initialState = {
  page: 0,
  role: params.get('role') ?? '',
  toolName: params.get('tool') ?? '',
  query: params.get('q') ?? '',
  problemsOnly: params.get('problems') === '1',
  statsOpen: params.get('stats') === '1',
};
let state: unknown = initialState;

(window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  postMessage: (msg: WebviewToHost) => {
    void session.handle(msg);
  },
  getState: () => state,
  setState: (s: unknown) => {
    state = s;
  },
});

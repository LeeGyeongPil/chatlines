/**
 * Serialization style of a JSON line: separators, `ensure_ascii`-style escaping, hex case.
 * Detecting the style of an existing line lets an edit write new strings the way the
 * original writer (often Python's `json.dumps`) would have written them.
 */
import type { Node } from './jsonSpan';

export interface StyleHints {
  /** Text between two array items or object members, e.g. "," or ", ". null = no evidence. */
  itemSep: string | null;
  /** Text between a key and its value, e.g. ":" or ": ". null = no evidence. */
  keySep: string | null;
  /** true = non-ASCII is written as \uXXXX, false = raw UTF-8, null = no evidence. */
  ascii: boolean | null;
  /** true = ° style hex digits, false = °, null = no evidence. */
  hexUpper: boolean | null;
  /** `\/` is used for slashes. */
  escapeSlash: boolean;
}

export interface Style {
  itemSep: string;
  keySep: string;
  ascii: boolean;
  hexUpper: boolean;
  escapeSlash: boolean;
}

export function emptyHints(): StyleHints {
  return { itemSep: null, keySep: null, ascii: null, hexUpper: null, escapeSlash: false };
}

const ITEM_SEP = /^[ \t]*,[ \t]*$/;
const KEY_SEP = /^[ \t]*:[ \t]*$/;
const UNICODE_ESCAPE = /\\u([0-9a-fA-F]{4})/g;

/** Look at one parsed line and report what style it was written in. */
export function detectStyle(text: string, root: Node): StyleHints {
  const h = emptyHints();
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const n = stack.pop() as Node;
    if (n.t === 'string') {
      scanStringToken(text.slice(n.start, n.end), h);
    } else if (n.t === 'array') {
      if (h.itemSep === null && n.items.length >= 2) {
        const gap = text.slice(n.items[0].end, n.items[1].start);
        if (ITEM_SEP.test(gap)) h.itemSep = gap;
      }
      for (const it of n.items) stack.push(it);
    } else if (n.t === 'object') {
      for (let i = 0; i < n.members.length; i++) {
        const m = n.members[i];
        scanStringToken(text.slice(m.keyStart, m.keyEnd), h);
        if (h.keySep === null) {
          const gap = text.slice(m.keyEnd, m.value.start);
          if (KEY_SEP.test(gap)) h.keySep = gap;
        }
        if (h.itemSep === null && i + 1 < n.members.length) {
          const gap = text.slice(m.value.end, n.members[i + 1].keyStart);
          if (ITEM_SEP.test(gap)) h.itemSep = gap;
        }
        stack.push(m.value);
      }
    }
  }
  return h;
}

function scanStringToken(raw: string, h: StyleHints): void {
  if (raw.includes('\\/')) h.escapeSlash = true;
  if (h.ascii !== null && h.hexUpper !== null) return;
  if (raw.indexOf('\\u') !== -1) {
    UNICODE_ESCAPE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = UNICODE_ESCAPE.exec(raw)) !== null) {
      const hex = m[1];
      if (h.ascii === null && parseInt(hex, 16) >= 0x80) h.ascii = true;
      if (h.hexUpper === null && /[a-fA-F]/.test(hex)) h.hexUpper = !/[a-f]/.test(hex);
    }
  }
  if (h.ascii === null) {
    for (let i = 0; i < raw.length; i++) {
      if (raw.charCodeAt(i) >= 0x80) {
        h.ascii = false;
        break;
      }
    }
  }
}

/** First hint that has evidence wins; `b` fills the gaps of `a`. */
export function mergeHints(a: StyleHints, b: StyleHints | undefined): StyleHints {
  if (!b) return a;
  return {
    itemSep: a.itemSep ?? b.itemSep,
    keySep: a.keySep ?? b.keySep,
    ascii: a.ascii ?? b.ascii,
    hexUpper: a.hexUpper ?? b.hexUpper,
    escapeSlash: a.escapeSlash || b.escapeSlash,
  };
}

/** Turn hints into a complete style. Without any evidence: compact separators, raw UTF-8. */
export function resolveStyle(h: StyleHints): Style {
  const itemSep = h.itemSep ?? (h.keySep !== null ? (h.keySep.endsWith(' ') ? ', ' : ',') : ',');
  const keySep = h.keySep ?? (h.itemSep !== null ? (h.itemSep.endsWith(' ') ? ': ' : ':') : ':');
  return {
    itemSep,
    keySep,
    ascii: h.ascii ?? false,
    hexUpper: h.hexUpper ?? false,
    escapeSlash: h.escapeSlash,
  };
}

function hex4(code: number, upper: boolean): string {
  const h = code.toString(16).padStart(4, '0');
  return upper ? h.toUpperCase() : h;
}

/** Encode `value` as a JSON string token in the given style. */
export function encodeString(value: string, st: Style): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    const ch = value[i];
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (c === 0x0a) out += '\\n';
    else if (c === 0x0d) out += '\\r';
    else if (c === 0x09) out += '\\t';
    else if (c === 0x08) out += '\\b';
    else if (c === 0x0c) out += '\\f';
    else if (c < 0x20) out += '\\u' + hex4(c, st.hexUpper);
    else if (st.escapeSlash && ch === '/') out += '\\/';
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        if (st.ascii) out += '\\u' + hex4(c, st.hexUpper) + '\\u' + hex4(next, st.hexUpper);
        else out += ch + value[i + 1];
        i++;
      } else {
        out += '\\u' + hex4(c, st.hexUpper); // a lone surrogate cannot be written as UTF-8
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      out += '\\u' + hex4(c, st.hexUpper);
    } else if (st.ascii && c > 0x7e) {
      out += '\\u' + hex4(c, st.hexUpper);
    } else {
      out += ch;
    }
  }
  return out + '"';
}

/**
 * Write a parsed node back out in `st`, keeping number and literal spellings.
 * With `indent` > 0 the output is pretty-printed (used for showing tool-call arguments).
 */
export function serializeNode(node: Node, st: Style, indent = 0): string {
  const ser = (n: Node, level: number): string => {
    switch (n.t) {
      case 'string':
        return encodeString(n.value, st);
      case 'number':
      case 'literal':
        return n.raw;
      case 'array': {
        if (n.items.length === 0) return '[]';
        if (indent > 0) {
          const pad = ' '.repeat(indent * (level + 1));
          const end = ' '.repeat(indent * level);
          return '[\n' + n.items.map((x) => pad + ser(x, level + 1)).join(',\n') + '\n' + end + ']';
        }
        return '[' + n.items.map((x) => ser(x, level + 1)).join(st.itemSep) + ']';
      }
      case 'object': {
        if (n.members.length === 0) return '{}';
        if (indent > 0) {
          const pad = ' '.repeat(indent * (level + 1));
          const end = ' '.repeat(indent * level);
          const body = n.members.map((m) => pad + encodeString(m.key, st) + ': ' + ser(m.value, level + 1));
          return '{\n' + body.join(',\n') + '\n' + end + '}';
        }
        const body = n.members.map((m) => encodeString(m.key, st) + st.keySep + ser(m.value, level + 1));
        return '{' + body.join(st.itemSep) + '}';
      }
    }
  };
  return ser(node, 0);
}

/**
 * Position-tracking JSON parser.
 *
 * Every node remembers where it starts and ends in the source text, numbers keep their
 * original spelling, and the accepted grammar is exactly what `JSON.parse` accepts
 * (so a line is "valid" here if and only if it is valid for JavaScript).
 */

export type Path = ReadonlyArray<string | number>;

export interface StringNode {
  t: 'string';
  start: number;
  end: number;
  value: string;
}
export interface NumberNode {
  t: 'number';
  start: number;
  end: number;
  raw: string;
}
export interface LiteralNode {
  t: 'literal';
  start: number;
  end: number;
  raw: 'true' | 'false' | 'null';
}
export interface ArrayNode {
  t: 'array';
  start: number;
  end: number;
  items: Node[];
}
export interface Member {
  key: string;
  keyStart: number;
  keyEnd: number;
  value: Node;
}
export interface ObjectNode {
  t: 'object';
  start: number;
  end: number;
  members: Member[];
}
export type Node = StringNode | NumberNode | LiteralNode | ArrayNode | ObjectNode;

export type ParseResult =
  | { ok: true; root: Node }
  | { ok: false; pos: number; message: string };

class SpanError extends Error {
  constructor(
    public pos: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_DEPTH = 512;

const HEX = /^[0-9a-fA-F]{4}$/;

class Parser {
  private i = 0;
  constructor(private readonly s: string) {}

  run(): Node {
    this.ws();
    const root = this.value(0);
    this.ws();
    if (this.i < this.s.length) throw new SpanError(this.i, 'Unexpected data after the JSON value');
    return root;
  }

  private ws(): void {
    const s = this.s;
    while (this.i < s.length) {
      const c = s.charCodeAt(this.i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.i++;
      else break;
    }
  }

  private value(depth: number): Node {
    if (depth > MAX_DEPTH) throw new SpanError(this.i, 'Nesting is too deep');
    const s = this.s;
    if (this.i >= s.length) throw new SpanError(this.i, 'Unexpected end of input');
    const c = s[this.i];
    if (c === '{') return this.object(depth);
    if (c === '[') return this.array(depth);
    if (c === '"') return this.string();
    if (c === '-' || (c >= '0' && c <= '9')) return this.number();
    for (const lit of ['true', 'false', 'null'] as const) {
      if (s.startsWith(lit, this.i)) {
        const start = this.i;
        this.i += lit.length;
        return { t: 'literal', start, end: this.i, raw: lit };
      }
    }
    throw new SpanError(this.i, `Unexpected character ${JSON.stringify(c)}`);
  }

  private object(depth: number): ObjectNode {
    const start = this.i;
    this.i++; // {
    const members: Member[] = [];
    this.ws();
    if (this.s[this.i] === '}') {
      this.i++;
      return { t: 'object', start, end: this.i, members };
    }
    for (;;) {
      this.ws();
      if (this.s[this.i] !== '"') throw new SpanError(this.i, 'Expected a string key');
      const k = this.string();
      this.ws();
      if (this.s[this.i] !== ':') throw new SpanError(this.i, "Expected ':' after the key");
      this.i++;
      this.ws();
      const v = this.value(depth + 1);
      members.push({ key: k.value, keyStart: k.start, keyEnd: k.end, value: v });
      this.ws();
      const c = this.s[this.i];
      if (c === ',') {
        this.i++;
        continue;
      }
      if (c === '}') {
        this.i++;
        return { t: 'object', start, end: this.i, members };
      }
      throw new SpanError(this.i, "Expected ',' or '}'");
    }
  }

  private array(depth: number): ArrayNode {
    const start = this.i;
    this.i++; // [
    const items: Node[] = [];
    this.ws();
    if (this.s[this.i] === ']') {
      this.i++;
      return { t: 'array', start, end: this.i, items };
    }
    for (;;) {
      this.ws();
      items.push(this.value(depth + 1));
      this.ws();
      const c = this.s[this.i];
      if (c === ',') {
        this.i++;
        continue;
      }
      if (c === ']') {
        this.i++;
        return { t: 'array', start, end: this.i, items };
      }
      throw new SpanError(this.i, "Expected ',' or ']'");
    }
  }

  private string(): StringNode {
    const s = this.s;
    const start = this.i;
    this.i++; // opening quote
    let out = '';
    let chunk = this.i;
    for (;;) {
      if (this.i >= s.length) throw new SpanError(this.i, 'Unterminated string');
      const c = s.charCodeAt(this.i);
      if (c === 0x22) {
        out += s.slice(chunk, this.i);
        this.i++;
        return { t: 'string', start, end: this.i, value: out };
      }
      if (c < 0x20) throw new SpanError(this.i, 'Control character in string');
      if (c === 0x5c) {
        out += s.slice(chunk, this.i);
        const e = s[this.i + 1];
        switch (e) {
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          case '/': out += '/'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'u': {
            const hex = s.slice(this.i + 2, this.i + 6);
            if (!HEX.test(hex)) throw new SpanError(this.i, 'Invalid \\u escape');
            out += String.fromCharCode(parseInt(hex, 16));
            this.i += 4;
            break;
          }
          default:
            throw new SpanError(this.i, 'Invalid escape sequence');
        }
        this.i += 2;
        chunk = this.i;
        continue;
      }
      this.i++;
    }
  }

  private number(): NumberNode {
    const s = this.s;
    const start = this.i;
    if (s[this.i] === '-') this.i++;
    if (s[this.i] === '0') {
      this.i++;
    } else if (s[this.i] >= '1' && s[this.i] <= '9') {
      while (s[this.i] >= '0' && s[this.i] <= '9') this.i++;
    } else {
      throw new SpanError(this.i, 'Invalid number');
    }
    if (s[this.i] === '.') {
      this.i++;
      if (!(s[this.i] >= '0' && s[this.i] <= '9')) throw new SpanError(this.i, 'Invalid number');
      while (s[this.i] >= '0' && s[this.i] <= '9') this.i++;
    }
    if (s[this.i] === 'e' || s[this.i] === 'E') {
      this.i++;
      if (s[this.i] === '+' || s[this.i] === '-') this.i++;
      if (!(s[this.i] >= '0' && s[this.i] <= '9')) throw new SpanError(this.i, 'Invalid number');
      while (s[this.i] >= '0' && s[this.i] <= '9') this.i++;
    }
    return { t: 'number', start, end: this.i, raw: s.slice(start, this.i) };
  }
}

/** Parse `text` and keep source positions. Never throws for bad input. */
export function parseSpan(text: string): ParseResult {
  try {
    return { ok: true, root: new Parser(text).run() };
  } catch (e) {
    if (e instanceof SpanError) return { ok: false, pos: e.pos, message: e.message };
    throw e;
  }
}

/**
 * Follow `path` from `node`. For objects with duplicate keys the LAST member wins,
 * exactly like `JSON.parse`. Returns undefined when the path does not exist.
 */
export function nodeAt(node: Node, path: Path): Node | undefined {
  let cur: Node | undefined = node;
  for (const step of path) {
    if (!cur) return undefined;
    if (typeof step === 'number') {
      if (cur.t !== 'array') return undefined;
      cur = cur.items[step];
    } else {
      if (cur.t !== 'object') return undefined;
      let found: Node | undefined;
      for (const m of cur.members) if (m.key === step) found = m.value;
      cur = found;
    }
  }
  return cur;
}

/**
 * Token-level edit: replace exactly one JSON string token inside one line and leave every
 * other byte alone. The new token is written in the line's own style (separators,
 * `\uXXXX` escapes), so a Python `json.dumps` line stays a Python-style line.
 */
import { nodeAt, parseSpan, type Path } from './jsonSpan';
import { detectStyle, emptyHints, mergeHints, resolveStyle, serializeNode, encodeString, type StyleHints } from './style';

export type EditKind = 'text' | 'arguments';

export type EditErrorCode = 'invalidJson' | 'notString' | 'badArguments';

export class EditError extends Error {
  constructor(
    public readonly code: EditErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EditError';
  }
}

/**
 * Return `lineText` with the string at `path` replaced by `newValue`.
 * `fallback` supplies style hints (e.g. from the rest of the file) for lines that carry no
 * evidence of their own, such as an all-ASCII line that receives its first non-ASCII character.
 */
export function applyMessageEdit(
  lineText: string,
  path: Path,
  newValue: string,
  kind: EditKind = 'text',
  fallback?: StyleHints,
): string {
  const bom = lineText.charCodeAt(0) === 0xfeff ? 1 : 0;
  const body = lineText.slice(bom);
  const parsed = parseSpan(body);
  if (!parsed.ok) throw new EditError('invalidJson', `The line is not valid JSON: ${parsed.message}`);
  const target = nodeAt(parsed.root, path);
  if (!target || target.t !== 'string') {
    throw new EditError('notString', `No string value at path ${JSON.stringify(path)}`);
  }
  const lineStyle = resolveStyle(mergeHints(detectStyle(body, parsed.root), fallback));

  let token: string;
  if (kind === 'arguments') {
    const next = parseSpan(newValue);
    if (!next.ok) throw new EditError('badArguments', `The arguments are not valid JSON: ${next.message}`);
    // Re-serialize in the style of the ORIGINAL arguments string (e.g. '{"city": "Seoul"}').
    const old = parseSpan(target.value);
    const argHints = old.ok ? detectStyle(target.value, old.root) : undefined;
    const carry: StyleHints = { ...emptyHints(), ascii: lineStyle.ascii, hexUpper: lineStyle.hexUpper };
    const argStyle = resolveStyle(mergeHints(argHints ?? emptyHints(), carry));
    token = encodeString(serializeNode(next.root, argStyle), lineStyle);
  } else {
    token = encodeString(newValue, lineStyle);
  }
  return lineText.slice(0, bom + target.start) + token + lineText.slice(bom + target.end);
}

export interface SplitLine {
  text: string;
  eol: string;
}

/** Split document text into lines, remembering each line's own terminator. */
export function splitLines(text: string): SplitLine[] {
  const out: SplitLine[] = [];
  const re = /\r\n|\n|\r/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ text: text.slice(last, m.index), eol: m[0] });
    last = m.index + m[0].length;
  }
  out.push({ text: text.slice(last), eol: '' });
  return out;
}

/** Whole-file helper: edit line `lineIndex` (0-based) and keep all other bytes, EOLs and BOM. */
export function applyEditToText(
  text: string,
  lineIndex: number,
  path: Path,
  newValue: string,
  kind: EditKind = 'text',
  fallback?: StyleHints,
): string {
  const lines = splitLines(text);
  const line = lines[lineIndex];
  if (!line) throw new EditError('invalidJson', `No line ${lineIndex + 1}`);
  line.text = applyMessageEdit(line.text, path, newValue, kind, fallback);
  return lines.map((l) => l.text + l.eol).join('');
}

/**
 * Format detection and conversion of one parsed JSONL line into a conversation view.
 * Everything here is plain data (JSON-serializable) so it can be posted to the webview.
 */
import { parseSpan, type Path } from './jsonSpan';
import { detectStyle, resolveStyle, serializeNode } from './style';

export type FormatId =
  | 'openai-chat'
  | 'sharegpt'
  | 'alpaca'
  | 'batch-request'
  | 'batch-response'
  | 'unknown'
  | 'invalid';

export type RoleClass = 'system' | 'user' | 'assistant' | 'tool' | 'other';

export type ProblemKind =
  | 'invalidJson'
  | 'unknownShape'
  | 'orphanToolResult'
  | 'unansweredToolCall'
  | 'badArguments'
  | 'batchError';

export interface Problem {
  kind: ProblemKind;
  /** Values substituted into the localized sentence for this kind. */
  args: Array<string | number>;
}

export interface PartView {
  kind: 'text' | 'other';
  text: string;
  /** Path of the editable string inside the line, or null when the part is read-only. */
  path: Path | null;
}

export interface ToolCallView {
  id: string | null;
  name: string;
  /** 1..6, shared with the tool result that answers this call; 0 = not paired. */
  color: number;
  argumentsRaw: string | null;
  /** Pretty-printed arguments when they parse as JSON, otherwise null. */
  argumentsPretty: string | null;
  argumentsOk: boolean;
  /** Path of the `arguments` string inside the line (editable when argumentsOk). */
  path: Path | null;
  answered: boolean;
}

export interface MessageView {
  index: number;
  role: RoleClass;
  /** The role string as written in the data, shown only when it differs from `role`. */
  rawRole: string;
  parts: PartView[];
  toolCalls: ToolCallView[];
  toolCallId: string | null;
  /** Color of the paired tool call (tool results), 0 when unpaired. */
  color: number;
  name: string | null;
  weight: number | null;
}

export interface LineMeta {
  customId: string | null;
  url: string | null;
  statusCode: number | null;
  model: string | null;
}

export interface LineView {
  format: FormatId;
  messages: MessageView[];
  tools: string[];
  meta: LineMeta;
  problems: Problem[];
  /** Pretty JSON for unknown shapes, raw text for invalid lines. */
  raw: string | null;
  /** 1-based column of a syntax error (invalid lines only). */
  column: number | null;
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Decide which chat format a parsed JSON value is. */
export function detectFormat(v: unknown): Exclude<FormatId, 'invalid'> {
  if (!isObj(v)) return 'unknown';
  if ('custom_id' in v) {
    if ('response' in v || 'error' in v) return 'batch-response';
    if (isObj(v.body) && ('method' in v || 'url' in v)) return 'batch-request';
  }
  if (Array.isArray(v.messages)) return 'openai-chat';
  if (Array.isArray(v.conversations)) return 'sharegpt';
  if (typeof v.instruction === 'string' && typeof v.output === 'string') return 'alpaca';
  return 'unknown';
}

const ROLE_MAP: Record<string, RoleClass> = {
  system: 'system',
  developer: 'system',
  user: 'user',
  human: 'user',
  assistant: 'assistant',
  gpt: 'assistant',
  tool: 'tool',
  function: 'tool',
  observation: 'tool',
  function_call: 'assistant',
};

function roleOf(raw: unknown): { role: RoleClass; rawRole: string } {
  const rawRole = typeof raw === 'string' ? raw : '';
  return { role: ROLE_MAP[rawRole] ?? 'other', rawRole };
}

function emptyMeta(): LineMeta {
  return { customId: null, url: null, statusCode: null, model: null };
}

function prettyArguments(raw: string): string | null {
  const parsed = parseSpan(raw);
  if (!parsed.ok) return null;
  return serializeNode(parsed.root, { ...resolveStyle(detectStyle(raw, parsed.root)), keySep: ': ' }, 2);
}

/** Convert an OpenAI-style message object (content, tool_calls, tool_call_id, ...). */
function openaiMessage(m: Obj, index: number, base: Path): MessageView {
  const { role, rawRole } = roleOf(m.role);
  const parts: PartView[] = [];
  const content = m.content;
  if (typeof content === 'string') {
    parts.push({ kind: 'text', text: content, path: [...base, 'content'] });
  } else if (Array.isArray(content)) {
    content.forEach((p, i) => {
      if (isObj(p) && typeof p.text === 'string' && (p.type === undefined || p.type === 'text' || p.type === 'input_text' || p.type === 'output_text')) {
        parts.push({ kind: 'text', text: p.text, path: [...base, 'content', i, 'text'] });
      } else {
        parts.push({ kind: 'other', text: JSON.stringify(p), path: null });
      }
    });
  } else if (content !== null && content !== undefined) {
    parts.push({ kind: 'other', text: JSON.stringify(content), path: null });
  }
  if (typeof m.refusal === 'string' && m.refusal !== '') {
    parts.push({ kind: 'text', text: m.refusal, path: [...base, 'refusal'] });
  }

  const toolCalls: ToolCallView[] = [];
  if (Array.isArray(m.tool_calls)) {
    m.tool_calls.forEach((tc, i) => {
      const fn = isObj(tc) && isObj(tc.function) ? tc.function : null;
      const args = fn && typeof fn.arguments === 'string' ? fn.arguments : null;
      const pretty = args === null ? null : prettyArguments(args);
      toolCalls.push({
        id: isObj(tc) && typeof tc.id === 'string' ? tc.id : null,
        name: fn && typeof fn.name === 'string' ? fn.name : '',
        color: 0,
        argumentsRaw: args,
        argumentsPretty: pretty,
        argumentsOk: pretty !== null,
        path: args === null ? null : [...base, 'tool_calls', i, 'function', 'arguments'],
        answered: false,
      });
    });
  } else if (isObj(m.function_call)) {
    // Legacy single function call.
    const fc = m.function_call;
    const args = typeof fc.arguments === 'string' ? fc.arguments : null;
    const pretty = args === null ? null : prettyArguments(args);
    toolCalls.push({
      id: null,
      name: typeof fc.name === 'string' ? fc.name : '',
      color: 0,
      argumentsRaw: args,
      argumentsPretty: pretty,
      argumentsOk: pretty !== null,
      path: args === null ? null : [...base, 'function_call', 'arguments'],
      answered: false,
    });
  }

  return {
    index,
    role,
    rawRole,
    parts,
    toolCalls,
    toolCallId: typeof m.tool_call_id === 'string' ? m.tool_call_id : null,
    color: 0,
    name: typeof m.name === 'string' ? m.name : null,
    weight: typeof m.weight === 'number' ? m.weight : null,
  };
}

function toolNamesOf(tools: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(tools)) return out;
  for (const t of tools) {
    if (isObj(t) && isObj(t.function) && typeof t.function.name === 'string') out.push(t.function.name);
    else if (isObj(t) && typeof t.name === 'string') out.push(t.name);
  }
  return out;
}

/** Match tool calls with tool results by id, assign shared colors, collect data problems. */
function pairToolCalls(messages: MessageView[], problems: Problem[]): void {
  const calls = new Map<string, ToolCallView>();
  let ordinal = 0;
  for (const m of messages) {
    for (const tc of m.toolCalls) {
      if (tc.id !== null && !calls.has(tc.id)) {
        tc.color = (ordinal % 6) + 1;
        ordinal++;
        calls.set(tc.id, tc);
      }
      if (tc.argumentsRaw !== null && !tc.argumentsOk) {
        problems.push({ kind: 'badArguments', args: [tc.name || (tc.id ?? '')] });
      }
    }
  }
  for (const m of messages) {
    if (m.role !== 'tool' || m.toolCallId === null) continue;
    const call = calls.get(m.toolCallId);
    if (call) {
      m.color = call.color;
      call.answered = true;
    } else {
      problems.push({ kind: 'orphanToolResult', args: [m.toolCallId] });
    }
  }
  for (const call of calls.values()) {
    if (!call.answered) problems.push({ kind: 'unansweredToolCall', args: [call.id ?? ''] });
  }
}

function messagesFrom(arr: unknown[], base: Path): MessageView[] | null {
  const out: MessageView[] = [];
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    if (!isObj(m)) return null;
    out.push(openaiMessage(m, i, [...base, i]));
  }
  return out;
}

function sharegptMessages(arr: unknown[]): MessageView[] | null {
  const out: MessageView[] = [];
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    if (!isObj(m) || typeof m.value !== 'string') return null;
    const { role, rawRole } = roleOf(m.from);
    out.push({
      index: i,
      role,
      rawRole,
      parts: [{ kind: 'text', text: m.value, path: ['conversations', i, 'value'] }],
      toolCalls: [],
      toolCallId: null,
      color: 0,
      name: null,
      weight: typeof m.weight === 'number' ? m.weight : null,
    });
  }
  return out;
}

function simpleMessage(index: number, role: RoleClass, rawRole: string, text: string, path: Path): MessageView {
  return {
    index,
    role,
    rawRole,
    parts: [{ kind: 'text', text, path }],
    toolCalls: [],
    toolCallId: null,
    color: 0,
    name: null,
    weight: null,
  };
}

function unknownView(v: unknown, tools: string[] = []): LineView {
  return {
    format: 'unknown',
    messages: [],
    tools,
    meta: emptyMeta(),
    problems: [{ kind: 'unknownShape', args: [] }],
    raw: JSON.stringify(v, null, 2),
    column: null,
  };
}

/** Build the view of an already parsed JSON value (the line parsed fine). */
export function toConversation(v: unknown): LineView {
  const format = detectFormat(v);
  if (format === 'unknown' || !isObj(v)) return unknownView(v);
  const problems: Problem[] = [];
  const meta = emptyMeta();
  let messages: MessageView[] | null = null;
  let tools: string[] = [];

  if (format === 'openai-chat') {
    messages = messagesFrom(v.messages as unknown[], ['messages']);
    tools = toolNamesOf(v.tools);
  } else if (format === 'sharegpt') {
    messages = sharegptMessages(v.conversations as unknown[]);
    tools = typeof v.tools === 'string' ? [] : toolNamesOf(v.tools);
  } else if (format === 'alpaca') {
    const list: MessageView[] = [];
    list.push(simpleMessage(0, 'user', 'instruction', v.instruction as string, ['instruction']));
    if (typeof v.input === 'string' && v.input !== '') list.push(simpleMessage(list.length, 'user', 'input', v.input, ['input']));
    list.push(simpleMessage(list.length, 'assistant', 'output', v.output as string, ['output']));
    messages = list;
  } else if (format === 'batch-request') {
    const body = v.body as Obj;
    meta.customId = typeof v.custom_id === 'string' ? v.custom_id : null;
    meta.url = typeof v.url === 'string' ? v.url : null;
    meta.model = typeof body.model === 'string' ? body.model : null;
    if (Array.isArray(body.messages)) messages = messagesFrom(body.messages, ['body', 'messages']);
    tools = toolNamesOf(body.tools);
  } else {
    // batch-response
    meta.customId = typeof v.custom_id === 'string' ? v.custom_id : null;
    const resp = isObj(v.response) ? v.response : null;
    meta.statusCode = resp && typeof resp.status_code === 'number' ? resp.status_code : null;
    const body = resp && isObj(resp.body) ? resp.body : null;
    meta.model = body && typeof body.model === 'string' ? body.model : null;
    const list: MessageView[] = [];
    if (body && Array.isArray(body.choices)) {
      body.choices.forEach((c, i) => {
        if (isObj(c) && isObj(c.message)) {
          list.push(openaiMessage(c.message, list.length, ['response', 'body', 'choices', i, 'message']));
        }
      });
    }
    messages = list;
    const errored = (v.error !== null && v.error !== undefined) || (meta.statusCode !== null && meta.statusCode >= 400);
    if (errored) problems.push({ kind: 'batchError', args: [meta.statusCode ?? '-'] });
  }

  if (messages === null) return unknownView(v);
  pairToolCalls(messages, problems);
  return { format, messages, tools, meta, problems, raw: null, column: null };
}

/** Build the view of one raw JSONL line. Blank lines return null. */
export function buildLineView(text: string, lineNumber: number): LineView | null {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (body.trim() === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    const r = parseSpan(body);
    const column = r.ok ? 1 : r.pos + 1;
    return {
      format: 'invalid',
      messages: [],
      tools: [],
      meta: emptyMeta(),
      problems: [{ kind: 'invalidJson', args: [lineNumber + 1, column] }],
      raw: body,
      column,
    };
  }
  return toConversation(value);
}

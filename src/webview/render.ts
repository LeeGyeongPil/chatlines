/** Cards, message bubbles and tool-call blocks. */
import type { LineView, MessageView, PartView, ToolCallView } from '../core/formats';
import type { PageLine } from '../shared/protocol';
import { el } from './dom';
import { createEditor, type EditorHandle } from './editor';

export type Tr = (key: string, ...args: Array<string | number>) => string;

export interface CardContext {
  tr: Tr;
  /** Like tr, but the substituted values (ids, names from the file) are wrapped in `.data` spans. */
  trNodes(key: string, ...args: Array<string | number>): Node[];
  /** Send an edit for this line. */
  edit(pl: PageLine, path: ReadonlyArray<string | number>, newText: string, kind: 'text' | 'arguments'): void;
  openAsText(line: number): void;
  registerEditor(line: number, handle: EditorHandle, close: () => void): void;
}

export const TEXT_LIMIT = 4000;

function badge(text: string, extra = ''): HTMLElement {
  return el('span', `badge ${extra}`.trim(), text);
}

function editButton(ctx: CardContext): HTMLButtonElement {
  return el('button', 'btn edit-btn', ctx.tr('label.edit'), { type: 'button', 'aria-label': ctx.tr('label.edit') });
}

/** Wire an edit button so that clicking it swaps `target` for an edit box. */
function attachEditor(
  ctx: CardContext,
  pl: PageLine,
  button: HTMLButtonElement,
  target: HTMLElement,
  initial: () => string,
  path: ReadonlyArray<string | number>,
  kind: 'text' | 'arguments',
): void {
  button.addEventListener('click', () => {
    if (target.hidden) return;
    const close = (): void => {
      handle.root.remove();
      target.hidden = false;
      button.disabled = false;
    };
    const handle = createEditor({
      initial: initial(),
      kind,
      tr: ctx.tr,
      onSave: (text) => ctx.edit(pl, path, text, kind),
      onCancel: close,
    });
    target.hidden = true;
    button.disabled = true;
    target.after(handle.root);
    ctx.registerEditor(pl.line, handle, close);
    handle.root.querySelector('textarea')?.focus();
  });
}

function renderPart(ctx: CardContext, pl: PageLine, part: PartView, head: HTMLElement): HTMLElement {
  const body = el('div', 'part data');
  const full = part.text;
  const truncated = full.length > TEXT_LIMIT;
  body.textContent = truncated ? full.slice(0, TEXT_LIMIT) : full;
  const wrap = el('div', 'part-wrap');
  wrap.append(body);

  if (part.path) {
    const btn = editButton(ctx);
    head.append(btn);
    attachEditor(ctx, pl, btn, body, () => full, part.path, 'text');
    if (truncated) {
      btn.disabled = true;
      const note = el('div', 'truncated');
      note.append(el('span', undefined, ctx.tr('msg.truncated', TEXT_LIMIT)));
      const more = el('button', 'btn link', ctx.tr('label.showAll'), { type: 'button' });
      more.addEventListener('click', () => {
        body.textContent = full;
        note.remove();
        btn.disabled = false;
      });
      note.append(more);
      wrap.append(note);
    }
  } else if (truncated) {
    const note = el('div', 'truncated');
    note.append(el('span', undefined, ctx.tr('msg.truncated', TEXT_LIMIT)));
    const more = el('button', 'btn link', ctx.tr('label.showAll'), { type: 'button' });
    more.addEventListener('click', () => {
      body.textContent = full;
      note.remove();
    });
    note.append(more);
    wrap.append(note);
  }
  if (!part.path) wrap.classList.add('readonly');
  return wrap;
}

function renderToolCall(ctx: CardContext, pl: PageLine, tc: ToolCallView): HTMLElement {
  const box = el('div', `toolcall color-${tc.color}`);
  if (tc.id !== null) box.setAttribute('data-call-id', tc.id);
  const head = el('div', 'tc-head');
  head.append(el('span', 'tc-label', ctx.tr('label.toolCall')), el('span', 'tc-name data', tc.name));
  if (tc.id !== null) head.append(el('span', 'tc-id data', tc.id));
  box.append(head);
  const args = el('pre', 'args data', tc.argumentsPretty ?? tc.argumentsRaw ?? '');
  const argsHead = el('div', 'args-head');
  argsHead.append(el('span', 'args-label', ctx.tr('label.arguments')));
  if (tc.argumentsOk && tc.path) {
    const btn = editButton(ctx);
    argsHead.append(btn);
    attachEditor(ctx, pl, btn, args, () => tc.argumentsPretty ?? '', tc.path, 'arguments');
  }
  box.append(argsHead, args);
  return box;
}

function renderMessage(ctx: CardContext, pl: PageLine, m: MessageView): HTMLElement {
  const box = el('section', `msg role-${m.role}${m.color ? ` paired color-${m.color}` : ''}`, undefined, { 'data-index': String(m.index) });
  if (m.role === 'tool' && m.toolCallId !== null) box.setAttribute('data-call-id', m.toolCallId);
  const head = el('div', 'msg-head');
  head.append(el('span', 'role', m.role === 'tool' ? ctx.tr('label.role.tool') : ctx.tr(`label.role.${m.role}`)));
  if (m.rawRole !== '' && m.rawRole !== m.role) head.append(el('span', 'raw-role data', m.rawRole));
  if (m.role === 'tool') head.append(el('span', 'tc-label', ctx.tr('label.toolResult')));
  if (m.toolCallId !== null) head.append(el('span', 'tc-id data', m.toolCallId));
  if (m.name !== null) head.append(el('span', 'raw-role data', m.name));
  if (m.weight !== null) head.append(badge(ctx.tr('label.weight', m.weight)));
  box.append(head);
  for (const part of m.parts) box.append(renderPart(ctx, pl, part, head));
  for (const tc of m.toolCalls) box.append(renderToolCall(ctx, pl, tc));
  return box;
}

function renderMeta(v: LineView, head: HTMLElement): void {
  if (v.meta.customId !== null) head.append(el('span', 'badge data', v.meta.customId));
  if (v.meta.statusCode !== null) head.append(el('span', 'badge data', String(v.meta.statusCode)));
  if (v.meta.model !== null) head.append(el('span', 'badge data', v.meta.model));
}

export function renderCard(ctx: CardContext, pl: PageLine): HTMLElement {
  const v = pl.view;
  const card = el('article', 'card', undefined, {
    'data-line': String(pl.line),
    'data-format': v.format,
    'data-hash': pl.lineHash,
  });
  const head = el('header', 'card-head');
  head.append(el('span', 'line-no', ctx.tr('label.line', pl.line + 1)), badge(ctx.tr(`label.format.${v.format}`), 'format'));
  if (v.messages.length > 0) head.append(badge(ctx.tr('label.messageCount', v.messages.length)));
  renderMeta(v, head);
  const open = el('button', 'btn link open-text', ctx.tr('label.openAsText'), { type: 'button' });
  open.addEventListener('click', () => ctx.openAsText(pl.line));
  head.append(open);
  card.append(head);

  for (const p of v.problems) {
    const row = el('div', 'problem', undefined, { 'data-problem': '', 'data-kind': p.kind });
    row.append(...ctx.trNodes(`data.${p.kind}`, ...p.args));
    card.append(row);
  }
  if (v.raw !== null) card.append(el('pre', 'raw data', v.raw));
  const msgs = el('div', 'msgs');
  for (const m of v.messages) msgs.append(renderMessage(ctx, pl, m));
  card.append(msgs);
  return card;
}

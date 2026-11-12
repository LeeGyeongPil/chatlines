/** The small edit box that replaces a message text or a tool-call argument block. */
import { el } from './dom';

export interface EditorOptions {
  initial: string;
  /** "arguments" values must be valid JSON before they are sent. */
  kind: 'text' | 'arguments';
  tr: (key: string, ...args: Array<string | number>) => string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

export interface EditorHandle {
  root: HTMLElement;
  showError(message: string): void;
}

export function createEditor(o: EditorOptions): EditorHandle {
  const root = el('div', 'editbox');
  const area = el('textarea', 'edit-area', undefined, { 'aria-label': o.tr('label.edit'), spellcheck: 'false', rows: '4' });
  area.value = o.initial;
  const hint = el('div', 'edit-hint', o.tr('msg.editHint'));
  const error = el('div', 'edit-error', '', { role: 'alert' });
  const save = el('button', 'btn primary save', o.tr('label.save'), { type: 'button' });
  const cancel = el('button', 'btn cancel', o.tr('label.cancel'), { type: 'button' });
  const row = el('div', 'edit-buttons');
  row.append(save, cancel);
  root.append(area, error, hint, row);

  const submit = (): void => {
    if (o.kind === 'arguments') {
      try {
        JSON.parse(area.value);
      } catch {
        // Input problem, not a tool error: tell the user here and send nothing.
        error.textContent = o.tr('msg.argsInvalid');
        return;
      }
    }
    error.textContent = '';
    o.onSave(area.value);
  };
  save.addEventListener('click', submit);
  cancel.addEventListener('click', () => o.onCancel());
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      o.onCancel();
    }
  });
  return { root, showError: (m) => (error.textContent = m) };
}

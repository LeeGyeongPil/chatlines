import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { exampleText } from '../helpers/examples';
import { openChat, openEditor, saveEditor } from '../helpers/harness';

describe('AC-6 data problems are not tool errors', () => {
  it('shows each data problem as a badge and counts four problem lines; no banner, no log', async () => {
    const h = await openChat(exampleText('en', 'mixed-problems'));
    try {
      await h.ready();
      const badges = [...h.document.querySelectorAll('[data-problem]')];
      assert.deepStrictEqual(
        badges.map((b) => b.getAttribute('data-kind')),
        ['invalidJson', 'unknownShape', 'orphanToolResult', 'batchError'],
      );
      assert.ok(badges.every((b) => (b.textContent ?? '').length > 10), 'each badge has a sentence');
      assert.match(badges[0].textContent!, /^Line 2 is not valid JSON/);
      assert.strictEqual(h.fromHost.find((m) => m.type === 'stats').stats.problemLines, 4);
      assert.strictEqual(h.document.querySelectorAll('.tool-error').length, 0);
      assert.strictEqual(h.state.outputLines.length, 0);
    } finally {
      h.cleanup();
    }
  });

  it('the Problems only filter keeps just those lines', async () => {
    const h = await openChat(exampleText('en', 'mixed-problems'));
    try {
      await h.ready();
      const box = h.document.querySelector<HTMLInputElement>('.problems-only')!;
      box.checked = true;
      box.dispatchEvent(new h.window.Event('change'));
      await h.waitFor(() => h.document.querySelectorAll('.card').length === 4);
      assert.deepStrictEqual([...h.document.querySelectorAll('.card')].map((c) => c.getAttribute('data-line')), ['1', '2', '3', '4']);
    } finally {
      h.cleanup();
    }
  });

  for (const mode of ['false', 'throw'] as const) {
    it('a failing applyEdit (' + mode + ') leaves the file alone, shows a banner and writes the log', async () => {
      const text = exampleText('en', 'openai-chat');
      const h = await openChat(text);
      try {
        await h.ready();
        h.state.applyEditMode = mode;
        const area = openEditor(h, '.card[data-line="0"] .msg.role-assistant .edit-btn');
        saveEditor(h, area, 'changed');
        await h.waitFor(() => h.document.querySelectorAll('.tool-error').length === 1);
        assert.strictEqual(h.doc.text, text);
        const banner = h.document.querySelector('.tool-error')!;
        assert.match(banner.textContent!, /could not be applied/);
        assert.strictEqual(banner.querySelector('button')!.textContent, 'Open as Text');
        assert.ok(h.state.outputLines.length >= 1);
        assert.ok(h.state.outputLines.some((l) => l.includes('EDIT_FAILED')));
        assert.strictEqual(h.document.querySelectorAll('[data-problem]').length, 0, 'not shown as a data problem');
      } finally {
        h.cleanup();
      }
    });
  }

  it('broken tool arguments typed into the edit box stay in the box and send nothing', async () => {
    const h = await openChat(exampleText('en', 'openai-tools'));
    try {
      await h.ready();
      const before = h.toHost.length;
      const area = openEditor(h, '.card[data-line="0"] .toolcall .edit-btn');
      assert.strictEqual(area.value, '{\n  "city": "Seoul"\n}');
      saveEditor(h, area, '{"city": ');
      assert.strictEqual(h.document.querySelector('.edit-error')!.textContent, 'The arguments are not valid JSON.');
      await h.settle(50);
      assert.strictEqual(h.toHost.slice(before).filter((m) => m.type === 'edit').length, 0);
      assert.strictEqual(h.state.applyEditCalls.length, 0);
      assert.strictEqual(h.document.querySelectorAll('.tool-error').length, 0);
    } finally {
      h.cleanup();
    }
  });

  it('valid tool arguments change only the arguments string, in its own style', async () => {
    const h = await openChat(exampleText('en', 'openai-tools'));
    try {
      await h.ready();
      const area = openEditor(h, '.card[data-line="0"] .toolcall .edit-btn');
      saveEditor(h, area, '{\n  "city": "Busan",\n  "unit": "C"\n}');
      await h.waitFor(() => h.fromHost.some((m) => m.type === 'linesUpdated'));
      const msg = JSON.parse(h.doc.text.split('\n')[0]);
      assert.strictEqual(msg.messages[2].tool_calls[0].function.arguments, '{"city": "Busan", "unit": "C"}');
    } finally {
      h.cleanup();
    }
  });

  it('an edit the data does not allow is reported in the box, not logged', async () => {
    const h = await openChat(exampleText('en', 'openai-chat'));
    try {
      await h.ready();
      const page = h.fromHost.find((m) => m.type === 'page');
      h.send({ type: 'edit', line: 0, docVersion: page.docVersion, lineHash: page.lines[0].lineHash, path: ['messages', 0, 'role', 'x'], newText: 'x', kind: 'text' });
      await h.waitFor(() => h.fromHost.some((m) => m.type === 'editResult'));
      assert.strictEqual(h.fromHost.find((m) => m.type === 'editResult').reason, 'invalid');
      assert.strictEqual(h.state.outputLines.length, 0);
      assert.strictEqual(h.state.applyEditCalls.length, 0);
    } finally {
      h.cleanup();
    }
  });
});

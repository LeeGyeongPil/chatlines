import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { exampleLines, exampleText } from '../helpers/examples';
import { openChat, openEditor, saveEditor } from '../helpers/harness';

const ASSISTANT_EDIT = '.card[data-line="0"] .msg.role-assistant .edit-btn';

describe('AC-4 extension flow (VS Code API stand-in)', () => {
  it('registers the custom editor and the commands', async () => {
    const h = await openChat(exampleText('en', 'openai-chat'));
    try {
      const reg = h.state.providers[0];
      assert.strictEqual(reg.viewType, 'chatlines.chatView');
      assert.strictEqual(reg.options.supportsMultipleEditorsPerDocument, false);
      assert.strictEqual(reg.options.webviewOptions.retainContextWhenHidden, false);
      assert.ok(h.state.commands.has('chatlines.openAsChat'));
      assert.ok(h.state.commands.has('chatlines.openLineAsText'));
    } finally {
      h.cleanup();
    }
  });

  it('serves HTML with a nonce CSP, no inline handlers and no inline styles', async () => {
    const h = await openChat(exampleText('en', 'openai-chat'));
    try {
      const html = h.panelHtml;
      const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)![1];
      const nonce = /script-src 'nonce-([^']+)'/.exec(csp)![1];
      assert.match(csp, /default-src 'none'/);
      assert.ok(html.includes('<script nonce="' + nonce + '"'));
      assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'inline event attribute');
      assert.doesNotMatch(html, /\sstyle\s*=/i, 'inline style');
      assert.doesNotMatch(html, /https?:\/\//, 'no external resource');
    } finally {
      h.cleanup();
    }
  });

  it('answers ready with init and the first page', async () => {
    const h = await openChat(exampleText('en', 'openai-chat'));
    try {
      await h.ready();
      assert.deepStrictEqual(h.toHost[0], { type: 'ready' });
      const types = h.fromHost.map((m) => m.type);
      assert.ok(types.indexOf('init') < types.indexOf('page'));
      const page = h.fromHost.find((m) => m.type === 'page');
      assert.strictEqual(page.lines.length, 3);
      assert.strictEqual(page.totalPages, 1);
    } finally {
      h.cleanup();
    }
  });

  it('an edit becomes ONE replace of ONE line and only that line is redrawn', async () => {
    const original = exampleText('en', 'openai-chat');
    const h = await openChat(original);
    try {
      await h.ready();
      const area = openEditor(h, ASSISTANT_EDIT);
      saveEditor(h, area, 'Hi there, friend!');
      await h.waitFor(() => h.fromHost.some((m) => m.type === 'linesUpdated'));

      assert.strictEqual(h.state.applyEditCalls.length, 1);
      const ops = h.state.applyEditCalls[0].ops;
      assert.strictEqual(ops.length, 1);
      assert.strictEqual(ops[0].range.start.line, 0);
      assert.strictEqual(ops[0].range.end.line, 0);
      assert.strictEqual(ops[0].range.start.character, 0);

      const updated = h.fromHost.filter((m) => m.type === 'linesUpdated');
      assert.strictEqual(updated.length, 1);
      assert.deepStrictEqual(updated[0].lines.map((l: { line: number }) => l.line), [0]);

      const lines = h.doc.text.split('\n');
      const old = original.split('\n');
      assert.notStrictEqual(lines[0], old[0]);
      assert.deepStrictEqual(lines.slice(1), old.slice(1));
      assert.strictEqual(JSON.parse(lines[0]).messages[2].content, 'Hi there, friend!');
      // the redrawn card shows the new text and the edit box is closed
      assert.strictEqual(h.document.querySelector('.card[data-line="0"] .role-assistant .part')!.textContent, 'Hi there, friend!');
      assert.strictEqual(h.document.querySelector('.editbox'), null);
    } finally {
      h.cleanup();
    }
  });

  it('rejects an edit made on an old version or an old line without calling applyEdit', async () => {
    const h = await openChat(exampleText('en', 'openai-chat'));
    try {
      await h.ready();
      const page = h.fromHost.find((m) => m.type === 'page');
      const pl = page.lines[0];
      const base = { type: 'edit', line: 0, path: ['messages', 2, 'content'], newText: 'x', kind: 'text' };

      h.send({ ...base, docVersion: page.docVersion + 5, lineHash: pl.lineHash });
      await h.waitFor(() => h.fromHost.some((m) => m.type === 'editResult'));
      assert.deepStrictEqual(h.fromHost.find((m) => m.type === 'editResult'), { type: 'editResult', ok: false, line: 0, reason: 'stale' });
      assert.strictEqual(h.state.applyEditCalls.length, 0);
      await h.waitFor(() => h.fromHost.filter((m) => m.type === 'page').length >= 2);

      h.send({ ...base, docVersion: page.docVersion, lineHash: 'deadbeef' });
      await h.waitFor(() => h.fromHost.filter((m) => m.type === 'editResult').length === 2);
      assert.strictEqual(h.state.applyEditCalls.length, 0);
      assert.strictEqual(h.doc.version, 1);
    } finally {
      h.cleanup();
    }
  });

  it('keeps the webview in step when the text changes elsewhere (undo, another editor)', async () => {
    const h = await openChat(exampleText('en', 'openai-chat'));
    try {
      await h.ready();
      const lines = h.doc.text.split('\n');
      lines[1] = lines[1].replace('Summarize', 'Shorten');
      h.doc.text = lines.join('\n');
      h.doc.version++;
      for (const l of h.state.changeListeners) {
        l({ document: h.doc, contentChanges: [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }, text: 'x' }] });
      }
      await h.waitFor(() => h.fromHost.some((m) => m.type === 'linesUpdated'));
      const msg = h.fromHost.find((m) => m.type === 'linesUpdated');
      assert.deepStrictEqual(msg.lines.map((l: { line: number }) => l.line), [1]);
      assert.ok(h.document.querySelector('.card[data-line="1"]')!.textContent!.includes('Shorten'));
    } finally {
      h.cleanup();
    }
  });

  it('openAsChat refuses files larger than 50 MB and explains why', async () => {
    const h = await openChat(exampleText('en', 'openai-chat'));
    try {
      h.state.fileSize = 60 * 1024 * 1024;
      await h.state.commands.get('chatlines.openAsChat')!(h.doc.uri);
      assert.strictEqual(h.state.errorMessages.length, 1);
      assert.match(h.state.errorMessages[0], /larger than 50 MB/);
      assert.ok(h.state.outputLines.some((l) => l.includes('TOO_LARGE')));
    } finally {
      h.cleanup();
    }
  });

  it('"Open as Text" selects the line beside the chat view', async () => {
    const h = await openChat(exampleLines('en', 'openai-chat').join('\n') + '\n');
    try {
      await h.ready();
      h.document.querySelector<HTMLButtonElement>('.card[data-line="1"] .open-text')!.click();
      await h.waitFor(() => h.state.shownDocuments.length === 1);
      assert.strictEqual(h.state.shownDocuments[0].viewColumn, -2);
      assert.strictEqual(h.state.shownDocuments[0].selection!.start.line, 1);
    } finally {
      h.cleanup();
    }
  });
});

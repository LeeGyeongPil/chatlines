import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { exampleText } from '../helpers/examples';
import { openChat } from '../helpers/harness';

const colorOf = (e: Element): string | undefined => [...e.classList].find((c) => /^color-\d$/.test(c));

describe('AC-5 webview rendering, paging and safety', () => {
  it('draws roles, tool calls and paired tool results', async () => {
    const h = await openChat(exampleText('en', 'openai-tools'));
    try {
      await h.ready();
      const d = h.document;
      const count = (s: string) => d.querySelectorAll(s).length;
      assert.strictEqual(count('.card'), 3);
      assert.strictEqual(count('.msg.role-system'), 1);
      assert.strictEqual(count('.msg.role-user'), 3);
      assert.strictEqual(count('.msg.role-assistant'), 5);
      assert.strictEqual(count('.msg.role-tool'), 3);
      assert.strictEqual(count('.toolcall'), 3);

      const call = d.querySelector('.toolcall[data-call-id="call_w1"]')!;
      assert.strictEqual(call.querySelector('.tc-name')!.textContent, 'get_weather');
      assert.strictEqual(call.querySelector('pre.args')!.textContent, '{\n  "city": "Seoul"\n}');
      const result = d.querySelector('.msg.role-tool[data-call-id="call_w1"]')!;
      assert.ok(colorOf(call));
      assert.strictEqual(colorOf(result), colorOf(call), 'the answer has the color of its call');
      const c1 = d.querySelector('.toolcall[data-call-id="call_c1"]')!;
      const c2 = d.querySelector('.toolcall[data-call-id="call_c2"]')!;
      assert.notStrictEqual(colorOf(c1), colorOf(c2));
      assert.strictEqual(d.querySelector('.card[data-line="0"] .badge.format')!.textContent, 'OpenAI chat');
    } finally {
      h.cleanup();
    }
  });

  it('sends at most pageSize lines of a 10,000-line document and pages through it', async () => {
    const line = '{"messages":[{"role":"user","content":"q"},{"role":"assistant","content":"a"}]}';
    const text = Array.from({ length: 10000 }, () => line).join('\n') + '\n';
    const h = await openChat(text);
    try {
      await h.waitFor(() => h.fromHost.some((m) => m.type === 'page'));
      const first = h.fromHost.find((m) => m.type === 'page');
      assert.ok(first.lines.length <= 50);
      assert.strictEqual(first.totalPages, 200);
      assert.strictEqual(h.document.querySelectorAll('.card').length, 50);
      await h.waitFor(() => h.fromHost.some((m) => m.type === 'stats'));
      h.document.querySelector<HTMLButtonElement>('.next')!.click();
      await h.waitFor(() => h.fromHost.filter((m) => m.type === 'page').length === 2);
      const second = h.fromHost.filter((m) => m.type === 'page')[1];
      assert.strictEqual(second.page, 1);
      assert.strictEqual(second.lines[0].line, 50);
      assert.ok(second.lines.length <= 50);
      assert.strictEqual(h.document.querySelector('.page-label')!.textContent, 'Page 2 / 200');
    } finally {
      h.cleanup();
    }
  });

  it('honors chatlines.pageSize within 10..200', async () => {
    const text = Array.from({ length: 300 }, () => '{"messages":[]}').join('\n');
    for (const [setting, expected] of [[20, 20], [5, 10], [999, 200]] as const) {
      const h = await openChat(text, { config: { 'chatlines.pageSize': setting } });
      try {
        await h.waitFor(() => h.fromHost.some((m) => m.type === 'page'));
        assert.strictEqual(h.fromHost.find((m) => m.type === 'page').lines.length, expected);
      } finally {
        h.cleanup();
      }
    }
  });

  it('shows HTML in message text as plain text', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    const line = JSON.stringify({
      messages: [
        { role: 'user', content: evil },
        { role: 'assistant', content: '<script>alert(2)</script>' },
      ],
      tools: [{ type: 'function', function: { name: '<b>t</b>' } }],
    });
    const h = await openChat(line + '\n');
    try {
      await h.ready();
      assert.strictEqual(h.document.querySelectorAll('img').length, 0);
      assert.strictEqual(h.document.querySelectorAll('.card script').length, 0);
      assert.strictEqual(h.document.querySelector('.msg.role-user .part')!.textContent, evil);
      assert.strictEqual(h.document.querySelectorAll('[onerror]').length, 0);
    } finally {
      h.cleanup();
    }
  });

  it('shortens very long text and expands it on request', async () => {
    const long = 'x'.repeat(10000);
    const h = await openChat(JSON.stringify({ messages: [{ role: 'user', content: long }] }) + '\n');
    try {
      await h.ready();
      const partLength = () => h.document.querySelector('.part')!.textContent!.length;
      assert.strictEqual(partLength(), 4000);
      assert.ok(h.document.querySelector<HTMLButtonElement>('.edit-btn')!.disabled, 'no edit before expanding');
      h.document.querySelector<HTMLButtonElement>('.truncated .btn')!.click();
      assert.strictEqual(partLength(), 10000);
      assert.ok(!h.document.querySelector<HTMLButtonElement>('.edit-btn')!.disabled);
    } finally {
      h.cleanup();
    }
  });

  it('filters by role, searches text and shows the statistics panel', async () => {
    const h = await openChat(exampleText('en', 'openai-tools'));
    try {
      await h.ready();
      const role = h.document.querySelector<HTMLSelectElement>('.role-select')!;
      role.value = 'tool';
      role.dispatchEvent(new h.window.Event('change'));
      await h.waitFor(() => h.document.querySelector('.match-label')!.textContent === '2 matching lines');
      assert.strictEqual(h.document.querySelectorAll('.card').length, 2);

      const q = h.document.querySelector<HTMLInputElement>('.search')!;
      q.value = 'kilometers';
      q.dispatchEvent(new h.window.Event('change'));
      await h.waitFor(() => h.document.querySelector('.match-label')!.textContent === '1 matching lines');

      h.document.querySelector<HTMLButtonElement>('.stats-btn')!.click();
      assert.ok(!h.document.querySelector<HTMLElement>('.stats-panel')!.hidden);
      assert.match(h.document.querySelector('.stat-list')!.textContent!, /Tool calls3/);
    } finally {
      h.cleanup();
    }
  });
});

import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { JSDOM } from 'jsdom';
import { ROOT } from '../helpers/examples';

/** Run the browser preview (host stand-in + real webview bundle) in jsdom. */
async function openPreview(query: string, storage?: Record<string, string>) {
  const html = fs.readFileSync(path.join(ROOT, 'preview', 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/index.html' + query, runScripts: 'outside-only', pretendToBeVisual: true });
  for (const [k, v] of Object.entries(storage ?? {})) dom.window.localStorage.setItem(k, v);
  dom.window.eval(fs.readFileSync(path.join(ROOT, 'preview', 'out', 'preview.js'), 'utf8'));
  dom.window.eval(fs.readFileSync(path.join(ROOT, 'media', 'webview.js'), 'utf8'));
  const t0 = Date.now();
  while (dom.window.document.querySelectorAll('.card').length === 0) {
    if (Date.now() - t0 > 3000) throw new Error('preview did not render');
    await new Promise((r) => setTimeout(r, 5));
  }
  return dom;
}

describe('preview harness', () => {
  it('shows the English example by default and the Korean one with ?lang=ko', async () => {
    const en = await openPreview('?fixture=openai-tools&lang=en');
    assert.match(en.window.document.querySelector('.msg.role-user .part')!.textContent!, /weather in Seoul/);
    assert.strictEqual(en.window.document.querySelector('.problems-only')!.nextElementSibling!.textContent, 'Problems only');
    en.window.close();

    const ko = await openPreview('?fixture=openai-tools&lang=ko');
    assert.match(ko.window.document.querySelector('.msg.role-user .part')!.textContent!, /서울 날씨/);
    assert.strictEqual(ko.window.document.querySelector('.problems-only')!.nextElementSibling!.textContent, '문제 줄만 보기');
    ko.window.close();
  });

  it('opens the problems view and statistics from the address', async () => {
    const dom = await openPreview('?fixture=mixed-problems&problems=1&stats=1&lang=en');
    const t0 = Date.now();
    while (dom.window.document.querySelectorAll('.card').length !== 4 && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 5));
    assert.strictEqual(dom.window.document.querySelectorAll('.card').length, 4);
    while (!dom.window.document.querySelector('.stat-list') && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 5));
    assert.match(dom.window.document.querySelector('.stat-list')!.textContent!, /Problem lines4/);
    dom.window.close();
  });

  it('remembers the language chosen in the menu', async () => {
    const dom = await openPreview('?fixture=openai-chat');
    const select = dom.window.document.querySelector<HTMLSelectElement>('.lang-select')!;
    select.value = 'ko';
    select.dispatchEvent(new dom.window.Event('change'));
    const t0 = Date.now();
    while (dom.window.document.querySelector('.line-no')?.textContent !== '1번 줄' && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 5));
    assert.strictEqual(dom.window.localStorage.getItem('chatlines.lang'), 'ko');
    assert.match(dom.window.document.querySelector('.msg .part')!.textContent!, /[가-힣]/, 'the example text is Korean too');
    dom.window.close();
    const again = await openPreview('?fixture=openai-chat', { 'chatlines.lang': 'ko' });
    assert.strictEqual(again.window.document.querySelector('.line-no')!.textContent, '1번 줄');
    again.window.close();
  });

  it('applies an edit in memory', async () => {
    const dom = await openPreview('?fixture=openai-chat&lang=en');
    const d = dom.window.document;
    d.querySelector<HTMLButtonElement>('.card[data-line="0"] .role-assistant .edit-btn')!.click();
    d.querySelector<HTMLTextAreaElement>('.editbox textarea')!.value = 'Edited in the preview';
    d.querySelector<HTMLButtonElement>('.editbox .save')!.click();
    const t0 = Date.now();
    while (d.querySelector('.card[data-line="0"] .role-assistant .part')?.textContent !== 'Edited in the preview' && Date.now() - t0 < 3000) {
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.strictEqual(d.querySelector('.card[data-line="0"] .role-assistant .part')!.textContent, 'Edited in the preview');
    dom.window.close();
  });
});

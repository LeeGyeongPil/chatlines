import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { en } from '../../src/i18n/en';
import { ko } from '../../src/i18n/ko';
import { format, langFromEnvironment, t } from '../../src/i18n';
import { resolveLanguage } from '../../src/host/lang';
import { exampleText, ROOT } from '../helpers/examples';
import { openChat, type Harness } from '../helpers/harness';

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort();
const ALLOWED = new Set(['JSON', 'JSONL', 'ID', 'OpenAI', 'ShareGPT', 'Alpaca', 'Batch', 'Ctrl', 'Enter', 'Esc', 'English']);

/** Latin words (3+ letters... any length) in `text`, minus the allowed list. */
function strayLatin(text: string): string[] {
  return (text.match(/[A-Za-z]+/g) ?? []).filter((w) => !ALLOWED.has(w));
}

/** Every user-visible string of the page that is NOT data from the file. */
function uiTexts(doc: Document): string[] {
  const out: string[] = [];
  const walk = (node: Element): void => {
    if (node.classList.contains('data') || node.hasAttribute('data-autonym')) return;
    for (const a of ['title', 'placeholder', 'aria-label']) {
      const v = node.getAttribute(a);
      if (v) out.push(v);
    }
    for (const child of node.childNodes) {
      if (child.nodeType === 3 && child.textContent?.trim()) out.push(child.textContent.trim());
      else if (child.nodeType === 1) walk(child as Element);
    }
  };
  walk(doc.body);
  return out;
}

describe('AC-7 language choice and full localization', () => {
  describe('(a) resolving the language', () => {
    it('follows the setting, and auto follows the display language', () => {
      assert.strictEqual(resolveLanguage('en', 'ko'), 'en');
      assert.strictEqual(resolveLanguage('ko', 'en'), 'ko');
      assert.strictEqual(resolveLanguage('auto', 'ko'), 'ko');
      assert.strictEqual(resolveLanguage('auto', 'ko-KR'), 'ko');
      assert.strictEqual(resolveLanguage('auto', 'fr'), 'en');
      assert.strictEqual(resolveLanguage('auto', 'en-US'), 'en');
      assert.strictEqual(resolveLanguage(undefined, undefined), 'en');
    });
    it('command line tools: --lang beats the environment variable beats the locale', () => {
      assert.strictEqual(langFromEnvironment('en', { CHATLINES_LANG: 'ko', LANG: 'ko_KR.UTF-8' }), 'en');
      assert.strictEqual(langFromEnvironment(undefined, { CHATLINES_LANG: 'ko', LANG: 'en_US.UTF-8' }), 'ko');
      assert.strictEqual(langFromEnvironment(undefined, { LC_ALL: 'ko_KR.UTF-8', LANG: 'en_US.UTF-8' }), 'ko');
      assert.strictEqual(langFromEnvironment(undefined, { LANG: 'fr_FR.UTF-8' }), 'en');
      assert.strictEqual(langFromEnvironment(undefined, {}), 'en');
    });
  });

  describe('(b) message tables', () => {
    it('English and Korean have the same keys and placeholders', () => {
      assert.deepStrictEqual(Object.keys(ko).sort(), Object.keys(en).sort());
      for (const k of Object.keys(en) as Array<keyof typeof en>) {
        assert.deepStrictEqual(placeholders(ko[k]), placeholders(en[k]), `placeholders of ${k}`);
        assert.notStrictEqual(ko[k].trim(), '', k);
      }
    });
    it('package.nls files have the same keys', () => {
      const a = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.nls.json'), 'utf8'));
      const b = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.nls.ko.json'), 'utf8'));
      assert.deepStrictEqual(Object.keys(b).sort(), Object.keys(a).sort());
    });
    it('every %key% in package.json exists in the nls files', () => {
      const pkg = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
      const nls = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.nls.json'), 'utf8'));
      for (const m of pkg.matchAll(/"%([^%"]+)%"/g)) assert.ok(m[1] in nls, m[1]);
    });
    it('format fills placeholders and leaves unknown ones alone', () => {
      assert.strictEqual(format('{0} of {1} {2}', ['a', 2]), 'a of 2 {2}');
      assert.strictEqual(t('en', 'label.page', 2, 5), 'Page 2 / 5');
      assert.strictEqual(t('ko', 'label.page', 2, 5), '2 / 5쪽');
    });
  });

  describe('(c) Korean sentences use one polite ending', () => {
    it('msg.*, data.* and error.* sentences end with 니다. or 니까?', () => {
      for (const [k, v] of Object.entries(ko)) {
        if (/^(msg|data|error)\./.test(k)) assert.match(v, /(니다\.|니까\?)$/, `${k}: ${v}`);
      }
    });
    it('no casual endings anywhere in the Korean table', () => {
      for (const [k, v] of Object.entries(ko)) {
        for (const bad of [/(해요|에요|예요|세요|어요|아요)[.?!]?$/, /(한다|된다|있다|없다)\.$/]) {
          assert.doesNotMatch(v, bad, `${k}: ${v}`);
        }
      }
    });
  });

  describe('(d) rendered screens contain only one language', () => {
    let h: Harness | undefined;
    for (const lang of ['en', 'ko'] as const) {
      it(`${lang}: nothing outside the data area is in the other language`, async () => {
        const text = exampleText(lang, 'openai-tools') + exampleText(lang, 'mixed-problems');
        h = await openChat(text, { config: { 'chatlines.language': lang } });
        try {
          await h.ready();
          h.document.querySelector<HTMLButtonElement>('.stats-btn')!.click();
          await h.settle();
          const texts = uiTexts(h.document);
          assert.ok(texts.length > 20, 'the page has text to check');
          for (const s of texts) {
            if (lang === 'ko') assert.deepStrictEqual(strayLatin(s), [], `Latin words in "${s}"`);
            else assert.doesNotMatch(s, /[ㄱ-ㆎ가-힣]/, `Hangul in "${s}"`);
          }
          assert.strictEqual(h.document.documentElement.lang, lang);
        } finally {
          h.cleanup();
        }
      });
    }
  });

  describe('(e) switching the language from the toolbar', () => {
    it('setLanguage saves a global setting and the screen changes', async () => {
      const h = await openChat(exampleText('en', 'openai-chat'));
      try {
        await h.ready();
        const select = h.document.querySelector<HTMLSelectElement>('.lang-select')!;
        assert.strictEqual(select.value, 'en');
        assert.strictEqual(h.document.querySelector('.problems-only')!.nextElementSibling!.textContent, 'Problems only');
        select.value = 'ko';
        select.dispatchEvent(new h.window.Event('change'));
        await h.waitFor(() => h.fromHost.some((m) => m.type === 'strings'));
        assert.deepStrictEqual(h.state.configUpdates, [{ key: 'language', value: 'ko', target: 1 }]);
        assert.strictEqual(h.document.querySelector('.problems-only')!.nextElementSibling!.textContent, '문제 줄만 보기');
        assert.strictEqual(h.document.querySelector('.line-no')!.textContent, '1번 줄');
        assert.strictEqual(h.document.documentElement.lang, 'ko');
        assert.strictEqual(h.document.querySelector<HTMLSelectElement>('.lang-select')!.value, 'ko');
      } finally {
        h.cleanup();
      }
    });

    it('a change of the VS Code setting updates open views too', async () => {
      const h = await openChat(exampleText('en', 'openai-chat'));
      try {
        await h.ready();
        await (h.state as unknown as { config: Record<string, unknown> }).config;
        h.state.config['chatlines.language'] = 'ko';
        for (const l of h.state.configListeners) l({ affectsConfiguration: (s: string) => s === 'chatlines.language' });
        await h.waitFor(() => h.document.querySelector('.line-no')?.textContent === '1번 줄');
      } finally {
        h.cleanup();
      }
    });

    it('auto follows the VS Code display language', async () => {
      const h = await openChat(exampleText('ko', 'openai-chat'), { language: 'ko-KR' });
      try {
        await h.ready();
        assert.strictEqual(h.document.querySelector('.line-no')!.textContent, '1번 줄');
      } finally {
        h.cleanup();
      }
    });
  });
});

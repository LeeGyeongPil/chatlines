import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { en } from '../../src/i18n/en';
import { ko } from '../../src/i18n/ko';
import { openChat, type Harness } from '../helpers/harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 100 lines. Every 4th line (0, 4, 8, ...) says "match", the others "other". */
function sampleText(extra: Record<number, string> = {}): string {
  const rows = Array.from({ length: 100 }, (_, i) =>
    JSON.stringify({ messages: [{ role: 'user', content: i % 4 === 0 ? `match ${i}` : `other ${i}` }] }),
  );
  for (const [i, v] of Object.entries(extra)) rows[Number(i)] = v;
  return rows.join('\n') + '\n';
}

const SMALL_PAGES = { 'chatlines.pageSize': 10 };

const pages = (h: Harness): any[] => h.fromHost.filter((m) => m.type === 'page');
const notices = (h: Harness): any[] => h.fromHost.filter((m) => m.type === 'toolError');

/** Ask the host for a line and wait for the next page message (or notice). */
async function goTo(h: Harness, line: number, filter: Record<string, unknown> = {}): Promise<void> {
  const before = pages(h).length + notices(h).length;
  h.send({ type: 'requestLine', line, filter });
  await h.waitFor(() => pages(h).length + notices(h).length > before);
}

describe('go to line: host side (session)', () => {
  it('computes the page without a filter, at the boundaries', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      for (const [line, page] of [[0, 0], [9, 0], [10, 1], [99, 9]] as const) {
        await goTo(h, line);
        const msg = pages(h).at(-1);
        assert.strictEqual(msg.page, page, `line ${line}`);
        assert.strictEqual(msg.focusLine, line);
        assert.ok(msg.lines.some((l: { line: number }) => l.line === line));
      }
    } finally {
      h.cleanup();
    }
  });

  it('uses the configured page size', async () => {
    const h = await openChat(sampleText(), { config: { 'chatlines.pageSize': 20 } });
    try {
      await h.ready();
      await goTo(h, 45);
      assert.strictEqual(pages(h).at(-1).page, 2);
    } finally {
      h.cleanup();
    }
  });

  it('counts the position among matching lines when a filter is on', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      // 25 matching lines (0, 4, ..., 96): line 40 is the 11th match, so it is on page 1.
      await goTo(h, 40, { query: 'match' });
      const msg = pages(h).at(-1);
      assert.strictEqual(msg.page, 1);
      assert.strictEqual(msg.focusLine, 40);
      assert.strictEqual(msg.matchCount, 25);
      assert.deepStrictEqual(msg.lines.map((l: { line: number }) => l.line).slice(0, 2), [40, 44]);
      await goTo(h, 96, { query: 'match' });
      assert.strictEqual(pages(h).at(-1).page, 2);
    } finally {
      h.cleanup();
    }
  });

  it('keeps the page and the filter and says so when the filter hides the line', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      await goTo(h, 40, { query: 'match' });
      const pagesBefore = pages(h).length;
      await goTo(h, 41, { query: 'match' });
      assert.strictEqual(pages(h).length, pagesBefore, 'no new page');
      const n = notices(h).at(-1);
      assert.strictEqual(n.messageKey, 'msg.lineNotInFilter');
      assert.deepStrictEqual(n.args, [42]);
      assert.strictEqual(n.line, 41);
      // The filter is still active: a plain page request with it shows the same matches.
      h.send({ type: 'requestPage', page: 1, filter: { query: 'match' } });
      await h.waitFor(() => pages(h).length > pagesBefore);
      assert.strictEqual(pages(h).at(-1).matchCount, 25);
    } finally {
      h.cleanup();
    }
  });

  it('says so and changes nothing for a line past the end', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      const before = pages(h).length;
      await goTo(h, 100);
      assert.strictEqual(pages(h).length, before);
      const n = notices(h).at(-1);
      assert.strictEqual(n.messageKey, 'msg.lineOutOfRange');
      assert.deepStrictEqual(n.args, [101, 100]);
      await goTo(h, -1);
      assert.strictEqual(notices(h).at(-1).messageKey, 'msg.lineOutOfRange');
      await goTo(h, 1.5);
      assert.strictEqual(notices(h).at(-1).messageKey, 'msg.lineOutOfRange');
      assert.strictEqual(pages(h).length, before);
    } finally {
      h.cleanup();
    }
  });

  it('moves a blank target line to the next line that has content', async () => {
    const h = await openChat(sampleText({ 3: '', 4: '' }), { config: SMALL_PAGES });
    try {
      await h.ready();
      await goTo(h, 3);
      const msg = pages(h).at(-1);
      assert.strictEqual(msg.focusLine, 5);
      assert.strictEqual(msg.page, 0);
    } finally {
      h.cleanup();
    }
  });
});

describe('go to line: webview toolbar', () => {
  const press = (h: Harness, value: string): void => {
    const input = h.document.querySelector<HTMLInputElement>('.goto-line')!;
    input.value = value;
    input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter' }));
  };

  it('sends a 0-based requestLine on Enter, then scrolls to and highlights the card', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      let scrolled = 0;
      (h.window as any).Element.prototype.scrollIntoView = () => {
        scrolled++;
      };
      await h.ready();
      press(h, ' 23 ');
      await h.waitFor(() => h.document.querySelector('.card.focused') !== null);
      assert.deepStrictEqual(h.toHost.at(-1), { type: 'requestLine', line: 22, filter: {} });
      const card = h.document.querySelector('.card.focused')!;
      assert.strictEqual(card.getAttribute('data-line'), '22');
      assert.strictEqual(card.querySelector('.line-no')!.textContent, 'Line 23');
      assert.strictEqual(h.document.activeElement, card);
      assert.strictEqual(scrolled, 1);
      assert.strictEqual(h.document.querySelector('.page-label')!.textContent, 'Page 3 / 10');
      assert.strictEqual(h.document.querySelectorAll('.card.focused').length, 1);
    } finally {
      h.cleanup();
    }
  });

  it('sends the active filter along with the line', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      const search = h.document.querySelector<HTMLInputElement>('.search')!;
      search.value = 'match';
      search.dispatchEvent(new h.window.Event('change'));
      await h.waitFor(() => pages(h).at(-1)?.matchCount === 25);
      press(h, '41');
      await h.waitFor(() => h.document.querySelector('.card.focused') !== null);
      assert.deepStrictEqual(h.toHost.at(-1), { type: 'requestLine', line: 40, filter: { query: 'match' } });
      assert.strictEqual(h.document.querySelector('.page-label')!.textContent, 'Page 2 / 3');
    } finally {
      h.cleanup();
    }
  });

  it('shows a notice in English for input that is not a line number, and sends nothing', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      const sent = h.toHost.length;
      for (const bad of ['abc', '0', '', '-3', '1.5']) {
        press(h, bad);
        assert.strictEqual(h.document.querySelector('.tool-error-text')!.textContent, en['msg.lineNotNumber'], bad);
      }
      assert.strictEqual(h.toHost.length, sent);
    } finally {
      h.cleanup();
    }
  });

  it('shows the out-of-range and filtered-out notices from the host in English', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      press(h, '500');
      await h.waitFor(() => h.document.querySelector('.tool-error-text') !== null);
      assert.strictEqual(h.document.querySelector('.tool-error-text')!.textContent, 'Line 500 does not exist. This file has 100 lines.');
      const search = h.document.querySelector<HTMLInputElement>('.search')!;
      search.value = 'match';
      search.dispatchEvent(new h.window.Event('change'));
      await h.waitFor(() => pages(h).at(-1)?.matchCount === 25);
      press(h, '2');
      await h.waitFor(() => /filtered results/.test(h.document.querySelector('.tool-error-text')?.textContent ?? ''));
      assert.strictEqual(
        h.document.querySelector('.tool-error-text')!.textContent,
        'Line 2 is not in the filtered results. Clear the filter to see it.',
      );
    } finally {
      h.cleanup();
    }
  });

  it('shows every new text in Korean when the language is Korean', async () => {
    const h = await openChat(sampleText(), { language: 'ko', config: SMALL_PAGES });
    try {
      await h.ready();
      const input = h.document.querySelector<HTMLInputElement>('.goto-line')!;
      assert.strictEqual(input.getAttribute('placeholder'), ko['label.gotoLinePlaceholder']);
      assert.strictEqual(input.getAttribute('aria-label'), '줄로 이동');
      press(h, 'x');
      assert.strictEqual(h.document.querySelector('.tool-error-text')!.textContent, '1 이상의 줄 번호를 입력해야 합니다.');
      press(h, '500');
      await h.waitFor(() => /없습니다/.test(h.document.querySelector('.tool-error-text')?.textContent ?? ''));
      assert.strictEqual(h.document.querySelector('.tool-error-text')!.textContent, '500번 줄이 없습니다. 이 파일은 100줄입니다.');
      const search = h.document.querySelector<HTMLInputElement>('.search')!;
      search.value = 'match';
      search.dispatchEvent(new h.window.Event('change'));
      await h.waitFor(() => pages(h).at(-1)?.matchCount === 25);
      press(h, '2');
      await h.waitFor(() => /필터 결과/.test(h.document.querySelector('.tool-error-text')?.textContent ?? ''));
      assert.strictEqual(
        h.document.querySelector('.tool-error-text')!.textContent,
        '2번 줄은 필터 결과에 없습니다. 필터를 해제해야 볼 수 있습니다.',
      );
    } finally {
      h.cleanup();
    }
  });

  it('switches the label language when the language menu changes', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      const get = () => h.document.querySelector('.goto-line')!.getAttribute('placeholder');
      assert.strictEqual(get(), en['label.gotoLinePlaceholder']);
      const select = h.document.querySelector<HTMLSelectElement>('.lang-select')!;
      select.value = 'ko';
      select.dispatchEvent(new h.window.Event('change'));
      await h.waitFor(() => get() === ko['label.gotoLinePlaceholder']);
    } finally {
      h.cleanup();
    }
  });
});

describe('open as chat at the cursor line', () => {
  it('first page message is the cursor line page and carries focusLine', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES, cursorLine: 57 });
    try {
      await h.ready();
      const first = pages(h)[0];
      assert.strictEqual(first.page, 5);
      assert.strictEqual(first.focusLine, 57);
      assert.strictEqual(h.document.querySelector('.card.focused')!.getAttribute('data-line'), '57');
      assert.strictEqual(h.document.querySelector('.page-label')!.textContent, 'Page 6 / 10');
    } finally {
      h.cleanup();
    }
  });

  it('is used once: a later ready starts at the first page again', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES, cursorLine: 57 });
    try {
      await h.ready();
      h.send({ type: 'ready' });
      // The webview also asks for the page it had before (state restore), so two pages follow.
      await h.waitFor(() => pages(h).length >= 3);
      const later = pages(h).slice(1);
      assert.ok(later.some((m) => m.page === 0), 'the host starts at the first page again');
      for (const m of later) assert.strictEqual(m.focusLine, undefined);
    } finally {
      h.cleanup();
    }
  });

  it('opens at the first page when started without a text editor (explorer or title menu)', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      assert.strictEqual(pages(h)[0].page, 0);
      assert.strictEqual(pages(h)[0].focusLine, undefined);
      assert.strictEqual(h.document.querySelector('.card.focused'), null);
    } finally {
      h.cleanup();
    }
  });

  it('a resource argument wins over the cursor and keeps the first page', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      h.state.activeEditor = { document: h.doc, selection: { active: { line: 80 } } };
      const before = pages(h).length;
      await h.state.commands.get('chatlines.openAsChat')!(h.doc.uri);
      await h.settle(50);
      assert.strictEqual(pages(h).length, before);
    } finally {
      h.cleanup();
    }
  });

  it('jumps in a chat view that is already open', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      const before = pages(h).length;
      h.state.activeEditor = { document: h.doc, selection: { active: { line: 80 } } };
      await h.state.commands.get('chatlines.openAsChat')!();
      await h.waitFor(() => pages(h).length > before);
      const msg = pages(h).at(-1);
      assert.strictEqual(msg.page, 8);
      assert.strictEqual(msg.focusLine, 80);
    } finally {
      h.cleanup();
    }
  });

  it('falls back to the first page when the cursor line is past the content', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES, cursorLine: 500 });
    try {
      await h.ready();
      assert.strictEqual(pages(h)[0].page, 0);
      assert.strictEqual(pages(h)[0].focusLine, undefined);
    } finally {
      h.cleanup();
    }
  });
});

describe('new message keys', () => {
  it('exist in both languages and are not empty', () => {
    for (const key of ['label.gotoLine', 'label.gotoLinePlaceholder', 'msg.lineNotNumber', 'msg.lineOutOfRange', 'msg.lineNotInFilter'] as const) {
      assert.ok(en[key].length > 0, key);
      assert.ok(ko[key].length > 0, key);
    }
  });
});

describe('open as chat while the view is hidden', () => {
  const lineCards = (h: Harness): number[] =>
    Array.from(h.document.querySelectorAll('[data-line]')).map((n) => Number(n.getAttribute('data-line')));

  it('reveals the view and applies the cursor line over the restored page, once', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      h.send({ type: 'requestPage', page: 3, filter: {} });
      await h.waitFor(() => pages(h).at(-1)?.page === 3);
      h.hide();
      const before = pages(h).length;
      h.state.activeEditor = { document: h.doc, selection: { active: { line: 80 } } };
      await h.state.commands.get('chatlines.openAsChat')!();
      assert.strictEqual(h.revealCalls, 1);
      assert.strictEqual(pages(h).length, before, 'nothing is delivered to a hidden view');
      h.show();
      await h.waitFor(() => pages(h).length > before);
      await h.settle(100);
      const after = pages(h).slice(before);
      assert.strictEqual(after.length, 1, 'no second page from the restored state');
      assert.strictEqual(after[0].page, 8);
      assert.strictEqual(after[0].focusLine, 80);
      assert.ok(lineCards(h).includes(80));
      // The line was used once: the next show restores the saved page (8), not a jump.
      h.hide();
      const again = pages(h).length;
      h.show();
      await h.waitFor(() => pages(h).length > again);
      await h.settle(100);
      assert.strictEqual(pages(h).at(-1).page, 8);
      assert.strictEqual(pages(h).at(-1).focusLine, undefined);
    } finally {
      h.cleanup();
    }
  });

  it('drops saved filters so the screen matches the jumped page', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      const search = h.document.querySelector<HTMLInputElement>('.search')!;
      search.value = 'match';
      search.dispatchEvent(new h.window.Event('change'));
      await h.waitFor(() => pages(h).at(-1)?.matchCount === 25);
      h.hide();
      const before = pages(h).length;
      h.state.activeEditor = { document: h.doc, selection: { active: { line: 81 } } };
      await h.state.commands.get('chatlines.openAsChat')!();
      h.show();
      await h.waitFor(() => pages(h).length > before);
      await h.settle(100);
      const last = pages(h).at(-1);
      assert.strictEqual(last.matchCount, 100);
      assert.strictEqual(last.focusLine, 81);
      assert.strictEqual(h.document.querySelector<HTMLInputElement>('.search')!.value, '');
    } finally {
      h.cleanup();
    }
  });
});

describe('line notices have no "Open as Text" button', () => {
  const buttons = (h: Harness): string[] =>
    Array.from(h.document.querySelectorAll('.tool-error button')).map((b) => b.textContent ?? '');

  it('not for bad input, a missing line or a filtered-out line', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      const input = h.document.querySelector<HTMLInputElement>('.goto-line')!;
      const press = (v: string): void => {
        input.value = v;
        input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter' }));
      };
      press('abc');
      assert.ok(h.document.querySelector('.tool-error'));
      assert.deepStrictEqual(buttons(h), []);
      press('500');
      await h.waitFor(() => /does not exist/.test(h.document.querySelector('.tool-error-text')?.textContent ?? ''));
      assert.deepStrictEqual(buttons(h), []);
      const search = h.document.querySelector<HTMLInputElement>('.search')!;
      search.value = 'match';
      search.dispatchEvent(new h.window.Event('change'));
      await h.waitFor(() => pages(h).at(-1)?.matchCount === 25);
      press('2');
      await h.waitFor(() => /filtered results/.test(h.document.querySelector('.tool-error-text')?.textContent ?? ''));
      assert.deepStrictEqual(buttons(h), []);
    } finally {
      h.cleanup();
    }
  });

  it('other tool errors keep the button', async () => {
    const h = await openChat(sampleText(), { config: SMALL_PAGES });
    try {
      await h.ready();
      h.window.dispatchEvent(
        new h.window.MessageEvent('message', {
          data: { type: 'toolError', code: 'INTERNAL', messageKey: 'msg.lineOutOfRange', args: [1, 2], line: 3 },
        }),
      );
      assert.deepStrictEqual(buttons(h), ['Open as Text']);
    } finally {
      h.cleanup();
    }
  });
});

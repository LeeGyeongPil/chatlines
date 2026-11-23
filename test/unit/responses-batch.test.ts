import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { buildLineView, detectFormat } from '../../src/core/formats';
import { applyEditToText } from '../../src/core/edit';
import { exampleLines } from '../helpers/examples';

const reqLine = (body: unknown) => JSON.stringify({ custom_id: 'r', method: 'POST', url: '/v1/responses', body });
const respLine = (body: unknown, extra: object = {}) =>
  JSON.stringify({ id: 'b', custom_id: 'r', response: { status_code: 200, body }, error: null, ...extra });

describe('Responses API batch lines', () => {
  it('shows a string input as one editable user bubble', () => {
    const line = reqLine({ model: 'm', input: 'hello' });
    const v = buildLineView(line, 0)!;
    assert.strictEqual(v.format, 'batch-request');
    assert.deepStrictEqual(v.problems, []);
    assert.strictEqual(v.messages.length, 1);
    assert.strictEqual(v.messages[0].role, 'user');
    assert.deepStrictEqual(v.messages[0].parts, [{ kind: 'text', text: 'hello', path: ['body', 'input'] }]);
  });

  it('converts array input items and keeps role-less items read-only', () => {
    const line = reqLine({
      input: [
        { role: 'developer', content: 'be brief' },
        { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
        { type: 'function_call', call_id: 'c1', name: 'f', arguments: '{}' },
        { type: 'function_call_output', call_id: 'c1', output: 'ok' },
      ],
    });
    const v = buildLineView(line, 0)!;
    assert.deepStrictEqual(v.problems, []);
    assert.deepStrictEqual(v.messages.map((m) => m.role), ['system', 'user', 'other', 'other']);
    assert.deepStrictEqual(v.messages[0].parts[0].path, ['body', 'input', 0, 'content']);
    assert.deepStrictEqual(v.messages[1].parts[0].path, ['body', 'input', 1, 'content', 0, 'text']);
    assert.strictEqual(v.messages[2].rawRole, 'function_call');
    assert.strictEqual(v.messages[2].parts[0].kind, 'other');
    assert.strictEqual(v.messages[2].parts[0].path, null);
    assert.strictEqual(v.messages[3].parts[0].path, null);
  });

  it('shows output messages as assistant bubbles and other items read-only', () => {
    const line = respLine({
      model: 'm',
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'answer' }] },
        { type: 'function_call', name: 'f', arguments: '{}' },
      ],
    });
    const v = buildLineView(line, 0)!;
    assert.strictEqual(v.format, 'batch-response');
    assert.strictEqual(v.meta.model, 'm');
    assert.deepStrictEqual(v.messages.map((m) => m.role), ['other', 'assistant', 'other']);
    assert.deepStrictEqual(v.messages[1].parts, [
      { kind: 'text', text: 'answer', path: ['response', 'body', 'output', 1, 'content', 0, 'text'] },
    ]);
    assert.strictEqual(v.messages[0].parts[0].path, null);
    assert.strictEqual(v.messages[2].parts[0].path, null);
  });

  it('still reports batchError for failed Responses lines', () => {
    const v = buildLineView(JSON.stringify({ custom_id: 'r', response: { status_code: 429, body: { output: [] } }, error: null }), 0)!;
    assert.deepStrictEqual(v.problems.map((p) => p.kind), ['batchError']);
  });

  it('edits only the output_text token and keeps the rest of the line', () => {
    const line = respLine({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'old' }] }] });
    const p = buildLineView(line, 0)!.messages[0].parts[0].path!;
    const out = applyEditToText(line, 0, p, 'new "text"');
    assert.strictEqual(out, line.replace('"old"', '"new \\"text\\""'));
    const line2 = reqLine({ model: 'm', input: 'old' });
    const out2 = applyEditToText(line2, 0, ['body', 'input'], 'new');
    assert.strictEqual(out2, line2.replace('"old"', '"new"'));
  });

  it('example Responses lines convert without problems', () => {
    for (const lang of ['en', 'ko'] as const) {
      const rq = buildLineView(exampleLines(lang, 'batch-request')[2], 2)!;
      const rs = buildLineView(exampleLines(lang, 'batch-response')[2], 2)!;
      assert.deepStrictEqual(rq.problems, []);
      assert.deepStrictEqual(rs.problems, []);
      assert.deepStrictEqual(rq.messages.map((m) => m.role), ['user']);
      assert.deepStrictEqual(rs.messages.map((m) => m.role), ['other', 'assistant']);
    }
  });
});

describe('Chat Completions batch lines are unchanged', () => {
  it('request: body.messages is read as before', () => {
    const v = buildLineView(JSON.stringify({ custom_id: 'x', url: '/v1/chat/completions', body: { model: 'm', messages: [{ role: 'user', content: 'a' }] } }), 0)!;
    assert.strictEqual(v.format, 'batch-request');
    assert.deepStrictEqual(v.messages.map((m) => [m.role, m.parts[0].path]), [['user', ['body', 'messages', 0, 'content']]]);
    assert.deepStrictEqual(v.problems, []);
  });

  it('request: messages win over input; neither means unknownShape', () => {
    const both = buildLineView(JSON.stringify({ custom_id: 'x', url: '/u', body: { messages: [{ role: 'user', content: 'a' }], input: 'b' } }), 0)!;
    assert.strictEqual(both.messages.length, 1);
    assert.deepStrictEqual(both.messages[0].parts[0].path, ['body', 'messages', 0, 'content']);
    const none = buildLineView(JSON.stringify({ custom_id: 'x', url: '/u', body: { model: 'm' } }), 0)!;
    assert.strictEqual(none.format, 'unknown');
    assert.deepStrictEqual(none.problems.map((p) => p.kind), ['unknownShape']);
  });

  it('response: choices are read as before and win over output', () => {
    const v = buildLineView(respLine({ choices: [{ message: { role: 'assistant', content: 'b' } }], output: [{ type: 'message' }] }), 0)!;
    assert.strictEqual(detectFormat(JSON.parse(respLine({}))), 'batch-response');
    assert.deepStrictEqual(v.messages.map((m) => [m.role, m.parts[0].path]), [['assistant', ['response', 'body', 'choices', 0, 'message', 'content']]]);
  });

  it('response: a body with neither choices nor output stays an empty card', () => {
    const v = buildLineView(respLine({ model: 'm' }), 0)!;
    assert.deepStrictEqual(v.messages, []);
    assert.deepStrictEqual(v.problems, []);
  });
});

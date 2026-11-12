import '../helpers/env';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { buildLineView, detectFormat, type FormatId } from '../../src/core/formats';
import { exampleLines, EXAMPLE_NAMES } from '../helpers/examples';

const EXPECTED: Record<string, FormatId[]> = {
  'openai-chat': ['openai-chat', 'openai-chat', 'openai-chat'],
  'openai-tools': ['openai-chat', 'openai-chat', 'openai-chat'],
  sharegpt: ['sharegpt', 'sharegpt'],
  alpaca: ['alpaca', 'alpaca', 'alpaca'],
  'batch-request': ['batch-request', 'batch-request'],
  'batch-response': ['batch-response', 'batch-response'],
  'python-style': ['openai-chat', 'openai-chat', 'openai-chat'],
  'mixed-problems': ['openai-chat', 'invalid', 'unknown', 'openai-chat', 'batch-response', 'openai-chat'],
};

describe('AC-1 format detection and conversion', () => {
  for (const lang of ['en', 'ko'] as const) {
    it(`detects the format of every example line (${lang})`, () => {
      for (const name of EXAMPLE_NAMES) {
        const got = exampleLines(lang, name).map((l, i) => buildLineView(l, i)?.format);
        assert.deepStrictEqual(got, EXPECTED[name], name);
      }
    });
  }

  it('detectFormat distinguishes the seven outcomes', () => {
    assert.strictEqual(detectFormat({ messages: [] }), 'openai-chat');
    assert.strictEqual(detectFormat({ conversations: [] }), 'sharegpt');
    assert.strictEqual(detectFormat({ instruction: 'a', output: 'b' }), 'alpaca');
    assert.strictEqual(detectFormat({ custom_id: 'x', url: '/v1', body: {} }), 'batch-request');
    assert.strictEqual(detectFormat({ custom_id: 'x', response: {} }), 'batch-response');
    assert.strictEqual(detectFormat({ nothing: true }), 'unknown');
    assert.strictEqual(detectFormat([1, 2]), 'unknown');
    assert.strictEqual(buildLineView('{"a":', 0)?.format, 'invalid');
  });

  it('pairs tool calls with tool results by id and shares the color', () => {
    const lines = exampleLines('en', 'openai-tools');
    const one = buildLineView(lines[0], 0)!;
    assert.deepStrictEqual(one.messages.map((m) => m.role), ['system', 'user', 'assistant', 'tool', 'assistant']);
    const call = one.messages[2].toolCalls[0];
    assert.strictEqual(call.name, 'get_weather');
    assert.strictEqual(call.id, 'call_w1');
    assert.ok(call.answered);
    assert.ok(call.color > 0);
    assert.strictEqual(one.messages[3].color, call.color);
    assert.deepStrictEqual(call.path, ['messages', 2, 'tool_calls', 0, 'function', 'arguments']);
    assert.strictEqual(call.argumentsRaw, '{"city": "Seoul"}');
    assert.strictEqual(call.argumentsPretty, '{\n  "city": "Seoul"\n}');
    assert.deepStrictEqual(one.tools, ['get_weather']);
    assert.strictEqual(one.problems.length, 0);

    const two = buildLineView(lines[1], 1)!;
    const calls = two.messages[1].toolCalls;
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.every((c) => c.answered));
    assert.notStrictEqual(calls[0].color, calls[1].color);
    assert.strictEqual(two.messages.filter((m) => m.role === 'tool' && m.color > 0).length, 2);
  });

  it('exposes editable paths for message text and content parts', () => {
    const chat = exampleLines('en', 'openai-chat');
    const first = buildLineView(chat[0], 0)!;
    assert.deepStrictEqual(first.messages[2].parts[0].path, ['messages', 2, 'content']);
    const parts = buildLineView(chat[2], 2)!;
    assert.deepStrictEqual(parts.messages[0].parts[0].path, ['messages', 0, 'content', 0, 'text']);
    const weighted = buildLineView(chat[1], 1)!;
    assert.strictEqual(weighted.messages[1].weight, 1);
    const alpaca = buildLineView(exampleLines('en', 'alpaca')[0], 0)!;
    assert.deepStrictEqual(alpaca.messages.map((m) => m.parts[0].path), [['instruction'], ['input'], ['output']]);
    const resp = buildLineView(exampleLines('en', 'batch-response')[0], 0)!;
    assert.deepStrictEqual(resp.messages[0].parts[0].path, ['response', 'body', 'choices', 0, 'message', 'content']);
    assert.strictEqual(resp.meta.statusCode, 200);
  });

  it('keeps unparsable arguments as raw text and reports a data problem', () => {
    const line = JSON.stringify({
      messages: [
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'f', arguments: '{"city": ' } }] },
        { role: 'tool', content: 'x', tool_call_id: 'c1' },
      ],
    });
    const v = buildLineView(line, 0)!;
    const call = v.messages[0].toolCalls[0];
    assert.strictEqual(call.argumentsOk, false);
    assert.strictEqual(call.argumentsRaw, '{"city": ');
    assert.strictEqual(call.argumentsPretty, null);
    assert.deepStrictEqual(v.problems.map((p) => p.kind), ['badArguments']);
  });

  it('classifies the data problems of mixed-problems.jsonl', () => {
    const lines = exampleLines('en', 'mixed-problems');
    const kinds = lines.map((l, i) => buildLineView(l, i)!.problems.map((p) => p.kind));
    assert.deepStrictEqual(kinds, [[], ['invalidJson'], ['unknownShape'], ['orphanToolResult'], ['batchError'], []]);
    const bad = buildLineView(lines[1], 1)!;
    assert.strictEqual(bad.column, lines[1].length + 1);
    assert.strictEqual(buildLineView('', 0), null);
    assert.strictEqual(buildLineView('   ', 0), null);
  });

  it('reports a tool call that never got an answer', () => {
    const line = JSON.stringify({ messages: [{ role: 'assistant', tool_calls: [{ id: 'z', type: 'function', function: { name: 'f', arguments: '{}' } }] }] });
    assert.deepStrictEqual(buildLineView(line, 0)!.problems.map((p) => p.kind), ['unansweredToolCall']);
  });
});

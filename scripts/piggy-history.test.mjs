import assert from 'node:assert/strict';
import test from 'node:test';
import { convertToModelMessages } from 'ai';
import { restorePiggyHistory, restorePiggyChatIndex } from '../src/domains/ledger-ai/domain/piggyHistory.ts';
import { piggyHistoryKey } from '../src/domains/ledger-ai/application/piggyHistoryStorage.ts';

test('restores conversation, draft and canvas references from a JSON round trip', async () => {
  const saved = {
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Draw a savings plan' }] },
      { id: 'a1', role: 'assistant', parts: [
        { type: 'step-start' },
        { type: 'tool-draw', toolCallId: 'call1', state: 'output-available', input: { title: 'Savings' }, output: { ok: true } },
        { type: 'text', text: 'Here it is.', state: 'done' },
      ] },
    ], draft: 'Make it green', aliases: [['savings', 'shape123']], boardErrors: [['old', 'Failed']],
  };
  const restored = restorePiggyHistory(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.messages.length, 2);
  assert.equal(restored.draft, saved.draft);
  assert.deepEqual(restored.aliases, saved.aliases);
  assert.deepEqual(restored.boardErrors, saved.boardErrors);
  const model = await convertToModelMessages(restored.messages);
  assert.ok(model.some((m) => m.role === 'tool'));
});

test('interrupted tools are removed while partial text is kept and made resumable', async () => {
  const restored = restorePiggyHistory({ messages: [{ id: 'a', role: 'assistant', parts: [
    { type: 'text', text: 'I started a plan', state: 'streaming' },
    { type: 'tool-draw', state: 'input-streaming', toolCallId: 'unfinished', input: {} },
    { type: 'dynamic-tool', state: 'input-available', toolCallId: 'pending', input: {} },
  ] }] });
  assert.equal(restored.messages[0].parts.length, 1);
  assert.equal(restored.messages[0].parts[0].state, 'done');
  await assert.doesNotReject(() => convertToModelMessages(restored.messages));
});

test('malformed history and duplicate tabs recover safely', () => {
  assert.deepEqual(restorePiggyHistory(null).messages, []);
  const restored = restorePiggyHistory({ messages: [null, { role: 'system', id: 's', parts: [] }, { id: 'a', role: 'assistant', parts: [null, { type: 'text', text: 7 }] }], aliases: [null, ['one'], ['ok', 'shape']] });
  assert.deepEqual(restored.messages, []);
  assert.deepEqual(restored.aliases, [['ok', 'shape']]);
  const index = restorePiggyChatIndex({ tabs: [{ id: '1', name: 'Bills' }, { id: '1', name: 'Duplicate' }, { id: '2', name: 'Savings' }], activeId: 'missing' });
  assert.equal(index.tabs.length, 2);
  assert.equal(index.activeId, '1');
  assert.equal(restorePiggyChatIndex(undefined).tabs.length, 1);
});

test('storage keys isolate accounts, chat tabs and canvas', () => {
  const keys = [piggyHistoryKey('alice', 'ledger:1'), piggyHistoryKey('bob', 'ledger:1'), piggyHistoryKey('alice', 'canvas'), piggyHistoryKey('alice', 'ledger:2')];
  assert.equal(new Set(keys).size, 4);
  assert.notEqual(piggyHistoryKey('a:b', 'c'), piggyHistoryKey('a', 'b:c'));
});

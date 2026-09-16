import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { piggyMoodFromChat, piggyMoodFromMessage, piggyEmoteForMood } from '../src/domains/ledger-ai/domain/piggyMood.ts';

const reply = (text) => ({ role: 'assistant', parts: [{ type: 'text', text }] });
const state = (overrides = {}) => piggyMoodFromChat({ status: 'ready', listening: false, ...overrides });

test('live activity overrides stale errors and typing', () => {
  assert.equal(state({ status: 'submitted', error: new Error(), listening: true }), 'thinking');
  assert.equal(state({ status: 'streaming', message: reply('Hello') }), 'happy');
  assert.equal(state({ status: 'streaming', message: { role: 'assistant', parts: [{ type: 'reasoning', text: 'Plan' }] } }), 'thinking');
  assert.equal(state({ status: 'streaming', message: { role: 'assistant', parts: [{ type: 'tool-draw', state: 'input-streaming' }] } }), 'thinking');
  assert.equal(state({ status: 'error' }), 'sad');
  assert.equal(state({ blocked: true }), 'confused');
  assert.equal(state({ listening: true, message: reply('Congratulations!') }), 'neutral');
});

test('completed replies use conservative cues, never user sentiment or financial keywords', () => {
  for (const [text, expected] of [
    ['Which month did you mean?', 'confused'], ['Congratulations, you reached your goal!', 'excited'],
    ["You’re welcome!", 'love'], ['Unfortunately, I could not finish.', 'sad'], ['Wow, that changed!', 'surprised'],
    ['Your debt and overspending totals are listed below.', 'happy'], ['The merchant is Angry Chicken.', 'happy'],
  ]) assert.equal(piggyMoodFromMessage(reply(text)), expected);
  assert.equal(piggyMoodFromMessage({ role: 'user', parts: [{ type: 'text', text: 'Congratulations!' }] }), 'happy');
});

test('tool failures override cheerful text and old canvas errors do not leak into new turns', () => {
  const message = reply('Congratulations!');
  message.parts.push({ type: 'tool-draw', state: 'output-available', toolCallId: 'new' });
  assert.equal(piggyMoodFromMessage(message, new Map([['old', 'Failed']])), 'excited');
  assert.equal(piggyMoodFromMessage(message, new Map([['new', 'Failed']])), 'sad');
  message.parts[1].state = 'output-error';
  assert.equal(piggyMoodFromMessage(message), 'sad');
  message.parts[1].state = 'output-denied';
  assert.equal(piggyMoodFromMessage(message), 'confused');
  message.parts[1] = { type: 'dynamic-tool', state: 'output-available', output: { error: 'Could not update' } };
  assert.equal(piggyMoodFromMessage(message), 'sad');
});

test('every mood resolves to a shipped SVG', () => {
  for (const emote of Object.values(piggyEmoteForMood)) {
    assert.ok(existsSync(new URL(`../public/piggy/${emote}.svg`, import.meta.url)), emote);
  }
});

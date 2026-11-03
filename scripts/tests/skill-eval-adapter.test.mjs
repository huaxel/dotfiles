import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContext, decodeAnswer } from '../../skills/skill-diet/scripts/skill_eval_pi.mjs';

test('no-skill context has one user message and no tool or global-resource declarations', () => {
  const context = buildContext({ skill_text: '', prompt: 'Task', provider: 'not-context', model: 'not-context' });
  assert.equal(context.messages.length, 1);
  assert.equal(context.messages[0].content, 'Task');
  assert.match(context.systemPrompt, /No skill is supplied/);
  assert.equal('tools' in context, false);
  assert.equal('apiKey' in context, false);
  assert(!JSON.stringify(context).includes('not-context'));
});

test('only the supplied skill text is included', () => {
  const context = buildContext({ skill_text: 'UNIQUE-SKILL-CANARY', prompt: 'Task' });
  assert.match(context.systemPrompt, /UNIQUE-SKILL-CANARY/);
  assert(!context.systemPrompt.includes('No skill is supplied'));
  const next = buildContext({ skill_text: '', prompt: 'Next independent task' });
  assert(!JSON.stringify(next).includes('UNIQUE-SKILL-CANARY'));
  assert.equal(next.messages.length, 1);
});

test('structured answers remain data, including command-looking strings', () => {
  assert.deepEqual(decodeAnswer('{"answer":"echo example"}'), { answer: 'echo example' });
});

test('prose or markdown fences do not count as JSON answers', () => {
  assert.throws(() => decodeAnswer('I did the work'));
  assert.throws(() => decodeAnswer('```json\n{"ok":true}\n```'));
});

test('null, scalar and array answers are rejected', () => {
  for (const text of ['null', 'true', '1', '[]', '"ok"']) assert.throws(() => decodeAnswer(text));
});

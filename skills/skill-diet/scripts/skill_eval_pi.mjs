#!/usr/bin/env node
// Text-only, single-request adapter. Model output is JSON data, never executed.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function buildContext(request) {
  const systemPrompt = 'This is a text-only evaluation. You have no tools, filesystem access, prior conversation, user memory, plugins, or other skill text. Answer the supplied task as JSON only. Do not claim to have run commands. ' +
    (request.skill_text ? `The sole supplied skill follows. Apply it where relevant.\n<skill>\n${request.skill_text}\n</skill>` : 'No skill is supplied.');
  return {systemPrompt, messages: [{role: 'user', content: request.prompt, timestamp: Date.now()}]};
}

export function decodeAnswer(text) {
  const answer = JSON.parse(text);
  if (!answer || Array.isArray(answer) || typeof answer !== 'object') throw new Error('answer must be a JSON object');
  return answer;
}

export async function main() {
  try {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 500_000) throw new Error('oversized request');
    }
    const request = JSON.parse(input);
    if (Object.keys(request).sort().join(',') !== 'model,prompt,provider,skill_text' ||
        Object.values(request).some(v => typeof v !== 'string')) throw new Error('invalid request');
    const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi/agent');
    const version = readFileSync(join(agentDir, 'install/current-version'), 'utf8').trim();
    if (!/^[a-zA-Z0-9._+-]+$/.test(version) || version === '.' || version === '..') throw new Error('invalid runtime version');
    const packageDir = resolve(agentDir, 'install/releases', version, 'node_modules/@earendil-works/pi-coding-agent');
    const { ModelRuntime } = await import(pathToFileURL(join(packageDir, 'dist/index.js')));
    const runtime = await ModelRuntime.create({
      authPath: join(agentDir, 'auth.json'), modelsPath: null,
      modelsStorePath: join(agentDir, 'models-store.json'),
      allowModelNetwork: false, refreshOnCreate: false,
    });
    const model = runtime.getPhysicalModel(request.provider, request.model);
    if (!model) throw new Error('requested physical model unavailable');
    const message = await runtime.completeSimple(model, buildContext(request),
      { reasoning: 'low', maxTokens: 1600, signal: AbortSignal.timeout(75_000) });
    if (message.stopReason !== 'stop') throw new Error('incomplete model response');
    const text = message.content.filter(c => c.type === 'text').map(c => c.text).join('');
    const answer = decodeAnswer(text);
    const tokens = message.usage.totalTokens;
    if (!Number.isSafeInteger(tokens) || tokens <= 0) throw new Error('missing usage');
    console.log(JSON.stringify({ status: 'completed', answer, tokens,
      provider: model.provider, model: model.id, sdk_version: version,
      node_version: process.version, tools_enabled: false }));
  } catch {
    // Provider failures can contain credential or request details; keep them out of reports.
    console.error('Text-only adapter failed; no model response accepted. No retry or provider fallback performed.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

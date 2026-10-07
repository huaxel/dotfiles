import { registerHooks } from 'node:module';
import { resolve } from './pi-resolve-hook.mjs';
import { assert, runTests } from './pi-test-harness.mjs';
registerHooks({ resolve });
const { default: install, capacityPage } = await import('./capacity.ts');

function view(count = 2) {
  return { schemaVersion: 1, purpose: 'facts-for-agent-reasoning-not-dispatch-policy', observedAt: '2026-10-06T12:00:00Z', observedMachine: 'host-a', paths: Array.from({ length: count }, (_, i) => ({
    id: `path-${i}`, machine: 'host-a', provider: i % 2 ? 'openference' : 'opencode-go', harness: 'pi', access: 'unknown',
    models: [{ id: 'GLM', images: true, reasoning: true, privacy: 'unverified', secret: 'private-sentinel' }, { id: 'DeepSeek', images: false, reasoning: true, privacy: 'unverified' }],
    quota: { bucket: 'go', state: 'unknown', usedPercent: 12.345, secret: 'private-sentinel' }, authentication: { state: 'unknown' }, constraints: ['verify-plan'], secret: 'private-sentinel',
  })) };
}
function harness(result = { stdout: JSON.stringify(view()), code: 0, killed: false }) {
  let tool;
  const calls = [];
  install({ registerTool: t => { tool = t; }, exec: async (...args) => { calls.push(args); return result; } });
  return { tool, calls };
}

await runTests({
  'registration starts no process and adds no routing guidance': () => {
    const h = harness();
    assert(h.tool.name === 'capacity', 'tool registered');
    assert(h.calls.length === 0, 'no startup probe');
    assert(h.tool.annotations.readOnlyHint === true, 'read-only annotation');
  },
  'tool invokes fixed node command and returns structured facts': async () => {
    const h = harness();
    const signal = new AbortController().signal;
    const result = await h.tool.execute('t', { offline: true }, signal);
    assert(h.calls[0][0] === process.execPath, 'node command');
    assert(h.calls[0][1].at(-1) === '--offline', 'offline flag');
    assert(h.calls[0][2].signal === signal, 'abort forwarded');
    assert(h.calls[0][2].timeout === 10000, 'bounded timeout');
    assert(result.structuredContent.paths.length === 2, 'structured facts');
    assert(!JSON.stringify(result).includes('private-sentinel'), 'unsupported fields withheld');
    assert(!JSON.stringify(result).includes('12.345'), 'raw quota withheld');
  },
  'all local opt-ins forward once with the combined bounded deadline': async () => {
    const h = harness();
    await h.tool.execute('t', { liveQuota: true, nativeQuota: 'agy', nativeDaemon: 'codex' });
    assert(h.calls.length === 1, 'one collector invocation, no tool-side probes');
    assert(JSON.stringify(h.calls[0][1].slice(1)) === JSON.stringify(['--live-quota', '--native-quota', 'agy', '--native-daemon', 'codex']), 'explicit flags preserved');
    assert(h.calls[0][2].timeout === 165000, 'all helper bounds included');
  },
  'combined offline opt-ins fail before any command': async () => {
    const h = harness();
    let failed = false;
    try { await h.tool.execute('t', { offline: true, liveQuota: true, nativeQuota: 'agy', nativeDaemon: 'codex' }); } catch { failed = true; }
    assert(failed && h.calls.length === 0, 'no partial probing');
  },
  'response timestamps reject objects and oversized strings without exposing contents': () => {
    for (const value of [{ secret: 'private-sentinel' }, 'private-sentinel'.repeat(10000), 12345, 'not-a-date']) {
      for (const key of ['observedAt', 'generatedAt']) {
        const input = view(); delete input.observedAt; input[key] = value;
        let message = '';
        try { capacityPage(input); } catch (error) { message = error.message; }
        assert(message && !message.includes('private-sentinel'), 'invalid header rejected privately');
      }
    }
  },
  'generated timestamps remain canonical and missing timestamps remain unknown': () => {
    const input = view(); delete input.observedAt; input.generatedAt = '2026-10-06T12:00:00+00:00';
    assert(capacityPage(input).observedAt === '2026-10-06T12:00:00.000Z', 'canonical merged timestamp');
    delete input.generatedAt;
    assert(capacityPage(input).observedAt === null, 'unknown timestamp preserved');
  },
  'provider filters and pagination do not rank or select': () => {
    const page = capacityPage(view(12), { provider: 'openference', limit: 2, offset: 1 });
    assert(page.totalMatchingPaths === 6, 'filtered count');
    assert(page.paths.length === 2, 'bounded page');
    assert(page.nextOffset === 3, 'continuation');
    assert(page.paths[0].id === 'path-3', 'original order, no ranking');
  },
  'model query filters models but preserves unknown/native paths': () => {
    const input = view();
    input.paths[1].models = null;
    const page = capacityPage(input, { modelQuery: 'glm', modelsPerPath: 1 });
    assert(page.paths.length === 2, 'paths not dropped');
    assert(page.paths[0].models[0].id === 'GLM', 'model listing narrowed');
    assert(page.paths[1].models === null, 'unknown remains unknown');
  },
  'large pages are bounded without malformed JSON': () => {
    const input = view(8);
    for (const path of input.paths) path.constraints = Array.from({ length: 20 }, () => 'x'.repeat(500));
    const page = capacityPage(input);
    assert(Buffer.byteLength(JSON.stringify(page.paths)) <= 20000, 'path byte cap');
    assert(page.nextOffset !== null, 'remaining rows advertised');
  },
  'live quota is explicit and separate accounts remain visible without raw fields': async () => {
    const input = view();
    input.paths[0].quota.recheckAt = '2026-10-06T13:00:00Z';
    input.paths[0].quota.accounts = [{ accountRef: 'observed-go-account-1', state: 'exhausted', matchesConfiguredProviderKey: true, recheckAt: '2026-10-06T13:00:00Z', usedPercent: 100, key: 'private-sentinel' }];
    const h = harness({ stdout: JSON.stringify(input), code: 0, killed: false });
    const result = await h.tool.execute('t', { liveQuota: true });
    assert(h.calls[0][1].includes('--live-quota'), 'explicit flag');
    assert(result.structuredContent.paths[0].quota.accounts[0].state === 'exhausted', 'account summary preserved');
    assert(result.structuredContent.paths[0].quota.recheckAt === input.paths[0].quota.recheckAt, 'path recheck boundary preserved');
    assert(result.structuredContent.paths[0].quota.accounts[0].recheckAt === input.paths[0].quota.recheckAt, 'account recheck boundary preserved');
    assert(!JSON.stringify(result).includes('private-sentinel'), 'account key withheld');
  },
  'offline live combination starts no process': async () => {
    const h = harness();
    let failed = false;
    try { await h.tool.execute('t', { offline: true, liveQuota: true }); } catch { failed = true; }
    assert(failed && h.calls.length === 0, 'offline disallows live usage');
  },
  'native quota is opt-in and reported pools remain separate and sanitized': async () => {
    const input = view();
    input.paths[0].quota.pools = [{ poolRef: 'observed-agy-pool-1', label: 'Gemini Models', state: 'headroom-observed', remaining_fraction: 0.12345, secret: 'private-sentinel' }];
    const h = harness({ stdout: JSON.stringify(input), code: 0, killed: false });
    const result = await h.tool.execute('t', { nativeQuota: 'agy' });
    assert(h.calls[0][1].includes('--native-quota'), 'explicit native flag');
    assert(h.calls[0][2].timeout === 115000, 'native helper deadline included');
    assert(result.structuredContent.paths[0].quota.pools[0].label === 'Gemini Models', 'reported pool retained');
    assert(!JSON.stringify(result).includes('private-sentinel'), 'raw fields withheld');
    assert(!JSON.stringify(result).includes('0.12345'), 'native quota amount withheld');
  },
  'native daemon facts stay separate, bounded and private': async () => {
    const input = view();
    input.nativeServices = [{ machine: 'host-a', harness: 'codex', provider: null, transport: 'existing-local-daemon-only', state: 'observed',
      authentication: { state: 'configured', mode: 'subscription', email: 'private-sentinel' },
      catalog: { state: 'advertised', partial: true },
      models: [{ id: 'gpt-test', images: true, secret: 'private-sentinel' }],
      quota: { state: 'unknown', ordinaryUsageAllowed: true, accountId: 'private-sentinel', pools: [{ poolRef: 'pool-1', state: 'unknown', usedPercent: 12.345 }] } }];
    const h = harness({ stdout: JSON.stringify(input), code: 0, killed: false });
    const result = await h.tool.execute('t', { nativeDaemon: 'codex', modelsPerPath: 1 });
    assert(h.calls[0][1].includes('--native-daemon'), 'explicit flag');
    assert(h.calls[0][2].timeout === 115000, 'separate helper deadline');
    assert(result.structuredContent.nativeServices[0].provider === null, 'provider unresolved');
    assert(result.structuredContent.nativeServices[0].quota.ordinaryUsageAllowed === true, 'explicit backend permission retained');
    assert(result.structuredContent.paths[0].access === 'unknown', 'no path linkage');
    assert(!JSON.stringify(result).includes('private-sentinel'), 'identity and other private fields withheld');
    assert(!JSON.stringify(result).includes('12.345'), 'raw usage withheld');
  },
  'offline native daemon starts no process': async () => {
    const h = harness();
    let failed = false;
    try { await h.tool.execute('t', { offline: true, nativeDaemon: 'codex' }); } catch { failed = true; }
    assert(failed && h.calls.length === 0, 'offline disallows daemon probe');
  },
  'offline native quota starts no process': async () => {
    const h = harness();
    let failed = false;
    try { await h.tool.execute('t', { offline: true, nativeQuota: 'agy' }); } catch { failed = true; }
    assert(failed && h.calls.length === 0, 'offline disallows native quota');
  },
  'offline remote combination fails before starting a process': async () => {
    const h = harness();
    let failed = false;
    try { await h.tool.execute('t', { offline: true, machines: ['wsl'] }); } catch { failed = true; }
    assert(failed && h.calls.length === 0, 'rejected before execution');
  },
  'already aborted call starts no process': async () => {
    const h = harness();
    const controller = new AbortController(); controller.abort();
    let failed = false;
    try { await h.tool.execute('t', {}, controller.signal); } catch { failed = true; }
    assert(failed && h.calls.length === 0, 'cancelled before execution');
  },
  'process errors and malformed JSON withhold private diagnostic text': async () => {
    for (const result of [{ code: 1, stderr: 'private-sentinel', stdout: '' }, { code: 0, stdout: 'private-sentinel INVALID', killed: false }]) {
      const h = harness(result);
      let message = '';
      try { await h.tool.execute('t', {}); } catch (error) { message = error.message; }
      assert(message && !message.includes('private-sentinel'), 'diagnostics withheld');
    }
  },
  'killed execution is not presented as a successful capacity observation': async () => {
    const h = harness({ stdout: JSON.stringify(view()), code: 0, killed: true });
    let failed = false;
    try { await h.tool.execute('t', {}); } catch { failed = true; }
    assert(failed, 'killed result rejected');
  },
}, { name: 'capacity tool' });

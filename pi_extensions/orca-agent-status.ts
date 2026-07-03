// @orca-managed-pi-extension
// Why: no package-specific type import here. Pi and OMP expose the same
// extension API, but publish their types under different package names.

// ---------- local type definitions (avoids importing pi/omp types) ----------

interface PiEventPrompt {
  prompt?: string
}

interface PiEventToolMeta {
  toolName: string
  args?: Record<string, unknown>
  input?: Record<string, unknown>
}

interface PiEventMessage {
  message?: { role?: string; content?: unknown }
}

interface PiExtensionApi {
  on: (event: string, handler: (...args: unknown[]) => void | Promise<void>) => void
}

// ---------- helpers ----------

// Why: warn-once so a recurring parse error on a malformed endpoint
// file does not spam stderr inside the pi TUI on every event.
let warnedBadEndpoint = false

// Why: re-reading the endpoint file on every event is cheap (small file,
// rare changes) but stat+mtime caching avoids re-parsing on every event
// during streaming tool execution. Mirrors the OpenCode plugin cache shape.
let cachedEndpointPath = ''
let cachedEndpointKey = ''
let cachedEndpointValues: Record<string, string> | null = null

function readEndpointFile(): Record<string, string> | null {
  const filePath = process.env.ORCA_AGENT_HOOK_ENDPOINT
  if (!filePath) return null
  try {
    const fs = require('fs')
    try {
      const stat = fs.statSync(filePath)
      const cacheKey = filePath + ':' + stat.mtimeMs + ':' + stat.size + ':' + stat.ino
      if (cacheKey === cachedEndpointKey && cachedEndpointValues) {
        return cachedEndpointValues
      }
      const contents: string = fs.readFileSync(filePath, 'utf8')
      const out: Record<string, string> = {}
      for (const line of contents.split(/\r?\n/)) {
        // Why: parse `KEY=VALUE` (POSIX endpoint.env), `set KEY=VALUE`,
        // `SET KEY=VALUE`, `Set KEY=VALUE` (Windows endpoint.cmd), and
        // `set "KEY=VALUE"` (quoted Windows syntax accepted by cmd.exe)
        // with one regex; strip a trailing CR so mixed-EOL files do not
        // leak \r into the value.
        const m = line.match(/^(?:(?:[sS][eE][tT])\s+)?["']?([A-Z0-9_]+)["']?=(.*)$/)
        if (m) out[m[1]] = m[2].replace(/\r$/, '')
      }
      cachedEndpointPath = filePath
      cachedEndpointKey = cacheKey
      cachedEndpointValues = out
      return out
    } catch (ioErr) {
      cachedEndpointPath = ''
      cachedEndpointKey = ''
      cachedEndpointValues = null
      throw ioErr
    }
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code
    if (err && code !== 'ENOENT' && !warnedBadEndpoint) {
      warnedBadEndpoint = true
      console.warn('[orca-pi-status] failed to parse endpoint file:', (err as Error).message)
    }
    return null
  }
}

// Why: validate that a parsed endpoint file at least contains Orca-relevant
// keys so silent garbage files are detected.
const ORCA_EXPECTED_KEYS = new Set([
  'ORCA_AGENT_HOOK_PORT',
  'ORCA_AGENT_HOOK_TOKEN',
  'ORCA_AGENT_HOOK_ENV',
  'ORCA_AGENT_HOOK_VERSION',
])

function resolveHookCoords(): {
  port: string | undefined
  token: string | undefined
  env: string
  version: string
} {
  const fileEnv = readEndpointFile() || {}

  // Why: if the file exists but none of the expected Orca keys were found,
  // the format may be wrong. Warn once per session.
  const filePath = cachedEndpointPath
  if (
    filePath &&
    !warnedBadEndpoint &&
    ![...ORCA_EXPECTED_KEYS].some((k) => k in fileEnv)
  ) {
    const fs = require('fs')
    if (fs.existsSync(filePath)) {
      warnedBadEndpoint = true
      console.warn(
        '[orca-pi-status] endpoint file at',
        filePath,
        'exists but none of the expected ORCA_AGENT_HOOK_* keys were found',
      )
    }
  }

  return {
    port: fileEnv.ORCA_AGENT_HOOK_PORT || process.env.ORCA_AGENT_HOOK_PORT,
    token: fileEnv.ORCA_AGENT_HOOK_TOKEN || process.env.ORCA_AGENT_HOOK_TOKEN,
    env: fileEnv.ORCA_AGENT_HOOK_ENV || process.env.ORCA_AGENT_HOOK_ENV || '',
    version: fileEnv.ORCA_AGENT_HOOK_VERSION || process.env.ORCA_AGENT_HOOK_VERSION || '',
  }
}

function processName(value: unknown): string {
  return String(value || '').split(/[\\/]/).pop()?.toLowerCase() || ''
}

function resolveHookPath(): string {
  const executableNames = [
    processName(process.title),
    processName(process.env._),
    processName(process.argv[1]),
    processName(process.argv[0]),
  ]
  const isOmpExecutable = executableNames.some((name) =>
    ['omp', 'omp.js', 'omp.sh', 'omp.cmd', 'omp.exe', 'omp.bat'].includes(name),
  )
  // Why: a bare shell may launch either Pi or OMP after spawn. Runtime
  // executable detection keeps that status labeled
  // as OMP instead of silently reporting it as Pi.
  if (isOmpExecutable) return '/hook/omp'
  return '/hook/pi'
}

// Why: validate that the port is a numeric string in the valid range so a
// malformed endpoint file cannot redirect requests off loopback.
function isValidPort(raw: string | undefined): raw is string {
  if (!raw) return false
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 65535 && String(n) === raw.trim()
}

const STATUS_POST_TIMEOUT_MS = 2_000

async function post(hookEventName: string, extra: Record<string, unknown> = {}): Promise<void> {
  try {
    const coords = resolveHookCoords()
    const paneKey = process.env.ORCA_PANE_KEY
    if (!isValidPort(coords.port) || !coords.token || !paneKey) return

    const url = `http://127.0.0.1:${coords.port}${resolveHookPath()}`
    const body = JSON.stringify({
      paneKey,
      launchToken: process.env.ORCA_AGENT_LAUNCH_TOKEN || '',
      tabId: process.env.ORCA_TAB_ID || '',
      worktreeId: process.env.ORCA_WORKTREE_ID || '',
      env: coords.env,
      version: coords.version,
      payload: { hook_event_name: hookEventName, ...extra },
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), STATUS_POST_TIMEOUT_MS)

    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Orca-Agent-Hook-Token': coords.token,
      },
      body,
      signal: controller.signal,
    })

    clearTimeout(timeout)
  } catch {
    // Why: status reporting must never fail the pi run just because Orca
    // is unavailable or the loopback request failed (e.g. Orca restart).
  }
}

// Why: pi assistant messages carry content as an array of parts
// ({ type: 'text', text } / tool_use / tool_result / reasoning). We only
// surface the concatenated text parts as the visible 'last assistant
// message' for the dashboard preview — tool_use / reasoning would be
// noise (the dashboard already shows the active tool name + input).
function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const part of content) {
    if (part && typeof part === 'object' && (part as { type?: unknown }).type === 'text') {
      const text = (part as { text?: unknown }).text
      if (typeof text === 'string') out += text
    }
  }
  return out
}

// Why: pi's tool_call event input shape is tool-specific (event.input is
// the raw args object). The agent-hooks server already runs
// deriveToolInputPreview(toolName, input) to render a friendly preview
// for known tool names ('bash' → command, 'read'/'write'/'edit' → path,
// etc.), so we forward the raw object verbatim under the same field
// names Claude uses (tool_name / tool_input) and let the server pick the
// preview. Keeps tool-name knowledge centralized on the receiver side.
export default function (pi: PiExtensionApi): void {
  pi.on('before_agent_start', async (event: PiEventPrompt) => {
    await post('before_agent_start', { prompt: event.prompt ?? '' })
  })

  pi.on('agent_start', async () => {
    await post('agent_start')
  })

  pi.on('tool_execution_start', async (event: PiEventToolMeta) => {
    await post('tool_execution_start', {
      tool_name: event.toolName,
      tool_input: event.args,
    })
  })

  pi.on('tool_call', async (event: PiEventToolMeta) => {
    await post('tool_call', {
      tool_name: event.toolName,
      tool_input: event.input,
    })
  })

  pi.on('tool_execution_end', async (event: PiEventToolMeta) => {
    await post('tool_execution_end', {
      tool_name: event.toolName,
    })
  })

  // Why: capture the assistant's final text on each completed message
  // so the dashboard preview reflects the most recent reply even before
  // agent_end fires. message_end is the right hook because pi guarantees
  // it fires after the message is finalized (post-streaming).
  pi.on('message_end', async (event: PiEventMessage) => {
    if (event.message?.role !== 'assistant') return
    const text = extractAssistantText(event.message)
    if (!text) return
    await post('message_end', { role: 'assistant', text })
  })

  pi.on('agent_end', async () => {
    await post('agent_end')
  })

  pi.on('session_shutdown', async () => {
    await post('session_shutdown')
  })
}

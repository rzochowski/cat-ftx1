<template>
  <div class="app">
    <!-- ── Header / Connection Bar ── -->
    <header class="header">
      <div class="header-brand">
        <span class="brand-logo">FTX-1</span>
        <span class="brand-sub">CAT Controller</span>
      </div>

      <div class="conn-bar">
        <select v-model="selectedPort" class="sel" :disabled="state.connected">
          <option value="" disabled>Select port…</option>
          <option v-for="p in ports" :key="p.path" :value="p.path">
            {{ p.path }}<template v-if="p.manufacturer"> — {{ p.manufacturer }}</template>
          </option>
        </select>

        <select v-model="selectedBaud" class="sel baud-sel" :disabled="state.connected">
          <option :value="4800">4800</option>
          <option :value="9600">9600</option>
          <option :value="19200">19200</option>
          <option :value="38400">38400</option>
          <option :value="115200">115200</option>
        </select>

        <button class="btn" :class="state.connected ? 'btn-danger' : 'btn-primary'" @click="toggleConnection" :disabled="connecting">
          {{ connecting ? '…' : state.connected ? 'Disconnect' : 'Connect' }}
        </button>

        <button class="btn btn-ghost" @click="refreshPorts" title="Refresh port list">⟳</button>
      </div>

      <div class="conn-status" :class="state.connected ? 'status-ok' : 'status-off'">
        {{ state.connected ? `● Connected — ${state.port}` : '○ Disconnected' }}
      </div>
    </header>

    <!-- ── Error banner ── -->
    <div v-if="lastError" class="error-banner">
      {{ lastError }}
      <button class="close-btn" @click="lastError = null">✕</button>
    </div>

    <!-- ── Main dashboard (only when connected) ── -->
    <main v-if="state.connected" class="dashboard">

      <!-- TX/RX Indicator -->
      <div class="tx-indicator" :class="{ 'tx-active': state.txState || state.mox }">
        <span>{{ (state.txState || state.mox) ? 'TX' : 'RX' }}</span>
        <span v-if="state.radioInfo?.hiSwr" class="swr-alarm">HI-SWR!</span>
      </div>

      <!-- ── VFO Section ── -->
      <section class="vfo-section">
        <!-- MAIN VFO -->
        <div class="vfo-card main-card">
          <div class="vfo-header">
            <span class="vfo-label">MAIN</span>
            <span class="mode-badge" :style="modeBadgeStyle(state.mainMode)">
              {{ state.mainMode ?? '--' }}
            </span>
          </div>
          <div class="freq-display" :class="{ 'freq-tx': state.txState || state.mox }">
            {{ formatFreq(state.mainFreq) }}
          </div>
          <div class="freq-unit">MHz</div>
          <SMeter :value="state.mainSmeter" label="MAIN S-meter" />
        </div>

        <!-- SUB VFO -->
        <div class="vfo-card sub-card">
          <div class="vfo-header">
            <span class="vfo-label">SUB</span>
            <span class="mode-badge" :style="modeBadgeStyle(state.subMode)">
              {{ state.subMode ?? '--' }}
            </span>
          </div>
          <div class="freq-display freq-sub">
            {{ formatFreq(state.subFreq) }}
          </div>
          <div class="freq-unit">MHz</div>
          <SMeter :value="state.subSmeter" label="SUB S-meter" />
        </div>
      </section>


      <!-- ── Status Grid ── -->
      <section class="status-section">
        <StatusBadge label="AUTO INFO" :value="state.autoInfo ? 'ON' : 'OFF'" :active="state.autoInfo" color-active="#22d3ee" />
        <StatusBadge label="SPLIT" :value="state.split ? 'ON' : 'OFF'" :active="state.split" />
        <StatusBadge label="MOX" :value="state.mox ? 'ON' : 'OFF'" :active="state.mox" />
        <StatusBadge label="AGC" :value="state.agcMain ?? '--'" />
        <StatusBadge label="RF GAIN" :value="state.rfGainMain != null ? String(state.rfGainMain) : '--'" />
        <StatusBadge label="AF GAIN" :value="state.afGainMain != null ? String(state.afGainMain) : '--'" />
        <StatusBadge label="PWR" :value="state.powerLevel != null ? state.powerLevel + ' W' : '--'" />
        <StatusBadge label="SCAN" :value="state.radioInfo?.scanning ? 'ON' : 'OFF'" :active="state.radioInfo?.scanning" />
        <StatusBadge label="SQL" :value="state.radioInfo?.squelchOpen ? 'OPEN' : 'CLOSED'" :active="state.radioInfo?.squelchOpen" color-active="#22d3ee" />
        <StatusBadge label="TUNER" :value="state.radioInfo?.tuning ? 'TUNING' : 'IDLE'" :active="state.radioInfo?.tuning" />
        <StatusBadge label="RECORD" :value="state.radioInfo?.recording ? 'ON' : (state.radioInfo?.playing ? 'PLAY' : 'OFF')" :active="state.radioInfo?.recording || state.radioInfo?.playing" />
      </section>

      <!-- ── TX Audio Grid ── -->
      <section class="status-section">
        <StatusBadge label="MIC GAIN" :value="state.micGain != null ? String(state.micGain) : '--'" />
        <StatusBadge label="AMC" :value="state.amcLevel != null ? String(state.amcLevel) : '--'" />
        <StatusBadge label="SPEECH PROC" :value="speechProcLabel" :active="state.speechProc === true" color-active="#f59e0b" />
        <StatusBadge label="PROC LEVEL" :value="state.speechProcLevel != null ? (state.speechProcLevel === 0 ? 'OFF' : String(state.speechProcLevel)) : '--'" />
        <StatusBadge label="VOX" :value="state.vox != null ? (state.vox ? 'ON' : 'OFF') : '--'" :active="state.vox === true" color-active="#10b981" />
        <StatusBadge label="VOX GAIN" :value="state.voxGain != null ? String(state.voxGain) : '--'" />
      </section>

      <!-- ── Presets ── -->
      <section v-if="presets.length > 0" class="presets-section">
        <div class="presets-header">
          <span class="section-title">Presets</span>
          <span class="presets-hint">Edit <code>cat-presets.json</code> to customize</span>
        </div>
        <div class="presets-grid">
          <PresetButton
            v-for="preset in presets"
            :key="preset.id"
            :preset="preset"
            :connected="state.connected"
            @executed="onPresetExecuted"
          />
        </div>
      </section>

      <!-- ── Manual command input ── -->
      <section class="cmd-section">
        <span class="cmd-label">CAT Command:</span>
        <input
          v-model="manualCmd"
          class="cmd-input"
          placeholder="e.g. FA  or  MD01"
          @keydown.enter="sendManualCommand"
          spellcheck="false"
        />
        <button class="btn btn-primary btn-sm" @click="sendManualCommand">Send</button>
        <span class="cmd-response" v-if="manualResponse">→ {{ manualResponse }}</span>
      </section>
    </main>

    <!-- ── Not connected screen ── -->
    <div v-else class="idle-screen">
      <div class="idle-icon">📡</div>
      <p>Select a serial port and click <strong>Connect</strong> to start.</p>
      <p class="idle-hint">
        On macOS, FTX-1 appears as <code>/dev/cu.SLAB_USBtoUART</code> or similar.<br>
        Default baud rate: <strong>38400</strong> (CAT-1)
      </p>
    </div>

    <footer class="footer">
      <span>Yaesu FTX-1 · CAT Protocol · Last update: {{ lastUpdateTime }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import SMeter from '~/components/SMeter.vue'
import StatusBadge from '~/components/StatusBadge.vue'
import PresetButton from '~/components/PresetButton.vue'

// ----------- state -----------

interface PortInfo {
  path: string
  manufacturer?: string
}

interface RadioInfo {
  hiSwr: boolean
  recording: boolean
  playing: boolean
  tx: boolean
  txInhibit: boolean
  tuning: boolean
  scanning: boolean
  squelchOpen: boolean
}

interface TransceiverState {
  connected: boolean
  port: string | null
  baudRate: number
  autoInfo: boolean
  mainFreq: number | null
  subFreq: number | null
  mainMode: string | null
  subMode: string | null
  mainSmeter: number | null
  subSmeter: number | null
  txState: boolean
  mox: boolean
  split: boolean
  agcMain: string | null
  rfGainMain: number | null
  afGainMain: number | null
  agcSub: string | null
  rfGainSub: string | null
  afGainSub: string | null
  powerLevel: number | null
  radioInfo: RadioInfo | null
  amcLevel: number | null
  micGain: number | null
  speechProc: boolean | null
  speechProcLevel: number | null
  vox: boolean | null
  voxGain: number | null
  lastUpdate: number
  error: string | null
}

const defaultState = (): TransceiverState => ({
  connected: false,
  port: null,
  baudRate: 38400,
  autoInfo: false,
  mainFreq: null,
  subFreq: null,
  mainMode: null,
  subMode: null,
  mainSmeter: null,
  subSmeter: null,
  txState: false,
  mox: false,
  split: false,
  agcMain: null,
  rfGainMain: null,
  afGainMain: null,
  agcSub: null, 
  rfGainSub: null, 
  afGainSub: null,
  powerLevel: null,
  radioInfo: null,
  amcLevel: null,
  micGain: null,
  speechProc: null,
  speechProcLevel: null,
  vox: null,
  voxGain: null,
  lastUpdate: Date.now(),
  error: null,
})

interface Preset {
  id: string
  label: string
  color?: string
  icon?: string
  description?: string
  commands: string[]
}

interface CommandResult {
  command: string
  response?: string
  error?: string
  ok: boolean
}

const state = ref<TransceiverState>(defaultState())
const ports = ref<PortInfo[]>([])
const selectedPort = ref('')
const selectedBaud = ref(38400)
const connecting = ref(false)
const lastError = ref<string | null>(null)
const manualCmd = ref('')
const manualResponse = ref('')
const presets = ref<Preset[]>([])
let eventSource: EventSource | null = null

// ----------- computed -----------

const lastUpdateTime = computed(() => {
  if (!state.value.connected) return '--'
  const d = new Date(state.value.lastUpdate)
  return d.toLocaleTimeString()
})

const speechProcLabel = computed(() => {
  if (state.value.speechProc === null) return '--'
  return state.value.speechProc ? 'ON' : 'OFF'
})

// ----------- helpers -----------

function formatFreq(hz: number | null): string {
  if (hz == null) return '---.---.---'
  const mhz = hz / 1_000_000
  // Format as XXX.XXX.XXX
  const [intPart, decPart = ''] = mhz.toFixed(6).split('.')
  const d = decPart.padEnd(6, '0')
  return `${intPart.padStart(3, ' ')}.${d.slice(0, 3)}.${d.slice(3)}`
}

const MODE_COLORS: Record<string, string> = {
  LSB: '#3b82f6',
  USB: '#8b5cf6',
  'CW-U': '#f59e0b',
  'CW-L': '#f59e0b',
  FM: '#10b981',
  'FM-N': '#10b981',
  AM: '#ef4444',
  'AM-N': '#ef4444',
  'RTTY-L': '#ec4899',
  'RTTY-U': '#ec4899',
  'DATA-L': '#06b6d4',
  'DATA-U': '#06b6d4',
  PSK: '#a78bfa',
  'C4FM-DN': '#34d399',
  'C4FM-VW': '#34d399',
}

function modeBadgeStyle(mode: string | null) {
  const color = mode ? (MODE_COLORS[mode] ?? '#6b7280') : '#6b7280'
  return { background: color }
}

// ----------- API calls -----------

async function refreshPorts() {
  try {
    const data = await $fetch<{ ports: PortInfo[] }>('/api/ports')
    ports.value = data.ports
    if (!selectedPort.value && data.ports.length > 0) {
      selectedPort.value = data.ports[0].path
    }
  } catch (e: any) {
    lastError.value = e.message ?? 'Failed to list ports'
  }
}

async function toggleConnection() {
  if (state.value.connected) {
    connecting.value = true
    try {
      stopEventSource()
      await $fetch('/api/disconnect', { method: 'POST' })
      state.value = defaultState()
    } catch (e: any) {
      lastError.value = e.message
    } finally {
      connecting.value = false
    }
  } else {
    if (!selectedPort.value) {
      lastError.value = 'Please select a port first'
      return
    }
    connecting.value = true
    try {
      const data = await $fetch<{ ok: boolean; state: TransceiverState }>('/api/connect', {
        method: 'POST',
        body: { port: selectedPort.value, baudRate: selectedBaud.value },
      })
      state.value = data.state
      startEventSource()
    } catch (e: any) {
      lastError.value = e.message ?? 'Connection failed'
    } finally {
      connecting.value = false
    }
  }
}

/** One-shot status fetch — used after manual commands/presets for immediate feedback. */
async function pollStatus() {
  try {
    const data = await $fetch<TransceiverState>('/api/status')
    state.value = data
  } catch {
    // ignore transient errors
  }
}

/**
 * Open a Server-Sent Events connection to the serial server.
 * The server pushes state updates whenever the transceiver sends an AI response
 * or the S-meter / params polls complete — no client-side interval required.
 */
function startEventSource() {
  stopEventSource()
  const config = useRuntimeConfig()
  const es = new EventSource(config.public.serialEventsUrl)

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as TransceiverState
      state.value = data
      if (!data.connected) stopEventSource()
    } catch { /* malformed frame */ }
  }

  es.onerror = () => {
    // EventSource reconnects automatically; nothing to do here.
    // If the transceiver was disconnected the server will push connected:false
    // which will close the EventSource via the onmessage handler.
  }

  eventSource = es
}

function stopEventSource() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

async function loadPresets() {
  try {
    const data = await $fetch<{ presets: Preset[] }>('/api/presets')
    presets.value = data.presets
  } catch {
    // Presets are optional — silently ignore if config file is missing
  }
}

function onPresetExecuted(results: CommandResult[]) {
  pollStatus()
}

async function sendManualCommand() {
  const cmd = manualCmd.value.trim()
  if (!cmd) return
  try {
    const data = await $fetch<{ response: string; state: TransceiverState }>('/api/command', {
      method: 'POST',
      body: { command: cmd },
    })
    manualResponse.value = data.response
    state.value = data.state
  } catch (e: any) {
    lastError.value = e.message
  }
}

// ----------- lifecycle -----------

onMounted(async () => {
  await Promise.all([refreshPorts(), loadPresets()])
  // Sync with server state (e.g. after page reload while transceiver is already connected)
  const s = await $fetch<TransceiverState>('/api/status')
  state.value = s
  if (s.connected) startEventSource()
})

onUnmounted(() => {
  stopEventSource()
})
</script>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0d1117;
  --surface: #161b22;
  --surface2: #21262d;
  --border: #30363d;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --accent: #58a6ff;
  --green: #3fb950;
  --red: #f85149;
  --yellow: #d29922;
  --radius: 8px;
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  min-height: 100vh;
}

.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ── Header ── */
.header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.header-brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-shrink: 0;
}

.brand-logo {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--accent);
  font-family: var(--font-mono);
}

.brand-sub {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.conn-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
  flex-wrap: wrap;
}

.sel {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--radius);
  padding: 5px 10px;
  font-size: 13px;
  flex: 1;
  min-width: 160px;
  cursor: pointer;
}

.sel:disabled { opacity: 0.5; cursor: default; }
.baud-sel { flex: 0 0 90px; min-width: 90px; }

.btn {
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .15s;
  white-space: nowrap;
}

.btn:disabled { opacity: 0.5; cursor: default; }
.btn-primary { background: var(--accent); color: #0d1117; }
.btn-danger { background: var(--red); color: #fff; }
.btn-ghost { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
.btn-sm { padding: 4px 10px; font-size: 12px; }

.conn-status {
  font-size: 12px;
  font-family: var(--font-mono);
  padding: 4px 10px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}

.status-ok { background: rgba(63,185,80,.15); color: var(--green); }
.status-off { background: rgba(139,148,158,.1); color: var(--text-muted); }

/* ── Error banner ── */
.error-banner {
  background: rgba(248,81,73,.12);
  border-bottom: 1px solid var(--red);
  color: var(--red);
  padding: 8px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.close-btn {
  background: none;
  border: none;
  color: var(--red);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}

/* ── Dashboard ── */
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  flex: 1;
}

/* ── TX indicator ── */
.tx-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  border-radius: var(--radius);
  background: var(--surface2);
  border: 1px solid var(--border);
  width: fit-content;
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--green);
  transition: all .2s;
}

.tx-indicator.tx-active {
  background: rgba(248,81,73,.15);
  border-color: var(--red);
  color: var(--red);
  box-shadow: 0 0 16px rgba(248,81,73,.3);
}

.swr-alarm {
  font-size: 13px;
  font-weight: 700;
  background: var(--red);
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  animation: blink 1s infinite;
}

@keyframes blink {
  50% { opacity: .4; }
}

/* ── VFO section ── */
.vfo-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 720px) {
  .vfo-section { grid-template-columns: 1fr; }
}

.vfo-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
}

.main-card { border-left: 3px solid var(--accent); }
.sub-card { border-left: 3px solid #8b5cf6; }

.vfo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.vfo-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-muted);
  font-weight: 600;
}

.mode-badge {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  color: #fff;
  letter-spacing: 0.5px;
}

.freq-display {
  font-family: var(--font-mono);
  font-size: 42px;
  font-weight: 300;
  letter-spacing: 2px;
  color: #e6edf3;
  line-height: 1;
  transition: color .2s;
  white-space: nowrap;
}

.freq-display.freq-tx { color: var(--red); }
.freq-sub { font-size: 34px; color: #c9d1d9; }

.freq-unit {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-top: 2px;
  margin-bottom: 12px;
}

/* ── Status section ── */
.status-section {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* ── Presets section ── */
.presets-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
}

.presets-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-muted);
}

.presets-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.presets-hint code {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text);
}

.presets-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* ── Manual command ── */
.cmd-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 16px;
}

.cmd-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap;
}

.cmd-input {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 5px 10px;
  font-family: var(--font-mono);
  font-size: 13px;
  width: 200px;
}

.cmd-input:focus { outline: 2px solid var(--accent); }

.cmd-response {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--green);
  padding: 3px 8px;
  background: rgba(63,185,80,.08);
  border-radius: 4px;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Idle screen ── */
.idle-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  text-align: center;
  padding: 40px;
}

.idle-icon { font-size: 64px; line-height: 1; }
.idle-screen p { font-size: 15px; line-height: 1.6; }
.idle-hint { font-size: 13px; }
.idle-hint code {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: var(--font-mono);
  color: var(--text);
}

/* ── Footer ── */
.footer {
  padding: 8px 20px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}
</style>

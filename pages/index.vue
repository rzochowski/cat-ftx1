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

      <!-- TX/RX Indicator + FUNC KNOB row -->
      <div class="txbar">
        <div class="btns">
            <button
              class="btn tx-indicator power-off"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('PS0')"
              title="POWER OFF"
            >POWER OFF</button>
        </div>
        
        <div class="tx-indicator" :class="{ 'tx-active': state.txState || state.mox }">
          <span>{{ (state.txState || state.mox) ? 'TX' : 'RX' }}</span>
          <span v-if="state.radioInfo?.hiSwr" class="swr-alarm">HI-SWR!</span>
        </div>

        <div class="func-knob-widget">
          <span class="func-knob-label">FUNC KNOB</span>:
          <span class="func-knob-value">{{ state.funcKnob ?? '--' }}</span>
          <div class="func-knob-btns">
            <button
              class="btn btn-ghost btn-sm"
              :class="{ 'btn-active': state.funcKnob === 'D-LEVEL' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF01')"
              title="Ustaw FUNC KNOB → D-LEVEL"
            >D-LEVEL</button>
            <button
              class="btn btn-ghost btn-sm"
              :class="{ 'btn-active': state.funcKnob === 'RF POWER' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF0D')"
              title="Ustaw FUNC KNOB → RF POWER"
            >RF POWER</button>
            <button
              class="btn btn-ghost btn-sm"
              :class="{ 'btn-active': state.funcKnob === 'MIC GAIN' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF07')"
              title="Ustaw FUNC KNOB → MIC GAIN"
            >MIC GAIN</button>
            <button
              class="btn btn-ghost btn-sm"
              :class="{ 'btn-active': state.funcKnob === 'AMC LEVEL' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF09')"
              title="Ustaw FUNC KNOB → AMC LEVEL"
            >AMC LEVEL</button>
            <button
              class="btn btn-ghost btn-sm"
              :class="{ 'btn-active': state.funcKnob === 'PROC LEVEL' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF08')"
              title="Ustaw FUNC KNOB → PROC LEVEL"
            >PROC LEVEL</button>
            <button
              class="btn btn-ghost btn-sm"
              :class="{ 'btn-active': state.funcKnob === 'VOX GAIN' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF0A')"
              title="Ustaw FUNC KNOB → VOX GAIN"
            >VOX GAIN</button>
          </div>
        </div>
      </div>
    
      <!-- ── VFO Section ── -->
      <section class="vfo-section">
        <!-- MAIN VFO -->
        <div class="vfo-card main-card"
          :class="{
            'vfo-card--tx-vfo':   state.txVfo === 0,
            'vfo-card--inactive': state.rxMode === 'single' && state.txVfo === 1,
          }"
        >
          <div class="vfo-header">
            <span class="vfo-label">MAIN</span>
            <span v-if="state.txVfo === 0" class="tx-vfo-badge">TX VFO</span>
            <select
              class="band-sel"
              :value="mainBandCode ?? ''"
              :disabled="bandBusy || state.txState || state.mox"
              @change="selectBand('0', ($event.target as HTMLSelectElement).value)"
            >
              <option value="" disabled>band…</option>
              <option v-for="b in BANDS" :key="b.code" :value="b.code">{{ b.label }}</option>
            </select>
            <select
              class="mode-sel"
              :style="modeBadgeStyle(state.mainMode)"
              :value="state.mainMode ?? ''"
              :disabled="modeBusy || state.txState || state.mox"
              @change="selectMode('0', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!state.mainMode" value="" disabled>--</option>
              <option v-for="m in MODES" :key="m.code" :value="m.label">{{ m.label }}</option>
            </select>
          </div>
          <div class="freq-row">
            <div class="freq-display" :class="{ 'freq-tx': state.txState || state.mox }">
              {{ formatFreq(state.mainFreq) }}
            </div>
            <span class="freq-unit">MHz</span>
            <div v-if="isFmMode(state.mainMode) && state.mainSqlType !== null && state.mainSqlType !== 0" class="sql-row">
              <span class="sql-badge" :style="{ background: sqlTypeColor(state.mainSqlType) + '28', borderColor: sqlTypeColor(state.mainSqlType), color: sqlTypeColor(state.mainSqlType) }">
                {{ sqlTypeLabel(state.mainSqlType) }}
                <span v-if="toneDisplay(state.mainSqlType, state.mainCtcssTone, state.mainDcsCode)" class="sql-tone">{{ toneDisplay(state.mainSqlType, state.mainCtcssTone, state.mainDcsCode) }}
                </span>
              </span>
            </div>
          </div>
          <SMeter :value="state.mainSmeter" label="MAIN S-meter" />
          <LevelBar :value="state.afGainMain" label="VOLUME" color="linear-gradient(90deg,#a60f0f,#c60f0f)" />
          <LevelBar v-if="isRfGainMode(state.mainMode)" :value="state.rfGainMain" label="RF GAIN" color="linear-gradient(90deg,#f59e0b,#fcd34d)" />
          <LevelBar v-else :value="state.sqMain" label="SQUELCH" color="linear-gradient(90deg,#f59e0b,#fcd34d)" />
          <br/>
          <section class="status-section">
            <StatusBadge label="AGC" :value="state.agcMain ?? '--'" />
            <StatusBadge label="DNR" :value="state.dnrMain != null ? String(state.dnrMain) : '--'" />
          </section>
        </div>

        <!-- SUB VFO -->
        <div class="vfo-card sub-card"
          :class="{
            'vfo-card--tx-vfo':   state.txVfo === 1,
            'vfo-card--inactive': state.rxMode === 'single' && state.txVfo === 0,
          }"
        >
          <div class="vfo-header">
            <span class="vfo-label">SUB</span>
            <span v-if="state.txVfo === 1" class="tx-vfo-badge">TX VFO</span>
            <select
              class="band-sel"
              :value="subBandCode ?? ''"
              :disabled="bandBusy || state.txState || state.mox"
              @change="selectBand('1', ($event.target as HTMLSelectElement).value)"
            >
              <option value="" disabled>pasmo…</option>
              <option v-for="b in BANDS" :key="b.code" :value="b.code">{{ b.label }}</option>
            </select>
            <select
              class="mode-sel"
              :style="modeBadgeStyle(state.subMode)"
              :value="state.subMode ?? ''"
              :disabled="modeBusy || state.txState || state.mox"
              @change="selectMode('1', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!state.subMode" value="" disabled>--</option>
              <option v-for="m in MODES" :key="m.code" :value="m.label">{{ m.label }}</option>
            </select>
          </div>
          <div class="freq-row">
            <div class="freq-display freq-sub">
              {{ formatFreq(state.subFreq) }}
            </div>
            <span class="freq-unit">MHz</span>
            <div v-if="isFmMode(state.subMode) && state.subSqlType !== null && state.subSqlType !== 0" class="sql-row">
            <span class="sql-badge" :style="{ background: sqlTypeColor(state.subSqlType) + '28', borderColor: sqlTypeColor(state.subSqlType), color: sqlTypeColor(state.subSqlType) }">
              {{ sqlTypeLabel(state.subSqlType) }}
              <span v-if="toneDisplay(state.subSqlType, state.subCtcssTone, state.subDcsCode)" class="sql-tone">
              {{ toneDisplay(state.subSqlType, state.subCtcssTone, state.subDcsCode) }}
            </span>
            </span>
            </div>
          </div>
          <SMeter :value="state.subSmeter" label="SUB S-meter" />
          <LevelBar :value="state.afGainSub" label="VOLUME" color="linear-gradient(90deg,#3b82f6,#60a5fa)" />
          <LevelBar v-if="isRfGainMode(state.subMode)" :value="state.rfGainSub" label="RF GAIN" color="linear-gradient(90deg,#f59e0b,#fcd34d)" />
          <LevelBar v-else :value="state.sqSub" label="SQUELCH" color="linear-gradient(90deg,#f59e0b,#fcd34d)" />
          <br/>
          <section class="status-section">
            <StatusBadge label="AGC" :value="state.agcSub ?? '--'" />
            <StatusBadge label="DNR" :value="state.dnrSub != null ? String(state.dnrSub) : '--'" />
          </section>
        </div>
      </section>

      <!-- ── Status Grid ── -->
      <section class="status-section">
        <StatusBadge label="SPLIT" :value="state.split ? 'ON' : 'OFF'" :active="state.split" :clickable="true" :busy="splitBusy" @toggle="toggleSplit" />
        <StatusBadge label="MOX" :value="state.mox ? 'ON' : 'OFF'" :active="state.mox" color-active="#ef4444" :clickable="true" :busy="moxBusy" @toggle="toggleMox" />
        <StatusBadge label="LOCK" :value="state.lock != null ? (state.lock ? 'ON' : 'OFF') : '--'" :active="state.lock === true" color-active="#f59e0b" :clickable="state.lock !== null" :busy="lockBusy" @toggle="toggleLock" />
        <StatusBadge label="PWR" :value="state.powerLevel != null ? state.powerLevel + ' W' : '--'" />
        <StatusBadge label="SCAN" :value="state.radioInfo?.scanning ? 'ON' : 'OFF'" :active="state.radioInfo?.scanning" />
        <!-- StatusBadge label="SQL" :value="state.radioInfo?.squelchOpen ? 'OPEN' : 'CLOSED'" :active="state.radioInfo?.squelchOpen" color-active="#22d3ee" / -->
        <StatusBadge label="TUNER" :value="state.radioInfo?.tuning ? 'TUNING' : 'IDLE'" :active="state.radioInfo?.tuning" />
        <StatusBadge label="ATT" :value="state.rfAttenuator ? 'ON' : 'OFF'" :active="state.rfAttenuator" />
        <StatusBadge label="RECORD" :value="state.radioInfo?.recording ? 'ON' : (state.radioInfo?.playing ? 'PLAY' : 'OFF')" :active="state.radioInfo?.recording || state.radioInfo?.playing" />
        <StatusBadge label="MIC GAIN" :value="state.micGain != null ? String(state.micGain) : '--'" />
        <StatusBadge label="AMC" :value="state.amcLevel != null ? String(state.amcLevel) : '--'" />
        <StatusBadge label="SPEECH PROC" :value="speechProcLabel" :active="state.speechProc === true" color-active="#f59e0b" :clickable="state.speechProc !== null" :busy="speechProcBusy" @toggle="toggleSpeechProc" />
        <StatusBadge label="PROC LEVEL" :value="state.speechProcLevel != null ? (state.speechProcLevel === 0 ? 'OFF' : String(state.speechProcLevel)) : '--'" />
        <StatusBadge label="VOX" :value="state.vox != null ? (state.vox ? 'ON' : 'OFF') : '--'" :active="state.vox === true" color-active="#10b981" :clickable="state.vox !== null" :busy="voxBusy" @toggle="toggleVox" />
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
import LevelBar from '~/components/LevelBar.vue'
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
  lock: boolean | null
  agcMain: string | null
  rfGainMain: number | null
  afGainMain: number | null
  sqMain: number | null
  agcSub: string | null
  rfGainSub: string | null
  afGainSub: number | null
  sqSub: number | null
  powerLevel: number | null
  radioInfo: RadioInfo | null
  amcLevel: number | null
  micGain: number | null
  speechProc: boolean | null
  speechProcLevel: number | null
  funcKnob: string | null
  vox: boolean | null
  voxGain: number | null
  txVfo: 0 | 1 | null
  rxMode: 'dual' | 'single' | null
  mainSqlType: number | null
  subSqlType: number | null
  mainCtcssTone: number | null
  subCtcssTone: number | null
  mainDcsCode: number | null
  subDcsCode: number | null
  dnrMain: string | null
  dnrSub: string | null
  rfAttenuator: boolean
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
  lock: null,
  agcMain: null,
  rfGainMain: null,
  afGainMain: null,
  sqMain: null,
  agcSub: null,
  rfGainSub: null,
  afGainSub: null,
  sqSub: null,
  powerLevel: null,
  radioInfo: null,
  amcLevel: null,
  micGain: null,
  speechProc: null,
  speechProcLevel: null,
  funcKnob: null,
  vox: null,
  voxGain: null,
  txVfo: null,
  rxMode: null,
  mainSqlType: null, subSqlType: null,
  mainCtcssTone: null, subCtcssTone: null,
  mainDcsCode: null, subDcsCode: null,
  dnrMain: null,
  dnrSub: null,
  rfAttenuator: false,
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
const funcKnobBusy = ref(false)
const speechProcBusy = ref(false)
const voxBusy = ref(false)
const splitBusy = ref(false)
const moxBusy = ref(false)
const lockBusy = ref(false)
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

// ----------- band data -----------

const BANDS = [
  { code: '00', label: '1.8 MHz',   freqMin:   1_800_000, freqMax:   2_000_000 },
  { code: '01', label: '3.5 MHz',   freqMin:   3_500_000, freqMax:   4_000_000 },
  { code: '02', label: '5 MHz',     freqMin:   5_000_000, freqMax:   5_500_000 },
  { code: '03', label: '7 MHz',     freqMin:   7_000_000, freqMax:   7_300_000 },
  { code: '04', label: '10 MHz',    freqMin:  10_000_000, freqMax:  10_200_000 },
  { code: '05', label: '14 MHz',    freqMin:  14_000_000, freqMax:  14_400_000 },
  { code: '06', label: '18 MHz',    freqMin:  18_000_000, freqMax:  18_200_000 },
  { code: '07', label: '21 MHz',    freqMin:  21_000_000, freqMax:  21_500_000 },
  { code: '08', label: '24.5 MHz',  freqMin:  24_500_000, freqMax:  25_000_000 },
  { code: '09', label: '28 MHz',    freqMin:  28_000_000, freqMax:  30_000_000 },
  { code: '10', label: '50 MHz',    freqMin:  50_000_000, freqMax:  54_000_000 },
  { code: '11', label: '70 MHz/GEN',freqMin:  70_000_000, freqMax: 108_000_000 },
  { code: '12', label: 'AIR',       freqMin: 108_000_000, freqMax: 144_000_000 },
  { code: '13', label: '144 MHz',   freqMin: 144_000_000, freqMax: 148_000_000 },
  { code: '14', label: '430 MHz',   freqMin: 430_000_000, freqMax: 450_000_000 },
] as const

function freqToBandCode(hz: number | null): string | null {
  if (!hz) return null
  return BANDS.find(b => hz >= b.freqMin && hz < b.freqMax)?.code ?? null
}

const mainBandCode = computed(() => freqToBandCode(state.value.mainFreq))
const subBandCode  = computed(() => freqToBandCode(state.value.subFreq))

const bandBusy = ref(false)

async function selectBand(vfo: '0' | '1', code: string) {
  if (bandBusy.value || !code) return
  bandBusy.value = true
  try {
    // BS P1 P2 P2 ; — P1=0 main / 1 sub, P2P2=2-digit band code (zero-padded)
    const data = await $fetch<{ response: string; state: TransceiverState }>('/api/command', {
      method: 'POST',
      body: { command: `BS${vfo}${code}` },
    })
    state.value = data.state
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    bandBusy.value = false
  }
}

// ----------- CTCSS / DCS lookup -----------

/** CTCSS tone frequencies (Hz) indexed 0–49, per FTX-1 Table 1 */
const CTCSS_TONES: readonly number[] = [
   67.0,  69.3,  71.9,  74.4,  77.0,  79.7,  82.5,  85.4,  88.5,  91.5,
   94.8,  97.4, 100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3,
  131.8, 136.5, 141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5, 167.9,
  171.3, 173.8, 177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5,
  203.5, 206.5, 210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1,
]

/** DCS codes indexed 0–103, per FTX-1 Table 2 */
const DCS_CODES: readonly number[] = [
   23,  25,  26,  31,  32,  36,  43,  47,  51,  53,  54,  65,  71,  72,  73,
   74, 114, 115, 116, 122, 125, 131, 132, 134, 143, 145, 152, 155, 156, 162,
  165, 172, 174, 205, 212, 223, 225, 226, 243, 244, 245, 246, 251, 252, 255,
  261, 263, 265, 266, 271, 274, 306, 311, 315, 325, 331, 332, 343, 346, 351,
  356, 364, 365, 371, 411, 412, 413, 423, 431, 432, 445, 446, 452, 454, 455,
  462, 464, 465, 466, 503, 506, 516, 523, 526, 532, 546, 565, 606, 612, 624,
  627, 631, 632, 654, 662, 664, 703, 712, 723, 731, 732, 734, 743, 754,
]

const SQL_TYPE_LABELS: Record<number, string> = {
  0: 'OFF', 1: 'CTCSS ENC', 2: 'CTCSS SQL', 3: 'DCS', 4: 'PR FREQ', 5: 'REV TONE',
}

const SQL_TYPE_COLORS: Record<number, string> = {
  0: '#6b7280',
  1: '#22d3ee', 2: '#22d3ee',   // CTCSS — cyan
  3: '#a78bfa',                  // DCS   — purple
  4: '#f59e0b', 5: '#f59e0b',   // special — amber
}

const FM_MODES = new Set(['FM', 'FM-N', 'DATA-FM', 'DATA-FM-N'])

function isFmMode(mode: string | null): boolean {
  return mode != null && FM_MODES.has(mode)
}

const RF_GAIN_MODES = new Set(['LSB', 'USB', 'CW-U', 'CW-L', 'RTTY-L', 'RTTY-U', 'DATA-L', 'DATA-U', 'PSK'])

function isRfGainMode(mode: string | null): boolean {
  return mode != null && RF_GAIN_MODES.has(mode)
}

/** Human-readable SQL type label */
function sqlTypeLabel(type: number | null): string {
  return type != null ? (SQL_TYPE_LABELS[type] ?? String(type)) : '--'
}

/** CSS color for the SQL type badge */
function sqlTypeColor(type: number | null): string {
  return type != null ? (SQL_TYPE_COLORS[type] ?? '#6b7280') : '#6b7280'
}

/**
 * Returns the tone/code string to display next to the SQL type.
 * For CTCSS: "127.3 Hz"; for DCS: "D156"; for type 0 (OFF): null.
 */
function toneDisplay(
  sqlType: number | null,
  ctcssTone: number | null,
  dcsCode: number | null,
): string | null {
  if (sqlType === null || sqlType === 0) return null
  if (sqlType === 3) {
    // DCS
    if (dcsCode === null || dcsCode < 0 || dcsCode >= DCS_CODES.length) return null
    return `D${String(DCS_CODES[dcsCode]).padStart(3, '0')}`
  }
  // CTCSS (types 1, 2, 4, 5) — type 4/5 may also use the stored CTCSS tone
  if (ctcssTone !== null && ctcssTone >= 0 && ctcssTone < CTCSS_TONES.length) {
    return `${CTCSS_TONES[ctcssTone].toFixed(1)} Hz`
  }
  return null
}

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

// MD command mode list: { code: CAT hex char, label: mode name }
const MODES = [
  { code: '0', label: 'AMS' },
  { code: '1', label: 'LSB' },
  { code: '2', label: 'USB' },
  { code: '3', label: 'CW-U' },
  { code: '7', label: 'CW-L' },
  { code: '5', label: 'AM' },
  { code: 'D', label: 'AM-N' },
  { code: '4', label: 'FM' },
  { code: 'B', label: 'FM-N' },
  { code: '6', label: 'RTTY-L' },
  { code: '9', label: 'RTTY-U' },
  { code: '8', label: 'DATA-L' },
  { code: 'C', label: 'DATA-U' },
  { code: 'A', label: 'DATA-FM' },
  { code: 'F', label: 'DATA-FM-N' },
  { code: 'E', label: 'PSK' },
  { code: 'H', label: 'C4FM-DN' },
  { code: 'I', label: 'C4FM-VW' },
] as const

const modeBusy = ref(false)

async function selectMode(vfo: '0' | '1', label: string) {
  if (modeBusy.value || !label) return
  const entry = MODES.find(m => m.label === label)
  if (!entry) return
  modeBusy.value = true
  try {
    // MD P1 P2 ; — P1=0 main / 1 sub, P2=mode code
    await $fetch('/api/command', { method: 'POST', body: { command: `MD${vfo}${entry.code}` } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    modeBusy.value = false
  }
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
      const msg = JSON.parse(e.data) as (TransceiverState & { _delta?: true })
      if (msg._delta) {
        // Delta frame — merge only the changed fields into the current state.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _delta, ...changes } = msg
        state.value = { ...state.value, ...(changes as Partial<TransceiverState>) }
        if (changes.connected === false) stopEventSource()
      } else {
        // Full-state frame (sent on initial connect / reconnect).
        state.value = msg as TransceiverState
        if (!msg.connected) stopEventSource()
      }
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
  //pollStatus()
}

async function toggleSpeechProc() {
  if (speechProcBusy.value || state.value.speechProc === null) return
  speechProcBusy.value = true
  try {
    // PR P1 P2 ; — P1=0 (Speech Processor), P2: 1=OFF, 2=ON
    const cmd = state.value.speechProc ? 'PR01' : 'PR02'
    const data = await $fetch<{ response: string; state: TransceiverState }>('/api/command', {
      method: 'POST',
      body: { command: cmd },
    })
    state.value = data.state
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    speechProcBusy.value = false
  }
}

async function toggleVox() {
  if (voxBusy.value || state.value.vox === null) return
  voxBusy.value = true
  try {
    // VX P1 ; — P1: 0=OFF, 1=ON
    const cmd = state.value.vox ? 'VX0' : 'VX1'
    const data = await $fetch<{ response: string; state: TransceiverState }>('/api/command', {
      method: 'POST',
      body: { command: cmd },
    })
    state.value = data.state
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    voxBusy.value = false
  }
}

async function toggleLock() {
  if (lockBusy.value || state.value.lock === null) return
  lockBusy.value = true
  try {
    // LK P1 ; — P1: 0=OFF, 1=ON
    const cmd = state.value.lock ? 'LK0' : 'LK1'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    lockBusy.value = false
  }
}

async function toggleMox() {
  if (moxBusy.value) return
  moxBusy.value = true
  try {
    // MX P1 ; — P1: 0=OFF, 1=ON
    const cmd = state.value.mox ? 'MX0' : 'MX1'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    moxBusy.value = false
  }
}

async function toggleSplit() {
  if (splitBusy.value) return
  splitBusy.value = true
  try {
    // ST P1 ; — P1: 0=OFF, 1=ON
    const cmd = state.value.split ? 'ST0' : 'ST1'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    splitBusy.value = false
  }
}

async function setFuncKnob(cmd: string) {
  if (funcKnobBusy.value) return
  funcKnobBusy.value = true
  try {
    const data = await $fetch<{ response: string; state: TransceiverState }>('/api/command', {
      method: 'POST',
      body: { command: cmd },
    })
    state.value = data.state
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    funcKnobBusy.value = false
  }
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

.tx-indicator.power-off {
  background: rgba(248,81,73,.15);
  color: var(--red);
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

/* TX VFO — left accent turns red, subtle glow */
.vfo-card--tx-vfo {
  border-left-color: var(--red) !important;
  box-shadow: inset 0 0 0 1px rgba(248, 81, 73, .12);
}

/* Single-receive inactive VFO — greyed out, non-interactive */
.vfo-card--inactive {
  opacity: .35;
  filter: grayscale(.4);
  pointer-events: none;
  user-select: none;
}

/* TX VFO badge in the card header */
.tx-vfo-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--red);
  background: rgba(248, 81, 73, .15);
  border: 1px solid rgba(248, 81, 73, .4);
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
  flex-shrink: 0;
}

.vfo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.band-sel {
  flex: 1;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 5px;
  padding: 3px 6px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  cursor: pointer;
  min-width: 0;
  transition: border-color .15s;
}

.band-sel:hover:not(:disabled) {
  border-color: var(--accent);
}

.band-sel:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.band-sel:disabled {
  opacity: .45;
  cursor: default;
}

.vfo-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-muted);
  font-weight: 600;
}

.mode-sel {
  background: #6b7280;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 2px 4px;
  cursor: pointer;
  transition: opacity .15s, filter .15s;
  appearance: none;
  -webkit-appearance: none;
  text-align: center;
}

.mode-sel:hover:not(:disabled) {
  filter: brightness(1.15);
}

.mode-sel:focus {
  outline: 2px solid rgba(255,255,255,.5);
  outline-offset: 1px;
}

.mode-sel:disabled {
  opacity: .45;
  cursor: default;
}

.mode-sel option {
  background: #1c2128;
  color: #e6edf3;
  font-weight: 600;
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

.freq-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 12px;
}

.freq-unit {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 2px;
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

/* ── SQL / CTCSS / DCS info row inside VFO card ── */
.sql-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 4px;
}

.sql-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid;
  white-space: nowrap;
}

.sql-tone {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  /*color: var(--text-muted);*/
  color: rgb(234, 211, 238);
}

/* ── TX bar (TX indicator + FUNC KNOB widget) ── */
.txbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.func-knob-widget {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 14px;
  flex-wrap: wrap;
}

.func-knob-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-muted);
  white-space: nowrap;
}

.func-knob-value {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  min-width: 90px;
  white-space: nowrap;
}

.func-knob-btns {
  display: flex;
  gap: 6px;
}

.btn-active {
  background: var(--surface2);
  border-color: var(--accent) !important;
  color: var(--accent) !important;
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

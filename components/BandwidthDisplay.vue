<script setup lang="ts">
import { computed } from 'vue'

// ── Table 5 – Bandwidth Chart (FTX-1 CAT Reference) ────────────────────────
// SH P1 P2; — P1=VFO (0=main, 1=sub), P2=2-digit index.
// The available indices and their Hz values depend on the current mode.
const BW_TABLE: Record<string, number[]> = {
  'LSB':       [300, 300, 400, 600, 850, 1100, 1200, 1500, 1650, 1800, 1950, 2100, 2250, 2400, 2450, 2500, 2600, 2700, 2800, 2900, 3000, 3200, 3500, 4000],
  'USB':       [300, 300, 400, 600, 850, 1100, 1200, 1500, 1650, 1800, 1950, 2100, 2250, 2400, 2450, 2500, 2600, 2700, 2800, 2900, 3000, 3200, 3500, 4000],
  'CW-U':      [50, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 800, 1200, 1400, 1700, 2000, 2400, 3000, 3200, 3500, 4000],
  'CW-L':      [50, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 800, 1200, 1400, 1700, 2000, 2400, 3000, 3200, 3500, 4000],
  'AM':        [0, 0, 9000],
  'AM-N':      [0, 6000],
  'RTTY-L':    [50, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 800, 1200, 1400, 1700, 2000, 2400, 3000, 3200, 3500, 4000],
  'RTTY-U':    [50, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 800, 1200, 1400, 1700, 2000, 2400, 3000, 3200, 3500, 4000],
  'DATA-L':    [50, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 800, 1200, 1400, 1700, 2000, 2400, 3000, 3200, 3500, 4000],
  'DATA-U':    [50, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 800, 1200, 1400, 1700, 2000, 2400, 3000, 3200, 3500, 4000],
  'DATA-FM':   [0, 0, 0, 16000],
  'DATA-FM-N': [0, 0, 9000],
  'PSK':       [50, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 800, 1200, 1400, 1700, 2000, 2400, 3000, 3200, 3500, 4000]
}

// Fixed-bandwidth modes — SH/IS not applicable
const FIXED_BW: Record<string, number> = {
  'FM':       16000,
  'FM-N':     9000,
  'AMS':      9000,
  'C4FM-DN':  9000,
  'C4FM-VW':  9000,
}

// ── IS command: IF Shift ────────────────────────────────────────────────────
const IS_CENTER  = 0
const IS_MAX     = 1200
const IS_HZ_MAX  = 1200   // ±1200 Hz
const IS_STEP    = 20     // ~20 Hz per scroll step

const props = defineProps<{
  mode:      string | null
  bandwidth: number | null   // SH index (0-based)
  shift:     number | null   // IS value -1200 | +1200
}>()

const emit = defineEmits<{
  'update:bandwidth': [index: number]
  'update:shift':    [value: number]
}>()

// ── Derived values ──────────────────────────────────────────────────────────

const bwTable  = computed(() => props.mode ? (BW_TABLE[props.mode]  ?? null) : null)
const fixedBw  = computed(() => props.mode ? (FIXED_BW[props.mode] ?? null) : null)
const isFixed  = computed(() => fixedBw.value !== null)

const bandwidthHz = computed<number | null>(() => {
  if (isFixed.value)  return fixedBw.value
  if (!bwTable.value || props.bandwidth === null) return null
  return bwTable.value[props.bandwidth] ?? null
})

const shiftHz = computed<number | null>(() => {
  if (isFixed.value || props.shift === null) return null
  return Math.round((props.shift - IS_CENTER) * IS_HZ_MAX / (IS_MAX - IS_CENTER))
})

const bandwidthLabel = computed(() => {
  if (bandwidthHz.value === null) return '--'
  const hz = bandwidthHz.value
  if (hz >= 1000) return (hz / 1000).toFixed(hz % 1000 === 0 ? 1 : 2) + 'k'
  return hz + 'Hz'
})

const shiftLabel = computed(() => {
  if (shiftHz.value === null) return '--'
  const hz = shiftHz.value
  if (hz === 0) return '±0'
  return (hz > 0 ? '+' : '') + hz + 'Hz'
})

// ── Visual passband bar ─────────────────────────────────────────────────────
// The bar represents the frequency range around the carrier.
// For non-AM modes the window is ±IS_HZ_MAX + half bandwidth on each side.
// For AM the bar spans the full bandwidth with no shift.

const visHalfRange = computed(() => {
  if (isFixed.value) return (13000 ?? 8000) / 2 * 1.1
  const bw = bandwidthHz.value ?? 3400
  return Math.max(IS_HZ_MAX + bw / 2, bw * 0.75) * 1.15
})

const passbandStyle = computed(() => {
  const bw = bandwidthHz.value
  const sh = isFixed.value ? 0 : (shiftHz.value ?? 0)
  if (bw === null) return { display: 'none' }

  const total = visHalfRange.value * 2
  const left  = ((sh - bw / 2) + visHalfRange.value) / total * 100
  const width = bw / total * 100

  return {
    left:  Math.max(0, left).toFixed(2) + '%',
    width: Math.min(100 - Math.max(0, left), width).toFixed(2) + '%',
  }
})

// ── Wheel handlers ──────────────────────────────────────────────────────────

function onBwWheel(e: WheelEvent) {
  if (isFixed.value || !bwTable.value || props.bandwidth === null) return
  const dir  = e.deltaY < 0 ? 1 : -1
  const next = Math.max(0, Math.min(bwTable.value.length - 1, props.bandwidth + dir))
  if (next !== props.bandwidth) emit('update:bandwidth', next)
}

function onShiftWheel(e: WheelEvent) {
  if (isFixed.value || props.shift === null) return
  const dir  = e.deltaY < 0 ? 1 : -1
  const next = Math.max(-1200, Math.min(IS_MAX, props.shift + dir * IS_STEP))
  if (next !== props.shift) emit('update:shift', next)
}

function resetShift() {
  if (!isFixed.value) emit('update:shift', IS_CENTER)
}
</script>

<template>
  <div class="bw-display" :class="{ 'bw-display--fixed': isFixed }">
    <!-- Passband visualizer -->
    <div class="bw-bar" @wheel.prevent="onBwWheel" title="Scroll to change bandwidth (SH)">
      <div class="bw-center-mark" />
      <div class="bw-passband" :style="passbandStyle" />
    </div>
    <!-- Values -->
    <div class="bw-vals">
      <span
        class="bw-width"
        @wheel.prevent="onBwWheel"
        title="Scroll: bandwidth (SH)"
      >{{ bandwidthLabel }}</span>
      <span
        class="bw-shift"
        :class="{ 'bw-shift--active': shiftHz !== null && shiftHz !== 0 }"
        @wheel.prevent="onShiftWheel"
        @dblclick="resetShift"
        title="Scroll: shift passband (IS) · dblclick: center"
      >{{ shiftLabel }}</span>
    </div>
    <div class="bw-label">WIDTH&thinsp;/&thinsp;SHIFT</div>
  </div>
</template>

<style scoped>
.bw-display {
  display: flex;
  flex-direction: column;
  align-self: center;
  gap: 3px;
  min-width: 168px;
  max-width: 188px;
  margin-left: 10px;
  opacity: 0.8;
  transition: opacity 0.15s;
}
.bw-display:hover { opacity: 1; }

/* ── Bar ── */
.bw-bar {
  position: relative;
  height: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  cursor: ns-resize;
}

.bw-center-mark {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.18);
  transform: translateX(-50%);
  pointer-events: none;
}

.bw-passband {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgb(181, 150, 94);
  border-left: 1px solid rgba(237, 182, 99, 0.75);
  border-right: 1px solid rgba(237, 182, 99, 0.75);
  border-top: 1px solid rgba(237, 182, 99, 0.75);
  transition: left 0.08s, width 0.08s;
  pointer-events: none;
}

/* ── Values row ── */
.bw-vals {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 4px;
}

.bw-width {
  font-family: var(--font-mono);
  font-size: 14px;
  color: #63b3ed;
  cursor: ns-resize;
  user-select: none;
  white-space: nowrap;
  transition: color 0.1s;
}
.bw-width:hover { color: #90cdf4; }

.bw-shift {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-muted);
  cursor: ns-resize;
  user-select: none;
  white-space: nowrap;
  transition: color 0.1s;
}
.bw-shift:hover { color: #c9d1d9; }
.bw-shift--active { color: #f6c90e; }
.bw-shift--active:hover { color: #fde68a; }

/* ── Label ── */
.bw-label {
  font-size: 8px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  text-align: center;
  opacity: 0.55;
  pointer-events: none;
}

/* Fixed-bandwidth modes: dim interactive elements */
.bw-display--fixed .bw-bar,
.bw-display--fixed .bw-width,
.bw-display--fixed .bw-shift {
  cursor: default;
  opacity: 0.55;
}
</style>

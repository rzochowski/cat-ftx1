<template>
  <div class="smeter">
    <div class="smeter-label">{{ label }}</div>

    <div class="smeter-bar-bg">
      <div
        ref="barFill"
        class="smeter-bar-fill"
      />

      <div class="smeter-ticks">
        <span
          v-for="t in ticks"
          :key="t.label"
          class="tick"
          :style="{ left: t.pct + '%' }"
        >
          {{ t.label }}
        </span>
      </div>
    </div>

    <div class="smeter-value">
      <span ref="sReadingEl" class="s-reading">--</span>
      <span ref="rawValueEl" class="raw-value">--</span>
    </div>

    <div class="smeter-label smeter-history-label">S-Meter history</div>

    <div
      ref="historyWrap"
      class="smeter-history-wrap"
      :style="{ height: HISTORY_HEIGHT + 'px' }"
    >
      <canvas
        ref="historyCanvas"
        class="smeter-history"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  value: number | null
  label?: string
}>(), {
  label: 'S-meter',
})

type MeterLevel = 'low' | 'mid' | 'high'

const HISTORY_HEIGHT = 50
const HISTORY_STEP = 1
const HISTORY_FPS = 15
const HISTORY_SMOOTHING = 0.35
const METER_FPS = 60
const METER_SMOOTHING = 0.8
const METER_SNAP_DISTANCE = 0.5
const CANVAS_SCALE = 1

const HISTORY_INTERVAL_MS = Math.round(1000 / HISTORY_FPS)
const METER_INTERVAL_MS = Math.round(1000 / METER_FPS)

const S_POINTS = [
  { raw: 0, s: 'S0' },
  { raw: 20, s: 'S1' },
  { raw: 35, s: 'S2' },
  { raw: 50, s: 'S3' },
  { raw: 64, s: 'S4' },
  { raw: 76, s: 'S5' },
  { raw: 92, s: 'S6' },
  { raw: 100, s: 'S7' },
  { raw: 111, s: 'S8' },
  { raw: 123, s: 'S9' },
  { raw: 162, s: '+20' },
  { raw: 198, s: '+40' },
  { raw: 239, s: '+60' },
]

const ticks = S_POINTS.map((p) => ({
  label: p.s,
  pct: (p.raw / 255) * 100,
}))

const barFill = ref<HTMLDivElement | null>(null)
const sReadingEl = ref<HTMLSpanElement | null>(null)
const rawValueEl = ref<HTMLSpanElement | null>(null)
const historyWrap = ref<HTMLDivElement | null>(null)
const historyCanvas = ref<HTMLCanvasElement | null>(null)

let latestValue: number | null = props.value
let displayedValue: number | null | undefined = undefined
let animatedMeterRaw: number | null = null
let displayedBarLevel: MeterLevel | undefined = undefined
let lastRenderedScale: number | undefined = undefined
let smoothedHistoryRaw: number | null = null
let historyContext: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | null = null
let meterTimerId: number | null = null
let historyTimerId: number | null = null
let canvasReady = false
let historyColumns: HTMLCanvasElement[] = []
let historyColumnsWidth = 0
let historyColumnsHeight = 0

const normalizeRaw = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(255, Math.round(value)))
}

const getHistoryRaw = () => {
  const raw = normalizeRaw(latestValue)

  if (raw == null) {
    smoothedHistoryRaw = null
    return null
  }

  if (smoothedHistoryRaw == null) {
    smoothedHistoryRaw = raw
    return raw
  }

  smoothedHistoryRaw += (raw - smoothedHistoryRaw) * HISTORY_SMOOTHING

  return Math.max(0, Math.min(255, Math.round(smoothedHistoryRaw)))
}

const getMeterLevel = (raw: number | null): MeterLevel => {
  const v = raw ?? 0

  if (v < 75) return 'low'
  if (v < 140) return 'mid'

  return 'high'
}

const getBarBackground = (raw: number | null) => {
  const level = getMeterLevel(raw)

  if (level === 'low') return 'linear-gradient(90deg, #22c55e, #86efac)'
  if (level === 'mid') return 'linear-gradient(90deg, #22c55e, #facc15)'

  return 'linear-gradient(90deg, #facc15, #f87171)'
}

const getSReading = (raw: number | null) => {
  if (raw == null) return '--'

  for (let i = S_POINTS.length - 1; i >= 0; i--) {
    if (raw >= S_POINTS[i].raw) return S_POINTS[i].s
  }

  return 'S0'
}

const createColumnGradient = (
  ctx: CanvasRenderingContext2D,
  raw: number,
  y: number,
  height: number,
) => {
  const gradient = ctx.createLinearGradient(0, y, 0, height)
  const level = getMeterLevel(raw)

  if (level === 'low') {
    gradient.addColorStop(0, '#86efac')
    gradient.addColorStop(0.5, '#22c55e')
    gradient.addColorStop(1, '#14532d')
    return gradient
  }

  if (level === 'mid') {
    gradient.addColorStop(0, '#facc15')
    gradient.addColorStop(0.45, '#84cc16')
    gradient.addColorStop(1, '#166534')
    return gradient
  }

  gradient.addColorStop(0, '#f87171')
  gradient.addColorStop(0.4, '#facc15')
  gradient.addColorStop(0.75, '#84cc16')
  gradient.addColorStop(1, '#166534')

  return gradient
}

const preRenderHistoryColumns = (width: number, height: number) => {
  if (
    historyColumns.length === 256 &&
    historyColumnsWidth === width &&
    historyColumnsHeight === height
  ) {
    return
  }

  historyColumns = []
  historyColumnsWidth = width
  historyColumnsHeight = height

  for (let raw = 0; raw <= 255; raw++) {
    const column = document.createElement('canvas')
    column.width = width
    column.height = height

    const ctx = column.getContext('2d', { alpha: false })

    if (!ctx) {
      historyColumns.push(column)
      continue
    }

    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, width, height)

    if (raw > 0) {
      const pct = raw / 255
      const barHeight = Math.max(1, height * pct)
      const y = height - barHeight

      ctx.fillStyle = createColumnGradient(ctx, raw, y, height)
      ctx.fillRect(0, y, width, barHeight)
    }

    historyColumns.push(column)
  }
}

const clearHistory = () => {
  const canvas = historyCanvas.value
  const ctx = historyContext

  if (!canvas || !ctx) return

  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

const prepareCanvas = () => {
  const wrap = historyWrap.value
  const canvas = historyCanvas.value

  if (!wrap || !canvas) return

  const width = Math.max(1, Math.floor(wrap.clientWidth))
  const height = Math.max(1, Math.floor(wrap.clientHeight || HISTORY_HEIGHT))

  const canvasWidth = Math.max(1, Math.floor(width * CANVAS_SCALE))
  const canvasHeight = Math.max(1, Math.floor(height * CANVAS_SCALE))
  const columnWidth = Math.max(1, HISTORY_STEP)

  if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
    canvas.width = canvasWidth
    canvas.height = canvasHeight

    historyContext = canvas.getContext('2d', { alpha: false })

    if (historyContext) {
      historyContext.imageSmoothingEnabled = false
    }

    preRenderHistoryColumns(columnWidth, canvasHeight)
    clearHistory()
  } else if (!historyContext) {
    historyContext = canvas.getContext('2d', { alpha: false })

    if (historyContext) {
      historyContext.imageSmoothingEnabled = false
    }

    preRenderHistoryColumns(columnWidth, canvasHeight)
  }

  canvasReady = true
}

const updateMeterDom = () => {
  const raw = normalizeRaw(latestValue)
  const fill = barFill.value
  const reading = sReadingEl.value
  const rawValue = rawValueEl.value

  if (raw == null) {
    animatedMeterRaw = null
    displayedBarLevel = undefined
    lastRenderedScale = undefined

    if (fill) {
      fill.style.transform = 'scaleX(0)'
      fill.style.background = getBarBackground(null)
    }

    if (displayedValue !== null) {
      displayedValue = null

      if (reading) {
        reading.textContent = '--'
      }

      if (rawValue) {
        rawValue.textContent = '--'
      }
    }

    return
  }

  if (animatedMeterRaw == null) {
    animatedMeterRaw = raw
  } else {
    const diff = raw - animatedMeterRaw

    if (Math.abs(diff) <= METER_SNAP_DISTANCE) {
      animatedMeterRaw = raw
    } else {
      animatedMeterRaw += diff * METER_SMOOTHING
    }
  }

  if (fill) {
    const scale = Math.max(0, Math.min(1, animatedMeterRaw / 255))
    const level = getMeterLevel(raw)

    if (lastRenderedScale == null || Math.abs(lastRenderedScale - scale) > 0.0005) {
      lastRenderedScale = scale
      fill.style.transform = `scaleX(${scale})`
    }

    if (displayedBarLevel !== level) {
      displayedBarLevel = level
      fill.style.background = getBarBackground(raw)
    }
  }

  if (displayedValue === raw) return

  displayedValue = raw

  if (reading) {
    reading.textContent = getSReading(raw)
  }

  if (rawValue) {
    rawValue.textContent = String(raw)
  }
}

const drawHistory = () => {
  const canvas = historyCanvas.value
  const ctx = historyContext

  if (!canvas || !ctx || !canvasReady) return

  const raw = getHistoryRaw()
  const copyWidth = Math.max(0, canvas.width - HISTORY_STEP)
  const drawWidth = canvas.width - copyWidth

  if (copyWidth > 0) {
    ctx.drawImage(
      canvas,
      HISTORY_STEP,
      0,
      copyWidth,
      canvas.height,
      0,
      0,
      copyWidth,
      canvas.height,
    )
  }

  ctx.fillStyle = '#0d1117'
  ctx.fillRect(copyWidth, 0, drawWidth, canvas.height)

  if (raw == null) return

  const column = historyColumns[raw]

  if (!column) return

  ctx.drawImage(
    column,
    0,
    0,
    column.width,
    column.height,
    copyWidth,
    0,
    drawWidth,
    canvas.height,
  )
}

onMounted(() => {
  nextTick(() => {
    prepareCanvas()
    updateMeterDom()
    drawHistory()

    meterTimerId = window.setInterval(updateMeterDom, METER_INTERVAL_MS)
    historyTimerId = window.setInterval(drawHistory, HISTORY_INTERVAL_MS)

    const wrap = historyWrap.value

    if (wrap && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        prepareCanvas()
      })

      resizeObserver.observe(wrap)
    }
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null

  if (meterTimerId != null) {
    clearInterval(meterTimerId)
    meterTimerId = null
  }

  if (historyTimerId != null) {
    clearInterval(historyTimerId)
    historyTimerId = null
  }
})

watch(() => props.value, (value) => {
  latestValue = value
})
</script>

<style scoped>
.smeter {
  margin-top: 8px;
}

.smeter-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #8b949e;
  margin-bottom: 4px;
}

.smeter-history-label {
  margin-top: 1rem;
}

.smeter-bar-bg {
  position: relative;
  height: 12px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 3px;
  overflow: visible;
}

.smeter-bar-fill {
  width: 100%;
  height: 100%;
  border-radius: 3px;
  transform: scaleX(0);
  transform-origin: left center;
  will-change: transform;
  transition: transform 45ms linear;
}

.smeter-ticks {
  position: absolute;
  top: 14px;
  left: 0;
  width: 100%;
  height: 14px;
  pointer-events: none;
}

.tick {
  position: absolute;
  transform: translateX(-50%);
  font-size: 9px;
  color: #6e7681;
  font-family: 'SF Mono', monospace;
  white-space: nowrap;
}

.smeter-value {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 20px;
}

.s-reading {
  font-family: 'SF Mono', monospace;
  font-size: 16px;
  font-weight: 700;
  color: #3fb950;
}

.raw-value {
  font-size: 10px;
  color: #6e7681;
  font-family: monospace;
}

.smeter-history-wrap {
  width: 100%;
  margin-top: 8px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 3px;
  overflow: hidden;
}

.smeter-history {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
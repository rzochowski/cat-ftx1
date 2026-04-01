<template>
  <div class="smeter">
    <div class="smeter-label">{{ label }}</div>
    <div class="smeter-bar-bg">
      <div
        class="smeter-bar-fill"
        :style="{ width: fillPercent + '%', background: fillColor }"
      />
      <!-- S-unit ticks -->
      <div class="smeter-ticks">
        <span v-for="t in ticks" :key="t.label" class="tick" :style="{ left: t.pct + '%' }">
          {{ t.label }}
        </span>
      </div>
    </div>
    <div class="smeter-value">
      <span class="s-reading">{{ sReading }}</span>
      <span class="raw-value">{{ value != null ? value : '--' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  value: number | null
  label?: string
}>()

// FTX-1 S-meter: 0-255 raw value
// Approximate mapping: S0=0, S1=20, S2=40 ... S9=160, S9+10=190, S9+20=210, S9+60=255
const S_POINTS = [
  { raw: 0,   s: 'S0' },
  { raw: 20,  s: 'S1' },
  { raw: 35,  s: 'S2' },
  { raw: 50,  s: 'S3' },
  { raw: 64,  s: 'S4' },
  { raw: 76,  s: 'S5' },
  { raw: 92,  s: 'S6' },
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

const fillPercent = computed(() => {
  if (props.value == null) return 0
  return Math.max(0, Math.min(100, (props.value / 255) * 100))
})

const fillColor = computed(() => {
  const v = props.value ?? 0
  if (v < 180) return 'linear-gradient(90deg, #22c55e, #86efac)'
  if (v < 210) return 'linear-gradient(90deg, #22c55e, #facc15)'
  return 'linear-gradient(90deg, #facc15, #f87171)'
})

const sReading = computed(() => {
  if (props.value == null) return '--'
  const v = props.value
  for (let i = S_POINTS.length - 1; i >= 0; i--) {
    if (v >= S_POINTS[i].raw) return S_POINTS[i].s
  }
  return 'S0'
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

.smeter-bar-bg {
  position: relative;
  height: 12px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 3px;
  overflow: visible;
}

.smeter-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width .15s ease-out;
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
</style>

<template>
  <div class="level-bar">
    <div class="level-label">{{ label }}</div>
    <div class="level-track">
      <div
        class="level-fill"
        :style="{ width: fillPercent + '%', background: fillColor }"
      />
    </div>
    <div class="level-value">{{ value != null ? value : '--' }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  value: number | null
  label: string
  max?: number
  color?: string
}>()

const maxVal = computed(() => props.max ?? 255)

const fillPercent = computed(() => {
  if (props.value == null) return 0
  return Math.max(0, Math.min(100, (props.value / maxVal.value) * 100))
})

const fillColor = computed(() =>
  props.color ?? 'linear-gradient(90deg, #3b82f6, #60a5fa)'
)
</script>

<style scoped>
.level-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.level-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #8b949e;
  white-space: nowrap;
  width: 49px;
  flex-shrink: 0;
}

.level-track {
  flex: 1;
  height: 6px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 3px;
  overflow: hidden;
}

.level-fill {
  height: 100%;
  border-radius: 3px;
  transition: width .15s ease-out;
}

.level-value {
  font-size: 9px;
  font-family: 'SF Mono', monospace;
  color: #8b949e;
  width: 24px;
  text-align: right;
  flex-shrink: 0;
}
</style>

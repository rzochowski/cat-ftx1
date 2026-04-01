<template>
  <div class="badge" :style="badgeStyle">
    <span class="badge-label">{{ label }}</span>
    <span class="badge-value">{{ value }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  value: string
  active?: boolean
  colorActive?: string
}>()

const badgeStyle = computed(() => {
  if (props.active) {
    const color = props.colorActive ?? '#f59e0b'
    return {
      borderColor: color,
      background: color + '18',
    }
  }
  return {}
})
</script>

<style scoped>
.badge {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 12px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  min-width: 70px;
  transition: border-color .2s, background .2s;
}

.badge-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #8b949e;
  font-weight: 600;
  margin-bottom: 3px;
}

.badge-value {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  font-weight: 700;
  color: #e6edf3;
}
</style>

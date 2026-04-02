<template>
  <div
    class="badge"
    :class="{ 'badge--clickable': clickable, 'badge--busy': busy }"
    :style="badgeStyle"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    :title="clickable ? (active ? `Wyłącz ${label}` : `Włącz ${label}`) : undefined"
    @click="clickable && !busy && emit('toggle')"
    @keydown.enter.space.prevent="clickable && !busy && emit('toggle')"
  >
    <span class="badge-label">
      {{ label }}
      <span v-if="clickable" class="badge-toggle-hint">{{ active ? '◉' : '○' }}</span>
    </span>
    <span class="badge-value">
      <span v-if="busy" class="badge-spinner">⟳</span>
      <template v-else>{{ value }}</template>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  value: string
  active?: boolean
  colorActive?: string
  clickable?: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  toggle: []
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
  user-select: none;
}

.badge--clickable {
  cursor: pointer;
}

.badge--clickable:hover:not(.badge--busy) {
  border-color: #58a6ff;
  background: rgba(88, 166, 255, .08);
}

.badge--clickable:focus-visible {
  outline: 2px solid #58a6ff;
  outline-offset: 2px;
}

.badge--busy {
  cursor: wait;
  opacity: .7;
}

.badge-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #8b949e;
  font-weight: 600;
  margin-bottom: 3px;
  display: flex;
  align-items: center;
  gap: 3px;
}

.badge-toggle-hint {
  font-size: 9px;
  opacity: .7;
}

.badge-value {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  font-weight: 700;
  color: #e6edf3;
}

.badge-spinner {
  display: inline-block;
  animation: spin .8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

<template>
  <button
    class="preset-btn"
    :class="{
      'is-running': running,
      'is-ok': flashState === 'ok',
      'is-error': flashState === 'error',
    }"
    :style="btnStyle"
    :disabled="running || !connected"
    :title="preset.description ?? preset.label"
    @click="execute"
  >
    <!-- Left accent bar -->
    <span class="accent-bar" :style="{ background: preset.color ?? '#6b7280' }" />

    <span class="btn-body">
      <span class="btn-top">
        <span class="btn-icon" v-if="preset.icon">{{ preset.icon }}</span>
        <span class="btn-label">{{ preset.label }}</span>
        <span class="btn-badge">{{ preset.commands.length }}</span>
      </span>
      <span class="btn-desc" v-if="preset.description">{{ preset.description }}</span>
    </span>

    <!-- Status overlay -->
    <Transition name="fade">
      <span v-if="running" class="status-overlay running">
        <span class="spinner">⟳</span> {{ progress }}
      </span>
      <span v-else-if="flashState === 'ok'" class="status-overlay ok">✓ Gotowe</span>
      <span v-else-if="flashState === 'error'" class="status-overlay err">
        ✕ {{ errorMsg }}
      </span>
    </Transition>
  </button>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

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

const props = defineProps<{
  preset: Preset
  connected: boolean
}>()

const emit = defineEmits<{
  executed: [results: CommandResult[]]
}>()

const running = ref(false)
const flashState = ref<'ok' | 'error' | null>(null)
const errorMsg = ref('')
const progress = ref('')
let flashTimer: ReturnType<typeof setTimeout> | null = null

const btnStyle = computed(() => ({
  '--preset-color': props.preset.color ?? '#6b7280',
}))

async function execute() {
  if (running.value || !props.connected) return

  running.value = true
  flashState.value = null
  progress.value = `0 / ${props.preset.commands.length}`

  // Show per-command progress by polling the index client-side
  let progressInterval: ReturnType<typeof setInterval> | null = null
  let step = 0
  progressInterval = setInterval(() => {
    if (step < props.preset.commands.length - 1) {
      step++
      progress.value = `${step} / ${props.preset.commands.length}`
    }
  }, 120)

  try {
    const data = await $fetch<{ ok: boolean; results: CommandResult[] }>('/api/preset-execute', {
      method: 'POST',
      body: { commands: props.preset.commands },
    })

    const failed = data.results.filter(r => !r.ok)
    if (failed.length > 0) {
      flashState.value = 'error'
      errorMsg.value = `${failed[0].command}: ${failed[0].error}`
    } else {
      flashState.value = 'ok'
    }
    emit('executed', data.results)
  } catch (e: any) {
    flashState.value = 'error'
    errorMsg.value = e.data?.message ?? e.message ?? 'Błąd'
  } finally {
    clearInterval(progressInterval!)
    running.value = false
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { flashState.value = null }, 3000)
  }
}
</script>

<style scoped>
.preset-btn {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 0;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  color: #e6edf3;
  transition: border-color .15s, background .15s, opacity .15s;
  overflow: hidden;
  min-width: 180px;
  max-width: 260px;
  padding: 0;
}

.preset-btn:hover:not(:disabled) {
  border-color: var(--preset-color);
  background: color-mix(in srgb, var(--preset-color) 8%, #161b22);
}

.preset-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.preset-btn.is-ok {
  border-color: #3fb950;
  background: rgba(63, 185, 80, .1);
}

.preset-btn.is-error {
  border-color: #f85149;
  background: rgba(248, 81, 73, .1);
}

.preset-btn.is-running {
  border-color: var(--preset-color);
  background: color-mix(in srgb, var(--preset-color) 6%, #161b22);
}

/* Left accent bar */
.accent-bar {
  display: block;
  width: 4px;
  flex-shrink: 0;
  border-radius: 8px 0 0 8px;
}

/* Button body */
.btn-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  flex: 1;
  min-width: 0;
}

.btn-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-icon {
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.btn-label {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.btn-badge {
  font-family: 'SF Mono', monospace;
  font-size: 10px;
  padding: 1px 6px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 10px;
  color: #8b949e;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-badge::after {
  content: ' cmd';
}

.btn-desc {
  font-size: 11px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

/* Status overlay */
.status-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  font-family: 'SF Mono', monospace;
  border-radius: 8px;
  padding: 4px 12px;
  text-align: center;
  backdrop-filter: blur(2px);
}

.status-overlay.running {
  background: rgba(22, 27, 34, .88);
  color: var(--preset-color);
}

.status-overlay.ok {
  background: rgba(22, 27, 34, .88);
  color: #3fb950;
}

.status-overlay.err {
  background: rgba(22, 27, 34, .88);
  color: #f85149;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spinner {
  display: inline-block;
  animation: spin .7s linear infinite;
  margin-right: 4px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Transition */
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

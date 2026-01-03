<template>
  <div class="panel">
    <div class="panel-header">
      Mixer
      <button
        class="hq-btn"
        :class="{ active: hqEnabled, loading: hqLoading }"
        @click="toggleHQAudio"
        :title="hqEnabled ? 'High quality samples active' : 'Load high quality samples'"
      >
        {{ hqLoading ? '...' : 'HQ' }}
      </button>
    </div>
    <div class="mixer-channels">
      <div class="channel" v-for="ch in channels" :key="ch.id">
        <label>{{ ch.label }}</label>
        <input
          type="range"
          min="0"
          max="100"
          :value="getVolume(ch.id) * 100"
          @input="setVolume(ch.id, $event)"
        />
        <span class="volume-value">{{ Math.round(getVolume(ch.id) * 100) }}</span>
        <button
          v-if="ch.toggleable"
          class="toggle-btn"
          :class="{ active: isEnabled(ch.id) }"
          @click="toggleChannel(ch.id)"
          :title="isEnabled(ch.id) ? 'Mute' : 'Unmute'"
        >
          {{ isEnabled(ch.id) ? 'ON' : 'OFF' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useHarmonyStore } from '../stores/harmony'
import { getLickEngine } from '../solo/LickEngine.js'
import { getAudioEngine } from '../audio/AudioEngine.js'

const harmonyStore = useHarmonyStore()

// HQ audio state
const hqLoading = ref(false)
const hqEnabled = ref(false)

async function toggleHQAudio() {
  if (hqEnabled.value) {
    // Already enabled, toggle off
    const audioEngine = getAudioEngine()
    audioEngine.setUseSamples(false)
    hqEnabled.value = false
    return
  }

  // Load samples
  hqLoading.value = true
  try {
    const audioEngine = getAudioEngine()
    await audioEngine.initAudio?.() || audioEngine.init?.()
    const success = await audioEngine.loadSamples()
    hqEnabled.value = success
  } catch (error) {
    console.error('Failed to load HQ samples:', error)
  }
  hqLoading.value = false
}

const channels = [
  { id: 'piano', label: 'Piano', toggleable: false },
  { id: 'bass', label: 'Bass', toggleable: true },
  { id: 'drums', label: 'Drums', toggleable: true },
  { id: 'solo', label: 'AI Solo', toggleable: true }
]

// Solo volume state (local, not in store)
const soloVolume = ref(0.7)
const soloEnabled = ref(true)

function getVolume(channelId) {
  switch (channelId) {
    case 'piano': return harmonyStore.pianoVolume
    case 'bass': return harmonyStore.bassVolume
    case 'drums': return harmonyStore.drumsVolume
    case 'solo': return soloVolume.value
    default: return 0.5
  }
}

function setVolume(channelId, event) {
  const value = event.target.value / 100
  if (channelId === 'solo') {
    soloVolume.value = value
    const lickEngine = getLickEngine()
    // Convert 0-1 to dB (-30 to +6)
    const db = value > 0 ? -30 + (value * 36) : -Infinity
    lickEngine.setVolume(db)
  } else {
    harmonyStore.setVolume(channelId, value)
  }
}

function isEnabled(channelId) {
  switch (channelId) {
    case 'bass': return harmonyStore.bassEnabled
    case 'drums': return harmonyStore.drumsEnabled
    case 'solo': return soloEnabled.value
    default: return true
  }
}

function toggleChannel(channelId) {
  switch (channelId) {
    case 'bass':
      harmonyStore.setBassEnabled(!harmonyStore.bassEnabled)
      break
    case 'drums':
      harmonyStore.setDrumsEnabled(!harmonyStore.drumsEnabled)
      break
    case 'solo':
      soloEnabled.value = !soloEnabled.value
      const lickEngine = getLickEngine()
      lickEngine.setVolume(soloEnabled.value ? 0 : -Infinity)
      break
  }
}
</script>

<style scoped>
.mixer-channels {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.channel {
  display: grid;
  grid-template-columns: 50px 1fr 30px 40px;
  align-items: center;
  gap: 8px;
}

.channel label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.channel input[type="range"] {
  width: 100%;
}

.volume-value {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'SF Mono', Monaco, monospace;
  text-align: right;
}

.toggle-btn {
  padding: 2px 6px;
  font-size: 9px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn.active {
  background: var(--accent-green);
  color: white;
  border-color: var(--accent-green);
}

/* Panel header with HQ button */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hq-btn {
  padding: 3px 8px;
  font-size: 9px;
  font-weight: 700;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
}

.hq-btn:hover {
  border-color: var(--accent-purple);
  color: var(--accent-purple);
}

.hq-btn.loading {
  opacity: 0.7;
  cursor: wait;
}

.hq-btn.active {
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-blue));
  color: white;
  border-color: var(--accent-purple);
}
</style>

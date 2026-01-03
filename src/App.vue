<template>
  <div class="app-container">
    <!-- Header -->
    <header class="app-header">
      <h1 class="app-title">RameauJazz</h1>
      <div class="header-controls">
        <button class="btn btn-secondary save-btn" @click="showSavedProgressions = true">
          <span class="save-icon">&#128190;</span>
          Guardadas
        </button>
        <button class="btn btn-secondary preset-btn" @click="showCustomPresets = true">
          <span class="preset-icon">&#9881;</span>
          Presets
        </button>
        <button class="btn btn-primary standards-btn" @click="showStandardsLibrary = true">
          <span class="standards-icon">&#127925;</span>
          Standards
        </button>
        <StylePresets />
        <div class="tempo-control">
          <span class="tempo-value">{{ harmonyStore.tempo }} BPM</span>
        </div>
      </div>
    </header>

    <!-- Saved Progressions Modal -->
    <SavedProgressions
      :isOpen="showSavedProgressions"
      @close="showSavedProgressions = false"
    />

    <!-- Custom Presets Modal -->
    <CustomPresets
      :isOpen="showCustomPresets"
      @close="showCustomPresets = false"
    />

    <!-- Standards Library Modal -->
    <StandardsLibrary
      :isOpen="showStandardsLibrary"
      @close="showStandardsLibrary = false"
      @select="loadStandard"
    />

    <!-- Main Content -->
    <main class="app-main">
      <!-- Left: Circle of Fifths -->
      <aside class="sidebar-left">
        <CircleOfFifths />
      </aside>

      <!-- Center: Force Graph -->
      <section class="center-panel">
        <ForceGraph />
      </section>

      <!-- Right: Controls -->
      <aside class="sidebar-right">
        <div class="controls-stack">
          <KeySelector />
          <GravitySlider />
          <LibraryPanel />
          <ModulationPanel />
          <VoicingSelector />
          <TensionMeter />
          <MixerPanel />
        </div>
      </aside>
    </main>

    <!-- Resizable Piano Roll -->
    <div
      class="resize-handle"
      @mousedown="startResize"
      title="Drag to resize"
    >
      <div class="resize-grip"></div>
    </div>
    <section class="piano-roll-section" :style="{ height: pianoRollHeight + 'px' }">
      <PianoRoll />
    </section>

    <!-- Resizable Footer -->
    <div
      class="resize-handle footer-resize"
      @mousedown="startFooterResize"
      title="Arrastra para redimensionar"
    >
      <div class="resize-grip"></div>
    </div>
    <footer class="app-footer" :style="{ height: footerHeight + 'px' }">
      <TransportBar />
      <ProgressionDisplay />
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useHarmonyStore } from './stores/harmony'

// Components
import TransportBar from './components/TransportBar.vue'
import KeySelector from './components/KeySelector.vue'
import GravitySlider from './components/GravitySlider.vue'
import ModulationPanel from './components/ModulationPanel.vue'
import VoicingSelector from './components/VoicingSelector.vue'
import StylePresets from './components/StylePresets.vue'
import MixerPanel from './components/MixerPanel.vue'
import ProgressionDisplay from './components/ProgressionDisplay.vue'
import TensionMeter from './components/TensionMeter.vue'
import SavedProgressions from './components/SavedProgressions.vue'
import CustomPresets from './components/CustomPresets.vue'
import LibraryPanel from './components/LibraryPanel.vue'
import StandardsLibrary from './components/StandardsLibrary.vue'
import { chordToRoman } from './engine/ChordConverter.js'

// Visualization
import ForceGraph from './visualization/ForceGraph.vue'
import PianoRoll from './visualization/PianoRoll.vue'
import CircleOfFifths from './visualization/CircleOfFifths.vue'

const harmonyStore = useHarmonyStore()

// Saved progressions modal
const showSavedProgressions = ref(false)

// Custom presets modal
const showCustomPresets = ref(false)

// Standards library modal
const showStandardsLibrary = ref(false)

function loadStandard(standard) {
  const key = standard.key || 'C'

  // Convert chords to progression format
  const progression = standard.chords.map((chord, idx) => {
    const romanDegree = chordToRoman(chord, key)
    return {
      degree: romanDegree,
      key: key,
      tension: 0.5,
      section: idx === 0 ? 'A' : null
    }
  })

  harmonyStore.setKey(key)
  harmonyStore.loadProgression(progression)
}

// Piano roll resize
const pianoRollHeight = ref(180)
const isResizing = ref(false)
const minHeight = 100
const maxHeight = 400

// Footer resize
const footerHeight = ref(80)
const isFooterResizing = ref(false)
const minFooterHeight = 50
const maxFooterHeight = 400

function startResize(e) {
  isResizing.value = true
  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
  e.preventDefault()
}

function startFooterResize(e) {
  isFooterResizing.value = true
  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
  e.preventDefault()
}

function onResize(e) {
  if (isResizing.value) {
    const windowHeight = window.innerHeight
    const currentFooterHeight = footerHeight.value
    const newHeight = windowHeight - e.clientY - currentFooterHeight - 8 // 8 for resize handle

    pianoRollHeight.value = Math.max(minHeight, Math.min(maxHeight, newHeight))
  }

  if (isFooterResizing.value) {
    const windowHeight = window.innerHeight
    const newHeight = windowHeight - e.clientY

    footerHeight.value = Math.max(minFooterHeight, Math.min(maxFooterHeight, newHeight))
  }
}

function stopResize() {
  if (isResizing.value || isFooterResizing.value) {
    isResizing.value = false
    isFooterResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
}

onMounted(() => {
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-height: 100vh;
  overflow: hidden;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.app-title {
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 6px;
}

.save-icon,
.preset-icon,
.standards-icon {
  font-size: 14px;
}

.preset-btn,
.standards-btn {
  display: flex;
  align-items: center;
  gap: 6px;
}

.standards-btn {
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
  border: none;
  color: white;
}

.standards-btn:hover {
  opacity: 0.9;
}

.tempo-control {
  background: var(--bg-tertiary);
  padding: 6px 12px;
  border-radius: var(--radius-md);
}

.tempo-value {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 14px;
  color: var(--text-secondary);
}

.app-main {
  flex: 1;
  display: grid;
  grid-template-columns: 200px 1fr 280px;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
}

.sidebar-left,
.sidebar-right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.sidebar-right {
  max-height: 100%;
}

.center-panel {
  min-height: 0;
  display: flex;
}

.controls-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  flex: 1;
  padding-right: 4px;
}

/* Resize Handle */
.resize-handle {
  height: 8px;
  background: var(--bg-secondary);
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.resize-handle:hover {
  background: var(--bg-tertiary);
}

.resize-grip {
  width: 60px;
  height: 4px;
  background: var(--border-color);
  border-radius: 2px;
  transition: background 0.15s;
}

.resize-handle:hover .resize-grip {
  background: var(--accent-blue);
}

.piano-roll-section {
  min-height: 100px;
  padding: 0 16px;
  overflow: hidden;
}

.app-footer {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px 24px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  min-height: 50px;
  overflow: hidden;
}

.footer-resize {
  border-top: 1px solid var(--border-color);
}
</style>

<template>
  <div class="panel library-panel">
    <div class="panel-header">Biblioteca</div>

    <!-- Tab navigation -->
    <div class="library-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-label">{{ tab.label }}</span>
        <span class="tab-count" v-if="tab.count">{{ tab.count }}</span>
      </button>
    </div>

    <!-- Tab content -->
    <div class="tab-content">
      <!-- Generate tab -->
      <div v-if="activeTab === 'generate'" class="tab-pane">
        <div class="control-row">
          <label>Forma</label>
          <select v-model="selectedForm" class="form-select">
            <option v-for="template in templates" :key="template.id" :value="template.id">
              {{ template.name }}
            </option>
          </select>
        </div>
        <div class="form-preview">
          <span
            v-for="(section, idx) in currentSections"
            :key="idx"
            class="section-badge"
            :class="`section-${section.toLowerCase()}`"
          >
            {{ section }}
          </span>
          <span class="total-bars">{{ currentTemplate?.totalBars }} bars</span>
        </div>
        <button class="action-btn primary" @click="generateSong">
          Generar Progresion
        </button>
      </div>

      <!-- My progressions tab -->
      <div v-if="activeTab === 'saved'" class="tab-pane">
        <div v-if="savedProgressions.length === 0" class="empty-state">
          No tienes progresiones guardadas
        </div>
        <div v-else class="item-list">
          <div
            v-for="prog in savedProgressions"
            :key="prog.id"
            class="list-item"
            @click="loadSavedProgression(prog)"
          >
            <div class="item-title">{{ prog.name }}</div>
            <div class="item-meta">{{ prog.key }} · {{ prog.chords?.length || 0 }} bars</div>
          </div>
        </div>
      </div>

      <!-- Standards tab -->
      <div v-if="activeTab === 'standards'" class="tab-pane">
        <input
          type="text"
          v-model="standardsSearch"
          placeholder="Buscar standard..."
          class="search-input"
        />
        <div class="item-list">
          <div
            v-for="standard in filteredStandards"
            :key="standard.title"
            class="list-item"
            :class="{ 'has-melody': standard.hasMelody }"
            @click="selectStandard(standard)"
          >
            <div class="item-title">
              {{ standard.title }}
              <span v-if="standard.hasMelody" class="melody-badge" title="Tiene melodía">♪</span>
            </div>
            <div class="item-meta">{{ standard.composer }} · {{ standard.key }}</div>
          </div>
        </div>
        <div class="list-footer" v-if="filteredStandards.length > 0">
          Mostrando {{ filteredStandards.length }} de {{ allStandards.length }}
        </div>
      </div>

      <!-- Transcriptions tab -->
      <div v-if="activeTab === 'transcriptions'" class="tab-pane">
        <input
          type="text"
          v-model="transcriptionsSearch"
          placeholder="Buscar transcripcion..."
          class="search-input"
        />
        <div class="item-list">
          <div
            v-for="item in filteredTranscriptions"
            :key="item.id"
            class="list-item has-melody"
            @click="selectTranscription(item)"
          >
            <div class="item-title">
              {{ item.title }}
              <span class="melody-badge" title="Con melodía">♪</span>
            </div>
            <div class="item-meta">{{ item.category }} · {{ item.key }}</div>
          </div>
        </div>
        <div class="list-footer" v-if="filteredTranscriptions.length > 0">
          {{ filteredTranscriptions.length }} transcripciones con melodía
        </div>
      </div>

      <!-- Heads tab -->
      <div v-if="activeTab === 'heads'" class="tab-pane">
        <div class="item-list">
          <div
            v-for="item in heads"
            :key="item.id"
            class="list-item has-melody"
            @click="selectHead(item)"
          >
            <div class="item-title">
              {{ item.title }}
              <span class="melody-badge" title="Melodía completa">♪</span>
            </div>
            <div class="item-meta">{{ item.composer }} · {{ item.key }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Selected item preview -->
    <div v-if="selectedItem" class="selected-preview">
      <div class="preview-title">{{ selectedItem.title }}</div>
      <div class="preview-meta">
        {{ selectedItem.composer || selectedItem.category }} · {{ selectedItem.key }}
        <span v-if="selectedItem.melody"> · ♪ melodía</span>
      </div>
      <button class="action-btn primary" @click="loadSelected">
        Cargar
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useHarmonyStore } from '../stores/harmony'
import { chordToRoman } from '../engine/ChordConverter.js'

const harmonyStore = useHarmonyStore()

// Tabs configuration
const tabs = ref([
  { id: 'generate', label: 'Generar', icon: '🎲', count: null },
  { id: 'saved', label: 'Mis Temas', icon: '💾', count: 0 },
  { id: 'standards', label: 'Standards', icon: '📚', count: 0 },
  { id: 'heads', label: 'Heads', icon: '🎵', count: 0 },
  { id: 'transcriptions', label: 'Solos', icon: '🎷', count: 0 }
])

const activeTab = ref('generate')

// Generate tab state
const selectedForm = computed({
  get: () => harmonyStore.songForm,
  set: (val) => { harmonyStore.songForm = val }
})

const templates = computed(() => {
  return Object.entries(harmonyStore.FORM_TEMPLATES).map(([id, template]) => ({
    id,
    name: template.name,
    sections: template.sections,
    totalBars: template.totalBars
  }))
})

const currentTemplate = computed(() => harmonyStore.FORM_TEMPLATES[selectedForm.value])
const currentSections = computed(() => currentTemplate.value?.sections || [])

// Data
const allStandards = ref([])
const transcriptions = ref([])
const heads = ref([])
const savedProgressions = ref([])

// Search
const standardsSearch = ref('')
const transcriptionsSearch = ref('')

// Selection
const selectedItem = ref(null)

// Filtered lists
const filteredStandards = computed(() => {
  const search = standardsSearch.value.toLowerCase()
  const filtered = allStandards.value.filter(s =>
    s.title.toLowerCase().includes(search) ||
    (s.composer && s.composer.toLowerCase().includes(search))
  )
  return filtered.slice(0, 100)
})

const filteredTranscriptions = computed(() => {
  const search = transcriptionsSearch.value.toLowerCase()
  const filtered = transcriptions.value.filter(t =>
    t.title.toLowerCase().includes(search) ||
    (t.category && t.category.toLowerCase().includes(search))
  )
  return filtered.slice(0, 100)
})

// Load data
onMounted(async () => {
  // Load standards
  try {
    const resp = await fetch('./data/standards.json')
    const data = await resp.json()
    allStandards.value = data.map(s => ({ ...s, hasMelody: false }))
    tabs.value.find(t => t.id === 'standards').count = data.length
  } catch (e) {
    console.error('Failed to load standards:', e)
  }

  // Load transcriptions
  try {
    const resp = await fetch('./data/transcriptions.json')
    transcriptions.value = await resp.json()
    tabs.value.find(t => t.id === 'transcriptions').count = transcriptions.value.length
  } catch (e) {
    console.error('Failed to load transcriptions:', e)
  }

  // Load heads
  try {
    const resp = await fetch('./data/heads.json')
    heads.value = await resp.json()
    tabs.value.find(t => t.id === 'heads').count = heads.value.length
  } catch (e) {
    console.error('Failed to load heads:', e)
  }

  // Load saved progressions from localStorage
  loadSavedFromStorage()

  // Mark standards that have melodies
  markStandardsWithMelodies()
})

function loadSavedFromStorage() {
  try {
    const saved = localStorage.getItem('rameau_progressions')
    if (saved) {
      savedProgressions.value = JSON.parse(saved)
      tabs.value.find(t => t.id === 'saved').count = savedProgressions.value.length
    }
  } catch (e) {
    console.error('Failed to load saved progressions:', e)
  }
}

function markStandardsWithMelodies() {
  // Create a set of titles that have melodies
  const melodyTitles = new Set([
    ...heads.value.map(h => h.title.toLowerCase()),
    ...transcriptions.value.map(t => t.title.toLowerCase())
  ])

  allStandards.value.forEach(s => {
    s.hasMelody = melodyTitles.has(s.title.toLowerCase())
  })
}

// Actions
function generateSong() {
  harmonyStore.generateSongForm(selectedForm.value)
  selectedItem.value = null
}

function selectStandard(standard) {
  selectedItem.value = { ...standard, type: 'standard' }
}

function selectTranscription(item) {
  selectedItem.value = { ...item, type: 'transcription' }
}

function selectHead(item) {
  selectedItem.value = { ...item, type: 'head' }
}

function loadSavedProgression(prog) {
  if (prog.progression) {
    harmonyStore.loadProgression(prog.progression)
    if (prog.key) harmonyStore.setKey(prog.key)
  }
}

function loadSelected() {
  if (!selectedItem.value) return

  const item = selectedItem.value
  const key = item.key || 'C'

  // Convert chords to progression format
  let progression = []

  if (item.chords && item.chords.length > 0) {
    progression = item.chords.map((chord, idx) => {
      const romanDegree = chordToRoman(chord, key)
      return {
        degree: romanDegree,
        key: key,
        tension: 0.5,
        section: idx === 0 ? 'A' : null
      }
    })
  }

  // Load melody if available
  if (item.melody) {
    harmonyStore.loadMelody(item.melody)
  } else {
    harmonyStore.loadMelody(null) // Clear any existing melody
  }

  harmonyStore.setKey(key)
  harmonyStore.loadProgression(progression)
  selectedItem.value = null
}
</script>

<style scoped>
.library-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
}

.panel-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Tabs */
.library-tabs {
  display: flex;
  gap: 2px;
  background: var(--bg-tertiary);
  padding: 3px;
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}

.tab-btn {
  flex: 1;
  min-width: 50px;
  padding: 6px 4px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.tab-btn.active {
  background: var(--accent-blue);
  color: white;
}

.tab-icon {
  font-size: 14px;
}

.tab-label {
  font-size: 9px;
  font-weight: 500;
}

.tab-count {
  font-size: 8px;
  opacity: 0.7;
}

/* Tab content */
.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

/* Search */
.search-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 12px;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

/* Item list */
.item-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
}

.list-item {
  padding: 8px 10px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.list-item:hover {
  background: var(--bg-hover);
  border-color: var(--accent-blue);
}

.list-item.has-melody {
  border-left: 3px solid var(--accent-green);
}

.item-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-meta {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.melody-badge {
  font-size: 10px;
  color: var(--accent-green);
}

.list-footer {
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
  padding: 4px;
}

/* Generate tab */
.control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.control-row label {
  font-size: 12px;
  color: var(--text-secondary);
}

.form-select {
  flex: 1;
  max-width: 140px;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 11px;
  cursor: pointer;
}

.form-preview {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}

.section-badge {
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 700;
  font-family: 'SF Mono', Monaco, monospace;
}

.section-a { background: rgba(63, 185, 80, 0.2); color: var(--accent-green); }
.section-b { background: rgba(210, 153, 34, 0.2); color: var(--accent-yellow); }
.section-c { background: rgba(163, 113, 247, 0.2); color: var(--accent-purple); }

.total-bars {
  margin-left: auto;
  font-size: 9px;
  color: var(--text-muted);
}

/* Selected preview */
.selected-preview {
  padding: 10px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px solid var(--accent-blue);
}

.preview-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.preview-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin: 4px 0 8px;
}

/* Action button */
.action-btn {
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.primary {
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-blue));
  color: white;
}

.action-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.3);
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--text-muted);
  font-size: 12px;
}
</style>

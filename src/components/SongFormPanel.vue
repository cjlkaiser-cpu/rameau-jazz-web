<template>
  <div class="panel song-form-panel">
    <div class="panel-header">Estructura</div>

    <!-- Form selector -->
    <div class="control-row">
      <label>Forma</label>
      <select v-model="selectedForm" class="form-control form-select">
        <option v-for="template in templates" :key="template.id" :value="template.id">
          {{ template.name }}
        </option>
      </select>
    </div>

    <!-- Visual preview -->
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

    <!-- Generate button -->
    <button class="generate-song-btn" @click="generateSong">
      Generar Cancion
    </button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useHarmonyStore } from '../stores/harmony'

const harmonyStore = useHarmonyStore()

// Get templates from store
const templates = computed(() => {
  return Object.entries(harmonyStore.FORM_TEMPLATES).map(([id, template]) => ({
    id,
    name: template.name,
    sections: template.sections,
    totalBars: template.totalBars
  }))
})

// Selected form with two-way binding
const selectedForm = computed({
  get: () => harmonyStore.songForm,
  set: (val) => { harmonyStore.songForm = val }
})

// Current template details
const currentTemplate = computed(() => {
  return harmonyStore.FORM_TEMPLATES[selectedForm.value]
})

// Current sections for preview
const currentSections = computed(() => {
  return currentTemplate.value?.sections || []
})

// Generate song with selected form
function generateSong() {
  harmonyStore.generateSongForm(selectedForm.value)
}
</script>

<style scoped>
.song-form-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

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
  max-width: 160px;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
}

.form-select:hover {
  border-color: var(--accent-blue);
}

.form-select:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.2);
}

/* Form preview */
.form-preview {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}

.section-badge {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 700;
  font-family: 'SF Mono', Monaco, monospace;
}

.section-a {
  background: rgba(63, 185, 80, 0.2);
  color: var(--accent-green);
  border: 1px solid rgba(63, 185, 80, 0.3);
}

.section-b {
  background: rgba(210, 153, 34, 0.2);
  color: var(--accent-yellow);
  border: 1px solid rgba(210, 153, 34, 0.3);
}

.section-c {
  background: rgba(163, 113, 247, 0.2);
  color: var(--accent-purple);
  border: 1px solid rgba(163, 113, 247, 0.3);
}

.total-bars {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-muted);
}

/* Generate button */
.generate-song-btn {
  width: 100%;
  padding: 10px 16px;
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-blue));
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.generate-song-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.3);
}

.generate-song-btn:active {
  transform: translateY(0);
}
</style>

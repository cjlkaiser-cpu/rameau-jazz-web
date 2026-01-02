<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Presets Personalizados</h2>
        <button class="close-btn" @click="close">&times;</button>
      </div>

      <div class="modal-body">
        <!-- Save current settings -->
        <div class="save-section">
          <input
            v-model="presetName"
            type="text"
            placeholder="Nombre del preset..."
            class="save-input"
            @keyup.enter="saveCurrentPreset"
          />
          <button
            class="btn btn-primary"
            @click="saveCurrentPreset"
          >
            Guardar actual
          </button>
        </div>

        <!-- Current settings summary -->
        <div class="current-settings">
          <span class="setting-tag">{{ harmonyStore.voicingStyle }}</span>
          <span class="setting-tag">{{ harmonyStore.tempo }} BPM</span>
          <span class="setting-tag">Swing {{ Math.round(harmonyStore.swingAmount * 100) }}%</span>
          <span class="setting-tag">Gravedad {{ Math.round(harmonyStore.gravity * 100) }}%</span>
        </div>

        <!-- List of saved presets -->
        <div class="presets-list">
          <div v-if="presets.length === 0" class="empty-state">
            No hay presets guardados
          </div>

          <div
            v-for="preset in presets"
            :key="preset.id"
            class="preset-item"
            :class="{ selected: selectedId === preset.id }"
            @click="selectPreset(preset.id)"
          >
            <div class="preset-info">
              <span class="preset-name">{{ preset.name }}</span>
              <div class="preset-tags">
                <span class="tag">{{ preset.voicingStyle }}</span>
                <span class="tag">{{ preset.tempo }} BPM</span>
                <span class="tag" v-if="preset.modulationEnabled">Mod {{ Math.round(preset.modulationProbability * 100) }}%</span>
              </div>
            </div>
            <div class="preset-actions">
              <button
                class="action-btn load"
                @click.stop="loadSelectedPreset(preset)"
                title="Cargar"
              >
                &#9654;
              </button>
              <button
                class="action-btn delete"
                @click.stop="deleteSelectedPreset(preset.id)"
                title="Eliminar"
              >
                &#10005;
              </button>
            </div>
          </div>
        </div>

        <!-- Storage info -->
        <div class="storage-info">
          {{ storageInfo.count }}/{{ storageInfo.maxCount }} guardados
          ({{ storageInfo.sizeKB }} KB)
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="exportAll">
          Exportar JSON
        </button>
        <label class="btn btn-secondary import-btn">
          Importar JSON
          <input type="file" accept=".json" @change="importFromFile" hidden />
        </label>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useHarmonyStore } from '../stores/harmony'
import {
  getSavedPresets,
  savePreset,
  deletePreset,
  exportAllPresets,
  importPresets,
  getPresetStorageInfo
} from '../storage/PresetStorage.js'

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close'])

const harmonyStore = useHarmonyStore()

const presetName = ref('')
const presets = ref([])
const selectedId = ref(null)
const storageInfo = ref({ count: 0, maxCount: 30, sizeKB: '0' })

// Load presets when modal opens
watch(() => props.isOpen, (open) => {
  if (open) {
    refreshList()
  }
})

function refreshList() {
  presets.value = getSavedPresets()
  storageInfo.value = getPresetStorageInfo()
}

function close() {
  emit('close')
}

function saveCurrentPreset() {
  savePreset({
    name: presetName.value || null,
    voicingStyle: harmonyStore.voicingStyle,
    stylePreset: harmonyStore.stylePreset,
    tempo: harmonyStore.tempo,
    swingAmount: harmonyStore.swingAmount,
    gravity: harmonyStore.gravity,
    modulationEnabled: harmonyStore.modulationEnabled,
    modulationProbability: harmonyStore.modulationProbability,
    modulationLevel: harmonyStore.modulationLevel,
    returnToTonic: harmonyStore.returnToTonic,
    pianoVolume: harmonyStore.pianoVolume,
    bassVolume: harmonyStore.bassVolume,
    drumsVolume: harmonyStore.drumsVolume,
    bassEnabled: harmonyStore.bassEnabled,
    drumsEnabled: harmonyStore.drumsEnabled
  })

  presetName.value = ''
  refreshList()
}

function selectPreset(id) {
  selectedId.value = selectedId.value === id ? null : id
}

function loadSelectedPreset(preset) {
  // Apply saved settings
  harmonyStore.voicingStyle = preset.voicingStyle
  harmonyStore.stylePreset = preset.stylePreset
  harmonyStore.setTempo(preset.tempo)
  harmonyStore.setSwingAmount(preset.swingAmount)
  harmonyStore.setGravity(preset.gravity)
  harmonyStore.modulationEnabled = preset.modulationEnabled
  harmonyStore.setModulationProbability(preset.modulationProbability)
  harmonyStore.modulationLevel = preset.modulationLevel
  harmonyStore.returnToTonic = preset.returnToTonic

  // Volumes
  harmonyStore.setVolume('piano', preset.pianoVolume)
  harmonyStore.setVolume('bass', preset.bassVolume)
  harmonyStore.setVolume('drums', preset.drumsVolume)
  harmonyStore.setBassEnabled(preset.bassEnabled)
  harmonyStore.setDrumsEnabled(preset.drumsEnabled)

  close()
}

function deleteSelectedPreset(id) {
  if (confirm('¿Eliminar este preset?')) {
    deletePreset(id)
    refreshList()
  }
}

function exportAll() {
  const json = exportAllPresets()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `RameauJazz_presets_${new Date().toISOString().slice(0, 10)}.json`
  link.click()

  URL.revokeObjectURL(url)
}

function importFromFile(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const count = importPresets(e.target.result)
    if (count > 0) {
      refreshList()
      alert(`${count} presets importados`)
    } else {
      alert('No se pudieron importar los presets')
    }
  }
  reader.readAsText(file)

  // Reset input
  event.target.value = ''
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 550px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.save-section {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.save-input {
  flex: 1;
  padding: 10px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
}

.save-input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.current-settings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
  padding: 10px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
}

.setting-tag {
  font-size: 11px;
  padding: 3px 8px;
  background: var(--accent-blue);
  color: white;
  border-radius: 10px;
}

.presets-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.empty-state {
  text-align: center;
  color: var(--text-muted);
  padding: 40px 20px;
}

.preset-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s;
}

.preset-item:hover {
  border-color: var(--accent-purple);
}

.preset-item.selected {
  border-color: var(--accent-purple);
  background: rgba(136, 87, 231, 0.1);
}

.preset-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.preset-name {
  font-weight: 600;
  color: var(--text-primary);
}

.preset-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 8px;
}

.preset-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.action-btn.load {
  background: var(--accent-purple);
  color: white;
}

.action-btn.load:hover {
  background: #7048c8;
}

.action-btn.delete {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.action-btn.delete:hover {
  background: var(--accent-red);
  color: white;
}

.storage-info {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}

.modal-footer {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}

.import-btn {
  cursor: pointer;
}
</style>

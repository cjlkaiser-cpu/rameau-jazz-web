<template>
  <div class="progression-display" tabindex="0" @keydown="onKeyDown" ref="containerRef">
    <!-- Clipboard toolbar (visible when selection exists) -->
    <div class="clipboard-toolbar" v-if="selectedIndices.size > 0">
      <span class="selection-info">{{ selectedIndices.size }} seleccionados</span>
      <button class="toolbar-btn" @click="copySelection" title="Copiar (Ctrl+C)">
        <span>Copiar</span>
      </button>
      <button class="toolbar-btn" @click="pasteAfterSelection" :disabled="!hasClipboard" title="Pegar (Ctrl+V)">
        <span>Pegar</span>
      </button>
      <button class="toolbar-btn clear-btn" @click="clearSelection" title="Deseleccionar (Esc)">
        <span>×</span>
      </button>
    </div>

    <div class="chord-sequence" v-if="progression.length > 0">
      <!-- Chord items with editing controls -->
      <div
        v-for="(chord, idx) in progression"
        :key="`chord-${idx}-${chord.degree}`"
        class="chord-item-wrapper"
        @mouseenter="hoveredIndex = idx"
        @mouseleave="hoveredIndex = null"
      >
        <!-- Insert before button (visible on hover) -->
        <button
          v-if="hoveredIndex === idx && !isDragging && selectedIndices.size === 0"
          class="insert-btn"
          @click.stop="openPickerForInsert(idx, $event)"
          title="Insertar acorde antes"
        >
          +
        </button>

        <!-- Section marker (v0.3.5) -->
        <span
          v-if="chord.section"
          class="section-marker"
          :class="`section-marker-${chord.section.toLowerCase()}`"
          @click.stop="selectSection(chord.section)"
          :title="`Seccion ${chord.section} - Click para seleccionar`"
        >
          {{ chord.section }}
        </span>

        <!-- Chord badge (clickable, draggable) -->
        <span
          class="chord-item"
          :class="{
            active: idx === currentIndex,
            selected: selectedIndices.has(idx),
            dragging: dragIndex === idx,
            'drag-over': dropTargetIndex === idx && dropTargetIndex !== dragIndex
          }"
          draggable="true"
          @click="onChordClick(idx, $event)"
          @dragstart="onDragStart(idx, $event)"
          @dragend="onDragEnd"
          @dragover.prevent="onDragOver(idx)"
          @dragenter.prevent="onDragEnter(idx)"
          @dragleave="onDragLeave(idx)"
          @drop.prevent="onDrop(idx)"
        >
          <span class="chord-badge" :class="getChordClass(chord.degree)">
            {{ chord.degree }}
          </span>
          <span v-if="chord.key !== baseKey" class="key-indicator">
            [{{ chord.key }}]
          </span>

          <!-- Delete button (visible on hover) -->
          <button
            v-if="hoveredIndex === idx && progression.length > 1 && !isDragging && selectedIndices.size === 0"
            class="delete-btn"
            @click.stop="removeChord(idx)"
            title="Eliminar acorde"
          >
            ×
          </button>
        </span>

        <!-- Arrow separator -->
        <span v-if="idx < progression.length - 1" class="arrow">→</span>
      </div>

      <!-- Add chord at end button -->
      <button class="add-chord-btn" @click="openPickerForInsert(progression.length, $event)" title="Anadir acorde">
        <span class="add-icon">+</span>
      </button>
    </div>

    <div class="empty-state" v-else>
      <span>Click "Generar" para crear una progresion</span>
      <span class="empty-hint">o</span>
      <button class="add-first-btn" @click="addFirstChord">
        Anadir acorde manualmente
      </button>
    </div>

    <!-- Chord Picker -->
    <ChordPicker
      :isOpen="pickerOpen"
      :position="pickerPosition"
      :currentDegree="editingChord?.degree"
      @select="onChordSelected"
      @close="closePicker"
    />
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useHarmonyStore } from '../stores/harmony'
import ChordPicker from './ChordPicker.vue'

const harmonyStore = useHarmonyStore()

// Computed
const progression = computed(() => harmonyStore.progression)
const baseKey = computed(() => harmonyStore.key)
const currentIndex = computed(() => harmonyStore.currentMeasure)
const hasClipboard = computed(() => harmonyStore.hasClipboard())

// Container ref for focus
const containerRef = ref(null)

// Picker state
const pickerOpen = ref(false)
const pickerPosition = ref({ x: 0, y: 0 })
const editingIndex = ref(null)
const editingChord = computed(() =>
  editingIndex.value !== null && editingIndex.value < progression.value.length
    ? progression.value[editingIndex.value]
    : null
)
const insertMode = ref(false) // true when inserting, false when editing

// Hover state
const hoveredIndex = ref(null)

// Selection state
const selectedIndices = reactive(new Set())
const lastSelectedIndex = ref(null)

// Drag state
const isDragging = ref(false)
const dragIndex = ref(null)
const dropTargetIndex = ref(null)

// Methods
function getChordClass(degree) {
  if (degree.includes('I') && !degree.includes('II') && !degree.includes('IV') && !degree.includes('VI') && !degree.includes('VII')) {
    return 'chord-tonic'
  }
  if (degree.includes('V') || degree.includes('VII') || degree.includes('bII')) {
    return 'chord-dominant'
  }
  return 'chord-subdominant'
}

// Selection methods
function onChordClick(index, event) {
  if (isDragging.value) return

  if (event.shiftKey && lastSelectedIndex.value !== null) {
    // Shift+Click: select range
    const start = Math.min(lastSelectedIndex.value, index)
    const end = Math.max(lastSelectedIndex.value, index)
    for (let i = start; i <= end; i++) {
      selectedIndices.add(i)
    }
  } else if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd+Click: toggle selection
    if (selectedIndices.has(index)) {
      selectedIndices.delete(index)
    } else {
      selectedIndices.add(index)
    }
    lastSelectedIndex.value = index
  } else {
    // Normal click: open picker (clear selection first)
    if (selectedIndices.size > 0) {
      clearSelection()
    }
    openPicker(index, event)
    return
  }

  lastSelectedIndex.value = index
}

function clearSelection() {
  selectedIndices.clear()
  lastSelectedIndex.value = null
}

// Select all chords in a section
function selectSection(sectionLabel) {
  clearSelection()

  // Find all indices that belong to this section
  let inSection = false
  for (let i = 0; i < progression.value.length; i++) {
    const chord = progression.value[i]

    // Start of target section
    if (chord.section === sectionLabel) {
      inSection = true
    }
    // Start of different section
    else if (chord.section && chord.section !== sectionLabel) {
      inSection = false
    }

    if (inSection) {
      selectedIndices.add(i)
    }
  }

  if (selectedIndices.size > 0) {
    lastSelectedIndex.value = Math.max(...selectedIndices)
  }
}

function copySelection() {
  if (selectedIndices.size === 0) return
  harmonyStore.copyChords([...selectedIndices])
}

function pasteAfterSelection() {
  if (!hasClipboard.value) return

  // Paste after last selected, or at end
  let pasteIndex = progression.value.length
  if (selectedIndices.size > 0) {
    pasteIndex = Math.max(...selectedIndices) + 1
  }

  harmonyStore.pasteChords(pasteIndex)
  clearSelection()
}

function onKeyDown(event) {
  // Ctrl/Cmd+C: Copy
  if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
    if (selectedIndices.size > 0) {
      event.preventDefault()
      copySelection()
    }
    return
  }

  // Ctrl/Cmd+V: Paste
  if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
    if (hasClipboard.value) {
      event.preventDefault()
      pasteAfterSelection()
    }
    return
  }

  // Escape: Clear selection
  if (event.key === 'Escape') {
    if (selectedIndices.size > 0) {
      event.preventDefault()
      clearSelection()
    }
    return
  }

  // Ctrl/Cmd+A: Select all
  if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
    event.preventDefault()
    for (let i = 0; i < progression.value.length; i++) {
      selectedIndices.add(i)
    }
    lastSelectedIndex.value = progression.value.length - 1
  }
}

// Picker methods
function openPicker(index, event) {
  if (isDragging.value) return

  editingIndex.value = index
  insertMode.value = false

  const rect = event.currentTarget.getBoundingClientRect()
  pickerPosition.value = {
    x: rect.left + rect.width / 2,
    y: rect.bottom
  }

  pickerOpen.value = true
}

function openPickerForInsert(index, event) {
  editingIndex.value = index
  insertMode.value = true

  const rect = event.currentTarget.getBoundingClientRect()
  pickerPosition.value = {
    x: rect.left + rect.width / 2,
    y: rect.bottom
  }

  pickerOpen.value = true
}

function closePicker() {
  pickerOpen.value = false
  editingIndex.value = null
  insertMode.value = false
}

function onChordSelected(degree) {
  if (insertMode.value) {
    harmonyStore.insertChordAt(editingIndex.value, { degree })
  } else if (editingIndex.value !== null) {
    harmonyStore.updateChordAt(editingIndex.value, { degree })
  }
  closePicker()
}

// Insert/Delete methods
function addFirstChord() {
  editingIndex.value = 0
  insertMode.value = true
  pickerPosition.value = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  pickerOpen.value = true
}

function removeChord(index) {
  harmonyStore.removeChordAt(index)
}

// Drag & Drop methods (HTML5 Drag API)
function onDragStart(index, event) {
  isDragging.value = true
  dragIndex.value = index
  hoveredIndex.value = null

  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', index.toString())

  // Slight delay to allow the drag image to appear correctly
  setTimeout(() => {
    if (event.target.classList) {
      event.target.classList.add('dragging')
    }
  }, 0)
}

function onDragEnd() {
  isDragging.value = false
  dragIndex.value = null
  dropTargetIndex.value = null
}

function onDragOver(index) {
  if (dragIndex.value === null) return
  dropTargetIndex.value = index
}

function onDragEnter(index) {
  if (dragIndex.value === null) return
  dropTargetIndex.value = index
}

function onDragLeave(index) {
  if (dropTargetIndex.value === index) {
    dropTargetIndex.value = null
  }
}

function onDrop(index) {
  if (dragIndex.value === null || dragIndex.value === index) {
    onDragEnd()
    return
  }

  harmonyStore.moveChord(dragIndex.value, index)
  onDragEnd()
}
</script>

<style scoped>
.progression-display {
  flex: 1;
  overflow: auto;
  padding: 8px 0;
  position: relative;
}

.chord-sequence {
  display: flex;
  align-items: flex-start;
  gap: 6px 4px;
  flex-wrap: wrap;
  padding-top: 20px; /* Space for section markers */
  row-gap: 24px; /* More space between rows for markers */
}

.chord-item-wrapper {
  display: inline-flex;
  align-items: center;
  position: relative;
  margin-bottom: 4px;
}

.chord-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: transform 0.2s, opacity 0.2s;
  cursor: pointer;
  position: relative;
  user-select: none;
}

.chord-item:hover .chord-badge {
  transform: scale(1.05);
}

.chord-item.active {
  transform: scale(1.1);
}

.chord-item.active .chord-badge {
  box-shadow: 0 0 12px currentColor;
}

/* Drag states */
.chord-item.dragging {
  opacity: 0.4;
}

.chord-item.drag-over {
  transform: translateX(4px);
}

.chord-item.drag-over::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent-blue);
  border-radius: 2px;
}

.chord-badge {
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, monospace;
  transition: transform 0.15s, box-shadow 0.15s;
}

.chord-tonic {
  background: rgba(63, 185, 80, 0.2);
  color: var(--accent-green);
  border: 1px solid rgba(63, 185, 80, 0.3);
}

.chord-subdominant {
  background: rgba(210, 153, 34, 0.2);
  color: var(--accent-yellow);
  border: 1px solid rgba(210, 153, 34, 0.3);
}

.chord-dominant {
  background: rgba(248, 81, 73, 0.2);
  color: var(--accent-red);
  border: 1px solid rgba(248, 81, 73, 0.3);
}

.key-indicator {
  font-size: 10px;
  color: var(--accent-purple);
}

.arrow {
  color: var(--text-muted);
  margin: 0 4px;
}

/* Insert/Delete buttons */
.insert-btn,
.delete-btn {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  z-index: 10;
  opacity: 0;
  animation: fadeIn 0.15s ease forwards;
}

.insert-btn {
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--accent-blue);
  color: white;
}

.delete-btn {
  right: -6px;
  top: -6px;
  background: var(--accent-red);
  color: white;
}

@keyframes fadeIn {
  to { opacity: 1; }
}

.insert-btn:hover {
  transform: translateY(-50%) scale(1.15);
  background: #79c0ff;
}

.delete-btn:hover {
  transform: scale(1.15);
  background: #ff6b6b;
}

/* Add chord button */
.add-chord-btn {
  width: 28px;
  height: 28px;
  margin-left: 8px;
  border-radius: 50%;
  border: 2px dashed var(--border-color);
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.add-chord-btn:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
  background: rgba(88, 166, 255, 0.1);
}

/* Empty state */
.empty-state {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.empty-hint {
  font-size: 12px;
}

.add-first-btn {
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.add-first-btn:hover {
  background: var(--accent-blue);
  border-color: var(--accent-blue);
  color: white;
}

/* Clipboard toolbar */
.clipboard-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  border: 1px solid var(--accent-blue);
}

.selection-info {
  font-size: 12px;
  color: var(--accent-blue);
  font-weight: 500;
}

.toolbar-btn {
  padding: 4px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--accent-blue);
  border-color: var(--accent-blue);
  color: white;
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn.clear-btn {
  padding: 4px 8px;
  font-size: 14px;
  font-weight: 600;
}

.toolbar-btn.clear-btn:hover {
  background: var(--accent-red);
  border-color: var(--accent-red);
}

/* Selected chord state */
.chord-item.selected .chord-badge {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}

/* Section markers (v0.3.5) */
.section-marker {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  font-family: 'SF Mono', Monaco, monospace;
  cursor: pointer;
  transition: all 0.15s;
  z-index: 5;
}

.section-marker:hover {
  transform: translateX(-50%) scale(1.1);
}

.section-marker-a {
  background: rgba(63, 185, 80, 0.3);
  color: var(--accent-green);
  border: 1px solid rgba(63, 185, 80, 0.5);
}

.section-marker-b {
  background: rgba(210, 153, 34, 0.3);
  color: var(--accent-yellow);
  border: 1px solid rgba(210, 153, 34, 0.5);
}

.section-marker-c {
  background: rgba(163, 113, 247, 0.3);
  color: var(--accent-purple);
  border: 1px solid rgba(163, 113, 247, 0.5);
}
</style>

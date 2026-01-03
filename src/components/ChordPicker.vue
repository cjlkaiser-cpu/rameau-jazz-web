<template>
  <Teleport to="body">
    <div v-if="isOpen" class="picker-backdrop" @click="close">
      <div
        class="picker-dropdown"
        :style="dropdownStyle"
        @click.stop
        ref="dropdownRef"
      >
        <!-- Search -->
        <div class="picker-search">
          <input
            v-model="searchQuery"
            placeholder="Buscar acorde..."
            ref="searchInput"
            @keydown="handleKeydown"
          />
        </div>

        <!-- Categories -->
        <div class="picker-categories">
          <div
            v-for="category in filteredCategories"
            :key="category.id"
            class="category-section"
          >
            <div
              class="category-header"
              @click="toggleCategory(category.id)"
            >
              <span class="category-dot" :style="{ background: category.color }"></span>
              <span class="category-name">{{ category.name }}</span>
              <span class="category-count">({{ category.chords.length }})</span>
              <span class="category-chevron" :class="{ expanded: expandedCategories.has(category.id) }">
                &#9662;
              </span>
            </div>

            <div v-if="expandedCategories.has(category.id)" class="chord-grid">
              <button
                v-for="chord in category.chords"
                :key="chord"
                class="chord-option"
                :class="{
                  current: chord === currentDegree,
                  focused: chord === focusedChord
                }"
                @click="selectChord(chord)"
                @mouseenter="onChordHover(chord)"
                @mouseleave="cancelPreview"
              >
                {{ chord }}
              </button>
            </div>
          </div>
        </div>

        <!-- Keyboard hints -->
        <div class="picker-footer">
          <span><kbd>Enter</kbd> seleccionar</span>
          <span><kbd>Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useHarmonyStore } from '../stores/harmony'
import { HARMONIC_FUNCTIONS } from '../engine/JazzDegrees.js'

const props = defineProps({
  isOpen: Boolean,
  position: Object, // { x, y }
  currentDegree: String
})

const emit = defineEmits(['select', 'close'])

const harmonyStore = useHarmonyStore()

// Refs
const dropdownRef = ref(null)
const searchInput = ref(null)
const searchQuery = ref('')
const focusedChord = ref(null)
const expandedCategories = ref(new Set(['diatonic', 'dominant']))

// Preview debounce
let previewTimeout = null

// Chord categories with chords organized
const CATEGORIES = [
  { id: 'diatonic', name: 'Diatonicos', func: 'T', chords: ['Imaj7', 'Imaj9', 'I6', 'IIIm7', 'VIm7'] },
  { id: 'subdominant', name: 'Subdominantes', func: 'SD', chords: ['IIm7', 'IIm9', 'IVmaj7', 'IVmaj9'] },
  { id: 'dominant', name: 'Dominantes', func: 'D', chords: ['V7', 'V9', 'V13', 'VIIm7b5'] },
  { id: 'tritone', name: 'Sustitutos Tritono', func: 'D', chords: ['bII7', 'bVII7', '#IVm7b5'] },
  { id: 'secDom', name: 'Dominantes Secundarios', func: 'secD', chords: ['V7/ii', 'V7/V', 'V7/IV', 'V7/vi'] },
  { id: 'secSD', name: 'ii-V Secundarios', func: 'secSD', chords: ['iiø/ii', 'iiø/V'] },
  { id: 'passing', name: 'Disminuidos de Paso', func: 'pass', chords: ['#Idim7', '#IVdim7', 'bIIIdim7'] },
  { id: 'borrowed', name: 'Acordes Prestados', func: 'SD', chords: ['bVImaj7', 'bIIImaj7', 'IVm7', 'bIImaj7'] },
  { id: 'altered', name: 'Dominantes Alterados', func: 'D', chords: ['V7alt', 'V7b13', 'V7#11', 'V7sus4'] },
  { id: 'suspended', name: 'Suspendidos', func: 'T', chords: ['IIsus4', 'Isus2'] },
  { id: 'upperStruct', name: 'Upper Structures', func: 'D', chords: ['V7#9#5', 'IVmaj7#11'] },
  { id: 'coltrane', name: 'Coltrane (Giant Steps)', func: 'coltrane', chords: ['bIII7', 'bVI7', 'VI7'] }
]

// Add colors from HARMONIC_FUNCTIONS
const categoriesWithColors = CATEGORIES.map(cat => ({
  ...cat,
  color: HARMONIC_FUNCTIONS[cat.func]?.color || '#8b949e'
}))

const filteredCategories = computed(() => {
  if (!searchQuery.value) return categoriesWithColors

  const query = searchQuery.value.toLowerCase()
  return categoriesWithColors
    .map(cat => ({
      ...cat,
      chords: cat.chords.filter(c => c.toLowerCase().includes(query))
    }))
    .filter(cat => cat.chords.length > 0)
})

// Position calculation
const dropdownStyle = computed(() => {
  if (!props.position) return {}

  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth
  const dropdownHeight = 420
  const dropdownWidth = 300
  const spaceBelow = viewportHeight - props.position.y

  const positionAbove = spaceBelow < dropdownHeight && props.position.y > dropdownHeight

  // Clamp horizontal position
  let left = props.position.x - dropdownWidth / 2
  left = Math.max(10, Math.min(left, viewportWidth - dropdownWidth - 10))

  return {
    position: 'fixed',
    left: `${left}px`,
    ...(positionAbove
      ? { bottom: `${viewportHeight - props.position.y + 8}px` }
      : { top: `${props.position.y + 8}px` }
    ),
    maxHeight: `${Math.min(400, positionAbove ? props.position.y - 20 : spaceBelow - 20)}px`
  }
})

// Methods
function selectChord(degree) {
  emit('select', degree)
  close()
}

function close() {
  searchQuery.value = ''
  focusedChord.value = null
  emit('close')
}

function toggleCategory(id) {
  if (expandedCategories.value.has(id)) {
    expandedCategories.value.delete(id)
  } else {
    expandedCategories.value.add(id)
  }
}

function onChordHover(degree) {
  focusedChord.value = degree
  cancelPreview()
  previewTimeout = setTimeout(() => {
    harmonyStore.previewChord(degree, harmonyStore.key)
  }, 300)
}

function cancelPreview() {
  if (previewTimeout) {
    clearTimeout(previewTimeout)
    previewTimeout = null
  }
}

// Keyboard navigation
function handleKeydown(e) {
  if (e.key === 'Escape') {
    close()
  } else if (e.key === 'Enter' && focusedChord.value) {
    selectChord(focusedChord.value)
  }
}

// Focus search on open
watch(() => props.isOpen, (open) => {
  if (open) {
    nextTick(() => searchInput.value?.focus())
    // Expand category of current chord if applicable
    if (props.currentDegree) {
      for (const cat of CATEGORIES) {
        if (cat.chords.includes(props.currentDegree)) {
          expandedCategories.value.add(cat.id)
          break
        }
      }
    }
  } else {
    cancelPreview()
  }
})
</script>

<style scoped>
.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.picker-dropdown {
  width: 300px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.picker-search {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.picker-search input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
}

.picker-search input::placeholder {
  color: var(--text-muted);
}

.picker-search input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.picker-categories {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.category-section {
  margin-bottom: 4px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.category-header:hover {
  background: var(--bg-tertiary);
}

.category-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.category-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.category-count {
  font-size: 11px;
  color: var(--text-muted);
}

.category-chevron {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-muted);
  transition: transform 0.2s;
}

.category-chevron.expanded {
  transform: rotate(180deg);
}

.chord-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 8px 10px;
}

.chord-option {
  padding: 6px 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chord-option:hover {
  background: var(--bg-hover, #30363d);
  border-color: var(--accent-blue);
}

.chord-option.current {
  background: var(--accent-blue);
  color: white;
  border-color: var(--accent-blue);
}

.chord-option.focused:not(.current) {
  outline: 2px solid var(--accent-blue);
  outline-offset: 1px;
}

.picker-footer {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-top: 1px solid var(--border-color);
  font-size: 10px;
  color: var(--text-muted);
}

.picker-footer kbd {
  padding: 2px 4px;
  background: var(--bg-secondary);
  border-radius: 3px;
  font-family: inherit;
}
</style>

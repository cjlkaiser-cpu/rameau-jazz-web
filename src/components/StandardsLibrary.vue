<template>
  <div class="standards-library" v-if="isOpen">
    <div class="library-backdrop" @click="$emit('close')"></div>
    <div class="library-modal">
      <div class="library-header">
        <h2>Standards Library</h2>
        <span class="standards-count">{{ filteredStandards.length }} de {{ standards.length }}</span>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <!-- Search -->
      <div class="search-box">
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          placeholder="Buscar standard... (Autumn, Giant, Blue...)"
          @keydown.enter="selectFirst"
          @keydown.escape="$emit('close')"
        />
      </div>

      <!-- Results list -->
      <div class="standards-list" v-if="!loading">
        <div
          v-for="standard in filteredStandards.slice(0, 100)"
          :key="standard.id"
          class="standard-item"
          @click="selectStandard(standard)"
        >
          <div class="standard-title">{{ standard.title }}</div>
          <div class="standard-meta">
            <span class="composer">{{ standard.composer || 'Unknown' }}</span>
            <span class="bars">{{ standard.chords.length }} bars</span>
            <span class="key">{{ standard.key }}</span>
          </div>
        </div>

        <div v-if="filteredStandards.length > 100" class="more-results">
          ... y {{ filteredStandards.length - 100 }} más
        </div>

        <div v-if="filteredStandards.length === 0" class="no-results">
          No se encontraron standards
        </div>
      </div>

      <div class="loading" v-else>
        Cargando biblioteca...
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close', 'select'])

// State
const standards = ref([])
const loading = ref(true)
const searchQuery = ref('')
const searchInput = ref(null)

// Load standards on mount
onMounted(async () => {
  try {
    const response = await fetch('./data/standards.json')
    const data = await response.json()
    standards.value = data.standards
    loading.value = false
  } catch (err) {
    console.error('Failed to load standards:', err)
    loading.value = false
  }
})

// Focus search when opened
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
})

// Filtered standards
const filteredStandards = computed(() => {
  if (!searchQuery.value.trim()) {
    return standards.value
  }

  const query = searchQuery.value.toLowerCase()
  return standards.value.filter(s =>
    s.title.toLowerCase().includes(query) ||
    (s.composer && s.composer.toLowerCase().includes(query))
  )
})

// Select standard
function selectStandard(standard) {
  emit('select', standard)
  emit('close')
}

// Select first result on Enter
function selectFirst() {
  if (filteredStandards.value.length > 0) {
    selectStandard(filteredStandards.value[0])
  }
}
</script>

<style scoped>
.standards-library {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.library-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
}

.library-modal {
  position: relative;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.library-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.library-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.standards-count {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--accent-red);
  color: white;
}

.search-box {
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-color);
}

.search-box input {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
}

.search-box input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.search-box input::placeholder {
  color: var(--text-muted);
}

.standards-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.standard-item {
  padding: 12px 16px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.15s;
}

.standard-item:hover {
  background: var(--bg-tertiary);
}

.standard-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.standard-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-muted);
}

.composer {
  flex: 1;
}

.bars {
  color: var(--accent-blue);
}

.key {
  color: var(--accent-green);
  font-family: 'SF Mono', Monaco, monospace;
}

.more-results,
.no-results {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.loading {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}
</style>

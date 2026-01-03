<template>
  <div class="circle-container panel">
    <div class="panel-header">Circulo de Quintas</div>
    <svg :viewBox="`0 0 ${size} ${size}`" class="circle-svg">
      <!-- Key segments -->
      <g
        v-for="(key, idx) in keys"
        :key="key.name"
        class="key-segment"
        :class="{ active: key.name === currentKey }"
        @click="selectKey(key.name)"
      >
        <path
          :d="getSegmentPath(idx)"
          :fill="key.name === currentKey ? 'var(--accent-blue)' : 'var(--bg-tertiary)'"
          stroke="var(--border-color)"
          stroke-width="1"
        />
        <text
          :x="getLabelPosition(idx).x"
          :y="getLabelPosition(idx).y"
          text-anchor="middle"
          dominant-baseline="middle"
          :fill="key.name === currentKey ? 'white' : 'var(--text-primary)'"
          font-size="12"
          font-weight="600"
        >
          {{ key.name }}
        </text>
      </g>

      <!-- Center circle -->
      <circle
        :cx="center"
        :cy="center"
        :r="innerRadius - 10"
        fill="var(--bg-secondary)"
        stroke="var(--border-color)"
      />
      <text
        :x="center"
        :y="center"
        text-anchor="middle"
        dominant-baseline="middle"
        fill="var(--text-primary)"
        font-size="14"
        font-weight="700"
      >
        {{ currentKey }}
      </text>
    </svg>

    <!-- Current chord display -->
    <div class="current-chord-display">
      <span class="chord-degree">{{ currentChord }}</span>
      <span class="chord-name">{{ absoluteChordName }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useHarmonyStore } from '../stores/harmony'

const harmonyStore = useHarmonyStore()

const size = 180
const center = size / 2
const outerRadius = size / 2 - 5
const innerRadius = size / 3

const currentKey = computed(() => harmonyStore.key)
const currentChord = computed(() => harmonyStore.currentChord)

// Convert Roman numeral degree to absolute chord name
const absoluteChordName = computed(() => {
  const degree = currentChord.value
  const key = currentKey.value
  if (!degree) return ''

  return degreeToAbsolute(degree, key)
})

/**
 * Convert a Roman numeral degree to absolute chord name
 * e.g., "IIm7" in key of C = "Dm7"
 */
function degreeToAbsolute(degree, key) {
  // Parse Roman numeral and quality
  const match = degree.match(/^(b?#?)([IViv]+)(.*)$/)
  if (!match) return degree

  const accidental = match[1] // 'b', '#', or ''
  const numeral = match[2].toUpperCase()
  const quality = match[3] // 'm7', 'maj7', '7', etc.

  // Roman numeral to semitone offset
  const numeralToSemitone = {
    'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11
  }

  let semitones = numeralToSemitone[numeral] ?? 0

  // Apply accidental
  if (accidental === 'b') semitones -= 1
  if (accidental === '#') semitones += 1

  // Key to semitone
  const keyToSemitone = {
    'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5,
    'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11
  }

  const keySemitone = keyToSemitone[key] ?? 0
  const noteSemitone = (keySemitone + semitones + 12) % 12

  // Semitone to note name (prefer flats for jazz)
  const semitoneToNote = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
  const noteName = semitoneToNote[noteSemitone]

  return noteName + quality
}

// Circle of fifths order
const keys = [
  { name: 'C', angle: -90 },
  { name: 'G', angle: -60 },
  { name: 'D', angle: -30 },
  { name: 'A', angle: 0 },
  { name: 'E', angle: 30 },
  { name: 'B', angle: 60 },
  { name: 'Gb', angle: 90 },
  { name: 'Db', angle: 120 },
  { name: 'Ab', angle: 150 },
  { name: 'Eb', angle: 180 },
  { name: 'Bb', angle: 210 },
  { name: 'F', angle: 240 }
]

function getSegmentPath(idx) {
  const segmentAngle = 360 / 12
  const startAngle = (idx * segmentAngle - 90 - segmentAngle / 2) * Math.PI / 180
  const endAngle = (idx * segmentAngle - 90 + segmentAngle / 2) * Math.PI / 180

  const x1 = center + innerRadius * Math.cos(startAngle)
  const y1 = center + innerRadius * Math.sin(startAngle)
  const x2 = center + outerRadius * Math.cos(startAngle)
  const y2 = center + outerRadius * Math.sin(startAngle)
  const x3 = center + outerRadius * Math.cos(endAngle)
  const y3 = center + outerRadius * Math.sin(endAngle)
  const x4 = center + innerRadius * Math.cos(endAngle)
  const y4 = center + innerRadius * Math.sin(endAngle)

  return `M ${x1} ${y1} L ${x2} ${y2} A ${outerRadius} ${outerRadius} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${innerRadius} ${innerRadius} 0 0 0 ${x1} ${y1} Z`
}

function getLabelPosition(idx) {
  const segmentAngle = 360 / 12
  const angle = (idx * segmentAngle - 90) * Math.PI / 180
  const labelRadius = (innerRadius + outerRadius) / 2

  return {
    x: center + labelRadius * Math.cos(angle),
    y: center + labelRadius * Math.sin(angle)
  }
}

function selectKey(key) {
  harmonyStore.setKey(key)
}
</script>

<style scoped>
.circle-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.circle-svg {
  width: 100%;
  max-width: 180px;
  cursor: pointer;
}

.key-segment {
  transition: all 0.2s;
}

.key-segment:hover path {
  fill: var(--bg-hover) !important;
}

.key-segment.active:hover path {
  fill: var(--accent-blue) !important;
}

/* Current chord display */
.current-chord-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  min-width: 100px;
}

.chord-degree {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'SF Mono', Monaco, monospace;
}

.chord-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent-blue);
  font-family: 'SF Mono', Monaco, monospace;
  letter-spacing: 0.5px;
}
</style>

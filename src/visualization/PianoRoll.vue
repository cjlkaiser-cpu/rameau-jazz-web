<template>
  <div class="piano-roll panel">
    <div class="piano-keys">
      <div
        v-for="note in visibleNotes"
        :key="note.midi"
        class="key"
        :class="{ black: note.isBlack, active: isNoteActive(note.midi) }"
      >
        <span class="key-label" v-if="note.showLabel">{{ note.name }}</span>
      </div>
    </div>
    <canvas ref="canvasRef" class="roll-canvas"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useHarmonyStore } from '../stores/harmony'
import { JAZZ_DEGREES } from '../engine/JazzDegrees.js'
import { getVoicing } from '../engine/Voicings.js'
import { parseMelody } from '../engine/MelodyParser.js'

const harmonyStore = useHarmonyStore()
const canvasRef = ref(null)

// Piano range: C2 (36) to C7 (96) - extended for melodies
const minPitch = 36
const maxPitch = 96
const pitchRange = maxPitch - minPitch

// Canvas dimensions
let canvasWidth = 800
let canvasHeight = 150
let ctx = null
let animationId = null

// Colors
const colors = {
  background: '#161b22',
  gridLine: '#21262d',
  gridBeat: '#30363d',
  bass: '#58a6ff',
  chord: '#a371f7',
  melody: '#f0883e',  // Orange for melody
  playhead: '#f85149',
  noteActive: '#3fb950'
}

// Parsed melody notes
const parsedMelody = computed(() => {
  if (!harmonyStore.currentMelody) return []
  return parseMelody(harmonyStore.currentMelody)
})

// Generate visible notes for piano keys
const visibleNotes = computed(() => {
  const notes = []
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const blackKeys = [1, 3, 6, 8, 10]

  for (let midi = minPitch; midi <= maxPitch; midi++) {
    const noteIndex = midi % 12
    const octave = Math.floor(midi / 12) - 1
    const isBlack = blackKeys.includes(noteIndex)

    notes.push({
      midi,
      name: noteNames[noteIndex] + octave,
      isBlack,
      showLabel: noteIndex === 0 // Show label only for C notes
    })
  }

  return notes.reverse() // Top to bottom (high to low)
})

// Current active notes based on voicing
const activeNotes = computed(() => {
  if (harmonyStore.progression.length === 0) return []

  const chordInfo = harmonyStore.progression[harmonyStore.currentMeasure]
  if (!chordInfo) return []

  const degreeInfo = JAZZ_DEGREES[chordInfo.degree]
  if (!degreeInfo) return []

  const rootPitch = getRootPitch(chordInfo.degree, chordInfo.key)
  const voicing = getVoicing(rootPitch, degreeInfo.type, harmonyStore.voicingStyle)

  return [...voicing.left, ...voicing.right]
})

function isNoteActive(midi) {
  return activeNotes.value.includes(midi)
}

function getRootPitch(degree, key) {
  const keyPitches = {
    'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5,
    'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11
  }

  const degreeInfo = JAZZ_DEGREES[degree]
  const keyOffset = keyPitches[key] || 0
  const root = degreeInfo?.root || 0

  return 48 + keyOffset + root
}

onMounted(() => {
  initCanvas()
  startAnimation()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  stopAnimation()
  window.removeEventListener('resize', handleResize)
})

watch(() => harmonyStore.progression, () => {
  draw()
}, { deep: true })

watch(() => harmonyStore.currentMeasure, () => {
  draw()
})

function handleResize() {
  initCanvas()
  draw()
}

function initCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return

  const container = canvas.parentElement
  canvasWidth = container.clientWidth - 50 // Account for piano keys
  canvasHeight = container.clientHeight

  const dpr = window.devicePixelRatio || 1
  canvas.width = canvasWidth * dpr
  canvas.height = canvasHeight * dpr
  canvas.style.width = canvasWidth + 'px'
  canvas.style.height = canvasHeight + 'px'

  ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
}

function startAnimation() {
  function animate() {
    draw()
    animationId = requestAnimationFrame(animate)
  }
  animate()
}

function stopAnimation() {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
}

function draw() {
  if (!ctx) return

  // Clear
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // Draw grid
  drawGrid()

  // Draw chord notes (bass + chords)
  drawNotes()

  // Draw melody notes on top
  drawMelody()

  // Draw playhead
  drawPlayhead()
}

function drawGrid() {
  const numMeasures = Math.max(harmonyStore.progression.length, 8)
  const measureWidth = canvasWidth / numMeasures
  const noteHeight = canvasHeight / pitchRange

  // Horizontal lines (pitch grid)
  ctx.strokeStyle = colors.gridLine
  ctx.lineWidth = 0.5

  for (let i = 0; i <= pitchRange; i++) {
    const y = i * noteHeight
    const midi = maxPitch - i

    // Highlight C notes
    if (midi % 12 === 0) {
      ctx.strokeStyle = colors.gridBeat
      ctx.lineWidth = 1
    } else {
      ctx.strokeStyle = colors.gridLine
      ctx.lineWidth = 0.5
    }

    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvasWidth, y)
    ctx.stroke()
  }

  // Vertical lines (beats)
  for (let m = 0; m <= numMeasures; m++) {
    const x = m * measureWidth

    // Measure line (thicker)
    ctx.strokeStyle = colors.gridBeat
    ctx.lineWidth = m % 4 === 0 ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvasHeight)
    ctx.stroke()

    // Beat lines within measure
    ctx.strokeStyle = colors.gridLine
    ctx.lineWidth = 0.5
    for (let b = 1; b < 4; b++) {
      const bx = x + (b * measureWidth / 4)
      ctx.beginPath()
      ctx.moveTo(bx, 0)
      ctx.lineTo(bx, canvasHeight)
      ctx.stroke()
    }
  }
}

function drawNotes() {
  if (harmonyStore.progression.length === 0) return

  const numMeasures = harmonyStore.progression.length
  const measureWidth = canvasWidth / numMeasures
  const noteHeight = canvasHeight / pitchRange

  harmonyStore.progression.forEach((chord, measureIndex) => {
    const degreeInfo = JAZZ_DEGREES[chord.degree]
    if (!degreeInfo) return

    const rootPitch = getRootPitch(chord.degree, chord.key)
    const voicing = getVoicing(rootPitch, degreeInfo.type, harmonyStore.voicingStyle)

    const x = measureIndex * measureWidth
    const isCurrentMeasure = measureIndex === harmonyStore.currentMeasure

    // Draw left hand (bass)
    voicing.left.forEach(midi => {
      if (midi >= minPitch && midi <= maxPitch) {
        const y = (maxPitch - midi) * noteHeight
        ctx.fillStyle = isCurrentMeasure ? colors.noteActive : colors.bass
        ctx.globalAlpha = isCurrentMeasure ? 1 : 0.6
        ctx.fillRect(x + 2, y, measureWidth - 4, noteHeight - 1)
        ctx.globalAlpha = 1
      }
    })

    // Draw right hand (chord)
    voicing.right.forEach(midi => {
      if (midi >= minPitch && midi <= maxPitch) {
        const y = (maxPitch - midi) * noteHeight
        ctx.fillStyle = isCurrentMeasure ? colors.noteActive : colors.chord
        ctx.globalAlpha = isCurrentMeasure ? 1 : 0.6
        ctx.fillRect(x + 2, y, measureWidth - 4, noteHeight - 1)
        ctx.globalAlpha = 1
      }
    })
  })
}

function drawMelody() {
  const melody = parsedMelody.value
  if (melody.length === 0) return
  if (!harmonyStore.melodyEnabled) return

  const noteHeight = canvasHeight / pitchRange
  const beatsPerMeasure = 4

  // Calculate melody duration
  const melodyDuration = melody.length > 0
    ? melody[melody.length - 1].startBeat + melody[melody.length - 1].duration
    : 0

  if (melodyDuration === 0) return

  // Use melody duration to determine canvas scale (no artificial scaling)
  const pixelsPerBeat = canvasWidth / melodyDuration

  // Calculate beats per chord for current measure highlighting
  const beatsPerChord = harmonyStore.progression.length > 0
    ? melodyDuration / harmonyStore.progression.length
    : beatsPerMeasure

  melody.forEach(note => {
    if (note.isRest || note.pitch === null) return
    if (note.pitch < minPitch || note.pitch > maxPitch) return

    const x = note.startBeat * pixelsPerBeat
    const width = Math.max(note.duration * pixelsPerBeat - 2, 4)
    const y = (maxPitch - note.pitch) * noteHeight

    // Check if this note is in the current chord
    const noteChordIndex = Math.floor(note.startBeat / beatsPerChord)
    const isCurrentMeasure = noteChordIndex === harmonyStore.currentMeasure

    // Draw melody note (rounded rectangle)
    ctx.fillStyle = isCurrentMeasure ? '#ffa657' : colors.melody
    ctx.globalAlpha = isCurrentMeasure ? 1 : 0.8

    // Rounded rectangle
    const radius = 2
    ctx.beginPath()
    ctx.roundRect(x, y, width, noteHeight - 1, radius)
    ctx.fill()

    ctx.globalAlpha = 1
  })
}

function drawPlayhead() {
  if (!harmonyStore.isPlaying && harmonyStore.currentBeat === 0) return

  const numMeasures = Math.max(harmonyStore.progression.length, 1)
  const measureWidth = canvasWidth / numMeasures

  const totalBeats = harmonyStore.currentMeasure * 4 + harmonyStore.currentBeat
  const x = (totalBeats / 4) * measureWidth

  ctx.strokeStyle = colors.playhead
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, 0)
  ctx.lineTo(x, canvasHeight)
  ctx.stroke()

  // Playhead triangle
  ctx.fillStyle = colors.playhead
  ctx.beginPath()
  ctx.moveTo(x - 6, 0)
  ctx.lineTo(x + 6, 0)
  ctx.lineTo(x, 10)
  ctx.closePath()
  ctx.fill()
}
</script>

<style scoped>
.piano-roll {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.piano-keys {
  width: 50px;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
}

.key {
  flex: 1;
  min-height: 3px;
  background: #e0e0e0;
  border-bottom: 1px solid #ccc;
  position: relative;
  transition: background 0.1s;
}

.key.black {
  background: #333;
  border-bottom-color: #222;
  margin-left: 20px;
  z-index: 1;
}

.key.active {
  background: var(--accent-green) !important;
}

.key-label {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 8px;
  color: #666;
}

.key.black .key-label {
  color: #999;
}

.roll-canvas {
  flex: 1;
  min-width: 0;
}
</style>

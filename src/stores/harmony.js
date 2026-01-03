import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { MarkovEngine } from '../engine/MarkovEngine.js'
import { SongFormEngine, FORM_TEMPLATES } from '../engine/SongFormEngine.js'
import { JAZZ_DEGREES } from '../engine/JazzDegrees.js'
import { getAudioEngine } from '../audio/AudioEngine.js'

// Instancia del motor
const engine = new MarkovEngine()
const songFormEngine = new SongFormEngine()

export const useHarmonyStore = defineStore('harmony', () => {
  // === TONALIDAD ===
  const key = ref('C')
  const mode = ref('major') // 'major' | 'minor'

  // === CLIPBOARD (v0.3.0) ===
  const clipboard = ref([]) // Array of {degree, key, tension}

  // === SONG FORM (v0.3.5) ===
  const songForm = ref('AABA') // Current form template

  // === MELODY (v0.4.0) ===
  const currentMelody = ref(null) // Raw melody string from .ls format
  const melodyEnabled = ref(true) // Toggle melody playback

  // === MOTOR ===
  const currentChord = ref('Imaj7')
  const progression = ref([]) // Array of { degree, key, tension }
  const tension = ref(0)
  const gravity = ref(0.5) // 0 = caos, 1 = estricto

  // === MODULACION ===
  const modulationEnabled = ref(true)
  const modulationProbability = ref(0.15)
  const modulationLevel = ref(2) // 0 = Basicas, 1 = Extendidas, 2 = Coltrane
  const returnToTonic = ref(true)

  // === ESTILO ===
  const voicingStyle = ref('shell') // 'shell' | 'drop2' | 'rootlessA' | 'rootlessB' | 'block'
  const stylePreset = ref('standard') // 'standard' | 'bebop' | 'bossaNova' | 'modal' | 'ballad'
  const tempo = ref(120)
  const swingAmount = ref(0.3) // 0 = straight, 1 = full swing

  // === AUDIO ===
  const isPlaying = ref(false)
  const audioInitialized = ref(false)
  const masterVolume = ref(0.7)
  const pianoVolume = ref(0.8)
  const bassVolume = ref(0.7)
  const drumsVolume = ref(0.5)
  const melodyVolume = ref(0.7)
  const bassEnabled = ref(true)
  const drumsEnabled = ref(true)

  // === VISUALIZACION ===
  const showForceGraph = ref(true)
  const showPianoRoll = ref(true)
  const currentBeat = ref(0)
  const currentMeasure = ref(0)

  // === COMPUTED ===
  const keySignature = computed(() => {
    const keyNames = {
      'C': 'Do', 'G': 'Sol', 'D': 'Re', 'A': 'La', 'E': 'Mi', 'B': 'Si',
      'F': 'Fa', 'Bb': 'Sib', 'Eb': 'Mib', 'Ab': 'Lab', 'Db': 'Reb', 'Gb': 'Solb'
    }
    return `${keyNames[key.value] || key.value} ${mode.value === 'major' ? 'Mayor' : 'menor'}`
  })

  const progressionString = computed(() => {
    return progression.value.map(p => {
      const keyIndicator = p.key !== key.value ? ` [${p.key}]` : ''
      return `${p.degree}${keyIndicator}`
    }).join(' → ')
  })

  // === SYNC ENGINE CONFIG ===
  function syncEngineConfig() {
    engine.configure({
      gravity: gravity.value,
      modulationEnabled: modulationEnabled.value,
      modulationProbability: modulationProbability.value,
      modulationLevel: modulationLevel.value,
      returnToTonic: returnToTonic.value,
      forceCadence: true
    })
  }

  // === SYNC AUDIO CONFIG ===
  function syncAudioConfig() {
    const audioEngine = getAudioEngine()
    audioEngine.configure({
      tempo: tempo.value,
      swing: swingAmount.value,
      voicingStyle: voicingStyle.value,
      bassEnabled: bassEnabled.value,
      drumsEnabled: drumsEnabled.value,
      melodyEnabled: melodyEnabled.value,
      pianoVolume: pianoVolume.value,
      bassVolume: bassVolume.value,
      drumsVolume: drumsVolume.value,
      melodyVolume: melodyVolume.value
    })
  }

  // === INIT AUDIO ===
  async function initAudio() {
    if (audioInitialized.value) return true

    const audioEngine = getAudioEngine()
    const success = await audioEngine.init()

    if (success) {
      audioInitialized.value = true
      syncAudioConfig()

      // Registrar callbacks
      audioEngine.onBeat((info) => {
        currentBeat.value = info.beat
        currentMeasure.value = info.measure
      })

      audioEngine.onMeasure((measureIndex, chord) => {
        currentChord.value = chord.degree
        tension.value = chord.tension
      })
    }

    return success
  }

  // === ACTIONS ===
  function setKey(newKey) {
    key.value = newKey
    progression.value = []
    currentChord.value = 'Imaj7'
    tension.value = 0
  }

  function setMode(newMode) {
    mode.value = newMode
  }

  function step() {
    syncEngineConfig()
    const result = engine.step()
    currentChord.value = result.degree
    tension.value = result.tension
    progression.value.push(result)
    return result
  }

  function generateProgression(numChords = 8) {
    syncEngineConfig()
    const result = engine.generateProgression(numChords, key.value)
    progression.value = result

    // Actualizar estado
    if (result.length > 0) {
      const first = result[0]
      currentChord.value = first.degree
      tension.value = first.tension
      currentMeasure.value = 0
      currentBeat.value = 0
    }

    // Cargar en audio engine
    const audioEngine = getAudioEngine()
    audioEngine.loadProgression(result)

    return result
  }

  function generateSongForm(formType = null) {
    const form = formType || songForm.value
    songForm.value = form

    const result = songFormEngine.generate(form, key.value)
    progression.value = result

    // Actualizar estado
    if (result.length > 0) {
      const first = result[0]
      currentChord.value = first.degree
      tension.value = first.tension
      currentMeasure.value = 0
      currentBeat.value = 0
    }

    // Cargar en audio engine
    const audioEngine = getAudioEngine()
    audioEngine.loadProgression(result)

    return result
  }

  function loadProgression(newProgression) {
    progression.value = newProgression

    // Actualizar estado
    if (newProgression.length > 0) {
      const first = newProgression[0]
      currentChord.value = first.degree
      tension.value = first.tension ?? 0.5
      currentMeasure.value = 0
      currentBeat.value = 0
    }

    // Cargar en audio engine
    const audioEngine = getAudioEngine()
    audioEngine.loadProgression(newProgression)

    return newProgression
  }

  async function play() {
    // Inicializar audio si es necesario
    if (!audioInitialized.value) {
      const success = await initAudio()
      if (!success) {
        console.error('Failed to initialize audio')
        return
      }
    }

    // Generar progresion si no hay
    if (progression.value.length === 0) {
      generateProgression(8)
    }

    syncAudioConfig()
    const audioEngine = getAudioEngine()
    audioEngine.play()
    isPlaying.value = true
  }

  function pause() {
    const audioEngine = getAudioEngine()
    audioEngine.pause()
    isPlaying.value = false
  }

  function stop() {
    const audioEngine = getAudioEngine()
    audioEngine.stop()
    isPlaying.value = false
    currentBeat.value = 0
    currentMeasure.value = 0
  }

  function setTempo(newTempo) {
    tempo.value = Math.max(40, Math.min(240, newTempo))
    if (audioInitialized.value) {
      const audioEngine = getAudioEngine()
      audioEngine.setTempo(tempo.value)
    }
  }

  function setSwingAmount(amount) {
    swingAmount.value = Math.max(0, Math.min(1, amount))
    if (audioInitialized.value) {
      const audioEngine = getAudioEngine()
      audioEngine.setSwing(swingAmount.value)
    }
  }

  function setGravity(newGravity) {
    gravity.value = Math.max(0, Math.min(1, newGravity))
  }

  function setModulationProbability(prob) {
    modulationProbability.value = Math.max(0, Math.min(0.5, prob))
  }

  function setVoicingStyle(style) {
    voicingStyle.value = style
    if (audioInitialized.value) {
      const audioEngine = getAudioEngine()
      audioEngine.setVoicingStyle(style)
    }
  }

  function setStylePreset(preset) {
    stylePreset.value = preset
    // Apply preset configurations
    switch (preset) {
      case 'bebop':
        swingAmount.value = 0.4
        tempo.value = 180
        gravity.value = 0.3
        modulationProbability.value = 0.25
        break
      case 'bossaNova':
        swingAmount.value = 0
        tempo.value = 140
        gravity.value = 0.6
        modulationProbability.value = 0.1
        break
      case 'modal':
        swingAmount.value = 0.2
        tempo.value = 120
        gravity.value = 0.7
        modulationProbability.value = 0.05
        break
      case 'ballad':
        swingAmount.value = 0.15
        tempo.value = 72
        gravity.value = 0.5
        modulationProbability.value = 0.12
        break
      default: // standard
        swingAmount.value = 0.25
        tempo.value = 120
        gravity.value = 0.5
        modulationProbability.value = 0.15
    }

    if (audioInitialized.value) {
      syncAudioConfig()
    }
  }

  function setVolume(channel, value) {
    const vol = Math.max(0, Math.min(1, value))
    const audioEngine = getAudioEngine()

    switch (channel) {
      case 'master':
        masterVolume.value = vol
        break
      case 'piano':
        pianoVolume.value = vol
        if (audioInitialized.value) audioEngine.setPianoVolume(vol)
        break
      case 'bass':
        bassVolume.value = vol
        if (audioInitialized.value) audioEngine.setBassVolume(vol)
        break
      case 'drums':
        drumsVolume.value = vol
        if (audioInitialized.value) audioEngine.setDrumsVolume(vol)
        break
    }
  }

  function setBassEnabled(enabled) {
    bassEnabled.value = enabled
    if (audioInitialized.value) {
      const audioEngine = getAudioEngine()
      audioEngine.setBassEnabled(enabled)
    }
  }

  function setDrumsEnabled(enabled) {
    drumsEnabled.value = enabled
    if (audioInitialized.value) {
      const audioEngine = getAudioEngine()
      audioEngine.setDrumsEnabled(enabled)
    }
  }

  function setMelodyVolume(value) {
    melodyVolume.value = Math.max(0, Math.min(1, value))
    if (audioInitialized.value) {
      const audioEngine = getAudioEngine()
      audioEngine.setMelodyVolume(melodyVolume.value)
    }
  }

  function setMelodyEnabled(enabled) {
    melodyEnabled.value = enabled
    if (audioInitialized.value) {
      const audioEngine = getAudioEngine()
      audioEngine.setMelodyEnabled(enabled)
    }
  }

  function loadMelody(melodyStr) {
    currentMelody.value = melodyStr
    if (audioInitialized.value) {
      const audioEngine = getAudioEngine()
      audioEngine.loadMelody(melodyStr)
    }
  }

  function modulate(interval) {
    const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    const currentIndex = keys.indexOf(key.value)
    const newIndex = (currentIndex + interval + 12) % 12
    key.value = keys[newIndex]
    currentChord.value = 'Imaj7'
    tension.value = 0
  }

  // Preview a single chord
  async function previewChord(degree, chordKey) {
    if (!audioInitialized.value) {
      await initAudio()
    }
    const audioEngine = getAudioEngine()
    audioEngine.previewChord(degree, chordKey || key.value)
  }

  // Helper para obtener info del acorde actual
  function getCurrentChordInfo() {
    const degree = JAZZ_DEGREES[currentChord.value]
    return {
      degree: currentChord.value,
      type: degree?.type || 'maj7',
      root: degree?.root || 0,
      func: degree?.func || 'T',
      tension: degree?.tension || 0
    }
  }

  // === CHORD EDITING (v0.3.0) ===

  /**
   * Helper to reload progression in audio engine
   */
  function reloadAudioProgression() {
    if (audioInitialized.value) {
      const audioEngine = getAudioEngine()
      audioEngine.loadProgression(progression.value)
    }
  }

  /**
   * Update a chord at a specific index
   * @param {number} index - Position in progression
   * @param {object} updates - {degree?, key?, tension?}
   */
  function updateChordAt(index, updates) {
    if (index < 0 || index >= progression.value.length) return

    const chord = progression.value[index]
    const newDegree = updates.degree || chord.degree
    const degreeInfo = JAZZ_DEGREES[newDegree]

    progression.value[index] = {
      ...chord,
      ...updates,
      // Recalculate tension from JAZZ_DEGREES if degree changed
      tension: updates.degree
        ? (degreeInfo?.tension ?? chord.tension)
        : (updates.tension ?? chord.tension)
    }

    reloadAudioProgression()
  }

  /**
   * Insert a chord at a specific index
   * @param {number} index - Position to insert at
   * @param {object} chord - {degree, key?, tension?}
   */
  function insertChordAt(index, chord) {
    const degreeInfo = JAZZ_DEGREES[chord.degree]
    const newChord = {
      degree: chord.degree,
      key: chord.key ?? key.value,
      tension: chord.tension ?? (degreeInfo?.tension ?? 0)
    }

    progression.value.splice(index, 0, newChord)
    reloadAudioProgression()
  }

  /**
   * Remove chord at index
   * @param {number} index - Position to remove
   */
  function removeChordAt(index) {
    if (progression.value.length <= 1) return // Keep at least one chord
    if (index < 0 || index >= progression.value.length) return

    progression.value.splice(index, 1)

    // Adjust currentMeasure if needed
    if (currentMeasure.value >= progression.value.length) {
      currentMeasure.value = progression.value.length - 1
    }

    reloadAudioProgression()
  }

  /**
   * Move chord from one position to another
   * @param {number} fromIndex - Source position
   * @param {number} toIndex - Destination position
   */
  function moveChord(fromIndex, toIndex) {
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || fromIndex >= progression.value.length) return
    if (toIndex < 0 || toIndex >= progression.value.length) return

    const [chord] = progression.value.splice(fromIndex, 1)
    progression.value.splice(toIndex, 0, chord)

    reloadAudioProgression()
  }

  /**
   * Copy chords to clipboard
   * @param {number[]} indices - Array of indices to copy
   */
  function copyChords(indices) {
    if (!indices || indices.length === 0) return

    const sorted = [...indices].sort((a, b) => a - b)
    clipboard.value = sorted
      .filter(i => i >= 0 && i < progression.value.length)
      .map(i => ({ ...progression.value[i] }))
  }

  /**
   * Paste chords from clipboard at position
   * @param {number} atIndex - Position to insert at
   */
  function pasteChords(atIndex) {
    if (clipboard.value.length === 0) return

    const insertAt = Math.min(Math.max(0, atIndex), progression.value.length)
    const cloned = clipboard.value.map(c => ({ ...c }))

    progression.value.splice(insertAt, 0, ...cloned)
    reloadAudioProgression()
  }

  /**
   * Check if clipboard has content
   */
  function hasClipboard() {
    return clipboard.value.length > 0
  }

  return {
    // State
    key,
    mode,
    currentChord,
    progression,
    tension,
    gravity,
    modulationEnabled,
    modulationProbability,
    modulationLevel,
    returnToTonic,
    voicingStyle,
    stylePreset,
    tempo,
    swingAmount,
    isPlaying,
    audioInitialized,
    masterVolume,
    pianoVolume,
    bassVolume,
    drumsVolume,
    melodyVolume,
    bassEnabled,
    drumsEnabled,
    showForceGraph,
    showPianoRoll,
    currentBeat,
    currentMeasure,

    // Computed
    keySignature,
    progressionString,

    // Actions
    initAudio,
    setKey,
    setMode,
    step,
    generateProgression,
    play,
    pause,
    stop,
    setTempo,
    setSwingAmount,
    setGravity,
    setModulationProbability,
    setVoicingStyle,
    setStylePreset,
    setVolume,
    setBassEnabled,
    setDrumsEnabled,
    setMelodyVolume,
    setMelodyEnabled,
    loadMelody,
    modulate,
    previewChord,
    getCurrentChordInfo,

    // Chord editing (v0.3.0)
    updateChordAt,
    insertChordAt,
    removeChordAt,
    moveChord,

    // Clipboard (v0.3.0)
    clipboard,
    copyChords,
    pasteChords,
    hasClipboard,

    // Song Forms (v0.3.5)
    songForm,
    generateSongForm,
    loadProgression,
    FORM_TEMPLATES,

    // Melody (v0.4.0)
    currentMelody,
    melodyEnabled
  }
})

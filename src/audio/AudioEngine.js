/**
 * AudioEngine.js - Orquestador principal de audio
 *
 * Coordina JazzSynth, WalkingBass y Drummer con el Transport de Tone.js.
 * Reproduce progresiones completas sincronizadas.
 */

import * as Tone from 'tone'
import { JazzSynth, getJazzSynth, disposeJazzSynth } from './JazzSynth.js'
import { SampledPiano, getSampledPiano, disposeSampledPiano } from './SampledPiano.js'
import { WalkingBass, getWalkingBass, disposeWalkingBass } from './WalkingBass.js'
import { Drummer, getDrummer, disposeDrummer } from './Drummer.js'
import { MelodySynth, getMelodySynth, disposeMelodySynth } from './MelodySynth.js'
import { initAudio, setTempo, setSwing, midiToNote, midiArrayToNotes } from './ToneSetup.js'
import { parseMelody } from '../engine/MelodyParser.js'
import { JAZZ_DEGREES } from '../engine/JazzDegrees.js'
import { CHORD_TYPES } from '../engine/ChordTypes.js'
import { getVoicing } from '../engine/Voicings.js'

/**
 * Fallback parser for unknown degrees
 * Extracts root interval and chord type from degree string
 */
function parseDegreeString(degreeStr) {
  // Roman numeral to semitone mapping
  const numeralToRoot = {
    'I': 0, 'bII': 1, 'II': 2, 'bIII': 3, 'III': 4, 'IV': 5,
    '#IV': 6, 'bV': 6, 'V': 7, 'bVI': 8, 'VI': 9, 'bVII': 10, 'VII': 11
  }

  // Extract numeral and quality from degree string
  const match = degreeStr.match(/^(b?#?[IViv]+)(.*)$/)
  if (!match) {
    return { root: 0, type: 'maj7' } // Default fallback
  }

  const numeral = match[1].toUpperCase()
  const quality = match[2] || 'maj7'

  // Map numeral to root
  let root = numeralToRoot[numeral]
  if (root === undefined) {
    // Try without accidentals
    const baseNumeral = numeral.replace(/[b#]/, '')
    root = numeralToRoot[baseNumeral] ?? 0
  }

  // Normalize quality to known type
  const typeMap = {
    'maj7': 'maj7', 'maj9': 'maj9', '6': '6',
    'm7': 'm7', 'm9': 'm9', 'min7': 'm7',
    '7': '7', '9': '9', '13': '13', '7alt': '7alt',
    'm7b5': 'm7b5', 'dim7': 'dim7',
    'sus': 'sus', 'sus4': 'sus', '7sus': '7sus', '7sus4': '7sus',
    'aug': 'aug'
  }

  const type = typeMap[quality] || 'maj7'

  return { root, type }
}

export class AudioEngine {
  constructor() {
    this.piano = null
    this.bass = null
    this.drums = null
    this.melody = null

    this.isInitialized = false
    this.isPlaying = false
    this.scheduledEvents = []

    this.progression = []
    this.currentMelody = null  // Raw melody string
    this.parsedMelody = []     // Parsed melody notes
    this.currentMeasure = 0
    this.loopEnabled = true

    // Configuracion
    this.config = {
      tempo: 120,
      swing: 0.3,
      voicingStyle: 'shell',
      bassEnabled: true,
      drumsEnabled: true,
      melodyEnabled: true,
      pianoVolume: 0.8,
      bassVolume: 0.7,
      drumsVolume: 0.5,
      melodyVolume: 0.7,
      useSamples: false  // Use sampled piano instead of synthesis
    }

    // Sample loading state
    this.samplesLoaded = false
    this.sampledPiano = null

    // Callback para actualizar UI
    this.onBeatCallback = null
    this.onMeasureCallback = null
  }

  /**
   * Inicializa el engine (requiere click del usuario)
   */
  async init() {
    if (this.isInitialized) return true

    const audioStarted = await initAudio()
    if (!audioStarted) return false

    // Crear instrumentos
    this.piano = getJazzSynth()
    this.bass = getWalkingBass()
    this.drums = getDrummer()
    this.melody = getMelodySynth()

    // Aplicar configuracion inicial
    this.applyConfig()

    this.isInitialized = true
    console.log('AudioEngine initialized')
    return true
  }

  /**
   * Load sampled piano (for higher quality audio)
   * Call this after init() to upgrade to sampled sounds
   */
  async loadSamples() {
    if (this.samplesLoaded) return true

    console.log('Loading Salamander piano samples...')
    this.sampledPiano = getSampledPiano()
    const success = await this.sampledPiano.load()

    if (success) {
      this.samplesLoaded = true
      this.config.useSamples = true
      // Apply current volume to sampled piano
      this.sampledPiano.setVolumeNormalized(this.config.pianoVolume)
      console.log('Samples loaded - using high quality audio')
    } else {
      console.warn('Failed to load samples - using synthesis')
    }

    return success
  }

  /**
   * Toggle between sampled and synthesized piano
   */
  setUseSamples(enabled) {
    this.config.useSamples = enabled && this.samplesLoaded
  }

  /**
   * Aplica la configuracion actual a los instrumentos
   */
  applyConfig() {
    setTempo(this.config.tempo)
    setSwing(this.config.swing)

    if (this.piano) {
      this.piano.setVolumeNormalized(this.config.pianoVolume)
    }
    if (this.bass) {
      this.bass.setVolumeNormalized(this.config.bassVolume)
    }
    if (this.drums) {
      this.drums.setVolumeNormalized(this.config.drumsVolume)
      this.drums.setSwing(this.config.swing)
    }
    if (this.melody) {
      this.melody.setVolumeNormalized(this.config.melodyVolume)
      this.melody.setEnabled(this.config.melodyEnabled)
    }
  }

  /**
   * Configura el engine
   */
  configure(config) {
    this.config = { ...this.config, ...config }
    if (this.isInitialized) {
      this.applyConfig()
    }
  }

  /**
   * Carga una progresion para reproducir
   * @param {Array<{degree: string, key: string}>} progression
   */
  loadProgression(progression) {
    this.progression = progression
    this.currentMeasure = 0
  }

  /**
   * Carga una melodia para reproducir
   * @param {string} melodyStr - Melodia en formato .ls de Impro-Visor
   */
  loadMelody(melodyStr) {
    this.currentMelody = melodyStr
    if (melodyStr) {
      this.parsedMelody = parseMelody(melodyStr)
      console.log(`Melody loaded: ${this.parsedMelody.length} notes`)
    } else {
      this.parsedMelody = []
    }
  }

  /**
   * Inicia reproduccion
   */
  play() {
    if (!this.isInitialized) {
      console.warn('AudioEngine not initialized')
      return
    }

    if (this.progression.length === 0) {
      console.warn('No progression loaded')
      return
    }

    // Limpiar eventos anteriores
    this.clearScheduledEvents()

    // Programar la progresion
    this.scheduleProgression()

    // Iniciar transport
    Tone.Transport.start()
    this.isPlaying = true
  }

  /**
   * Pausa reproduccion
   */
  pause() {
    Tone.Transport.pause()
    this.isPlaying = false
  }

  /**
   * Detiene reproduccion
   */
  stop() {
    Tone.Transport.stop()
    Tone.Transport.position = 0
    this.isPlaying = false
    this.currentMeasure = 0
    this.clearScheduledEvents()

    // Soltar notas
    if (this.piano) {
      this.piano.release()
    }
  }

  /**
   * Programa la progresion completa
   */
  scheduleProgression() {
    const measureDuration = Tone.Time('1m').toSeconds()

    this.progression.forEach((chord, measureIndex) => {
      const startTime = measureIndex * measureDuration

      // Programar cada compas
      const eventId = Tone.Transport.schedule((time) => {
        this.playMeasure(chord, measureIndex, time)
      }, startTime)

      this.scheduledEvents.push(eventId)
    })

    // Programar melodia si existe
    if (this.parsedMelody.length > 0 && this.config.melodyEnabled) {
      this.scheduleMelody(measureDuration)
    }

    // Si loop esta habilitado, programar repeat
    if (this.loopEnabled) {
      const totalDuration = this.progression.length * measureDuration
      Tone.Transport.loopEnd = totalDuration
      Tone.Transport.loop = true
    }

    // Programar beat callback
    if (this.onBeatCallback) {
      const beatEventId = Tone.Transport.scheduleRepeat((time) => {
        Tone.Draw.schedule(() => {
          this.onBeatCallback(this.getBeatInfo())
        }, time)
      }, '4n')
      this.scheduledEvents.push(beatEventId)
    }
  }

  /**
   * Programa las notas de melodia
   */
  scheduleMelody(measureDuration) {
    if (!this.melody || this.parsedMelody.length === 0) return

    const beatsPerMeasure = 4
    const beatDuration = measureDuration / beatsPerMeasure
    const totalProgressionBeats = this.progression.length * beatsPerMeasure

    // Calculate melody total duration for scaling
    const lastNote = this.parsedMelody[this.parsedMelody.length - 1]
    const melodyDuration = lastNote ? lastNote.startBeat + lastNote.duration : 0

    // Scale factor to fit melody to progression length
    const scale = melodyDuration > 0 ? totalProgressionBeats / melodyDuration : 1

    this.parsedMelody.forEach(note => {
      if (note.isRest || note.pitch === null) return

      const scaledStart = note.startBeat * scale
      const scaledDuration = note.duration * scale

      const startTime = scaledStart * beatDuration
      const noteDuration = scaledDuration * beatDuration

      // Convert MIDI pitch to note name
      const noteName = midiToNote(note.pitch)

      // Schedule the note
      const eventId = Tone.Transport.schedule((time) => {
        this.melody.playNote(noteName, noteDuration, time)
      }, startTime)

      this.scheduledEvents.push(eventId)
    })
  }

  /**
   * Reproduce un compas
   */
  playMeasure(chord, measureIndex, time) {
    this.currentMeasure = measureIndex

    // Obtener info del acorde - with fallback for unknown degrees
    let degreeInfo = JAZZ_DEGREES[chord.degree]
    let rootPitch, chordType

    if (degreeInfo) {
      rootPitch = this.getRootPitch(chord.degree, chord.key)
      chordType = degreeInfo.type
    } else {
      // Fallback: parse degree string directly
      const parsed = parseDegreeString(chord.degree)
      const keyPitches = { 'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11 }
      const keyOffset = keyPitches[chord.key] ?? 0
      rootPitch = 48 + keyOffset + parsed.root
      chordType = parsed.type
      console.log(`Fallback for unknown degree: ${chord.degree} -> root=${rootPitch}, type=${chordType}`)
    }

    // Piano: voicing
    this.playPianoChord(rootPitch, chordType, time)

    // Bass: walking line
    if (this.config.bassEnabled) {
      const nextChord = this.progression[(measureIndex + 1) % this.progression.length]
      this.playBassLine(chord, nextChord, time)
    }

    // Drums
    if (this.config.drumsEnabled) {
      this.drums.playMeasure(time, { includeKick: measureIndex === 0 })
    }

    // Callback para UI
    if (this.onMeasureCallback) {
      Tone.Draw.schedule(() => {
        this.onMeasureCallback(measureIndex, chord)
      }, time)
    }
  }

  /**
   * Toca el acorde de piano con el voicing seleccionado
   */
  playPianoChord(rootPitch, chordType, time) {
    const voicing = getVoicing(rootPitch, chordType, this.config.voicingStyle)

    // Combinar mano izquierda y derecha
    const allNotes = [...voicing.left, ...voicing.right]
    const noteNames = midiArrayToNotes(allNotes)

    // Duracion: casi todo el compas
    // Use sampled piano if available, otherwise synthesis
    if (this.config.useSamples && this.sampledPiano?.isLoaded) {
      this.sampledPiano.playChord(noteNames, '2n.', time)
    } else {
      this.piano.playChord(noteNames, '2n.', time)
    }
  }

  /**
   * Toca la linea de bajo
   */
  playBassLine(currentChord, nextChord, time) {
    const line = this.bass.generateLine(currentChord, nextChord)
    this.bass.playLine(line, time)
  }

  /**
   * Calcula el pitch MIDI de la fundamental
   */
  getRootPitch(degree, key) {
    const keyPitches = {
      'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5,
      'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11
    }

    const degreeInfo = JAZZ_DEGREES[degree]
    const keyOffset = keyPitches[key] || 0
    const root = degreeInfo?.root || 0

    // Piano en octava 3-4 (MIDI 48 = C3)
    return 48 + keyOffset + root
  }

  /**
   * Obtiene info del beat actual
   */
  getBeatInfo() {
    const pos = Tone.Transport.position.toString().split(':')
    return {
      measure: parseInt(pos[0]) % this.progression.length,
      beat: parseInt(pos[1]),
      sixteenths: parseFloat(pos[2])
    }
  }

  /**
   * Limpia eventos programados
   */
  clearScheduledEvents() {
    this.scheduledEvents.forEach(id => {
      Tone.Transport.clear(id)
    })
    this.scheduledEvents = []
  }

  /**
   * Setters para volumenes
   */
  setPianoVolume(value) {
    this.config.pianoVolume = value
    if (this.piano) {
      this.piano.setVolumeNormalized(value)
    }
    if (this.sampledPiano) {
      this.sampledPiano.setVolumeNormalized(value)
    }
  }

  setBassVolume(value) {
    this.config.bassVolume = value
    if (this.bass) {
      this.bass.setVolumeNormalized(value)
    }
  }

  setDrumsVolume(value) {
    this.config.drumsVolume = value
    if (this.drums) {
      this.drums.setVolumeNormalized(value)
    }
  }

  setTempo(bpm) {
    this.config.tempo = bpm
    setTempo(bpm)
  }

  setSwing(amount) {
    this.config.swing = amount
    setSwing(amount)
    if (this.drums) {
      this.drums.setSwing(amount)
    }
  }

  setVoicingStyle(style) {
    this.config.voicingStyle = style
  }

  setBassEnabled(enabled) {
    this.config.bassEnabled = enabled
  }

  setDrumsEnabled(enabled) {
    this.config.drumsEnabled = enabled
  }

  setMelodyVolume(value) {
    this.config.melodyVolume = value
    if (this.melody) {
      this.melody.setVolumeNormalized(value)
    }
  }

  setMelodyEnabled(enabled) {
    this.config.melodyEnabled = enabled
    if (this.melody) {
      this.melody.setEnabled(enabled)
    }
  }

  /**
   * Registra callback para beats
   */
  onBeat(callback) {
    this.onBeatCallback = callback
  }

  /**
   * Registra callback para cambio de compas
   */
  onMeasure(callback) {
    this.onMeasureCallback = callback
  }

  /**
   * Toca un acorde inmediatamente (preview)
   */
  async previewChord(degree, key) {
    if (!this.isInitialized) {
      await this.init()
    }

    let rootPitch, chordType
    const degreeInfo = JAZZ_DEGREES[degree]

    if (degreeInfo) {
      rootPitch = this.getRootPitch(degree, key)
      chordType = degreeInfo.type
    } else {
      // Fallback for unknown degrees
      const parsed = parseDegreeString(degree)
      const keyPitches = { 'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11 }
      const keyOffset = keyPitches[key] ?? 0
      rootPitch = 48 + keyOffset + parsed.root
      chordType = parsed.type
    }

    const voicing = getVoicing(rootPitch, chordType, this.config.voicingStyle)
    const allNotes = [...voicing.left, ...voicing.right]
    const noteNames = midiArrayToNotes(allNotes)

    // Use sampled piano if available
    if (this.config.useSamples && this.sampledPiano?.isLoaded) {
      this.sampledPiano.playChord(noteNames, '2n')
    } else {
      this.piano.playChord(noteNames, '2n')
    }
  }

  /**
   * Limpia recursos
   */
  dispose() {
    this.stop()
    this.clearScheduledEvents()

    disposeJazzSynth()
    disposeWalkingBass()
    disposeDrummer()
    disposeMelodySynth()
    disposeSampledPiano()

    this.piano = null
    this.bass = null
    this.drums = null
    this.melody = null
    this.sampledPiano = null
    this.samplesLoaded = false
    this.isInitialized = false
  }
}

// Singleton
let engineInstance = null

export function getAudioEngine() {
  if (!engineInstance) {
    engineInstance = new AudioEngine()
  }
  return engineInstance
}

export function disposeAudioEngine() {
  if (engineInstance) {
    engineInstance.dispose()
    engineInstance = null
  }
}

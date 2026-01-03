/**
 * LickEngine.js - Pattern-based Jazz Solo Generator
 *
 * Uses pre-extracted licks from Impro-Visor training data.
 * Much simpler and more reliable than LSTM approach.
 */

import * as Tone from 'tone'
import { JAZZ_DEGREES } from '../engine/JazzDegrees.js'
import licksData from './licks.json'

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const KEY_TO_SEMITONE = {
  'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5,
  'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11
}

// Chord tones (pitch classes relative to root)
const CHORD_TONES = {
  'maj7': [0, 4, 7, 11],      // 1, 3, 5, 7
  'maj9': [0, 2, 4, 7, 11],   // 1, 9, 3, 5, 7
  '6': [0, 4, 7, 9],          // 1, 3, 5, 6
  'm7': [0, 3, 7, 10],        // 1, b3, 5, b7
  'm9': [0, 2, 3, 7, 10],     // 1, 9, b3, 5, b7
  'm6': [0, 3, 7, 9],         // 1, b3, 5, 6
  '7': [0, 4, 7, 10],         // 1, 3, 5, b7
  '9': [0, 2, 4, 7, 10],      // 1, 9, 3, 5, b7
  '13': [0, 4, 7, 9, 10],     // 1, 3, 5, 13, b7
  'm7b5': [0, 3, 6, 10],      // 1, b3, b5, b7
  'dim7': [0, 3, 6, 9],       // 1, b3, b5, bb7
  '7alt': [0, 4, 8, 10],      // 1, 3, #5, b7
  '7b9': [0, 1, 4, 7, 10],    // 1, b9, 3, 5, b7
  '7#9': [0, 3, 4, 7, 10],    // 1, #9, 3, 5, b7
  'sus4': [0, 5, 7],          // 1, 4, 5
  '7sus4': [0, 5, 7, 10]      // 1, 4, 5, b7
}

/**
 * Lick-based Solo Engine
 */
export class LickEngine {
  constructor() {
    this.licks = licksData
    this.synth = null
    this.scheduledEvents = []
    this.loaded = true  // Already loaded via import
  }

  async loadModel() {
    // Licks are already loaded via import
    console.log(`LickEngine loaded: ${this.licks['ii-V-I'].length} ii-V-I licks`)
    return true
  }

  initSynth() {
    if (this.synth) return

    // Jazz trumpet - tight, punchy, articulated
    this.synth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      envelope: {
        attack: 0.02,
        decay: 0.15,
        sustain: 0.15,
        release: 0.1
      },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.2,
        release: 0.1,
        baseFrequency: 800,
        octaves: 2
      },
      filter: { type: 'lowpass', frequency: 3000, Q: 1 }
    })

    // Light vibrato, subtle effects
    this.vibrato = new Tone.Vibrato({ frequency: 4, depth: 0.05 })
    const reverb = new Tone.Reverb({ decay: 1.2, wet: 0.15 })

    this.synth.chain(this.vibrato, reverb, Tone.Destination)
    this.synth.volume.value = -6
  }

  /**
   * Detect harmonic context from progression
   */
  detectContext(progression, startIdx) {
    const chord = progression[startIdx]
    const degreeInfo = JAZZ_DEGREES[chord.degree] || {}
    const chordType = degreeInfo.type || 'm7'

    // Check for ii-V-I pattern
    if (startIdx + 2 < progression.length) {
      const c1 = progression[startIdx].degree
      const c2 = progression[startIdx + 1].degree
      const c3 = progression[startIdx + 2].degree

      if (c1.includes('IIm') && c2.includes('V7') && c3.includes('I')) {
        return 'ii-V-I'
      }
    }

    // Check for blues context (dominant 7ths)
    if (chordType === '7' || chordType === '9' || chordType === '13') {
      return 'blues'
    }

    // Default to bebop (largest pool, most versatile)
    return 'bebop'
  }

  /**
   * Get chord tones for a given chord type
   */
  getChordTones(chordType) {
    return CHORD_TONES[chordType] || CHORD_TONES['m7']
  }

  /**
   * Check if a pitch class is in the chord
   */
  isChordTone(pitchClass, chordType, chordRootPC) {
    const tones = this.getChordTones(chordType)
    const notePC = ((pitchClass - chordRootPC) % 12 + 12) % 12
    return tones.includes(notePC)
  }

  /**
   * Select a lick intelligently based on:
   * - Category (ii-V-I, blues, bebop)
   * - First note fits the current chord
   * - Proximity to last note played
   */
  selectLick(category, chordType, chordRootPC, lastNoteMidi = null, targetLength = 12) {
    // Get licks from category, fallback to bebop
    let licks = this.licks[category]
    if (!licks || licks.length === 0) {
      licks = this.licks['bebop'] || this.licks['ii-V-I'] || []
    }
    if (licks.length === 0) {
      console.warn('No licks available')
      return null
    }

    // Filter by length
    let pool = licks.filter(l => l.length >= targetLength - 4 && l.length <= targetLength + 6)
    if (pool.length < 10) pool = licks  // Fallback if too few

    // Score each lick
    const scored = pool.map(lick => {
      let score = Math.random() * 0.3  // Base randomness

      const firstNote = lick.notes[0]
      const lastNote = lick.notes[lick.notes.length - 1]
      const firstPC = firstNote.midi % 12

      // Bonus if first note is a chord tone
      if (this.isChordTone(firstPC, chordType, chordRootPC)) {
        score += 0.4
      }

      // Bonus for proximity to last played note
      if (lastNoteMidi !== null) {
        const distance = Math.abs(firstNote.midi - lastNoteMidi)
        if (distance <= 3) score += 0.3       // Very close
        else if (distance <= 5) score += 0.2  // Close
        else if (distance <= 7) score += 0.1  // Acceptable
        // Larger intervals get no bonus
      }

      // Small bonus if last note is also a chord tone (good resolution)
      const lastPC = lastNote.midi % 12
      if (this.isChordTone(lastPC, chordType, chordRootPC)) {
        score += 0.1
      }

      return { lick, score }
    })

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score)

    // Pick from top candidates with some randomness
    const topN = Math.min(5, scored.length)
    const idx = Math.floor(Math.random() * topN)
    return scored[idx].lick
  }

  /**
   * Transpose a lick to the target key
   */
  transposeLick(lick, targetKey) {
    const transposition = KEY_TO_SEMITONE[targetKey] || 0
    return lick.notes.map(note => ({
      midi: note.midi + transposition,
      dur: note.dur
    }))
  }

  /**
   * Generate solo over a progression
   */
  async generate(progression, stepsPerBeat = 2, temperature = 1.0) {
    console.log(`Generating lick-based solo over ${progression.length} bars...`)

    const melody = []
    let timestep = 0
    let measureIdx = 0
    let lastNoteMidi = null  // Track last note for smooth connections

    while (measureIdx < progression.length) {
      const chord = progression[measureIdx]
      const degreeInfo = JAZZ_DEGREES[chord.degree] || { type: 'm7', root: 0 }
      const chordType = degreeInfo.type
      const chordRootPC = ((KEY_TO_SEMITONE[chord.key] || 0) + degreeInfo.root + 12) % 12

      const context = this.detectContext(progression, measureIdx)

      // Select a lick with intelligent scoring
      const targetLength = 8 + Math.floor(Math.random() * 10)  // 8-18 notes
      const lick = this.selectLick(context, chordType, chordRootPC, lastNoteMidi, targetLength)

      if (!lick) {
        measureIdx++
        timestep += 4 * stepsPerBeat
        continue
      }

      // Transpose to current key
      const notes = this.transposeLick(lick, chord.key)

      // Add variation: slight rhythmic shift
      const startOffset = Math.random() < 0.3 ? 1 : 0

      // Schedule each note
      let noteTime = timestep + startOffset
      for (const note of notes) {
        const durationSteps = Math.round(note.dur * stepsPerBeat)
        const currentMeasure = Math.floor(noteTime / (4 * stepsPerBeat))

        if (currentMeasure >= progression.length) break

        // Add note to melody
        melody.push({
          timestep: noteTime,
          beat: (noteTime % (4 * stepsPerBeat)) / stepsPerBeat,
          measure: currentMeasure,
          type: 'note',
          note: note.midi,
          chordRoot: this.getChordRoot(progression[currentMeasure])
        })

        // Add continues for duration > 1
        for (let i = 1; i < durationSteps; i++) {
          melody.push({
            timestep: noteTime + i,
            beat: ((noteTime + i) % (4 * stepsPerBeat)) / stepsPerBeat,
            measure: currentMeasure,
            type: 'continue',
            note: null
          })
        }

        noteTime += durationSteps
      }

      // Track last note for smooth connection to next lick
      if (notes.length > 0) {
        lastNoteMidi = notes[notes.length - 1].midi
      }

      // Move to next section (skip 2-4 bars depending on lick length)
      const barsUsed = Math.ceil(notes.length / (4 * stepsPerBeat)) + 1
      measureIdx += Math.max(1, barsUsed)
      timestep = measureIdx * 4 * stepsPerBeat
    }

    console.log(`Generated ${melody.length} events from licks`)
    return melody
  }

  getChordRoot(chord) {
    const degreeInfo = JAZZ_DEGREES[chord.degree] || { root: 0 }
    return 60 + (KEY_TO_SEMITONE[chord.key] || 0) + degreeInfo.root
  }

  midiToNoteName(midi) {
    const pitchClass = midi % 12
    const octave = Math.floor(midi / 12) - 1
    return NOTE_NAMES[pitchClass] + octave
  }

  scheduleSolo(melody, stepsPerBeat = 2) {
    if (!this.synth) this.initSynth()
    this.clearScheduledEvents()

    const stepNotation = stepsPerBeat === 2 ? '8n' : '16n'

    melody.forEach((note, index) => {
      if (note.type === 'note') {
        const noteName = this.midiToNoteName(note.note)
        const measure = Math.floor(note.timestep / (4 * stepsPerBeat))
        const beatInMeasure = Math.floor((note.timestep % (4 * stepsPerBeat)) / stepsPerBeat)
        const subdivision = note.timestep % stepsPerBeat
        const timeStr = `${measure}:${beatInMeasure}:${subdivision * (4 / stepsPerBeat)}`

        let durationSteps = 1
        for (let j = index + 1; j < melody.length; j++) {
          if (melody[j].type === 'continue') durationSteps++
          else break
        }

        const durationStr = `${durationSteps}*${stepNotation}`

        const eventId = Tone.Transport.schedule((t) => {
          this.synth.triggerAttackRelease(noteName, durationStr, t)
        }, timeStr)

        this.scheduledEvents.push(eventId)
      }
    })

    return this.scheduledEvents.length
  }

  clearScheduledEvents() {
    this.scheduledEvents.forEach(id => Tone.Transport.clear(id))
    this.scheduledEvents = []
  }

  setVolume(volumeDb) {
    if (this.synth) this.synth.volume.value = volumeDb
  }

  dispose() {
    this.clearScheduledEvents()
    if (this.synth) { this.synth.dispose(); this.synth = null }
  }
}

// Singleton
let lickEngineInstance = null

export function getLickEngine() {
  if (!lickEngineInstance) {
    lickEngineInstance = new LickEngine()
  }
  return lickEngineInstance
}

export function disposeLickEngine() {
  if (lickEngineInstance) {
    lickEngineInstance.dispose()
    lickEngineInstance = null
  }
}

export default LickEngine

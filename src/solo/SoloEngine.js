/**
 * SoloEngine.js - Product of Experts LSTM Solo Generator
 *
 * Implements Impro-Visor's Product of Experts architecture:
 * - Expert 0: IntervalRelativeNoteEncoding (melodic intervals)
 * - Expert 1: ChordRelativeNoteEncoding (harmonic fit)
 *
 * The probabilities from both experts are multiplied together,
 * ensuring notes are BOTH melodically smooth AND harmonically correct.
 */

import * as tf from '@tensorflow/tfjs'
import * as Tone from 'tone'
import { JAZZ_DEGREES } from '../engine/JazzDegrees.js'

// Constants
const HIDDEN_SIZE = 300
const LOW_BOUND = 48  // C3
const HIGH_BOUND = 84 // C6
const PITCH_RANGE = HIGH_BOUND - LOW_BOUND  // 36 notes

const BEAT_PERIODS = [48, 24, 12, 6, 3, 16, 8, 4, 2]
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const KEY_TO_SEMITONE = {
  'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5,
  'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11
}

// Chord type vectors (12-bit pitch class sets)
const CHORD_TYPE_VECTORS = {
  'maj7':     [1,0,0,0,1,0,0,1,0,0,0,1],
  'maj9':     [1,0,1,0,1,0,0,1,0,0,0,1],
  '6':        [1,0,0,0,1,0,0,1,0,1,0,0],
  'maj7#11':  [1,0,0,0,1,0,1,1,0,0,0,1],
  'm7':       [1,0,0,1,0,0,0,1,0,0,1,0],
  'm9':       [1,0,1,1,0,0,0,1,0,0,1,0],
  'm6':       [1,0,0,1,0,0,0,1,0,1,0,0],
  '7':        [1,0,0,0,1,0,0,1,0,0,1,0],
  '9':        [1,0,1,0,1,0,0,1,0,0,1,0],
  '13':       [1,0,0,0,1,0,0,1,0,1,1,0],
  '7b13':     [1,0,0,0,1,0,0,1,1,0,1,0],
  '7#11':     [1,0,0,0,1,0,1,1,0,0,1,0],
  '7sus4':    [1,0,0,0,0,1,0,1,0,0,1,0],
  '7alt':     [1,0,0,0,1,0,0,0,1,0,1,1],
  '7b9':      [1,1,0,0,1,0,0,1,0,0,1,0],
  '7#9':      [1,0,0,1,1,0,0,1,0,0,1,0],
  '7#9#5':    [1,0,0,1,1,0,0,0,1,0,1,0],
  'm7b5':     [1,0,0,1,0,0,1,0,0,0,1,0],
  'dim7':     [1,0,0,1,0,0,1,0,0,1,0,0],
  'sus4':     [1,0,0,0,0,1,0,1,0,0,0,0],
  'sus2':     [1,0,1,0,0,0,0,1,0,0,0,0]
}

/**
 * LSTM Cell for TensorFlow.js
 */
class LSTMCell {
  constructor(inputSize, hiddenSize) {
    this.inputSize = inputSize
    this.hiddenSize = hiddenSize
    this.weights = null
    this.h0 = null
    this.c0 = null
  }

  loadWeights(w) {
    this.weights = {
      Wi: tf.tensor2d(w.input_w.data, w.input_w.shape).transpose(),
      bi: tf.tensor1d(w.input_b.data),
      Wf: tf.tensor2d(w.forget_w.data, w.forget_w.shape).transpose(),
      bf: tf.tensor1d(w.forget_b.data),
      Wc: tf.tensor2d(w.activate_w.data, w.activate_w.shape).transpose(),
      bc: tf.tensor1d(w.activate_b.data),
      Wo: tf.tensor2d(w.out_w.data, w.out_w.shape).transpose(),
      bo: tf.tensor1d(w.out_b.data)
    }

    if (w.initialstate) {
      const init = w.initialstate.data
      this.h0 = tf.tensor1d(init.slice(0, this.hiddenSize))
      this.c0 = tf.tensor1d(init.slice(this.hiddenSize))
    } else {
      this.h0 = tf.zeros([this.hiddenSize])
      this.c0 = tf.zeros([this.hiddenSize])
    }
  }

  step(x, hPrev, cPrev) {
    return tf.tidy(() => {
      const concat = tf.concat([x, hPrev])
      const i = tf.sigmoid(tf.add(tf.matMul(concat.reshape([1, -1]), this.weights.Wi).squeeze(), this.weights.bi))
      const f = tf.sigmoid(tf.add(tf.matMul(concat.reshape([1, -1]), this.weights.Wf).squeeze(), this.weights.bf))
      const cCand = tf.tanh(tf.add(tf.matMul(concat.reshape([1, -1]), this.weights.Wc).squeeze(), this.weights.bc))
      const o = tf.sigmoid(tf.add(tf.matMul(concat.reshape([1, -1]), this.weights.Wo).squeeze(), this.weights.bo))
      const c = tf.add(tf.mul(f, cPrev), tf.mul(i, cCand))
      const h = tf.mul(o, tf.tanh(c))
      return { h, c }
    })
  }

  getInitialState() {
    return { h: this.h0.clone(), c: this.c0.clone() }
  }

  dispose() {
    if (this.weights) {
      Object.values(this.weights).forEach(t => t.dispose())
      if (this.h0) this.h0.dispose()
      if (this.c0) this.c0.dispose()
    }
  }
}

/**
 * Expert network (LSTM + Dense)
 */
class Expert {
  constructor(inputSize, outputSize) {
    this.inputSize = inputSize
    this.outputSize = outputSize
    this.lstm1 = new LSTMCell(inputSize, HIDDEN_SIZE)
    this.lstm2 = new LSTMCell(HIDDEN_SIZE, HIDDEN_SIZE)
    this.denseW = null
    this.denseB = null
  }

  loadWeights(weights) {
    this.lstm1.loadWeights(weights.lstm1)
    this.lstm2.loadWeights(weights.lstm2)
    this.denseW = tf.tensor2d(weights.dense.w.data, weights.dense.w.shape).transpose()
    this.denseB = tf.tensor1d(weights.dense.b.data)
  }

  getInitialState() {
    return {
      lstm1: this.lstm1.getInitialState(),
      lstm2: this.lstm2.getInitialState()
    }
  }

  step(input, state) {
    const x = tf.tensor1d(input)

    const { h: h1, c: c1 } = this.lstm1.step(x, state.lstm1.h, state.lstm1.c)
    state.lstm1.h.dispose(); state.lstm1.c.dispose()

    const { h: h2, c: c2 } = this.lstm2.step(h1, state.lstm2.h, state.lstm2.c)
    state.lstm2.h.dispose(); state.lstm2.c.dispose()

    const logits = tf.tidy(() => {
      return tf.add(tf.matMul(h2.reshape([1, -1]), this.denseW).squeeze(), this.denseB)
    })

    x.dispose()

    return {
      logits,
      state: { lstm1: { h: h1, c: c1 }, lstm2: { h: h2, c: c2 } }
    }
  }

  dispose() {
    this.lstm1.dispose()
    this.lstm2.dispose()
    if (this.denseW) this.denseW.dispose()
    if (this.denseB) this.denseB.dispose()
  }
}

/**
 * Product of Experts Solo Engine
 */
export class SoloEngine {
  constructor() {
    this.expert0 = null  // IntervalRelative
    this.expert1 = null  // ChordRelative
    this.loaded = false
    this.loading = false

    // Audio
    this.synth = null
    this.scheduledEvents = []
  }

  async loadModel() {
    if (this.loaded || this.loading) return this.loaded

    this.loading = true
    console.log('Loading Product of Experts LSTM model...')

    try {
      const baseUrl = import.meta.env.BASE_URL || '/'
      const response = await fetch(`${baseUrl}models/clifford_poe.json`)
      const model = await response.json()

      // Load Expert 0 (IntervalRelative)
      const e0 = model.experts[0]
      this.expert0 = new Expert(e0.inputSize, e0.outputSize)
      this.expert0.loadWeights(e0.weights)
      console.log(`Expert 0 (${e0.name}): input=${e0.inputSize}, output=${e0.outputSize}`)

      // Load Expert 1 (ChordRelative)
      const e1 = model.experts[1]
      this.expert1 = new Expert(e1.inputSize, e1.outputSize)
      this.expert1.loadWeights(e1.weights)
      console.log(`Expert 1 (${e1.name}): input=${e1.inputSize}, output=${e1.outputSize}`)

      this.loaded = true
      console.log('Product of Experts model loaded successfully')
      return true
    } catch (err) {
      console.error('Error loading PoE model:', err)
      this.loading = false
      return false
    }
  }

  initSynth() {
    if (this.synth) return

    this.synth = new Tone.MonoSynth({
      oscillator: { type: 'fatsawtooth', spread: 20, count: 3 },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.4 },
      filterEnvelope: {
        attack: 0.06, decay: 0.3, sustain: 0.4, release: 0.3,
        baseFrequency: 400, octaves: 2.5
      },
      filter: { type: 'lowpass', frequency: 2000, Q: 2 }
    })

    this.vibrato = new Tone.Vibrato({ frequency: 5, depth: 0.1 })
    const reverb = new Tone.Reverb({ decay: 2, wet: 0.25 })
    const delay = new Tone.FeedbackDelay('8n.', 0.12)
    delay.wet.value = 0.15

    this.synth.chain(this.vibrato, delay, reverb, Tone.Destination)
    this.synth.volume.value = -3
  }

  // === ENCODING FUNCTIONS ===

  encodeBeat(timestep) {
    return BEAT_PERIODS.map(period => (timestep % period === 0) ? 1 : 0)
  }

  encodePosition(relativePosition) {
    const delta = (HIGH_BOUND - LOW_BOUND) / 1  // 2 divisions
    const indicator = []
    for (let i = 0; i < 2; i++) {
      const center = LOW_BOUND + i * delta
      let value = 1 - Math.abs(relativePosition - center) / delta
      indicator.push(Math.max(0, value))
    }
    return indicator
  }

  encodeChord(chordType, chordRootPitchClass, relativePosition) {
    const baseVector = CHORD_TYPE_VECTORS[chordType] || CHORD_TYPE_VECTORS['maj7']
    const distance = chordRootPitchClass - (relativePosition % 12)
    const rotateBy = ((distance % 12) + 12) % 12
    const shifted = [...baseVector]
    for (let i = 0; i < rotateBy; i++) {
      shifted.unshift(shifted.pop())
    }
    return shifted
  }

  // Expert 0: IntervalRelativeNoteEncoding (27 outputs: rest + sustain + 25 intervals)
  encodeInterval(currentNote, previousNote, isRest, isContinue) {
    const encoding = new Array(27).fill(0)
    if (isRest) {
      encoding[0] = 1
    } else if (isContinue) {
      encoding[1] = 1
    } else {
      let delta = currentNote - previousNote
      if (delta > 12) delta = delta % 12
      if (delta < -12) delta = delta % 12
      const index = Math.max(2, Math.min(26, delta + 12 + 2))
      encoding[index] = 1
    }
    return encoding
  }

  // Expert 1: ChordRelativeNoteEncoding (14 outputs: rest + sustain + 12 pitch classes)
  encodePitchClass(midiNote, chordRoot, isRest, isContinue) {
    const encoding = new Array(14).fill(0)
    if (isRest) {
      encoding[0] = 1
    } else if (isContinue) {
      encoding[1] = 1
    } else {
      let relIdx = (midiNote - chordRoot) % 12
      if (relIdx < 0) relIdx += 12
      encoding[relIdx + 2] = 1
    }
    return encoding
  }

  // Create input for Expert 0 (IntervalRelative)
  // Input: beat(9) + position(2) + chord(12) + interval(27) = 50
  createInputExpert0(timestep, chordType, chordRootPC, relPos, prevNote, isRest, isContinue) {
    const beat = this.encodeBeat(timestep)
    const position = this.encodePosition(relPos)
    const chord = this.encodeChord(chordType, chordRootPC, relPos)
    const interval = this.encodeInterval(relPos, prevNote, isRest, isContinue)
    return [...beat, ...position, ...chord, ...interval]
  }

  // Create input for Expert 1 (ChordRelative)
  // Input: beat(9) + position(2) + chord(12) + pitchclass(14) = 37
  createInputExpert1(timestep, chordType, chordRootPC, chordRoot, relPos, isRest, isContinue) {
    const beat = this.encodeBeat(timestep)
    const position = this.encodePosition(relPos)
    const chord = this.encodeChord(chordType, chordRootPC, chordRoot)
    const pitchClass = this.encodePitchClass(relPos, chordRoot, isRest, isContinue)
    return [...beat, ...position, ...chord, ...pitchClass]
  }

  // === PROBABILITY CONVERSION ===

  // Expert 0: Convert 27-output to absolute MIDI probabilities (38 = 2 artic + 36 notes)
  intervalProbsToAbsolute(logits, relativePosition) {
    const probs = tf.tidy(() => tf.softmax(logits))
    const probsArr = probs.arraySync()
    probs.dispose()

    // Output: [rest, sustain, note0, note1, ... note35]
    const absolute = new Array(PITCH_RANGE + 2).fill(0)
    absolute[0] = probsArr[0]  // rest
    absolute[1] = probsArr[1]  // sustain

    // Map intervals to absolute notes
    for (let i = 2; i < 27; i++) {
      const interval = (i - 2) - 12  // -12 to +12
      let midiNote = relativePosition + interval

      // Clamp to valid range
      if (midiNote >= LOW_BOUND && midiNote < HIGH_BOUND) {
        const noteIdx = midiNote - LOW_BOUND + 2
        absolute[noteIdx] += probsArr[i]
      }
    }

    return absolute
  }

  // Expert 1: Convert 14-output to absolute MIDI probabilities
  pitchClassProbsToAbsolute(logits, chordRoot) {
    const probs = tf.tidy(() => tf.softmax(logits))
    const probsArr = probs.arraySync()
    probs.dispose()

    const absolute = new Array(PITCH_RANGE + 2).fill(0)
    absolute[0] = probsArr[0]  // rest
    absolute[1] = probsArr[1]  // sustain

    // Tile pitch class probabilities across the range
    const pitchClassProbs = probsArr.slice(2)

    // Roll by chordRoot - LOW_BOUND to align with absolute pitches
    const rollAmount = (chordRoot - LOW_BOUND) % 12
    const rolled = new Array(12)
    for (let i = 0; i < 12; i++) {
      rolled[(i + rollAmount + 12) % 12] = pitchClassProbs[i]
    }

    // Tile across the range
    for (let i = 0; i < PITCH_RANGE; i++) {
      absolute[i + 2] = rolled[i % 12]
    }

    return absolute
  }

  // === GENERATION ===

  async generate(progression, stepsPerBeat = 2, temperature = 1.0) {
    if (!this.loaded) {
      const success = await this.loadModel()
      if (!success) throw new Error('Could not load PoE model')
    }

    console.log(`Generating solo with PoE over ${progression.length} bars...`)

    const melody = []
    let timestep = 0

    // State for Expert 0 (tracks melodic intervals)
    let relativePosition = LOW_BOUND + Math.floor(Math.random() * (HIGH_BOUND - LOW_BOUND) / 2)
    let prevNote = relativePosition
    let isRest = true
    let isContinue = false

    // LSTM states
    let state0 = this.expert0.getInitialState()
    let state1 = this.expert1.getInitialState()

    for (let measureIdx = 0; measureIdx < progression.length; measureIdx++) {
      const chord = progression[measureIdx]
      const degreeInfo = JAZZ_DEGREES[chord.degree] || { type: 'm7', root: 0 }
      const chordType = degreeInfo.type
      const chordRootPC = ((KEY_TO_SEMITONE[chord.key] || 0) + degreeInfo.root + 12) % 12
      const chordRoot = 60 + chordRootPC  // MIDI note for chord root

      const stepsForChord = 4 * stepsPerBeat

      for (let step = 0; step < stepsForChord; step++) {
        // Create inputs for both experts
        const input0 = this.createInputExpert0(
          timestep, chordType, chordRootPC, relativePosition, prevNote, isRest, isContinue
        )
        const input1 = this.createInputExpert1(
          timestep, chordType, chordRootPC, chordRoot, relativePosition, isRest, isContinue
        )

        // Forward pass through both experts
        const result0 = this.expert0.step(input0, state0)
        const result1 = this.expert1.step(input1, state1)
        state0 = result0.state
        state1 = result1.state

        // Convert to absolute probabilities
        const probs0 = this.intervalProbsToAbsolute(result0.logits, relativePosition)
        const probs1 = this.pitchClassProbsToAbsolute(result1.logits, chordRoot)

        result0.logits.dispose()
        result1.logits.dispose()

        // PRODUCT OF EXPERTS: multiply probabilities
        // But normalize articulation (notes) separately from rest/sustain

        // Multiply rest and sustain probabilities
        const restProb = probs0[0] * probs1[0]
        const sustainProb = probs0[1] * probs1[1]

        // Multiply note probabilities
        const noteProbs = new Array(PITCH_RANGE)
        for (let i = 0; i < PITCH_RANGE; i++) {
          noteProbs[i] = probs0[i + 2] * probs1[i + 2]
        }

        // Normalize notes separately
        const noteSum = noteProbs.reduce((a, b) => a + b, 0)
        if (noteSum > 0) {
          for (let i = 0; i < noteProbs.length; i++) {
            noteProbs[i] /= noteSum
          }
        }

        // Apply temperature to notes
        for (let i = 0; i < noteProbs.length; i++) {
          noteProbs[i] = Math.pow(noteProbs[i], 1 / temperature)
        }

        // Re-normalize notes after temperature
        const noteSumAfterTemp = noteProbs.reduce((a, b) => a + b, 0)
        if (noteSumAfterTemp > 0) {
          for (let i = 0; i < noteProbs.length; i++) {
            noteProbs[i] /= noteSumAfterTemp
          }
        }

        // Combine: articulation probability vs rest/sustain
        // Reduce sustain probability to avoid long notes
        const articSum = restProb + sustainProb * 0.3  // Reduce sustain weight
        const noteWeight = 1 - Math.min(articSum, 0.4)  // Notes get at least 60%

        // Build final probability vector
        const combined = new Array(PITCH_RANGE + 2)
        combined[0] = restProb * 0.5  // Reduce rest probability
        combined[1] = sustainProb * 0.15  // Significantly reduce sustain
        for (let i = 0; i < PITCH_RANGE; i++) {
          combined[i + 2] = noteProbs[i] * noteWeight
        }

        // Final normalization
        const sum = combined.reduce((a, b) => a + b, 0)
        if (sum > 0) {
          for (let i = 0; i < combined.length; i++) {
            combined[i] /= sum
          }
        }

        // Sample
        const sampledIndex = this.sample(combined)

        // Decode
        let decoded
        if (sampledIndex === 0) {
          decoded = { type: 'rest', note: null }
        } else if (sampledIndex === 1) {
          decoded = { type: 'continue', note: null }
        } else {
          const midiNote = LOW_BOUND + (sampledIndex - 2)
          decoded = { type: 'note', note: midiNote }
        }

        melody.push({
          timestep,
          beat: step / stepsPerBeat,
          measure: measureIdx,
          ...decoded,
          chordRoot
        })

        // Update state
        if (decoded.type === 'note') {
          prevNote = relativePosition
          relativePosition = decoded.note
          isRest = false
          isContinue = false
        } else if (decoded.type === 'rest') {
          isRest = true
          isContinue = false
        } else {
          isContinue = true
        }

        timestep++
      }
    }

    // Cleanup
    this.disposeState(state0)
    this.disposeState(state1)

    console.log(`Generated ${melody.length} notes with PoE`)
    return melody
  }

  sample(probs) {
    const r = Math.random()
    let cumulative = 0
    for (let i = 0; i < probs.length; i++) {
      cumulative += probs[i]
      if (r < cumulative) return i
    }
    return probs.length - 1
  }

  disposeState(state) {
    state.lstm1.h.dispose()
    state.lstm1.c.dispose()
    state.lstm2.h.dispose()
    state.lstm2.c.dispose()
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
    if (this.expert0) { this.expert0.dispose(); this.expert0 = null }
    if (this.expert1) { this.expert1.dispose(); this.expert1 = null }
    this.loaded = false
  }
}

// Singleton
let soloEngineInstance = null

export function getSoloEngine() {
  if (!soloEngineInstance) {
    soloEngineInstance = new SoloEngine()
  }
  return soloEngineInstance
}

export function disposeSoloEngine() {
  if (soloEngineInstance) {
    soloEngineInstance.dispose()
    soloEngineInstance = null
  }
}

export default SoloEngine

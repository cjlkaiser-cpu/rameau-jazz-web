/**
 * JazzLSTM.js - TensorFlow.js implementation of Impro-Visor's LSTM model
 *
 * Generates jazz solo notes based on chord progressions
 * Uses pre-trained weights from Clifford Brown connectome
 */

import * as tf from '@tensorflow/tfjs'

// Constants matching Impro-Visor's encoding
const HIDDEN_SIZE = 300
const INPUT_SIZE = 50
const OUTPUT_SIZE = 14 // rest + continue + 12 pitch classes

// Beat periods for rhythmic encoding (in 48ths of a whole note)
const BEAT_PERIODS = [48, 24, 12, 6, 3, 16, 8, 4, 2]

// Pitch bounds (MIDI)
const LOW_BOUND = 48  // C3
const HIGH_BOUND = 84 // C6

/**
 * LSTM Cell implementation matching Impro-Visor's architecture
 */
class LSTMCell {
  constructor(inputSize, hiddenSize) {
    this.inputSize = inputSize
    this.hiddenSize = hiddenSize
    this.weights = null
  }

  /**
   * Load weights from converted JSON format
   */
  loadWeights(weightsObj) {
    this.weights = {
      Wi: tf.tensor2d(weightsObj.input_w.data, weightsObj.input_w.shape),
      bi: tf.tensor1d(weightsObj.input_b.data),
      Wf: tf.tensor2d(weightsObj.forget_w.data, weightsObj.forget_w.shape),
      bf: tf.tensor1d(weightsObj.forget_b.data),
      Wc: tf.tensor2d(weightsObj.activate_w.data, weightsObj.activate_w.shape),
      bc: tf.tensor1d(weightsObj.activate_b.data),
      Wo: tf.tensor2d(weightsObj.out_w.data, weightsObj.out_w.shape),
      bo: tf.tensor1d(weightsObj.out_b.data)
    }

    // Initial state
    if (weightsObj.initialstate) {
      const initData = weightsObj.initialstate.data
      this.initialH = tf.tensor1d(initData.slice(0, this.hiddenSize))
      this.initialC = tf.tensor1d(initData.slice(this.hiddenSize))
    } else {
      this.initialH = tf.zeros([this.hiddenSize])
      this.initialC = tf.zeros([this.hiddenSize])
    }
  }

  /**
   * Single step of LSTM
   * @param {Tensor} x - Input tensor [inputSize]
   * @param {Tensor} hPrev - Previous hidden state [hiddenSize]
   * @param {Tensor} cPrev - Previous cell state [hiddenSize]
   * @returns {Object} {h, c} - New hidden and cell states
   */
  step(x, hPrev, cPrev) {
    return tf.tidy(() => {
      // Concatenate input and previous hidden state
      const concat = tf.concat([x, hPrev])

      // Input gate
      const i = tf.sigmoid(tf.add(tf.matMul(concat.reshape([1, -1]), this.weights.Wi).squeeze(), this.weights.bi))

      // Forget gate
      const f = tf.sigmoid(tf.add(tf.matMul(concat.reshape([1, -1]), this.weights.Wf).squeeze(), this.weights.bf))

      // Cell candidate
      const cCandidate = tf.tanh(tf.add(tf.matMul(concat.reshape([1, -1]), this.weights.Wc).squeeze(), this.weights.bc))

      // Output gate
      const o = tf.sigmoid(tf.add(tf.matMul(concat.reshape([1, -1]), this.weights.Wo).squeeze(), this.weights.bo))

      // New cell state
      const c = tf.add(tf.mul(f, cPrev), tf.mul(i, cCandidate))

      // New hidden state
      const h = tf.mul(o, tf.tanh(c))

      return { h, c }
    })
  }

  getInitialState() {
    return {
      h: this.initialH.clone(),
      c: this.initialC.clone()
    }
  }

  dispose() {
    if (this.weights) {
      Object.values(this.weights).forEach(t => t.dispose())
      this.initialH.dispose()
      this.initialC.dispose()
    }
  }
}

/**
 * Full Jazz Solo Generator Model
 */
export class JazzSoloGenerator {
  constructor() {
    this.lstm1 = new LSTMCell(INPUT_SIZE, HIDDEN_SIZE)
    this.lstm2 = new LSTMCell(HIDDEN_SIZE, HIDDEN_SIZE)
    this.denseW = null
    this.denseB = null
    this.loaded = false
  }

  /**
   * Load model weights from JSON (lite format - single expert)
   */
  async loadWeights(url) {
    console.log('Loading Jazz LSTM weights...')
    const response = await fetch(url)
    const model = await response.json()

    // Load LSTM weights (lite format has direct lstm1/lstm2)
    this.lstm1.loadWeights(model.weights.lstm1)
    this.lstm2.loadWeights(model.weights.lstm2)

    // Load dense layer
    this.denseW = tf.tensor2d(
      model.weights.dense.w.data,
      model.weights.dense.w.shape
    )
    this.denseB = tf.tensor1d(model.weights.dense.b.data)

    this.loaded = true
    console.log('Jazz LSTM loaded successfully')
  }

  /**
   * Encode beat position
   */
  encodeBeat(timestep) {
    return BEAT_PERIODS.map(period => (timestep % period === 0) ? 1 : 0)
  }

  /**
   * Encode chord type (12-bit vector shifted by note position)
   */
  encodeChord(chordType, notePosition) {
    // Rotate chord type by note position
    const shifted = [...chordType]
    const rotateBy = (12 - notePosition % 12) % 12
    for (let i = 0; i < rotateBy; i++) {
      shifted.unshift(shifted.pop())
    }
    return shifted
  }

  /**
   * Encode previous note (rest, continue, 12 pitch classes)
   */
  encodeNote(midiNote, chordRoot, isRest, isContinue) {
    const encoding = new Array(14).fill(0)
    if (isRest) {
      encoding[0] = 1
    } else if (isContinue) {
      encoding[1] = 1
    } else {
      const relativeNote = ((midiNote - chordRoot) % 12 + 12) % 12
      encoding[2 + relativeNote] = 1
    }
    return encoding
  }

  /**
   * Create full input vector
   */
  createInput(timestep, chordType, chordRoot, prevNote, isRest, isContinue) {
    const beat = this.encodeBeat(timestep)        // 9 features
    const chord = this.encodeChord(chordType, chordRoot) // 12 features
    const note = this.encodeNote(prevNote, chordRoot, isRest, isContinue) // 14 features

    // Pad to 50 features if needed
    const input = [...beat, ...chord, ...note]
    while (input.length < INPUT_SIZE) {
      input.push(0)
    }

    return input
  }

  /**
   * Sample from output probabilities
   */
  sampleFromProbs(probs, temperature = 1.0) {
    return tf.tidy(() => {
      // Apply temperature
      const logits = tf.log(probs.add(1e-10)).div(temperature)
      const scaled = tf.softmax(logits)

      // Sample
      const sample = tf.multinomial(scaled.reshape([1, -1]), 1)
      return sample.dataSync()[0]
    })
  }

  /**
   * Decode output index to MIDI note
   */
  decodeOutput(index, chordRoot) {
    if (index === 0) return { type: 'rest', note: null }
    if (index === 1) return { type: 'continue', note: null }

    // Pitch class relative to chord root
    const pitchClass = index - 2
    const absolutePitch = chordRoot + pitchClass

    // Find closest note in valid range
    let midiNote = absolutePitch
    while (midiNote < LOW_BOUND) midiNote += 12
    while (midiNote > HIGH_BOUND) midiNote -= 12

    return { type: 'note', note: midiNote }
  }

  /**
   * Generate a solo over a chord progression
   * @param {Array} chords - Array of {root: number, type: number[12], duration: number}
   * @param {number} stepsPerBeat - Resolution (default 2 = eighth notes)
   * @param {number} temperature - Sampling temperature (default 1.0)
   */
  generate(chords, stepsPerBeat = 2, temperature = 1.0) {
    if (!this.loaded) {
      throw new Error('Model not loaded. Call loadWeights() first.')
    }

    const melody = []
    let timestep = 0
    let prevNote = 60 // Middle C
    let isRest = true
    let isContinue = false

    // Initialize LSTM states
    let state1 = this.lstm1.getInitialState()
    let state2 = this.lstm2.getInitialState()

    for (const chord of chords) {
      const stepsForChord = chord.duration * stepsPerBeat

      for (let step = 0; step < stepsForChord; step++) {
        // Create input
        const inputArray = this.createInput(
          timestep,
          chord.type,
          chord.root,
          prevNote,
          isRest,
          isContinue
        )
        const input = tf.tensor1d(inputArray)

        // Forward pass through LSTMs
        const { h: h1, c: c1 } = this.lstm1.step(input, state1.h, state1.c)
        state1.h.dispose()
        state1.c.dispose()
        state1 = { h: h1, c: c1 }

        const { h: h2, c: c2 } = this.lstm2.step(h1, state2.h, state2.c)
        state2.h.dispose()
        state2.c.dispose()
        state2 = { h: h2, c: c2 }

        // Dense layer
        const logits = tf.tidy(() => {
          return tf.add(
            tf.matMul(h2.reshape([1, -1]), this.denseW).squeeze(),
            this.denseB
          )
        })

        // Softmax and sample
        const probs = tf.softmax(logits)
        const sampledIndex = this.sampleFromProbs(probs, temperature)

        // Decode output
        const decoded = this.decodeOutput(sampledIndex, chord.root)

        // Add to melody
        melody.push({
          timestep,
          ...decoded,
          chordRoot: chord.root
        })

        // Update state for next step
        if (decoded.type === 'note') {
          prevNote = decoded.note
          isRest = false
          isContinue = false
        } else if (decoded.type === 'rest') {
          isRest = true
          isContinue = false
        } else {
          isContinue = true
        }

        // Cleanup
        input.dispose()
        logits.dispose()
        probs.dispose()

        timestep++
      }
    }

    // Cleanup final states
    state1.h.dispose()
    state1.c.dispose()
    state2.h.dispose()
    state2.c.dispose()

    return melody
  }

  dispose() {
    this.lstm1.dispose()
    this.lstm2.dispose()
    if (this.denseW) this.denseW.dispose()
    if (this.denseB) this.denseB.dispose()
  }
}

// Singleton instance
let generatorInstance = null

export async function getJazzGenerator(weightsUrl) {
  if (!generatorInstance) {
    generatorInstance = new JazzSoloGenerator()
    await generatorInstance.loadWeights(weightsUrl)
  }
  return generatorInstance
}

export default JazzSoloGenerator

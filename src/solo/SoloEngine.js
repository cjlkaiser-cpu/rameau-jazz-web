/**
 * SoloEngine.js - Integración del generador LSTM con el motor de audio
 *
 * Genera solos de jazz usando el modelo Clifford Brown LSTM
 * y los reproduce sincronizado con la progresión.
 */

import * as tf from '@tensorflow/tfjs'
import * as Tone from 'tone'
import { JAZZ_DEGREES } from '../engine/JazzDegrees.js'

// Constantes del modelo (deben coincidir con JazzLSTM.js)
const HIDDEN_SIZE = 300
const INPUT_SIZE = 50
const OUTPUT_SIZE = 14

const BEAT_PERIODS = [48, 24, 12, 6, 3, 16, 8, 4, 2]
const LOW_BOUND = 48  // C3
const HIGH_BOUND = 84 // C6

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Mapeo de tonalidades a semitono base
const KEY_TO_SEMITONE = {
  'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5,
  'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11
}

// Codificación de tipos de acorde como 12-bit vectors
const CHORD_TYPE_VECTORS = {
  'maj7':     [1,0,0,0,1,0,0,1,0,0,0,1],
  'maj9':     [1,0,0,0,1,0,0,1,0,0,0,1],
  '6':        [1,0,0,0,1,0,0,1,0,1,0,0],
  'maj7#11':  [1,0,0,0,1,0,1,1,0,0,0,1],
  'm7':       [1,0,0,1,0,0,0,1,0,0,1,0],
  'm9':       [1,0,0,1,0,0,0,1,0,0,1,0],
  'm6':       [1,0,0,1,0,0,0,1,0,1,0,0],
  '7':        [1,0,0,0,1,0,0,1,0,0,1,0],
  '9':        [1,0,0,0,1,0,0,1,0,0,1,0],
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
 * Célula LSTM simple para TensorFlow.js
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
      Wi: tf.tensor2d(w.input_w.data, w.input_w.shape),
      bi: tf.tensor1d(w.input_b.data),
      Wf: tf.tensor2d(w.forget_w.data, w.forget_w.shape),
      bf: tf.tensor1d(w.forget_b.data),
      Wc: tf.tensor2d(w.activate_w.data, w.activate_w.shape),
      bc: tf.tensor1d(w.activate_b.data),
      Wo: tf.tensor2d(w.out_w.data, w.out_w.shape),
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
 * Motor de generación de solos
 */
export class SoloEngine {
  constructor() {
    this.lstm1 = null
    this.lstm2 = null
    this.denseW = null
    this.denseB = null
    this.loaded = false
    this.loading = false

    // Sintetizador para el solo
    this.synth = null
    this.scheduledEvents = []
  }

  /**
   * Carga el modelo LSTM
   */
  async loadModel() {
    if (this.loaded || this.loading) return this.loaded

    this.loading = true
    console.log('Loading Jazz LSTM model...')

    try {
      // Cargar pesos
      const response = await fetch('/models/clifford_brown_lite.json')
      const model = await response.json()

      // Crear células LSTM
      this.lstm1 = new LSTMCell(INPUT_SIZE, HIDDEN_SIZE)
      this.lstm2 = new LSTMCell(HIDDEN_SIZE, HIDDEN_SIZE)

      this.lstm1.loadWeights(model.weights.lstm1)
      this.lstm2.loadWeights(model.weights.lstm2)

      // Capa densa final
      this.denseW = tf.tensor2d(model.weights.dense.w.data, model.weights.dense.w.shape)
      this.denseB = tf.tensor1d(model.weights.dense.b.data)

      this.loaded = true
      console.log('Jazz LSTM model loaded successfully')
      return true
    } catch (err) {
      console.error('Error loading LSTM model:', err)
      this.loading = false
      return false
    }
  }

  /**
   * Inicializa el sintetizador del solo
   */
  initSynth() {
    if (this.synth) return

    // Synth tipo trompeta/sax para el solo
    this.synth = new Tone.MonoSynth({
      oscillator: {
        type: 'sawtooth'
      },
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.3,
        release: 0.3
      },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.5,
        release: 0.2,
        baseFrequency: 300,
        octaves: 3
      }
    })

    // Efectos
    const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.2 })
    const delay = new Tone.FeedbackDelay('8n', 0.15)
    delay.wet.value = 0.1

    this.synth.chain(delay, reverb, Tone.Destination)
    this.synth.volume.value = -6
  }

  /**
   * Codifica el beat position
   */
  encodeBeat(timestep) {
    return BEAT_PERIODS.map(period => (timestep % period === 0) ? 1 : 0)
  }

  /**
   * Codifica el tipo de acorde (rotado por posición)
   */
  encodeChord(chordType, notePosition) {
    const baseVector = CHORD_TYPE_VECTORS[chordType] || CHORD_TYPE_VECTORS['maj7']
    const shifted = [...baseVector]
    const rotateBy = (12 - notePosition % 12) % 12
    for (let i = 0; i < rotateBy; i++) {
      shifted.unshift(shifted.pop())
    }
    return shifted
  }

  /**
   * Codifica la nota previa
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
   * Crea el vector de entrada completo
   */
  createInput(timestep, chordType, chordRoot, prevNote, isRest, isContinue) {
    const beat = this.encodeBeat(timestep)
    const chord = this.encodeChord(chordType, chordRoot)
    const note = this.encodeNote(prevNote, chordRoot, isRest, isContinue)

    const input = [...beat, ...chord, ...note]
    while (input.length < INPUT_SIZE) {
      input.push(0)
    }
    return input
  }

  /**
   * Decodifica el índice de salida a nota MIDI
   */
  decodeOutput(index, chordRoot) {
    if (index === 0) return { type: 'rest', note: null }
    if (index === 1) return { type: 'continue', note: null }

    const pitchClass = index - 2
    let midiNote = chordRoot + pitchClass

    while (midiNote < LOW_BOUND) midiNote += 12
    while (midiNote > HIGH_BOUND) midiNote -= 12

    return { type: 'note', note: midiNote }
  }

  /**
   * Obtiene el pitch base de una tonalidad
   */
  getKeyPitch(key) {
    return 60 + (KEY_TO_SEMITONE[key] || 0) // C4 + offset
  }

  /**
   * Obtiene el pitch de la fundamental del acorde
   */
  getChordRoot(degree, key) {
    const degreeInfo = JAZZ_DEGREES[degree]
    if (!degreeInfo) return this.getKeyPitch(key)

    const keyPitch = this.getKeyPitch(key)
    return keyPitch + degreeInfo.root
  }

  /**
   * Genera un solo sobre una progresión
   * @param {Array} progression - Array de {degree, key}
   * @param {number} stepsPerBeat - Subdivisión (2 = corcheas, 4 = semicorcheas)
   * @param {number} temperature - Temperatura de muestreo (0.5-1.5)
   */
  async generate(progression, stepsPerBeat = 2, temperature = 1.0) {
    if (!this.loaded) {
      const success = await this.loadModel()
      if (!success) throw new Error('Could not load LSTM model')
    }

    console.log(`Generating solo over ${progression.length} bars...`)

    const melody = []
    let timestep = 0
    let prevNote = 60
    let isRest = true
    let isContinue = false

    // Inicializar estados LSTM
    let state1 = this.lstm1.getInitialState()
    let state2 = this.lstm2.getInitialState()

    for (const chord of progression) {
      const degreeInfo = JAZZ_DEGREES[chord.degree] || { type: 'm7', root: 0 }
      const chordType = degreeInfo.type
      const chordRoot = this.getChordRoot(chord.degree, chord.key)

      // 4 beats por compás * stepsPerBeat
      const stepsForChord = 4 * stepsPerBeat

      for (let step = 0; step < stepsForChord; step++) {
        // Crear input
        const inputArray = this.createInput(
          timestep,
          chordType,
          chordRoot,
          prevNote,
          isRest,
          isContinue
        )
        const input = tf.tensor1d(inputArray)

        // Forward pass
        const { h: h1, c: c1 } = this.lstm1.step(input, state1.h, state1.c)
        state1.h.dispose(); state1.c.dispose()
        state1 = { h: h1, c: c1 }

        const { h: h2, c: c2 } = this.lstm2.step(h1, state2.h, state2.c)
        state2.h.dispose(); state2.c.dispose()
        state2 = { h: h2, c: c2 }

        // Capa densa
        const logits = tf.tidy(() => {
          return tf.add(tf.matMul(h2.reshape([1, -1]), this.denseW).squeeze(), this.denseB)
        })

        // Muestreo con temperatura
        const sampledIndex = tf.tidy(() => {
          const scaledLogits = logits.div(temperature)
          const probs = tf.softmax(scaledLogits)
          const sample = tf.multinomial(probs.reshape([1, -1]), 1)
          return sample.dataSync()[0]
        })

        // Decodificar
        const decoded = this.decodeOutput(sampledIndex, chordRoot)

        melody.push({
          timestep,
          beat: step / stepsPerBeat,
          measure: progression.indexOf(chord),
          ...decoded,
          chordRoot
        })

        // Actualizar estado para siguiente paso
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

        input.dispose()
        logits.dispose()
        timestep++
      }
    }

    // Limpiar estados finales
    state1.h.dispose(); state1.c.dispose()
    state2.h.dispose(); state2.c.dispose()

    console.log(`Generated ${melody.length} notes`)
    return melody
  }

  /**
   * Convierte nota MIDI a nombre
   */
  midiToNoteName(midi) {
    const pitchClass = midi % 12
    const octave = Math.floor(midi / 12) - 1
    return NOTE_NAMES[pitchClass] + octave
  }

  /**
   * Programa el solo para reproducción
   * @param {Array} melody - Array de notas generadas
   * @param {number} stepsPerBeat - Subdivisión usada
   */
  scheduleSolo(melody, stepsPerBeat = 2) {
    if (!this.synth) {
      this.initSynth()
    }

    this.clearScheduledEvents()

    const stepDuration = Tone.Time('4n').toSeconds() / stepsPerBeat
    let lastNoteTime = null
    let lastNoteDuration = 0

    melody.forEach((note, index) => {
      const time = note.timestep * stepDuration

      if (note.type === 'note') {
        // Si hay nota previa sostenida, calcular su duración
        if (lastNoteTime !== null) {
          // La nota previa se toca hasta aquí
        }

        const noteName = this.midiToNoteName(note.note)

        // Buscar duración (contar continues siguientes)
        let duration = stepDuration
        for (let j = index + 1; j < melody.length; j++) {
          if (melody[j].type === 'continue') {
            duration += stepDuration
          } else {
            break
          }
        }

        const eventId = Tone.Transport.schedule((t) => {
          this.synth.triggerAttackRelease(noteName, duration, t)
        }, time)

        this.scheduledEvents.push(eventId)
        lastNoteTime = time
        lastNoteDuration = duration
      }
    })

    return this.scheduledEvents.length
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
   * Establece el volumen del solo
   */
  setVolume(volumeDb) {
    if (this.synth) {
      this.synth.volume.value = volumeDb
    }
  }

  /**
   * Limpia recursos
   */
  dispose() {
    this.clearScheduledEvents()

    if (this.synth) {
      this.synth.dispose()
      this.synth = null
    }

    if (this.lstm1) this.lstm1.dispose()
    if (this.lstm2) this.lstm2.dispose()
    if (this.denseW) this.denseW.dispose()
    if (this.denseB) this.denseB.dispose()

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

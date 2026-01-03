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
const OUTPUT_SIZE = 27  // rest + continue + 25 pitch classes (2 octaves)

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
    // Weights are stored transposed, need to transpose for matMul
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
      // Cargar pesos (usar base URL de Vite)
      const baseUrl = import.meta.env.BASE_URL || '/'
      const response = await fetch(`${baseUrl}models/clifford_brown_lite.json`)
      const model = await response.json()

      // Crear células LSTM
      this.lstm1 = new LSTMCell(INPUT_SIZE, HIDDEN_SIZE)
      this.lstm2 = new LSTMCell(HIDDEN_SIZE, HIDDEN_SIZE)

      this.lstm1.loadWeights(model.weights.lstm1)
      this.lstm2.loadWeights(model.weights.lstm2)

      // Capa densa final (también transpuesta)
      this.denseW = tf.tensor2d(model.weights.dense.w.data, model.weights.dense.w.shape).transpose()
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

    // Synth tipo trompeta jazz - más cálido y expresivo
    this.synth = new Tone.MonoSynth({
      oscillator: {
        type: 'fatsawtooth',
        spread: 20,
        count: 3
      },
      envelope: {
        attack: 0.05,
        decay: 0.2,
        sustain: 0.4,
        release: 0.4
      },
      filterEnvelope: {
        attack: 0.06,
        decay: 0.3,
        sustain: 0.4,
        release: 0.3,
        baseFrequency: 400,
        octaves: 2.5
      },
      filter: {
        type: 'lowpass',
        frequency: 2000,
        Q: 2
      }
    })

    // Efectos para sonido jazz
    this.vibrato = new Tone.Vibrato({
      frequency: 5,
      depth: 0.1
    })

    const reverb = new Tone.Reverb({ decay: 2, wet: 0.25 })
    const delay = new Tone.FeedbackDelay('8n.', 0.12)
    delay.wet.value = 0.15

    const eq = new Tone.EQ3({
      low: -3,
      mid: 2,
      high: -2
    })

    this.synth.chain(this.vibrato, eq, delay, reverb, Tone.Destination)
    this.synth.volume.value = -3  // Más volumen
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
   * Codifica la nota previa (mismo encoding que output: 27 clases)
   */
  encodeNote(midiNote, chordRoot, isRest, isContinue) {
    const encoding = new Array(27).fill(0)
    if (isRest) {
      encoding[0] = 1
    } else if (isContinue) {
      encoding[1] = 1
    } else {
      // Semitono relativo al root, centrado en index 14
      const semitoneOffset = midiNote - chordRoot  // -12 a +12
      const index = Math.max(2, Math.min(26, semitoneOffset + 14))
      encoding[index] = 1
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
   * Impro-Visor encoding: 0=rest, 1=continue, 2-26=25 semitones (2 octaves)
   * El rango es desde chord_root-12 hasta chord_root+12
   */
  decodeOutput(index, chordRoot) {
    if (index === 0) return { type: 'rest', note: null }
    if (index === 1) return { type: 'continue', note: null }

    // Index 2 = root - 12 semitones (octava abajo)
    // Index 14 = root (centro)
    // Index 26 = root + 12 semitones (octava arriba)
    const semitoneOffset = (index - 2) - 12  // -12 a +12
    let midiNote = chordRoot + semitoneOffset

    // Ajustar al rango válido del instrumento
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
   * Obtiene el pitch de la fundamental del acorde (en rango de solo)
   */
  getChordRoot(degree, key) {
    const degreeInfo = JAZZ_DEGREES[degree]
    if (!degreeInfo) return 60 + (KEY_TO_SEMITONE[key] || 0)

    // Base en C4 (60) + offset de la tonalidad + root del grado
    let root = 60 + (KEY_TO_SEMITONE[key] || 0) + degreeInfo.root

    // Mantener en rango medio para el solo (C4-C5)
    while (root < 60) root += 12
    while (root > 72) root -= 12

    return root
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

    for (let measureIdx = 0; measureIdx < progression.length; measureIdx++) {
      const chord = progression[measureIdx]
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
          measure: measureIdx,
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
   * Programa el solo para reproducción sincronizado con el Transport
   * @param {Array} melody - Array de notas generadas
   * @param {number} stepsPerBeat - Subdivisión usada
   */
  scheduleSolo(melody, stepsPerBeat = 2) {
    if (!this.synth) {
      this.initSynth()
    }

    this.clearScheduledEvents()

    // Usar notación de Tone.js para sincronizar con Transport
    // '8n' = corchea, '16n' = semicorchea
    const stepNotation = stepsPerBeat === 2 ? '8n' : '16n'

    melody.forEach((note, index) => {
      if (note.type === 'note') {
        const noteName = this.midiToNoteName(note.note)

        // Calcular tiempo en notación de compás: "measure:beat:subdivision"
        const measure = Math.floor(note.timestep / (4 * stepsPerBeat))
        const beatInMeasure = Math.floor((note.timestep % (4 * stepsPerBeat)) / stepsPerBeat)
        const subdivision = note.timestep % stepsPerBeat

        // Formato Tone.js: "bars:quarters:sixteenths"
        const timeStr = `${measure}:${beatInMeasure}:${subdivision * (4 / stepsPerBeat)}`

        // Buscar duración (contar continues siguientes)
        let durationSteps = 1
        for (let j = index + 1; j < melody.length; j++) {
          if (melody[j].type === 'continue') {
            durationSteps++
          } else {
            break
          }
        }

        // Convertir duración a notación
        const durationStr = `${durationSteps}*${stepNotation}`

        const eventId = Tone.Transport.schedule((t) => {
          this.synth.triggerAttackRelease(noteName, durationStr, t)
        }, timeStr)

        this.scheduledEvents.push(eventId)
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

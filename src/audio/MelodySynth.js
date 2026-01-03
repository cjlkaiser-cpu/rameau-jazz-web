/**
 * MelodySynth.js - Sintetizador para lineas melodicas
 *
 * Usa MonoSynth con sonido tipo trompeta/sax para melodias jazz.
 * Incluye vibrato y reverb para mayor expresividad.
 */

import * as Tone from 'tone'

export class MelodySynth {
  constructor() {
    // Sintetizador monofonico (para lineas melodicas)
    this.synth = new Tone.MonoSynth({
      oscillator: {
        type: 'sawtooth'
      },
      filter: {
        Q: 2,
        type: 'lowpass',
        rolloff: -24
      },
      envelope: {
        attack: 0.05,
        decay: 0.2,
        sustain: 0.7,
        release: 0.4
      },
      filterEnvelope: {
        attack: 0.06,
        decay: 0.2,
        sustain: 0.5,
        release: 0.2,
        baseFrequency: 300,
        octaves: 4
      }
    })

    // Vibrato para expresividad
    this.vibrato = new Tone.Vibrato({
      frequency: 5,
      depth: 0.1,
      type: 'sine'
    })

    // Delay sutil
    this.delay = new Tone.FeedbackDelay({
      delayTime: '8n.',
      feedback: 0.15,
      wet: 0.2
    })

    // Reverb
    this.reverb = new Tone.Reverb({
      decay: 2,
      wet: 0.25,
      preDelay: 0.01
    })

    // Compresor
    this.compressor = new Tone.Compressor({
      threshold: -15,
      ratio: 3,
      attack: 0.01,
      release: 0.2
    })

    this.volume = new Tone.Volume(-6) // Slightly lower than chords

    // Cadena de efectos
    this.synth.chain(
      this.vibrato,
      this.delay,
      this.reverb,
      this.compressor,
      this.volume,
      Tone.Destination
    )

    // Warm up reverb
    this.reverb.generate()

    this.isEnabled = true
  }

  /**
   * Toca una nota
   * @param {string} note - Nota (ej: 'C5', 'F#4')
   * @param {string|number} duration - Duracion
   * @param {number} time - Tiempo de inicio
   */
  playNote(note, duration = '8n', time) {
    if (!this.isEnabled) return

    if (time !== undefined) {
      this.synth.triggerAttackRelease(note, duration, time)
    } else {
      this.synth.triggerAttackRelease(note, duration)
    }
  }

  /**
   * Programa una secuencia de notas
   * @param {Array} notes - Array de {note, duration, time}
   */
  scheduleNotes(notes) {
    if (!this.isEnabled) return

    notes.forEach(({ note, duration, time }) => {
      this.synth.triggerAttackRelease(note, duration, time)
    })
  }

  /**
   * Enable/disable
   */
  setEnabled(enabled) {
    this.isEnabled = enabled
    this.volume.mute = !enabled
  }

  /**
   * Ajusta el volumen normalizado (0-1)
   */
  setVolumeNormalized(value) {
    const db = value === 0 ? -Infinity : (value - 1) * 40
    this.volume.volume.value = db
  }

  /**
   * Ajusta la cantidad de vibrato
   */
  setVibratoDepth(depth) {
    this.vibrato.depth.value = depth
  }

  /**
   * Ajusta la cantidad de delay
   */
  setDelayWet(wet) {
    this.delay.wet.value = wet
  }

  /**
   * Ajusta la cantidad de reverb
   */
  setReverbWet(wet) {
    this.reverb.wet.value = wet
  }

  /**
   * Limpia recursos
   */
  dispose() {
    this.synth.dispose()
    this.vibrato.dispose()
    this.delay.dispose()
    this.reverb.dispose()
    this.compressor.dispose()
    this.volume.dispose()
  }
}

// Singleton
let instance = null

export function getMelodySynth() {
  if (!instance) {
    instance = new MelodySynth()
  }
  return instance
}

export function disposeMelodySynth() {
  if (instance) {
    instance.dispose()
    instance = null
  }
}

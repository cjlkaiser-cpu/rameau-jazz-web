/**
 * SampledPiano.js - Piano con samples reales
 *
 * Usa los samples de Salamander Grand Piano (Yamaha C5)
 * para audio de alta calidad. Fallback a sintesis FM si
 * los samples no cargan.
 *
 * Salamander Grand Piano samples: CC-BY 3.0 Alexander Holm
 * https://github.com/tambien/Piano
 */

import * as Tone from 'tone'

// Subset of notes to sample (every 3rd note for efficiency)
// Tone.Sampler will interpolate the rest
const SAMPLE_NOTES = {
  A0: 'A0.mp3',
  C1: 'C1.mp3',
  'D#1': 'Ds1.mp3',
  'F#1': 'Fs1.mp3',
  A1: 'A1.mp3',
  C2: 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  A2: 'A2.mp3',
  C3: 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  A3: 'A3.mp3',
  C4: 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  A4: 'A4.mp3',
  C5: 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  A5: 'A5.mp3',
  C6: 'C6.mp3',
  'D#6': 'Ds6.mp3',
  'F#6': 'Fs6.mp3',
  A6: 'A6.mp3',
  C7: 'C7.mp3',
  'D#7': 'Ds7.mp3',
  'F#7': 'Fs7.mp3',
  A7: 'A7.mp3',
  C8: 'C8.mp3'
}

// Base URL for Salamander samples
const SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander/'

export class SampledPiano {
  constructor() {
    this.isLoaded = false
    this.isLoading = false
    this.loadError = null

    // Will be initialized when load() is called
    this.sampler = null

    // Effects chain (same as JazzSynth for consistency)
    this.tremolo = new Tone.Tremolo({
      frequency: 3,
      depth: 0.15,
      spread: 180
    }).start()

    this.chorus = new Tone.Chorus({
      frequency: 1.2,
      delayTime: 2.5,
      depth: 0.2,
      wet: 0.15
    }).start()

    this.reverb = new Tone.Reverb({
      decay: 2.5,
      wet: 0.25,
      preDelay: 0.01
    })

    this.compressor = new Tone.Compressor({
      threshold: -20,
      ratio: 3,
      attack: 0.003,
      release: 0.25
    })

    this.volume = new Tone.Volume(-3)

    // Warm up reverb
    this.reverb.generate()
  }

  /**
   * Load piano samples (async)
   * @returns {Promise<boolean>} true if loaded successfully
   */
  async load() {
    if (this.isLoaded) return true
    if (this.isLoading) {
      // Wait for existing load
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (!this.isLoading) {
            clearInterval(check)
            resolve(this.isLoaded)
          }
        }, 100)
      })
    }

    this.isLoading = true

    try {
      this.sampler = new Tone.Sampler({
        urls: SAMPLE_NOTES,
        baseUrl: SAMPLE_BASE_URL,
        release: 1.5,
        onload: () => {
          console.log('Salamander piano samples loaded')
        }
      })

      // Wait for sampler to load
      await Tone.loaded()

      // Connect effects chain
      this.sampler.chain(
        this.tremolo,
        this.chorus,
        this.reverb,
        this.compressor,
        this.volume,
        Tone.Destination
      )

      this.isLoaded = true
      this.isLoading = false
      return true
    } catch (error) {
      console.error('Failed to load piano samples:', error)
      this.loadError = error
      this.isLoading = false
      return false
    }
  }

  /**
   * Play a chord
   * @param {string[]} notes - Array of note names
   * @param {string} duration - Duration
   * @param {number} time - Scheduled time
   */
  playChord(notes, duration = '2n', time) {
    if (!this.isLoaded || !this.sampler) return

    if (time !== undefined) {
      this.sampler.triggerAttackRelease(notes, duration, time)
    } else {
      this.sampler.triggerAttackRelease(notes, duration)
    }
  }

  /**
   * Play a single note
   */
  playNote(note, duration = '8n', time) {
    if (!this.isLoaded || !this.sampler) return

    if (time !== undefined) {
      this.sampler.triggerAttackRelease(note, duration, time)
    } else {
      this.sampler.triggerAttackRelease(note, duration)
    }
  }

  /**
   * Attack notes (for sustain)
   */
  attack(notes, time) {
    if (!this.isLoaded || !this.sampler) return

    if (time !== undefined) {
      this.sampler.triggerAttack(notes, time)
    } else {
      this.sampler.triggerAttack(notes)
    }
  }

  /**
   * Release notes
   */
  release(notes, time) {
    if (!this.isLoaded || !this.sampler) return

    if (notes) {
      if (time !== undefined) {
        this.sampler.triggerRelease(notes, time)
      } else {
        this.sampler.triggerRelease(notes)
      }
    } else {
      this.sampler.releaseAll()
    }
  }

  /**
   * Set volume in dB
   */
  setVolume(db) {
    this.volume.volume.value = db
  }

  /**
   * Set normalized volume (0-1)
   */
  setVolumeNormalized(value) {
    const db = value === 0 ? -Infinity : (value - 1) * 40
    this.volume.volume.value = db
  }

  /**
   * Adjust tremolo depth
   */
  setTremoloDepth(depth) {
    this.tremolo.depth.value = depth
  }

  /**
   * Adjust reverb wet
   */
  setReverbWet(wet) {
    this.reverb.wet.value = wet
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.sampler) {
      this.sampler.dispose()
    }
    this.tremolo.dispose()
    this.chorus.dispose()
    this.reverb.dispose()
    this.compressor.dispose()
    this.volume.dispose()
  }
}

// Singleton
let instance = null

export function getSampledPiano() {
  if (!instance) {
    instance = new SampledPiano()
  }
  return instance
}

export function disposeSampledPiano() {
  if (instance) {
    instance.dispose()
    instance = null
  }
}

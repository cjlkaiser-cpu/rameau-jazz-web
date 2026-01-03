/**
 * MelodyParser.js - Parse Impro-Visor .ls melody notation
 *
 * Notation format:
 * - Notes: a, b, c, d, e, f, g (lowercase)
 * - Octave modifiers: + (up), - (down), can stack: c++ = 2 octaves up
 * - Accidentals: # (sharp), b (flat) after note: f#, bb
 * - Durations: 1=whole, 2=half, 4=quarter, 8=eighth, 16=sixteenth
 * - Tied notes: 2+8 = half + eighth
 * - Triplets: /3 after duration
 * - Rests: r followed by duration
 *
 * Example: "a8 c+8 d+8 e+2+8 r8 bb4"
 */

// Base MIDI note for middle C (C4)
const MIDDLE_C = 60

// Note name to semitone offset from C
const NOTE_TO_SEMITONE = {
  'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11
}

// Duration value to beats (in quarter notes)
const DURATION_TO_BEATS = {
  '1': 4,      // whole
  '2': 2,      // half
  '4': 1,      // quarter
  '8': 0.5,    // eighth
  '16': 0.25,  // sixteenth
  '32': 0.125  // thirty-second
}

/**
 * Parse a single note token
 * @param {string} token - e.g., "a8", "c+4", "f#8", "bb-2", "r4"
 * @returns {object} { pitch: number|null, duration: number, isRest: boolean }
 */
function parseNoteToken(token) {
  if (!token || token.length === 0) return null

  // Check for rest
  if (token.startsWith('r')) {
    const duration = parseDuration(token.slice(1))
    return { pitch: null, duration, isRest: true }
  }

  // Parse note
  const match = token.match(/^([a-g])(#|b)?([+\-]*)(.*)$/)
  if (!match) return null

  const [, noteName, accidental, octaveModifiers, durationStr] = match

  // Calculate pitch
  let semitone = NOTE_TO_SEMITONE[noteName]
  if (accidental === '#') semitone += 1
  if (accidental === 'b') semitone -= 1

  // Apply octave modifiers (+ = up, - = down)
  let octaveOffset = 0
  for (const mod of octaveModifiers) {
    if (mod === '+') octaveOffset += 12
    if (mod === '-') octaveOffset -= 12
  }

  // Default octave is middle (C4 area, but we use C5 for melody)
  const pitch = MIDDLE_C + 12 + semitone + octaveOffset

  const duration = parseDuration(durationStr)

  return { pitch, duration, isRest: false }
}

/**
 * Parse duration string (handles ties and triplets)
 * @param {string} durationStr - e.g., "4", "2+8", "4/3"
 * @returns {number} Duration in beats (quarter notes)
 */
function parseDuration(durationStr) {
  if (!durationStr || durationStr.length === 0) return 1 // default quarter

  let totalBeats = 0

  // Split by + for tied notes
  const parts = durationStr.split('+')

  for (const part of parts) {
    // Check for triplet
    let tripletDivisor = 1
    let cleanPart = part

    if (part.includes('/')) {
      const [durPart, divisor] = part.split('/')
      cleanPart = durPart
      tripletDivisor = parseInt(divisor) || 1
    }

    // Parse base duration
    const baseDuration = parseInt(cleanPart)
    if (baseDuration && DURATION_TO_BEATS[baseDuration]) {
      totalBeats += DURATION_TO_BEATS[baseDuration] / tripletDivisor
    }
  }

  return totalBeats || 1
}

/**
 * Parse a full melody string from .ls format
 * @param {string} melodyStr - Full melody notation
 * @param {number} beatsPerMeasure - Time signature (default 4)
 * @returns {Array} Array of { pitch, duration, startBeat, isRest }
 */
export function parseMelody(melodyStr, beatsPerMeasure = 4) {
  if (!melodyStr || melodyStr.trim().length === 0) return []

  const notes = []
  let currentBeat = 0

  // Clean and tokenize
  const cleaned = melodyStr
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Split into tokens (space-separated)
  const tokens = cleaned.split(' ').filter(t => t.length > 0)

  for (const token of tokens) {
    const parsed = parseNoteToken(token)
    if (parsed) {
      notes.push({
        pitch: parsed.pitch,
        duration: parsed.duration,
        startBeat: currentBeat,
        isRest: parsed.isRest
      })
      currentBeat += parsed.duration
    }
  }

  return notes
}

/**
 * Convert parsed melody to MIDI-like format
 * @param {Array} notes - Parsed notes from parseMelody
 * @param {number} tempo - BPM
 * @returns {Array} Array of { note: midiNumber, time: seconds, duration: seconds }
 */
export function melodyToMidi(notes, tempo = 120) {
  const secondsPerBeat = 60 / tempo

  return notes
    .filter(n => !n.isRest && n.pitch !== null)
    .map(note => ({
      note: note.pitch,
      time: note.startBeat * secondsPerBeat,
      duration: note.duration * secondsPerBeat
    }))
}

/**
 * Convert MIDI note number to note name
 * @param {number} midi - MIDI note number
 * @returns {string} Note name like "C4", "F#5"
 */
export function midiToNoteName(midi) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(midi / 12) - 1
  const noteName = noteNames[midi % 12]
  return `${noteName}${octave}`
}

/**
 * Get total duration of melody in beats
 * @param {Array} notes - Parsed notes
 * @returns {number} Total beats
 */
export function getMelodyDuration(notes) {
  if (notes.length === 0) return 0
  const lastNote = notes[notes.length - 1]
  return lastNote.startBeat + lastNote.duration
}

/**
 * Quantize melody to chord changes
 * @param {Array} melody - Parsed melody notes
 * @param {Array} chords - Chord progression (one chord per measure)
 * @param {number} beatsPerMeasure - Beats per measure
 * @returns {Array} Melody with chord context added
 */
export function alignMelodyToChords(melody, chords, beatsPerMeasure = 4) {
  return melody.map(note => {
    const measureIndex = Math.floor(note.startBeat / beatsPerMeasure)
    const chord = chords[measureIndex] || chords[chords.length - 1]
    return {
      ...note,
      measure: measureIndex,
      chord: chord?.degree || null
    }
  })
}

export default {
  parseMelody,
  melodyToMidi,
  midiToNoteName,
  getMelodyDuration,
  alignMelodyToChords
}

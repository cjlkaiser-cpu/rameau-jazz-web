/**
 * ChordConverter.js - Convert absolute chord symbols to Roman numeral degrees
 *
 * Converts "Cm7" in key of Bb to "IIm7"
 */

/**
 * Note name to semitone offset from C
 */
const NOTE_TO_SEMITONE = {
  'C': 0, 'C#': 1, 'Db': 1,
  'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4, 'E#': 5,
  'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8,
  'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11, 'B#': 0
}

/**
 * Semitone interval to Roman numeral
 */
const INTERVAL_TO_NUMERAL = {
  0: 'I',
  1: 'bII',
  2: 'II',
  3: 'bIII',
  4: 'III',
  5: 'IV',
  6: '#IV',  // or bV
  7: 'V',
  8: 'bVI',
  9: 'VI',
  10: 'bVII',
  11: 'VII'
}

/**
 * Map chord quality suffixes to our degree format
 */
const QUALITY_MAP = {
  // Major 7
  'maj7': 'maj7',
  'M7': 'maj7',
  'Maj7': 'maj7',
  'MA7': 'maj7',
  'maj9': 'maj9',
  '6': '6',
  '69': '6',

  // Minor 7
  'm7': 'm7',
  'mi7': 'm7',
  'min7': 'm7',
  '-7': 'm7',
  'm9': 'm9',
  'm': 'm7',      // Default minor to m7
  'mi': 'm7',
  'min': 'm7',

  // Dominant 7
  '7': '7',
  '9': '9',
  '13': '13',
  '7alt': '7alt',
  '7#9': '7alt',
  '7b9': '7alt',
  '7#5': '7alt',
  '7b5': '7alt',

  // Half-diminished
  'm7b5': 'm7b5',
  'ø': 'm7b5',
  'ø7': 'm7b5',
  '-7b5': 'm7b5',

  // Diminished
  'dim': 'dim7',
  'dim7': 'dim7',
  'o': 'dim7',
  'o7': 'dim7',

  // Sus
  'sus': 'sus',
  'sus4': 'sus',
  '7sus': '7sus',
  '7sus4': '7sus',

  // Augmented
  'aug': 'aug',
  '+': 'aug',
  '+7': '7',

  // Default
  '': 'maj7'  // Plain chord letter = major
}

/**
 * Parse a chord symbol into root and quality
 * @param {string} chord - e.g., "Cm7", "F#maj7", "Bb7"
 * @returns {object} { root: string, quality: string }
 */
function parseChord(chord) {
  if (!chord || chord === 'NC' || chord === '/') {
    return { root: null, quality: null }
  }

  // Match root note (with optional # or b)
  const rootMatch = chord.match(/^([A-G][#b]?)(.*)$/)
  if (!rootMatch) {
    return { root: null, quality: null }
  }

  const root = rootMatch[1]
  let quality = rootMatch[2] || ''

  // Clean up quality
  quality = quality.replace(/\s/g, '')

  return { root, quality }
}

/**
 * Convert absolute chord symbol to Roman numeral degree
 * @param {string} chord - Absolute chord (e.g., "Cm7")
 * @param {string} key - Key (e.g., "Bb")
 * @returns {string} Roman numeral degree (e.g., "IIm7")
 */
export function chordToRoman(chord, key = 'C') {
  const { root, quality } = parseChord(chord)

  if (!root) {
    return 'Imaj7' // Default fallback
  }

  // Calculate interval from key
  const keySemitone = NOTE_TO_SEMITONE[key] ?? 0
  const chordSemitone = NOTE_TO_SEMITONE[root] ?? 0
  const interval = (chordSemitone - keySemitone + 12) % 12

  // Get Roman numeral
  const numeral = INTERVAL_TO_NUMERAL[interval] || 'I'

  // Map quality
  const mappedQuality = QUALITY_MAP[quality] || QUALITY_MAP[''] || 'maj7'

  // Combine: handle special cases for minor numerals
  let degree = numeral

  // If quality starts with 'm' (minor), lowercase the numeral
  if (mappedQuality.startsWith('m') && !mappedQuality.startsWith('maj')) {
    // Convert to lowercase for minor chords (but keep accidentals)
    if (numeral.startsWith('b') || numeral.startsWith('#')) {
      degree = numeral.charAt(0) + numeral.slice(1).toLowerCase()
    } else {
      // Actually, in jazz notation we keep uppercase and add 'm'
      // So IIm7, not iim7
    }
  }

  return degree + mappedQuality
}

/**
 * Convert a full progression from absolute to Roman
 * @param {Array} progression - Array of {degree: "Cm7", key: "Bb", ...}
 * @param {string} key - Key to use for conversion
 * @returns {Array} Converted progression
 */
export function convertProgressionToRoman(progression, key = 'C') {
  return progression.map(chord => ({
    ...chord,
    degree: chordToRoman(chord.degree, key),
    key: key
  }))
}

/**
 * Check if a degree exists in our JAZZ_DEGREES
 * and return the closest match if not
 */
export function normalizeDegree(degree) {
  // Import dynamically to avoid circular dependency
  // For now, just return the degree and let the audio engine handle unknown chords
  return degree
}

export default {
  chordToRoman,
  convertProgressionToRoman,
  parseChord
}

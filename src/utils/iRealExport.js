/**
 * iReal Pro Export Utility
 *
 * Exports progressions to iReal Pro URL format.
 * Format: irealb://[title]=[composer]=[style]=[key]=[n]=[chords]
 */

// iReal Pro chord symbol mapping
const CHORD_MAP = {
  'maj7': '^7',
  'maj9': '^9',
  '6': '6',
  'm7': '-7',
  'm9': '-9',
  'm6': '-6',
  '7': '7',
  '9': '9',
  '13': '13',
  'm7b5': 'h7',
  'dim7': 'o7',
  '7alt': '7alt',
  '7b9': '7b9',
  '7#9': '7#9',
  '7b13': '7b13',
  'sus4': 'sus',
  '7sus4': '7sus'
}

// Key signature mapping
const KEY_MAP = {
  'C': 'C', 'Db': 'Db', 'D': 'D', 'Eb': 'Eb', 'E': 'E', 'F': 'F',
  'Gb': 'Gb', 'G': 'G', 'Ab': 'Ab', 'A': 'A', 'Bb': 'Bb', 'B': 'B'
}

/**
 * Convert internal chord representation to iReal Pro format
 */
function chordToIReal(degree, key, degreeInfo) {
  // Get root note
  const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
  const keyIndex = roots.indexOf(key) || 0
  const rootIndex = (keyIndex + (degreeInfo?.root || 0) + 12) % 12
  const root = roots[rootIndex]

  // Get chord type
  const type = degreeInfo?.type || 'm7'
  const iRealType = CHORD_MAP[type] || '-7'

  return root + iRealType
}

/**
 * Encode string for iReal Pro URL
 */
function encodeIReal(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
}

/**
 * Generate iReal Pro URL from progression
 *
 * @param {Array} progression - Array of chord objects {degree, key}
 * @param {Object} degrees - JAZZ_DEGREES mapping
 * @param {Object} options - Export options
 * @returns {string} iReal Pro URL
 */
export function generateIRealUrl(progression, degrees, options = {}) {
  const {
    title = 'RameauJazz Progression',
    composer = 'Generated',
    style = 'Medium Swing',
    key = 'C'
  } = options

  // Build chord string
  // iReal format: [chord] for each beat, | for bar lines, {} for repeats
  let chords = ''

  progression.forEach((chord, i) => {
    const degreeInfo = degrees[chord.degree]
    const iRealChord = chordToIReal(chord.degree, chord.key, degreeInfo)

    // Add chord (one per bar in 4/4)
    chords += iRealChord

    // Add bar line (except last)
    if (i < progression.length - 1) {
      chords += ' |'
    }
  })

  // Wrap in structure markers
  // [T44 = 4/4 time, *A = section A
  const structure = `*A[T44${chords}Z`

  // Build URL
  // Format: irealb://[title]=[composer]=[style]=[key]=[n]=[chords]
  const url = `irealb://${encodeIReal(title)}=${encodeIReal(composer)}=${encodeIReal(style)}=${key}=n=${encodeIReal(structure)}`

  return url
}

/**
 * Generate and trigger download/open of iReal Pro progression
 */
export function exportToIReal(progression, degrees, options = {}) {
  const url = generateIRealUrl(progression, degrees, options)

  // Try to open in iReal Pro (works on iOS/Mac if app installed)
  window.open(url, '_blank')

  return url
}

/**
 * Copy iReal Pro URL to clipboard
 */
export async function copyIRealUrl(progression, degrees, options = {}) {
  const url = generateIRealUrl(progression, degrees, options)

  try {
    await navigator.clipboard.writeText(url)
    return { success: true, url }
  } catch (err) {
    console.error('Failed to copy:', err)
    return { success: false, url }
  }
}

export default {
  generateIRealUrl,
  exportToIReal,
  copyIRealUrl
}

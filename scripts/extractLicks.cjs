/**
 * Extract licks from Impro-Visor .ls files
 *
 * Parses leadsheet files and extracts melodic phrases
 * categorized by harmonic context (ii-V-I, blues, etc.)
 */

const fs = require('fs')
const path = require('path')

const TRAINING_DATA = '/Users/carlos/Projects/Impro-Visor/connectomes-more-and-training-leadsheets/training-data/combination'
const TRANSCRIPTIONS = '/Users/carlos/Projects/Impro-Visor/leadsheets/transcriptions'
const OUTPUT_FILE = path.join(__dirname, '../src/solo/licks.json')

// Parse note string like "d8", "c+4", "f#-8/3"
function parseNote(noteStr) {
  if (!noteStr || noteStr === 'r' || noteStr.startsWith('r')) {
    // Rest
    const match = noteStr.match(/r(\d+)?/)
    const duration = match && match[1] ? parseInt(match[1]) : 4
    return { type: 'rest', duration }
  }

  // Match: note name + accidental? + octave marker? + duration + triplet?
  const match = noteStr.match(/^([a-g])([#b])?([+-]*)(\d+)?(\/3)?$/)
  if (!match) return null

  const [, noteName, accidental, octaveMarkers, durationStr, triplet] = match

  // Convert note name to pitch class (0-11)
  const noteMap = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
  let pitchClass = noteMap[noteName]
  if (accidental === '#') pitchClass = (pitchClass + 1) % 12
  if (accidental === 'b') pitchClass = (pitchClass + 11) % 12

  // Octave offset from middle C (C4 = 60)
  let octaveOffset = 0
  if (octaveMarkers) {
    for (const c of octaveMarkers) {
      if (c === '+') octaveOffset++
      if (c === '-') octaveOffset--
    }
  }

  // MIDI note (middle C = 60)
  const midi = 60 + pitchClass + (octaveOffset * 12)

  // Duration in beats (4 = quarter, 8 = eighth, etc.)
  const durationValue = durationStr ? parseInt(durationStr) : 8
  let beats = 4 / durationValue
  if (triplet) beats = beats * 2 / 3

  return {
    type: 'note',
    midi,
    pitchClass,
    duration: beats,
    original: noteStr
  }
}

// Parse melody section from .ls file
function parseMelody(content) {
  // Find melody part - everything after "(stave treble)" and ")"
  const staveIdx = content.indexOf('(stave treble)')
  if (staveIdx === -1) return []

  // Find the closing paren after stave treble
  const afterStave = content.substring(staveIdx + 14)
  const closeIdx = afterStave.indexOf(')')
  if (closeIdx === -1) return []

  // Everything after that is melody
  const melodyText = afterStave.substring(closeIdx + 1)

  // Extract notes (ignore bar lines and newlines)
  const tokens = melodyText.trim().split(/[\s\n]+/).filter(t => {
    return t && t !== '|' && !t.startsWith('(') && t !== '/'
  })

  const notes = []
  for (const token of tokens) {
    // Handle tied notes like "r1+4" or "b2+8"
    const tiedMatch = token.match(/^([a-gr][#b]?[+-]*\d+)\+(\d+)$/)
    if (tiedMatch) {
      const note1 = parseNote(tiedMatch[1])
      if (note1) notes.push(note1)
      // Add continuation with same pitch
      if (note1 && note1.type === 'note') {
        const dur2 = 4 / parseInt(tiedMatch[2])
        notes.push({ ...note1, duration: dur2, tied: true })
      }
    } else {
      const note = parseNote(token)
      if (note) notes.push(note)
    }
  }

  return notes
}

// Parse chord progression from .ls file
function parseChords(content) {
  // Find chords section
  const chordsMatch = content.match(/\(section.*?\)\s*([\s\S]*?)\(part\s+\(type melody\)/m)
  if (!chordsMatch) return []

  const chordsText = chordsMatch[1]
  const chordTokens = chordsText.split('|').map(c => c.trim()).filter(c => c && c !== '/')

  return chordTokens
}

// Split melody into phrases (by rests, long notes, or max length)
function splitIntoPhrases(notes, minLength = 4, maxLength = 24) {
  const phrases = []
  let currentPhrase = []
  let restCount = 0

  for (const note of notes) {
    if (note.type === 'rest') {
      restCount++
      if (restCount >= 1 && currentPhrase.length >= minLength) {
        phrases.push(currentPhrase)
        currentPhrase = []
      }
    } else {
      restCount = 0
      currentPhrase.push(note)

      // Split if phrase gets too long
      if (currentPhrase.length >= maxLength) {
        phrases.push(currentPhrase)
        currentPhrase = []
      }
    }
  }

  if (currentPhrase.length >= minLength) {
    phrases.push(currentPhrase)
  }

  return phrases
}

// Transpose a phrase to C (pitch class 0)
function transposeToC(phrase, originalKey) {
  const transposition = -originalKey
  return phrase.map(note => ({
    ...note,
    midi: note.midi + transposition,
    pitchClass: (note.pitchClass + transposition + 12) % 12
  }))
}

// Extract key from filename or content
function extractKey(filename, content) {
  // Try filename first
  const keyMatch = filename.match(/^([A-G][b#]?) /)
  if (keyMatch) {
    const keyMap = {
      'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5,
      'F#': 6, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11
    }
    return keyMap[keyMatch[1]] || 0
  }

  // Try (key X) in content
  const contentKeyMatch = content.match(/\(key\s+(-?\d+)\)/)
  if (contentKeyMatch) {
    return parseInt(contentKeyMatch[1])
  }

  return 0
}

// Process a directory of .ls files
function processDirectory(dirPath, category) {
  const licks = []
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.ls'))

  for (const file of files) {
    const filePath = path.join(dirPath, file)
    const content = fs.readFileSync(filePath, 'utf8')

    const key = extractKey(file, content)
    const notes = parseMelody(content)
    const phrases = splitIntoPhrases(notes, 4)

    for (const phrase of phrases) {
      if (phrase.length >= 4 && phrase.length <= 32) {
        const transposed = transposeToC(phrase, key)
        licks.push({
          category,
          length: phrase.length,
          notes: transposed.map(n => ({
            midi: n.midi,
            dur: n.duration
          }))
        })
      }
    }
  }

  return licks
}

// Process all .ls files in a directory recursively
function processDirectoryRecursive(dirPath, category) {
  const licks = []

  if (!fs.existsSync(dirPath)) return licks

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      // Recurse into subdirectory
      const subLicks = processDirectoryRecursive(fullPath, category)
      licks.push(...subLicks)
    } else if (entry.name.endsWith('.ls')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8')
        const key = extractKey(entry.name, content)
        const notes = parseMelody(content)
        const phrases = splitIntoPhrases(notes, 4)

        for (const phrase of phrases) {
          if (phrase.length >= 4 && phrase.length <= 32) {
            const transposed = transposeToC(phrase, key)
            licks.push({
              category,
              length: phrase.length,
              notes: transposed.map(n => ({
                midi: n.midi,
                dur: n.duration
              }))
            })
          }
        }
      } catch (err) {
        // Skip files that can't be parsed
      }
    }
  }

  return licks
}

function main() {
  console.log('Extracting licks from Impro-Visor...\n')

  const allLicks = {
    'ii-V-I': [],
    'blues': [],
    'bebop': []
  }

  // Process training data
  console.log('=== Training Data ===')

  const iiVI_path = path.join(TRAINING_DATA, 'bopland-major-ii-V-I')
  let licks = processDirectoryRecursive(iiVI_path, 'ii-V-I')
  allLicks['ii-V-I'].push(...licks)
  console.log(`ii-V-I (bopland): ${licks.length} phrases`)

  const rbm_path = path.join(TRAINING_DATA, 'rbmprovisor-ii-V-I')
  licks = processDirectoryRecursive(rbm_path, 'ii-V-I')
  allLicks['ii-V-I'].push(...licks)
  console.log(`ii-V-I (rbmprovisor): ${licks.length} phrases`)

  const blues_path = path.join(TRAINING_DATA, 'blues')
  licks = processDirectoryRecursive(blues_path, 'blues')
  allLicks['blues'].push(...licks)
  console.log(`Blues: ${licks.length} phrases`)

  const trans_path = path.join(TRAINING_DATA, 'transcriptions')
  licks = processDirectoryRecursive(trans_path, 'bebop')
  allLicks['bebop'].push(...licks)
  console.log(`Transcriptions: ${licks.length} phrases`)

  // Process artist transcriptions
  console.log('\n=== Artist Transcriptions ===')

  const artists = [
    'CharlieParker', 'CliffordBrown', 'JohnColtrane', 'MilesDavis',
    'CannonballAdderley', 'SonnyRollins', 'DizzyGillespie', 'LeeMorgan',
    'FreddieHubbard', 'JoeHenderson', 'WayneShorter', 'ChetBaker',
    'ArtPepper', 'BillEvans', 'TomHarrell', 'KennyGarrett'
  ]

  for (const artist of artists) {
    const artistPath = path.join(TRANSCRIPTIONS, artist)
    if (fs.existsSync(artistPath)) {
      licks = processDirectoryRecursive(artistPath, 'bebop')
      allLicks['bebop'].push(...licks)
      if (licks.length > 0) {
        console.log(`${artist}: ${licks.length} phrases`)
      }
    }
  }

  // Summary
  console.log('\n=== Summary ===')
  for (const [cat, catLicks] of Object.entries(allLicks)) {
    console.log(`${cat}: ${catLicks.length} licks`)
  }

  const totalLicks = Object.values(allLicks).reduce((a, b) => a + b.length, 0)
  console.log(`\nTotal: ${totalLicks} licks extracted`)

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allLicks))
  const stats = fs.statSync(OUTPUT_FILE)
  console.log(`\nWritten to ${OUTPUT_FILE}`)
  console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB`)
}

main()

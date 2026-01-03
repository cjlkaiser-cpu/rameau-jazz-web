/**
 * extractMelodies.cjs - Extract melodies from Impro-Visor .ls files
 *
 * Processes all .ls files with melody content and creates:
 * 1. melodies.json - Full melody data
 * 2. Updates standards.json to link melodies where available
 */

const fs = require('fs')
const path = require('path')

const IMPRO_VISOR_PATH = '/Users/carlos/impro-visor-version-10.2-files/leadsheets'
const OUTPUT_PATH = path.join(__dirname, '../public/data')

// Categories for organizing content
const CATEGORIES = {
  'imaginary-book': 'standards',
  'melodies': 'heads',
  'transcriptions': 'transcriptions',
  'solos': 'solos',
  'exercises': 'exercises',
  'compositions': 'compositions'
}

/**
 * Parse .ls file and extract all data
 */
function parseLeadsheet(content, filePath) {
  const result = {
    title: '',
    composer: '',
    key: 'C',
    tempo: 120,
    meter: [4, 4],
    chords: [],
    melody: null,
    category: 'unknown',
    source: path.basename(filePath)
  }

  // Extract metadata
  const titleMatch = content.match(/\(title\s+([^)]+)\)/)
  if (titleMatch) result.title = titleMatch[1].trim()

  const composerMatch = content.match(/\(composer\s+([^)]+)\)/)
  if (composerMatch) result.composer = composerMatch[1].trim()

  const tempoMatch = content.match(/\(tempo\s+([\d.]+)\)/)
  if (tempoMatch) result.tempo = parseFloat(tempoMatch[1])

  const meterMatch = content.match(/\(meter\s+(\d+)\s+(\d+)\)/)
  if (meterMatch) result.meter = [parseInt(meterMatch[1]), parseInt(meterMatch[2])]

  const keyMatch = content.match(/\(key\s+(-?\d+)\)/)
  if (keyMatch) {
    // Convert key number to note name
    const keyNum = parseInt(keyMatch[1])
    const keys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
    const keysFlat = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']
    if (keyNum >= 0) {
      result.key = keys[keyNum] || 'C'
    } else {
      result.key = keysFlat[-keyNum] || 'C'
    }
  }

  // Determine category from path
  for (const [folder, category] of Object.entries(CATEGORIES)) {
    if (filePath.includes(folder)) {
      result.category = category
      break
    }
  }

  // Extract chords
  const chordSection = content.match(/\(part\s*\(type chords\)[\s\S]*?\)([\s\S]*?)(?=\(part|\Z)/m)
  if (chordSection) {
    const chordText = chordSection[1]
    // Match chord bars: "C6 | / | E7 | /"
    const bars = chordText.match(/[A-G][^|]*(?=\||\n|$)/g)
    if (bars) {
      result.chords = bars
        .map(bar => bar.trim())
        .filter(bar => bar.length > 0 && !bar.startsWith('('))
        .map(bar => {
          // Handle multiple chords per bar
          return bar.split(/\s+/).filter(c => c && c !== '/' && !c.startsWith('('))
        })
        .flat()
    }
  }

  // Extract melody - it comes AFTER the part definition closes
  // Look for (type melody) section and capture everything after (stave ...) )
  const melodyPartMatch = content.match(/\(type melody\)/m)
  if (melodyPartMatch) {
    // Find the position after stave declaration and closing paren
    const afterMelodyPart = content.slice(melodyPartMatch.index)
    // Capture everything after the stave declaration until end of file or next (part
    const staveMatch = afterMelodyPart.match(/\(stave[^)]*\)\s*\)\s*([\s\S]+)$/m)

    if (staveMatch) {
      let melodyText = staveMatch[1].trim()
      // Remove any trailing (part declarations that might have been captured
      const nextPartIdx = melodyText.indexOf('(part')
      if (nextPartIdx > 0) {
        melodyText = melodyText.slice(0, nextPartIdx).trim()
      }
      // Check if it's actual melody (not just rests)
      // Count actual notes (letter followed by optional accidental and octave modifiers, then digit)
      const noteCount = (melodyText.match(/[a-g][#b]?[+\-]*\d/gi) || []).length
      if (noteCount > 5) {
        result.melody = melodyText
      }
    }
  }

  return result
}

/**
 * Find all .ls files recursively
 */
function findLsFiles(dir) {
  const files = []

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name.endsWith('.ls')) {
        files.push(fullPath)
      }
    }
  }

  walk(dir)
  return files
}

/**
 * Main extraction
 */
function main() {
  console.log('Scanning for .ls files...')
  const files = findLsFiles(IMPRO_VISOR_PATH)
  console.log(`Found ${files.length} .ls files`)

  const withMelody = []
  const withoutMelody = []
  const stats = {
    total: 0,
    withMelody: 0,
    byCategory: {}
  }

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const parsed = parseLeadsheet(content, file)

      if (!parsed.title) continue

      stats.total++

      if (parsed.melody) {
        stats.withMelody++
        stats.byCategory[parsed.category] = (stats.byCategory[parsed.category] || 0) + 1
        withMelody.push(parsed)
      } else if (parsed.chords.length > 0) {
        withoutMelody.push(parsed)
      }
    } catch (err) {
      console.error(`Error parsing ${file}: ${err.message}`)
    }
  }

  console.log('\n=== Statistics ===')
  console.log(`Total processed: ${stats.total}`)
  console.log(`With melody: ${stats.withMelody}`)
  console.log('\nBy category:')
  for (const [cat, count] of Object.entries(stats.byCategory)) {
    console.log(`  ${cat}: ${count}`)
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_PATH)) {
    fs.mkdirSync(OUTPUT_PATH, { recursive: true })
  }

  // Save melodies.json (with full melody data)
  const melodiesOutput = withMelody.map(item => ({
    id: item.title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    title: item.title,
    composer: item.composer,
    key: item.key,
    tempo: item.tempo,
    meter: item.meter,
    category: item.category,
    chords: item.chords,
    melody: item.melody,
    source: item.source
  }))

  fs.writeFileSync(
    path.join(OUTPUT_PATH, 'melodies.json'),
    JSON.stringify(melodiesOutput, null, 2)
  )
  console.log(`\nSaved ${melodiesOutput.length} items to melodies.json`)

  // Create transcriptions.json (solos + transcriptions)
  const transcriptions = melodiesOutput.filter(
    m => m.category === 'transcriptions' || m.category === 'solos'
  )
  fs.writeFileSync(
    path.join(OUTPUT_PATH, 'transcriptions.json'),
    JSON.stringify(transcriptions, null, 2)
  )
  console.log(`Saved ${transcriptions.length} transcriptions to transcriptions.json`)

  // Create heads.json (actual song melodies)
  const heads = melodiesOutput.filter(
    m => m.category === 'heads' || m.category === 'standards'
  )
  fs.writeFileSync(
    path.join(OUTPUT_PATH, 'heads.json'),
    JSON.stringify(heads, null, 2)
  )
  console.log(`Saved ${heads.length} heads to heads.json`)

  console.log('\nDone!')
}

main()

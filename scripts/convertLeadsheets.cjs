/**
 * Convert Impro-Visor leadsheets (.ls) to JSON
 *
 * Usage: node scripts/convertLeadsheets.cjs
 */

const fs = require('fs');
const path = require('path');

const IMPROVISOR_PATH = '/Users/carlos/Projects/Impro-Visor/leadsheets/imaginary-book';
const OUTPUT_PATH = path.join(__dirname, '../public/data/standards.json');

/**
 * Parse a single .ls file
 */
function parseLeadsheet(content, filename) {
  const result = {
    id: path.basename(filename, '.ls'),
    title: '',
    composer: '',
    key: 'C',
    tempo: 120,
    meter: '4/4',
    chords: []
  };

  // Extract metadata
  const titleMatch = content.match(/\(title\s+([^)]+)\)/);
  if (titleMatch) result.title = titleMatch[1].trim();

  const composerMatch = content.match(/\(composer\s+([^)]+)\)/);
  if (composerMatch) result.composer = composerMatch[1].trim();

  const keyMatch = content.match(/\(key\s+(-?\d+)\)/);
  if (keyMatch) {
    const keyNum = parseInt(keyMatch[1]);
    result.key = keyNumberToName(keyNum);
  }

  const tempoMatch = content.match(/\(tempo\s+([\d.]+)\)/);
  if (tempoMatch) result.tempo = Math.round(parseFloat(tempoMatch[1]));

  const meterMatch = content.match(/\(meter\s+(\d+)\s+(\d+)\)/);
  if (meterMatch) result.meter = `${meterMatch[1]}/${meterMatch[2]}`;

  // Extract chords - find lines with | separators
  const lines = content.split('\n');
  const chordLines = [];

  for (const line of lines) {
    // Skip metadata lines and empty lines
    if (line.startsWith('(') || line.trim() === '') continue;
    // Lines with chord progressions contain |
    if (line.includes('|')) {
      chordLines.push(line);
    }
  }

  // Parse chord symbols
  const rawChords = chordLines.join(' ')
    .split('|')
    .map(bar => bar.trim())
    .filter(bar => bar.length > 0);

  // Convert to our format
  result.chords = rawChords.map(bar => {
    // Handle multiple chords per bar (split by space)
    const chordsInBar = bar.split(/\s+/).filter(c => c.length > 0);

    // For now, take first chord of bar (simplification)
    // Could expand to handle 2 chords per bar later
    const chord = chordsInBar[0] || 'NC';

    return convertChordSymbol(chord);
  });

  // Use filename as title if none found
  if (!result.title) {
    result.title = result.id.replace(/([A-Z])/g, ' $1').trim();
  }

  return result;
}

/**
 * Convert key number to key name
 * Impro-Visor uses: 0=C, 1=G, 2=D, -1=F, -2=Bb, etc. (circle of fifths)
 */
function keyNumberToName(num) {
  const keys = {
    0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B',
    6: 'Gb', '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db',
    '-6': 'Gb'
  };
  return keys[num.toString()] || 'C';
}

/**
 * Convert Impro-Visor chord symbol to our format
 */
function convertChordSymbol(chord) {
  if (!chord || chord === 'NC' || chord === '/') return 'NC';

  // Impro-Visor format: CM7, Cm7, C7, Cdim, Caug, etc.
  // Our format: Imaj7, Im7, I7, etc. (but we'll store absolute for standards)

  let result = chord
    // Standardize major 7
    .replace(/M7/g, 'maj7')
    .replace(/Maj7/g, 'maj7')
    .replace(/MA7/g, 'maj7')
    // Standardize minor
    .replace(/m7b5/g, 'm7b5')
    .replace(/mi7/g, 'm7')
    .replace(/min7/g, 'm7')
    .replace(/-7/g, 'm7')
    // Standardize diminished
    .replace(/dim7/g, 'dim7')
    .replace(/o7/g, 'dim7')
    // Standardize augmented
    .replace(/aug/g, '+')
    // Standardize sus
    .replace(/sus4/g, 'sus')
    .replace(/sus2/g, 'sus2')
    // Handle slash chords (take root chord)
    .replace(/\/[A-G][b#]?$/, '');

  return result;
}

/**
 * Main conversion
 */
function main() {
  console.log('Converting Impro-Visor leadsheets to JSON...\n');

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Read all .ls files
  const files = fs.readdirSync(IMPROVISOR_PATH)
    .filter(f => f.endsWith('.ls'));

  console.log(`Found ${files.length} leadsheet files\n`);

  const standards = [];
  let errors = 0;

  for (const file of files) {
    try {
      const filepath = path.join(IMPROVISOR_PATH, file);
      const content = fs.readFileSync(filepath, 'utf-8');
      const parsed = parseLeadsheet(content, file);

      // Only include if we got some chords
      if (parsed.chords.length > 0) {
        standards.push(parsed);
      }
    } catch (err) {
      errors++;
      // console.error(`Error parsing ${file}:`, err.message);
    }
  }

  // Sort by title
  standards.sort((a, b) => a.title.localeCompare(b.title));

  // Write output
  const output = {
    version: '1.0',
    count: standards.length,
    generated: new Date().toISOString(),
    standards
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));

  // Also create a minified version
  const minPath = OUTPUT_PATH.replace('.json', '.min.json');
  fs.writeFileSync(minPath, JSON.stringify(output));

  const stats = fs.statSync(OUTPUT_PATH);
  const minStats = fs.statSync(minPath);

  console.log(`✓ Converted ${standards.length} standards (${errors} errors)`);
  console.log(`✓ Output: ${OUTPUT_PATH}`);
  console.log(`  Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`  Minified: ${(minStats.size / 1024).toFixed(1)} KB`);

  // Show some examples
  console.log('\nSample standards:');
  standards.slice(0, 5).forEach(s => {
    console.log(`  - ${s.title} (${s.composer || 'Unknown'}) - ${s.chords.length} bars`);
  });
}

main();

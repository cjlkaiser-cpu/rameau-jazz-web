/**
 * Convert Impro-Visor ctome weights to JSON for Product of Experts
 *
 * Converts both param_0 (IntervalRelative) and param_1 (ChordRelative) experts
 */

const fs = require('fs')
const path = require('path')

const CTOME_DIR = '/tmp/clifford_brown'
const OUTPUT_FILE = path.join(__dirname, '../public/models/clifford_poe.json')

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim()
  const lines = content.split('\n')
  const data = lines.map(line => line.split(',').map(Number))

  // Flatten if 2D, or return 1D
  if (data.length === 1) {
    return { data: data[0], shape: [data[0].length] }
  }

  const flat = data.flat()
  return { data: flat, shape: [data.length, data[0].length] }
}

function loadExpert(prefix) {
  console.log(`Loading ${prefix}...`)

  const lstm1 = {
    input_w: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm1_input_w.csv`)),
    input_b: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm1_input_b.csv`)),
    forget_w: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm1_forget_w.csv`)),
    forget_b: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm1_forget_b.csv`)),
    activate_w: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm1_activate_w.csv`)),
    activate_b: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm1_activate_b.csv`)),
    out_w: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm1_out_w.csv`)),
    out_b: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm1_out_b.csv`)),
    initialstate: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm1_initialstate.csv`))
  }

  const lstm2 = {
    input_w: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm2_input_w.csv`)),
    input_b: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm2_input_b.csv`)),
    forget_w: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm2_forget_w.csv`)),
    forget_b: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm2_forget_b.csv`)),
    activate_w: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm2_activate_w.csv`)),
    activate_b: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm2_activate_b.csv`)),
    out_w: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm2_out_w.csv`)),
    out_b: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm2_out_b.csv`)),
    initialstate: parseCSV(path.join(CTOME_DIR, `${prefix}_lstm2_initialstate.csv`))
  }

  const dense = {
    w: parseCSV(path.join(CTOME_DIR, `${prefix}_full_w.csv`)),
    b: parseCSV(path.join(CTOME_DIR, `${prefix}_full_b.csv`))
  }

  // Calculate sizes
  const inputSize = lstm1.input_w.shape[1] - 300 // columns - hidden_size
  const outputSize = dense.w.shape[0]

  console.log(`  Input size: ${inputSize}, Output size: ${outputSize}`)

  return { lstm1, lstm2, dense, inputSize, outputSize }
}

function main() {
  console.log('Converting Clifford Brown Product of Experts model...\n')

  // Load both experts
  const expert0 = loadExpert('param_0')
  const expert1 = loadExpert('param_1')

  const model = {
    name: 'CliffordBrown-PoE',
    architecture: 'product_of_experts',
    config: {
      hiddenSize: 300,
      lowBound: 48,
      highBound: 84
    },
    experts: [
      {
        name: 'IntervalRelative',
        inputSize: expert0.inputSize,
        outputSize: expert0.outputSize,
        weights: {
          lstm1: expert0.lstm1,
          lstm2: expert0.lstm2,
          dense: expert0.dense
        }
      },
      {
        name: 'ChordRelative',
        inputSize: expert1.inputSize,
        outputSize: expert1.outputSize,
        weights: {
          lstm1: expert1.lstm1,
          lstm2: expert1.lstm2,
          dense: expert1.dense
        }
      }
    ]
  }

  console.log('\nWriting to', OUTPUT_FILE)
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(model))

  const stats = fs.statSync(OUTPUT_FILE)
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)

  console.log('\nDone!')
}

main()

/**
 * convertWeights.js - Convert Impro-Visor connectome CSVs to TensorFlow.js format
 *
 * Run with: node convertWeights.js
 *
 * Reads CSV files from clifford_weights/ and outputs JSON for TF.js
 */

const fs = require('fs')
const path = require('path')

const WEIGHTS_DIR = './clifford_weights'
const OUTPUT_FILE = './clifford_brown.json'

/**
 * Parse CSV file to 2D array of floats
 */
function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf8')
  const lines = content.trim().split('\n')
  return lines.map(line =>
    line.split(',').map(v => parseFloat(v.trim()))
  )
}

/**
 * Flatten 2D array and get shape
 */
function flattenWithShape(matrix) {
  const rows = matrix.length
  const cols = matrix[0]?.length || 1

  // Handle 1D arrays (biases)
  if (cols === 1 || !Array.isArray(matrix[0])) {
    const data = matrix.flat()
    return { data, shape: [data.length] }
  }

  // 2D matrix - flatten row by row
  const data = matrix.flat()
  return { data, shape: [rows, cols] }
}

/**
 * Load all weight files for one LSTM layer
 */
function loadLSTMWeights(prefix) {
  const gates = ['input', 'forget', 'activate', 'out']
  const weights = {}

  for (const gate of gates) {
    const wPath = path.join(WEIGHTS_DIR, `${prefix}_${gate}_w.csv`)
    const bPath = path.join(WEIGHTS_DIR, `${prefix}_${gate}_b.csv`)

    if (fs.existsSync(wPath)) {
      weights[`${gate}_w`] = flattenWithShape(parseCSV(wPath))
    }
    if (fs.existsSync(bPath)) {
      weights[`${gate}_b`] = flattenWithShape(parseCSV(bPath))
    }
  }

  // Initial state
  const initPath = path.join(WEIGHTS_DIR, `${prefix}_initialstate.csv`)
  if (fs.existsSync(initPath)) {
    weights['initialstate'] = flattenWithShape(parseCSV(initPath))
  }

  return weights
}

/**
 * Main conversion
 */
function convert() {
  console.log('Converting Clifford Brown connectome to TensorFlow.js format...')

  const model = {
    name: 'CliffordBrown',
    architecture: {
      lstm1: { inputSize: 50, hiddenSize: 300 },
      lstm2: { inputSize: 300, hiddenSize: 300 },
      dense: { inputSize: 300, outputSize: 27 }
    },
    weights: {}
  }

  // Load LSTM1 weights (param_0 and param_1 are two "experts")
  console.log('Loading LSTM1 weights...')
  model.weights.lstm1_0 = loadLSTMWeights('param_0_lstm1')
  model.weights.lstm1_1 = loadLSTMWeights('param_1_lstm1')

  // Load LSTM2 weights
  console.log('Loading LSTM2 weights...')
  model.weights.lstm2_0 = loadLSTMWeights('param_0_lstm2')
  model.weights.lstm2_1 = loadLSTMWeights('param_1_lstm2')

  // Load dense layer weights
  console.log('Loading dense layer weights...')
  const fullW0 = path.join(WEIGHTS_DIR, 'param_0_full_w.csv')
  const fullB0 = path.join(WEIGHTS_DIR, 'param_0_full_b.csv')
  const fullW1 = path.join(WEIGHTS_DIR, 'param_1_full_w.csv')
  const fullB1 = path.join(WEIGHTS_DIR, 'param_1_full_b.csv')

  if (fs.existsSync(fullW0)) {
    model.weights.dense_0 = {
      w: flattenWithShape(parseCSV(fullW0)),
      b: flattenWithShape(parseCSV(fullB0))
    }
  }
  if (fs.existsSync(fullW1)) {
    model.weights.dense_1 = {
      w: flattenWithShape(parseCSV(fullW1)),
      b: flattenWithShape(parseCSV(fullB1))
    }
  }

  // Calculate total size
  let totalParams = 0
  const countParams = (obj) => {
    if (obj.data) {
      totalParams += obj.data.length
    } else if (typeof obj === 'object') {
      Object.values(obj).forEach(countParams)
    }
  }
  countParams(model.weights)

  console.log(`Total parameters: ${totalParams.toLocaleString()}`)

  // Write output
  console.log(`Writing to ${OUTPUT_FILE}...`)
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(model))

  const stats = fs.statSync(OUTPUT_FILE)
  console.log(`Output size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
  console.log('Done!')
}

convert()

/**
 * compressWeights.cjs - Compress weights for web delivery
 *
 * Strategies:
 * 1. Use only one expert (param_0) instead of both
 * 2. Quantize to Float16
 * 3. Round to fewer decimal places
 */

const fs = require('fs')
const zlib = require('zlib')

const INPUT_FILE = './clifford_brown.json'
const OUTPUT_FILE = './clifford_brown_lite.json'
const OUTPUT_GZ = './clifford_brown_lite.json.gz'

// Quantize float to reduced precision (4 decimal places)
function quantize(value) {
  return Math.round(value * 10000) / 10000
}

function compressWeights() {
  console.log('Loading full weights...')
  const model = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'))

  console.log('Creating lite version (single expert)...')
  const lite = {
    name: 'CliffordBrown_Lite',
    architecture: model.architecture,
    weights: {
      // Only use param_0 (first expert)
      lstm1: compressLayerWeights(model.weights.lstm1_0),
      lstm2: compressLayerWeights(model.weights.lstm2_0),
      dense: {
        w: compressMatrix(model.weights.dense_0.w),
        b: compressMatrix(model.weights.dense_0.b)
      }
    }
  }

  // Write JSON
  const json = JSON.stringify(lite)
  fs.writeFileSync(OUTPUT_FILE, json)
  console.log(`JSON size: ${(json.length / 1024 / 1024).toFixed(2)} MB`)

  // Write gzipped
  const gzipped = zlib.gzipSync(json, { level: 9 })
  fs.writeFileSync(OUTPUT_GZ, gzipped)
  console.log(`Gzipped size: ${(gzipped.length / 1024 / 1024).toFixed(2)} MB`)

  console.log('Done!')
}

function compressLayerWeights(layer) {
  const compressed = {}
  for (const [key, value] of Object.entries(layer)) {
    compressed[key] = compressMatrix(value)
  }
  return compressed
}

function compressMatrix(matrix) {
  return {
    shape: matrix.shape,
    data: matrix.data.map(quantize)
  }
}

compressWeights()

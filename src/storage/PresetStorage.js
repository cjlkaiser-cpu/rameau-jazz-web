/**
 * PresetStorage.js - Save/Load user presets to LocalStorage
 *
 * Presets store configuration settings (no progression data):
 * - Style, voicing, tempo, swing
 * - Modulation settings
 * - Volume levels
 */

const STORAGE_KEY = 'rameau_jazz_presets'
const MAX_PRESETS = 30

/**
 * Get all saved presets
 * @returns {Array} Array of saved presets
 */
export function getSavedPresets() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch (err) {
    console.error('Failed to load presets:', err)
    return []
  }
}

/**
 * Save a preset
 * @param {object} options - Preset options
 * @returns {string} ID of saved preset
 */
export function savePreset({
  name,
  voicingStyle,
  stylePreset,
  tempo,
  swingAmount,
  gravity,
  modulationEnabled,
  modulationProbability,
  modulationLevel,
  returnToTonic,
  pianoVolume,
  bassVolume,
  drumsVolume,
  bassEnabled,
  drumsEnabled
}) {
  const presets = getSavedPresets()

  // Generate unique ID
  const id = `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Create entry
  const entry = {
    id,
    name: name || generateDefaultName(stylePreset, tempo),
    date: new Date().toISOString(),
    voicingStyle,
    stylePreset,
    tempo,
    swingAmount,
    gravity,
    modulationEnabled,
    modulationProbability,
    modulationLevel,
    returnToTonic,
    pianoVolume,
    bassVolume,
    drumsVolume,
    bassEnabled,
    drumsEnabled
  }

  // Add to beginning of array
  presets.unshift(entry)

  // Limit total stored
  if (presets.length > MAX_PRESETS) {
    presets.pop()
  }

  // Save
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    return id
  } catch (err) {
    console.error('Failed to save preset:', err)
    if (err.name === 'QuotaExceededError') {
      presets.splice(Math.floor(presets.length / 2))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
      return id
    }
    return null
  }
}

/**
 * Load a preset by ID
 * @param {string} id - Preset ID
 * @returns {object|null} Preset data or null
 */
export function loadPreset(id) {
  const presets = getSavedPresets()
  return presets.find(p => p.id === id) || null
}

/**
 * Delete a preset by ID
 * @param {string} id - Preset ID
 * @returns {boolean} Success
 */
export function deletePreset(id) {
  const presets = getSavedPresets()
  const index = presets.findIndex(p => p.id === id)

  if (index === -1) return false

  presets.splice(index, 1)

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    return true
  } catch (err) {
    console.error('Failed to delete preset:', err)
    return false
  }
}

/**
 * Rename a preset
 * @param {string} id - Preset ID
 * @param {string} newName - New name
 * @returns {boolean} Success
 */
export function renamePreset(id, newName) {
  const presets = getSavedPresets()
  const preset = presets.find(p => p.id === id)

  if (!preset) return false

  preset.name = newName

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    return true
  } catch (err) {
    console.error('Failed to rename preset:', err)
    return false
  }
}

/**
 * Generate default name for a preset
 * @param {string} style - Style preset
 * @param {number} tempo - BPM
 * @returns {string} Default name
 */
function generateDefaultName(style, tempo) {
  const styleNames = {
    standard: 'Standard',
    bebop: 'Bebop',
    bossaNova: 'Bossa',
    modal: 'Modal',
    ballad: 'Ballad'
  }
  const date = new Date()
  const timeStr = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  return `${styleNames[style] || style} ${tempo}bpm - ${timeStr}`
}

/**
 * Export all presets as JSON
 * @returns {string} JSON string
 */
export function exportAllPresets() {
  const presets = getSavedPresets()
  return JSON.stringify(presets, null, 2)
}

/**
 * Import presets from JSON
 * @param {string} jsonString - JSON string
 * @returns {number} Number of presets imported
 */
export function importPresets(jsonString) {
  try {
    const imported = JSON.parse(jsonString)

    if (!Array.isArray(imported)) {
      throw new Error('Invalid format')
    }

    const existing = getSavedPresets()
    const existingIds = new Set(existing.map(p => p.id))

    // Filter out duplicates and add new ones
    const newPresets = imported.filter(p => !existingIds.has(p.id))
    const merged = [...newPresets, ...existing].slice(0, MAX_PRESETS)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))

    return newPresets.length
  } catch (err) {
    console.error('Failed to import presets:', err)
    return 0
  }
}

/**
 * Clear all saved presets
 * @returns {boolean} Success
 */
export function clearAllPresets() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch (err) {
    console.error('Failed to clear presets:', err)
    return false
  }
}

/**
 * Get storage usage info
 * @returns {object} Usage info
 */
export function getPresetStorageInfo() {
  const presets = getSavedPresets()
  const dataSize = new Blob([JSON.stringify(presets)]).size

  return {
    count: presets.length,
    maxCount: MAX_PRESETS,
    sizeBytes: dataSize,
    sizeKB: (dataSize / 1024).toFixed(2)
  }
}

export default {
  getSavedPresets,
  savePreset,
  loadPreset,
  deletePreset,
  renamePreset,
  exportAllPresets,
  importPresets,
  clearAllPresets,
  getPresetStorageInfo
}

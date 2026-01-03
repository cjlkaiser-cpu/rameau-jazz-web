/**
 * SongFormEngine.js - Generate complete song structures
 *
 * Creates jazz song forms (AABA, Blues, etc.) with:
 * - Contrasting sections (A stable, B tense)
 * - Automatic turnarounds
 * - Section markers for UI display
 */

import { MarkovEngine } from './MarkovEngine.js'
import { JAZZ_DEGREES } from './JazzDegrees.js'

/**
 * Available song form templates
 */
export const FORM_TEMPLATES = {
  'AABA': {
    name: 'AABA (Standard)',
    sections: ['A', 'A', 'B', 'A'],
    barsPerSection: 8,
    totalBars: 32
  },
  'Blues12': {
    name: 'Blues (12 bars)',
    sections: ['A', 'A', 'B'],
    barsPerSection: 4,
    totalBars: 12
  },
  'ABAC': {
    name: 'ABAC (32 bars)',
    sections: ['A', 'B', 'A', 'C'],
    barsPerSection: 8,
    totalBars: 32
  },
  'ABAB': {
    name: 'ABAB (32 bars)',
    sections: ['A', 'B', 'A', 'B'],
    barsPerSection: 8,
    totalBars: 32
  }
}

/**
 * Configuration for each section type
 * Creates musical contrast between sections
 */
const SECTION_CONFIG = {
  'A': {
    gravity: 0.5,              // Balanced
    modulationProbability: 0.1, // Low modulation
    modulationLevel: 1,        // Basic modulations
    description: 'Estable'
  },
  'B': {
    gravity: 0.3,              // More chaotic/tense
    modulationProbability: 0.25, // More modulation
    modulationLevel: 2,        // Coltrane changes allowed
    description: 'Tension'
  },
  'C': {
    gravity: 0.6,              // Slightly more stable
    modulationProbability: 0.15, // Moderate modulation
    modulationLevel: 1,
    description: 'Variante'
  }
}

/**
 * Common turnaround patterns for jazz
 */
const TURNAROUNDS = {
  basic: ['V7', 'Imaj7'],           // V-I
  extended: ['IIm7', 'V7', 'Imaj7'], // ii-V-I
  tritone: ['bII7', 'Imaj7'],       // Tritone sub
  full: ['IIIm7', 'VI7', 'IIm7', 'V7'] // iii-VI-ii-V
}

export class SongFormEngine {
  constructor() {
    this.engine = new MarkovEngine()
  }

  /**
   * Generate a complete song form
   * @param {string} formType - Template key (AABA, Blues12, etc.)
   * @param {string} key - Musical key (C, G, etc.)
   * @returns {Array} Progression with section markers
   */
  generate(formType, key = 'C') {
    const template = FORM_TEMPLATES[formType]
    if (!template) {
      throw new Error(`Unknown form type: ${formType}`)
    }

    const generatedSections = {}
    const progression = []

    for (const sectionLabel of template.sections) {
      // Generate section only once, then reuse (e.g., A in AABA)
      if (!generatedSections[sectionLabel]) {
        generatedSections[sectionLabel] = this.generateSection(
          sectionLabel,
          template.barsPerSection,
          key
        )
      }

      // Clone section and add markers
      const sectionChords = generatedSections[sectionLabel].map((chord, idx) => ({
        ...chord,
        section: idx === 0 ? sectionLabel : null // Mark first chord of section
      }))

      progression.push(...sectionChords)
    }

    return progression
  }

  /**
   * Generate a single section with appropriate character
   * @param {string} sectionLabel - A, B, or C
   * @param {number} numBars - Number of bars
   * @param {string} key - Musical key
   * @returns {Array} Section chords
   */
  generateSection(sectionLabel, numBars, key) {
    const config = SECTION_CONFIG[sectionLabel] || SECTION_CONFIG['A']

    // Configure engine for this section's character
    this.engine.configure({
      gravity: config.gravity,
      modulationEnabled: true,
      modulationProbability: config.modulationProbability,
      modulationLevel: config.modulationLevel,
      returnToTonic: true,
      forceCadence: true
    })

    // Generate base progression
    const section = this.engine.generateProgression(numBars, key)

    // Add turnaround at end of section
    this.addTurnaround(section, key)

    return section
  }

  /**
   * Add a turnaround at the end of a section
   * @param {Array} section - Section chords (modified in place)
   * @param {string} key - Musical key
   */
  addTurnaround(section, key) {
    if (section.length < 2) return

    // Use basic V-I turnaround for last 2 bars
    const lastIdx = section.length - 1

    // Penultimate: V7
    section[lastIdx - 1] = {
      degree: 'V7',
      key: key,
      tension: JAZZ_DEGREES['V7']?.tension || 0.8
    }

    // Last: Imaj7
    section[lastIdx] = {
      degree: 'Imaj7',
      key: key,
      tension: JAZZ_DEGREES['Imaj7']?.tension || 0
    }
  }

  /**
   * Get available form templates
   * @returns {Array} Template options for UI
   */
  static getTemplates() {
    return Object.entries(FORM_TEMPLATES).map(([id, template]) => ({
      id,
      name: template.name,
      sections: template.sections,
      totalBars: template.totalBars
    }))
  }

  /**
   * Get section configuration
   * @param {string} sectionLabel - A, B, or C
   * @returns {object} Section config
   */
  static getSectionConfig(sectionLabel) {
    return SECTION_CONFIG[sectionLabel] || SECTION_CONFIG['A']
  }
}

export default SongFormEngine

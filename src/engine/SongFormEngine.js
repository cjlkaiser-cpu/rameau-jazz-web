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
 * Turnaround patterns - some resolve, some suspend
 */
const TURNAROUNDS = {
  // Resolving (for final section)
  resolve: ['V7', 'Imaj7'],           // V-I
  resolveExtended: ['IIm7', 'V7', 'Imaj7'], // ii-V-I

  // Suspending (for middle sections - no resolution)
  suspend: ['IIm7', 'V7'],            // ii-V (leaves tension)
  suspendLong: ['IIIm7', 'VI7', 'IIm7', 'V7'], // iii-VI-ii-V

  // Colorful alternatives
  backdoor: ['IVm7', 'bVII7'],        // Minor iv - bVII
  tritone: ['IIm7', 'bII7'],          // ii - tritone sub
}

/**
 * Starting chords for contrast
 */
const SECTION_STARTS = {
  'A': ['Imaj7'],                     // A always starts on tonic
  'B': ['IVmaj7', 'IIm7', 'VIm7', 'bVIImaj7'], // B has contrast options
  'C': ['IIm7', 'IVmaj7', 'bVImaj7'], // C also contrasts
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
    const totalSections = template.sections.length

    template.sections.forEach((sectionLabel, sectionIndex) => {
      const isLastSection = sectionIndex === totalSections - 1
      const isFirstOccurrence = !generatedSections[sectionLabel]

      // Generate section only once, then reuse (e.g., A in AABA)
      if (isFirstOccurrence) {
        // Determine if this section type ever appears as last
        const appearsAsLast = template.sections.lastIndexOf(sectionLabel) === totalSections - 1

        generatedSections[sectionLabel] = this.generateSection(
          sectionLabel,
          template.barsPerSection,
          key,
          appearsAsLast // Only resolve if this section appears at the end
        )
      }

      // Clone section and add markers
      let sectionChords = generatedSections[sectionLabel].map((chord, idx) => ({
        ...chord,
        section: idx === 0 ? sectionLabel : null // Mark first chord of section
      }))

      // If this is the last section but not the "resolving" version, fix the ending
      if (isLastSection && !generatedSections[sectionLabel]._resolves) {
        sectionChords = this.ensureResolution(sectionChords, key)
      }

      progression.push(...sectionChords)
    })

    return progression
  }

  /**
   * Ensure a section ends with proper resolution
   */
  ensureResolution(chords, key) {
    if (chords.length < 2) return chords

    const result = [...chords]
    const lastIdx = result.length - 1

    // Replace last two chords with V7 → Imaj7
    result[lastIdx - 1] = {
      ...result[lastIdx - 1],
      degree: 'V7',
      key: key,
      tension: JAZZ_DEGREES['V7']?.tension || 0.8
    }
    result[lastIdx] = {
      ...result[lastIdx],
      degree: 'Imaj7',
      key: key,
      tension: JAZZ_DEGREES['Imaj7']?.tension || 0
    }

    return result
  }

  /**
   * Generate a single section with appropriate character
   * @param {string} sectionLabel - A, B, or C
   * @param {number} numBars - Number of bars
   * @param {string} key - Musical key
   * @param {boolean} shouldResolve - Whether to end with resolution (only for final section)
   * @returns {Array} Section chords
   */
  generateSection(sectionLabel, numBars, key, shouldResolve = false) {
    const config = SECTION_CONFIG[sectionLabel] || SECTION_CONFIG['A']

    // Configure engine for this section's character
    this.engine.configure({
      gravity: config.gravity,
      modulationEnabled: true,
      modulationProbability: config.modulationProbability,
      modulationLevel: config.modulationLevel,
      returnToTonic: false,  // We handle endings ourselves
      forceCadence: false    // We handle cadences ourselves
    })

    // Generate base progression
    const section = this.engine.generateProgression(numBars, key)

    // Set starting chord based on section type
    this.setStartingChord(section, sectionLabel, key)

    // Add appropriate ending
    if (shouldResolve) {
      this.addResolvingTurnaround(section, key)
      section._resolves = true
    } else {
      this.addSuspendingTurnaround(section, key)
    }

    return section
  }

  /**
   * Set the starting chord for contrast
   */
  setStartingChord(section, sectionLabel, key) {
    if (section.length === 0) return

    const startOptions = SECTION_STARTS[sectionLabel] || SECTION_STARTS['A']
    const startDegree = startOptions[Math.floor(Math.random() * startOptions.length)]

    section[0] = {
      degree: startDegree,
      key: key,
      tension: JAZZ_DEGREES[startDegree]?.tension || 0
    }
  }

  /**
   * Add a suspending turnaround (ii-V, no resolution)
   */
  addSuspendingTurnaround(section, key) {
    if (section.length < 2) return

    const lastIdx = section.length - 1

    // Choose turnaround type randomly
    const turnaroundTypes = ['suspend', 'backdoor', 'tritone']
    const turnaroundType = turnaroundTypes[Math.floor(Math.random() * turnaroundTypes.length)]
    const turnaround = TURNAROUNDS[turnaroundType]

    // Apply last 2 chords of turnaround
    const t1 = turnaround[0]
    const t2 = turnaround[1]

    section[lastIdx - 1] = {
      degree: t1,
      key: key,
      tension: JAZZ_DEGREES[t1]?.tension || 0.5
    }

    section[lastIdx] = {
      degree: t2,
      key: key,
      tension: JAZZ_DEGREES[t2]?.tension || 0.8
    }
  }

  /**
   * Add a resolving turnaround (V-I)
   */
  addResolvingTurnaround(section, key) {
    if (section.length < 2) return

    const lastIdx = section.length - 1

    section[lastIdx - 1] = {
      degree: 'V7',
      key: key,
      tension: JAZZ_DEGREES['V7']?.tension || 0.8
    }

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

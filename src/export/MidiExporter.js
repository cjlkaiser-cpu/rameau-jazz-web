/**
 * MidiExporter.js - Export progressions to Standard MIDI File
 *
 * Generates professional multi-track MIDI:
 * - Track 1: Piano (chords)
 * - Track 2: Electric Bass (walking bass) - separate channel
 * - Track 3: Drums (jazz swing pattern)
 */

import MidiWriter from 'midi-writer-js'
import { JAZZ_DEGREES } from '../engine/JazzDegrees.js'
import { CHORD_TYPES } from '../engine/ChordTypes.js'
import { getVoicing } from '../engine/Voicings.js'

/**
 * Key pitch offsets (C = 0)
 */
const KEY_PITCHES = {
  'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5,
  'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11
}

/**
 * GM Drum notes (channel 10)
 */
const DRUM = {
  kick: 36,
  hihatPedal: 44,
  rideCymbal: 51
}

/**
 * Calculates root pitch for a degree in a key
 */
function getRootPitch(degree, key, baseOctave = 60) {
  const degreeInfo = JAZZ_DEGREES[degree]
  const keyOffset = KEY_PITCHES[key] || 0
  const root = degreeInfo?.root || 0
  return baseOctave + keyOffset + root
}

/**
 * Generates walking bass line for a measure
 */
function generateBassLine(currentChord, nextChord, key) {
  const chordKey = currentChord.key || key
  const nextChordKey = nextChord?.key || key

  const rootPitch = getRootPitch(currentChord.degree, chordKey, 36) // E1-G3 range
  const nextRootPitch = nextChord
    ? getRootPitch(nextChord.degree, nextChordKey, 36)
    : rootPitch

  const chordType = JAZZ_DEGREES[currentChord.degree]?.type || 'maj7'
  const intervals = CHORD_TYPES[chordType]?.intervals || [0, 4, 7]

  const third = intervals.find(i => i === 3 || i === 4) || 4
  const fifth = intervals.find(i => i === 6 || i === 7 || i === 8) || 7

  // Beat 1: Root
  const beat1 = rootPitch

  // Beat 2: Passing tone
  const rand2 = Math.random()
  const beat2 = rand2 < 0.5 ? rootPitch + 2 : rootPitch + third

  // Beat 3: Chord tone (5th or 3rd)
  const beat3 = Math.random() < 0.6 ? rootPitch + fifth : rootPitch + third

  // Beat 4: Chromatic approach
  const beat4 = nextRootPitch + (Math.random() < 0.5 ? 1 : -1)

  return [beat1, beat2, beat3, beat4]
}

/**
 * Main export function
 */
export function exportToMidi({
  progression,
  key = 'C',
  tempo = 120,
  voicingStyle = 'shell',
  includeBass = true,
  includeDrums = false,
  filename = 'RameauJazz'
}) {
  if (!progression || progression.length === 0) {
    throw new Error('No progression to export')
  }

  const tracks = []

  // ============================================
  // Track 1: Piano (channel 1)
  // Only mid-high register (C4-C6) to not overlap with bass
  // ============================================
  const pianoTrack = new MidiWriter.Track()
  pianoTrack.addTrackName('Piano')
  pianoTrack.setTempo(tempo)
  pianoTrack.setTimeSignature(4, 4)
  pianoTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 1, channel: 1 }))

  progression.forEach((chord) => {
    const degreeInfo = JAZZ_DEGREES[chord.degree]
    if (!degreeInfo) {
      pianoTrack.addEvent(new MidiWriter.NoteEvent({
        pitch: [60],
        duration: '1',
        velocity: 0,
        channel: 1
      }))
      return
    }

    const chordKey = chord.key || key
    const rootPitch = getRootPitch(chord.degree, chordKey, 60) // C4 base
    const voicing = getVoicing(rootPitch, degreeInfo.type, voicingStyle)

    // Combine hands but keep only notes above bass range (>= C3 = 48)
    // Move low notes up an octave to avoid overlap with bass
    const allNotes = [...voicing.left, ...voicing.right]
      .map(note => note < 48 ? note + 12 : note) // Move notes below C3 up an octave
      .filter((note, index, arr) => arr.indexOf(note) === index) // Remove duplicates

    pianoTrack.addEvent(new MidiWriter.NoteEvent({
      pitch: allNotes,
      duration: '1',
      velocity: 75,
      channel: 1
    }))
  })

  tracks.push(pianoTrack)

  // ============================================
  // Track 2: Acoustic Bass (channel 2)
  // GM 33 = Acoustic Bass, range E1-G3 (MIDI 28-55)
  // ============================================
  if (includeBass) {
    const bassTrack = new MidiWriter.Track()
    bassTrack.addTrackName('Acoustic Bass')
    // GM instrument 33 = Acoustic Bass (more distinctive sound)
    bassTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 33, channel: 2 }))

    progression.forEach((chord, measureIndex) => {
      const nextChord = progression[(measureIndex + 1) % progression.length]
      const bassLine = generateBassLine(chord, nextChord, key)

      bassLine.forEach((pitch, beatIndex) => {
        // Ensure bass is in proper low range (E1-E3)
        let bassPitch = pitch
        while (bassPitch > 52) bassPitch -= 12 // Keep below E3
        while (bassPitch < 28) bassPitch += 12 // Keep above E1

        bassTrack.addEvent(new MidiWriter.NoteEvent({
          pitch: [bassPitch],
          duration: '4',
          velocity: beatIndex === 0 ? 100 : 85,
          channel: 2
        }))
      })
    })

    tracks.push(bassTrack)
  }

  // ============================================
  // Track 3: Drums (channel 10)
  // Jazz swing pattern with triplets using startTick
  // 128 ticks per quarter note
  // Swing = play on beat and on last third (tick 85 of each beat)
  // ============================================
  if (includeDrums) {
    const drumTrack = new MidiWriter.Track()
    drumTrack.addTrackName('Drums')

    const TICKS_PER_BEAT = 128
    const TICKS_PER_MEASURE = TICKS_PER_BEAT * 4
    const TRIPLET_OFFSET = Math.round(TICKS_PER_BEAT * 2 / 3) // 85 ticks

    progression.forEach((_, measureIndex) => {
      const measureStart = measureIndex * TICKS_PER_MEASURE

      // Jazz swing pattern: ride on each beat + triplet skip beat
      // Hi-hat pedal on 2 and 4
      for (let beat = 0; beat < 4; beat++) {
        const beatTick = measureStart + (beat * TICKS_PER_BEAT)
        const isBackbeat = (beat === 1 || beat === 3) // 2 and 4

        // Main beat - Ride (+ hihat on 2 and 4)
        const mainPitches = isBackbeat
          ? [DRUM.rideCymbal, DRUM.hihatPedal]
          : [DRUM.rideCymbal]

        drumTrack.addEvent(new MidiWriter.NoteEvent({
          pitch: mainPitches,
          duration: 'T32',
          velocity: beat === 0 ? 95 : (beat === 2 ? 85 : 75),
          channel: 10,
          startTick: beatTick
        }))

        // Triplet skip beat - Ride only (softer)
        drumTrack.addEvent(new MidiWriter.NoteEvent({
          pitch: [DRUM.rideCymbal],
          duration: 'T32',
          velocity: 55,
          channel: 10,
          startTick: beatTick + TRIPLET_OFFSET
        }))
      }
    })

    tracks.push(drumTrack)
  }

  // Generate MIDI file
  const write = new MidiWriter.Writer(tracks)
  const midiData = write.buildFile()

  return new Blob([midiData], { type: 'audio/midi' })
}

/**
 * Download MIDI file
 */
export function downloadMidi(options) {
  const blob = exportToMidi(options)
  const filename = options.filename || 'RameauJazz'

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.mid`

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Generate filename from progression info
 */
export function generateFilename(key, numChords, style = 'jazz') {
  const timestamp = new Date().toISOString().slice(0, 10)
  return `RameauJazz_${key}_${numChords}bars_${style}_${timestamp}`
}

export default {
  exportToMidi,
  downloadMidi,
  generateFilename
}

/**
 * Every size and value limit in one table. Applied on every write path (imports, merges, mutators, computed
 * values) and by the loader, so whatever the app saves it can load back.
 */
export const LIMITS = {
  titleMaxChars: 80,
  markerMaxChars: 24,
  songsMax: 300,
  barsMax: 500,
  eventsPerBarMax: 64,
  tempoMin: 30,
  tempoMax: 240,
  beatsMin: 1,
  beatsMax: 12,
  beatTypes: [2, 4, 8, 16] as readonly number[],
  repeatTimesMin: 2,
  repeatTimesMax: 8,
  endingMax: 8,
  endingsPerBarMax: 4,
  /** Stored pitches may be outside the editing range (imports); this is the hard range. */
  storedMidiMin: 36,
  storedMidiMax: 96,
  speedMin: 25,
  speedMax: 150,
  versionsPerSong: 20,
  practiceEntriesMax: 5000,
  practiceSecondsMax: 6 * 3600,
  loopsMax: 100000,
  tombstonesMax: 2000,
  importFileMaxBytes: 5 * 1024 * 1024,
  backupFileMaxBytes: 50 * 1024 * 1024,
} as const;

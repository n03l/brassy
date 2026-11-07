# TODO

Open work for Brassy. Keep items short. Remove an item when it ships, and say in the commit what was done.

## Music the importer drops
Listed in the import dialog's "Brassy left out…" warning (`skip.*` keys in `src/i18n`):
- [ ] Triplets and other tuplets
- [ ] Grace notes
- [ ] Second voices, chords (only the top note is kept), extra staves, other parts
- [ ] Time signature changes and tempo changes during the song
- [ ] Double dots, notes longer than a whole or shorter than a sixteenth

Dropped **without** a warning (seen in Bella Ciao). Either support them or list them in the warning:
- [ ] Slurs, articulations (tenuto, staccato, accents), breath marks
- [ ] Dynamics (p, f), crescendo and diminuendo
- [ ] Tempo words ("Andante"); the tempo number is kept

## Notation
- [ ] Key signatures: the model has none, so every accidental is written next to its note, and the MusicXML
      export always writes `<fifths>0</fifths>`

## Editor
- [ ] Sixteenth notes: the model and importer support them, but the palette has no button for them

## Player
- [ ] Phone held upright (< 600px wide) hides the Trumpet, Click and Loop toggles (`.transport .toggles`), so silent
      playback, the metronome and loops can't be reached there (a phone held sideways shows them)
- [ ] Phone held sideways: the editor palette (beside the music) needs a short scroll to reach Delete

## Housekeeping
- [ ] Vite warns that `vite.config.ts` imports `vercel.json` without `with { type: 'json' }`

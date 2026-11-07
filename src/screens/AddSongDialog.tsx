import { useId, useRef, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { hasImportExtension, ImportError, IMPORT_EXTENSIONS, pitchKind, readScore, scoreToSong, titleFromFileName, type ConvertResult } from '../io/importScore';
import { createBlankSong } from '../model/songOps';
import { saveSong } from '../db/repo';
import { navigate } from '../app/router';
import { LIMITS } from '../model/limits';
import type * as alphaTab from '@coderline/alphatab';
import { t } from '../i18n';

type Picked =
  | { stage: 'idle' }
  | { stage: 'reading'; name: string }
  | { stage: 'ask'; name: string; score: alphaTab.model.Score; other: boolean }
  | { stage: 'ready'; name: string; result: ConvertResult }
  | { stage: 'error'; message: string };

export function AddSongDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={t('add.title')} wide>
      <div className="add-grid">
        <ImportSide onDone={onClose} />
        <ScratchSide onDone={onClose} />
      </div>
    </Dialog>
  );
}

function ImportSide({ onDone }: { onDone: () => void }) {
  const [picked, setPicked] = useState<Picked>({ stage: 'idle' });
  const [drag, setDrag] = useState(false);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!hasImportExtension(file.name)) {
      setPicked({ stage: 'error', message: t('add.badType') });
      return;
    }
    if (file.size > LIMITS.importFileMaxBytes) {
      setPicked({ stage: 'error', message: t('import.tooBig') });
      return;
    }
    setPicked({ stage: 'reading', name: file.name });
    try {
      const score = readScore(new Uint8Array(await file.arrayBuffer()));
      const kind = pitchKind(score);
      if (kind === 'trumpet') {
        setPicked({ stage: 'ready', name: file.name, result: scoreToSong(score, { concertPitch: false, fallbackTitle: titleFromFileName(file.name) }) });
      } else {
        setPicked({ stage: 'ask', name: file.name, score, other: kind === 'other-transposition' });
      }
    } catch (e) {
      setPicked({ stage: 'error', message: e instanceof ImportError ? e.message : t('import.unreadable') });
    }
  }

  function answer(concertPitch: boolean) {
    if (picked.stage !== 'ask') return;
    try {
      const result = scoreToSong(picked.score, { concertPitch, fallbackTitle: titleFromFileName(picked.name) });
      setPicked({ stage: 'ready', name: picked.name, result });
    } catch {
      setPicked({ stage: 'error', message: t('add.convertFailed') });
    }
  }

  async function add() {
    if (picked.stage !== 'ready') return;
    setSaving(true);
    try {
      await saveSong(picked.result.song, { version: true });
      onDone();
      navigate({ name: 'player', songId: picked.result.song.id });
    } catch (e) {
      setPicked({ stage: 'error', message: e instanceof Error ? e.message : t('common.savingFailed') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="add-side" aria-labelledby="import-h">
      <h3 id="import-h">{t('add.open')}</h3>
      {picked.stage === 'idle' || picked.stage === 'error' || picked.stage === 'reading' ? (
        <div
          className={`dropzone${drag ? ' dropzone--over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void handleFile(f);
          }}
        >
          <Icon name="upload" size={36} />
          <p>{picked.stage === 'reading' ? t('add.reading') : t('add.drop')}</p>
          <button className="btn btn--primary" onClick={() => input.current?.click()} disabled={picked.stage === 'reading'}>
            {t('add.choose')}
          </button>
          <p className="muted small">{t('add.kinds')}</p>
          <input ref={input} type="file" hidden accept={IMPORT_EXTENSIONS.join(',')}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleFile(f); }} />
        </div>
      ) : null}
      {picked.stage === 'error' && <p className="warn-text" role="alert">{picked.message}</p>}
      {picked.stage === 'ask' && (
        <div className="ask card-inset" role="group" aria-labelledby="ask-q">
          <p className="file-name">{picked.name}</p>
          <p id="ask-q" className="ask-q">{t('add.question')}</p>
          {picked.other && <p className="muted small">{t('add.otherInstrument')}</p>}
          <div className="ask-buttons">
            <button className="btn btn--primary" onClick={() => answer(false)}>{t('add.forTrumpet')}</button>
            <button className="btn" onClick={() => answer(true)}>{t('add.concert')}</button>
          </div>
          <p className="muted small">{t('add.notSure')}</p>
        </div>
      )}
      {picked.stage === 'ready' && (
        <div className="ready card-inset">
          <p className="file-name"><Icon name="music" size={20} /> {picked.result.song.title}</p>
          <p className="muted">{t('add.bpm', picked.result.song.bars.length, picked.result.song.tempo)}</p>
          {picked.result.warnings.length > 0 && (
            <div className="skip-note" role="note">
              <p><strong>{t('add.headsUp')}</strong> {t('add.leftOut')}</p>
              <ul>{picked.result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          <div className="ask-buttons">
            <button className="btn" onClick={() => setPicked({ stage: 'idle' })}>{t('add.another')}</button>
            <button className="btn btn--primary" onClick={() => void add()} disabled={saving}>{t('add.addIt')}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function ScratchSide({ onDone }: { onDone: () => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [beats, setBeats] = useState(4);
  const [bars, setBars] = useState(8);
  const [error, setError] = useState('');
  async function create() {
    const song = createBlankSong(name, beats, bars);
    try {
      await saveSong(song, { version: true });
      onDone();
      navigate({ name: 'editor', songId: song.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.savingFailed'));
    }
  }
  return (
    <section className="add-side" aria-labelledby="scratch-h">
      <h3 id="scratch-h">{t('add.scratch')}</h3>
      <label className="field" htmlFor={`${id}-name`}>
        {t('add.name')}
        <input id={`${id}-name`} className="input" value={name} maxLength={LIMITS.titleMaxChars}
          placeholder={t('song.defaultTitle')} onChange={(e) => setName(e.target.value)} />
      </label>
      <Segmented label={t('add.beats')} options={[2, 3, 4]} value={beats} onChange={setBeats} />
      <Segmented label={t('add.bars')} options={[4, 8, 16]} value={bars} onChange={setBars} />
      <p className="instrument-label"><Icon name="trumpet" size={20} /> {t('add.instrument')}</p>
      {error && <p className="warn-text" role="alert">{error}</p>}
      <button className="btn btn--primary" onClick={() => void create()}>{t('add.create')}</button>
    </section>
  );
}

function Segmented({ label, options, value, onChange }: { label: string; options: number[]; value: number; onChange: (v: number) => void }) {
  return (
    <fieldset className="segmented">
      <legend>{label}</legend>
      <div className="segmented-row">
        {options.map((o) => (
          <button key={o} type="button" className="btn" aria-pressed={o === value} onClick={() => onChange(o)}>{o}</button>
        ))}
      </div>
    </fieldset>
  );
}

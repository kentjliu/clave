'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './Sequencer.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = 16;

const DRUM_TRACKS = [
  { id: 'kick',  label: 'Kick',  color: '#7c6fff' },
  { id: 'snare', label: 'Snare', color: '#ff6b9d' },
  { id: 'chh',   label: 'C-HH',  color: '#4ecdc4' },
  { id: 'ohh',   label: 'O-HH',  color: '#45b7d1' },
] as const;

const SYNTH_TRACKS = [
  { id: 'bass', label: 'Bass', color: '#96e6a1',
    notes: ['C2','Eb2','F2','G2','Bb2','C3','Eb3','F3','G3','Bb3'] },
  { id: 'lead', label: 'Lead', color: '#ffd166',
    notes: ['C4','Eb4','F4','G4','Bb4','C5','Eb5','F5','G5','Bb5'] },
] as const;

type DrumGrid  = boolean[][];          // [4 tracks][16 steps]
type SynthGrid = (number | null)[][];  // [2 tracks][16 steps] — null=off, n=note index

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emptyDrums  = (): DrumGrid  => DRUM_TRACKS.map(() => Array(STEPS).fill(false));
const emptySynths = (): SynthGrid => SYNTH_TRACKS.map(() => Array(STEPS).fill(null));

// ─── Presets ──────────────────────────────────────────────────────────────────

function basicBeat(): { drums: DrumGrid; synths: SynthGrid } {
  const drums = emptyDrums();
  [0, 4, 8, 12].forEach((i) => { drums[0][i] = true; });          // kick
  [4, 12].forEach((i) => { drums[1][i] = true; });                  // snare
  [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => { drums[2][i] = true; }); // chh
  return { drums, synths: emptySynths() };
}

function clavePattern(): { drums: DrumGrid; synths: SynthGrid } {
  const drums = emptyDrums();
  [0, 3, 6, 8, 11].forEach((i) => { drums[0][i] = true; }); // son clave
  [4, 12].forEach((i) => { drums[1][i] = true; });
  [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => { drums[2][i] = true; });
  [3, 11].forEach((i) => { drums[3][i] = true; });

  const synths = emptySynths();
  // Bass: C2 . . Eb2 . F2 . G2 . . . Bb2 . . . .
  [[0, 0], [3, 2], [5, 3], [7, 4], [11, 5]].forEach(([step, note]) => {
    synths[0][step] = note;
  });
  return { drums, synths };
}

function randomPattern(): { drums: DrumGrid; synths: SynthGrid } {
  const drums = DRUM_TRACKS.map((_, ti) =>
    Array.from({ length: STEPS }, () => Math.random() < (ti === 2 ? 0.45 : 0.25)),
  );
  const synths = SYNTH_TRACKS.map((track) =>
    Array.from({ length: STEPS }, () =>
      Math.random() < 0.2 ? Math.floor(Math.random() * track.notes.length) : null,
    ),
  );
  return { drums, synths };
}

// ─── URL Encoding ─────────────────────────────────────────────────────────────

function encodePattern(drums: DrumGrid, synths: SynthGrid, bpm: number): string {
  try { return btoa(JSON.stringify({ d: drums, s: synths, b: bpm })); }
  catch { return ''; }
}

function decodePattern(hash: string): { drums: DrumGrid; synths: SynthGrid; bpm: number } | null {
  try {
    const { d, s, b } = JSON.parse(atob(hash));
    return { drums: d, synths: s, bpm: b };
  } catch { return null; }
}

// ─── Sequencer ────────────────────────────────────────────────────────────────

export function Sequencer() {
  const [drums,   setDrums]   = useState<DrumGrid>(emptyDrums);
  const [synths,  setSynths]  = useState<SynthGrid>(emptySynths);
  const [bpm,     setBpm]     = useState(120);
  const [playing, setPlaying] = useState(false);
  const [step,    setStep]    = useState(-1);
  const [muted,   setMuted]   = useState(() =>
    [...DRUM_TRACKS, ...SYNTH_TRACKS].map(() => false),
  );
  const [copied,  setCopied]  = useState(false);

  // Refs for audio (closures inside Tone callbacks must read from refs, not state)
  const drumsRef  = useRef(drums);
  const synthsRef = useRef(synths);
  const mutedRef  = useRef(muted);
  const stepRef   = useRef(-1);
  const toneRef   = useRef<{
    Tone:   typeof import('tone');
    kick:   import('tone').MembraneSynth;
    snare:  import('tone').NoiseSynth;
    chh:    import('tone').MetalSynth;
    ohh:    import('tone').MetalSynth;
    bass:   import('tone').MonoSynth;
    lead:   import('tone').Synth;
    seq:    import('tone').Sequence | null;
  } | null>(null);

  useEffect(() => { drumsRef.current = drums;   }, [drums]);
  useEffect(() => { synthsRef.current = synths; }, [synths]);
  useEffect(() => { mutedRef.current = muted;   }, [muted]);

  // RAF loop to sync step indicator without blocking audio thread
  useEffect(() => {
    let id: number;
    const tick = () => { setStep(stepRef.current); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  // Restore from URL hash
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const state = decodePattern(hash);
    if (state) { setDrums(state.drums); setSynths(state.synths); setBpm(state.bpm); }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const t = toneRef.current;
      if (!t) return;
      t.seq?.stop(); t.seq?.dispose();
      t.Tone.getTransport().stop();
      [t.kick, t.snare, t.chh, t.ohh, t.bass, t.lead].forEach((s) => s.dispose());
    };
  }, []);

  // ─── Audio init (lazy, requires user gesture) ───────────────────────────────

  async function ensureTone() {
    if (toneRef.current) return toneRef.current;

    const Tone = await import('tone');
    await Tone.start();

    // Effects
    const snareVerb = new Tone.Reverb({ decay: 0.8,  wet: 0.2  }).toDestination();
    const leadDelay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.15, wet: 0.2 }).toDestination();

    // Drums
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 8,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
    }).toDestination();
    kick.volume.value = 0;

    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.13, sustain: 0, release: 0.02 },
    }).connect(snareVerb);
    snare.volume.value = -4;

    const chh = new Tone.MetalSynth({
      frequency: 400,
      envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
      harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
    }).toDestination();
    chh.volume.value = -12;

    const ohh = new Tone.MetalSynth({
      frequency: 400,
      envelope: { attack: 0.001, decay: 0.28, release: 0.1 },
      harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
    }).toDestination();
    ohh.volume.value = -14;

    // Synths
    const bass = new Tone.MonoSynth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.1 },
      filterEnvelope: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.1, baseFrequency: 220, octaves: 2.5 },
    }).toDestination();
    bass.volume.value = -8;

    const lead = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.5 },
    }).connect(leadDelay);
    lead.volume.value = -12;

    toneRef.current = { Tone, kick, snare, chh, ohh, bass, lead, seq: null };
    return toneRef.current;
  }

  function buildSequence(t: NonNullable<typeof toneRef.current>) {
    t.seq?.stop(); t.seq?.dispose();

    t.Tone.getTransport().bpm.value = bpm;

    const seq = new t.Tone.Sequence<number>(
      (time, stepIdx) => {
        const d = drumsRef.current;
        const s = synthsRef.current;
        const m = mutedRef.current;

        if (d[0][stepIdx] && !m[0]) t.kick.triggerAttackRelease('C1', '8n', time);
        if (d[1][stepIdx] && !m[1]) t.snare.triggerAttackRelease('8n', time);
        if (d[2][stepIdx] && !m[2]) t.chh.triggerAttackRelease('32n', time);
        if (d[3][stepIdx] && !m[3]) t.ohh.triggerAttackRelease('8n', time);

        const bassNote = s[0][stepIdx];
        if (bassNote !== null && !m[4]) {
          t.bass.triggerAttackRelease(SYNTH_TRACKS[0].notes[bassNote], '8n', time);
        }
        const leadNote = s[1][stepIdx];
        if (leadNote !== null && !m[5]) {
          t.lead.triggerAttackRelease(SYNTH_TRACKS[1].notes[leadNote], '8n', time);
        }

        // Update playhead ref (read by RAF loop above)
        stepRef.current = stepIdx;
      },
      Array.from({ length: STEPS }, (_, i) => i),
      '16n',
    );
    seq.start(0);
    t.seq = seq;
  }

  // ─── Transport ───────────────────────────────────────────────────────────────

  async function handlePlayStop() {
    if (playing) {
      toneRef.current?.Tone.getTransport().stop();
      toneRef.current?.seq?.stop();
      stepRef.current = -1;
      setPlaying(false);
      return;
    }
    const t = await ensureTone();
    buildSequence(t);
    t.Tone.getTransport().start();
    setPlaying(true);
  }

  // Update BPM live
  useEffect(() => {
    if (toneRef.current) toneRef.current.Tone.getTransport().bpm.value = bpm;
  }, [bpm]);

  // ─── Grid interactions ───────────────────────────────────────────────────────

  const toggleDrum = useCallback((track: number, s: number) => {
    setDrums((prev) => {
      const next = prev.map((r) => [...r]);
      next[track][s] = !next[track][s];
      return next;
    });
  }, []);

  const cycleSynth = useCallback((track: number, s: number) => {
    setSynths((prev) => {
      const next = prev.map((r) => [...r]);
      const cur = next[track][s];
      const len = SYNTH_TRACKS[track].notes.length;
      next[track][s] = cur === null ? 0 : cur < len - 1 ? cur + 1 : null;
      return next;
    });
  }, []);

  const toggleMute = useCallback((i: number) => {
    setMuted((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }, []);

  // ─── Presets & utilities ─────────────────────────────────────────────────────

  function applyPreset(p: { drums: DrumGrid; synths: SynthGrid }) {
    setDrums(p.drums.map((r) => [...r]));
    setSynths(p.synths.map((r) => [...r]));
  }

  function handleShare() {
    const encoded = encodePattern(drums, synths, bpm);
    const url = `${window.location.origin}/playground#${encoded}`;
    window.history.replaceState(null, '', `/playground#${encoded}`);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const allTracks = [
    ...DRUM_TRACKS.map((t, i) => ({ ...t, kind: 'drum' as const, index: i })),
    ...SYNTH_TRACKS.map((t, i) => ({ ...t, kind: 'synth' as const, index: i })),
  ];

  return (
    <div className={styles.wrap}>

      {/* ── Transport bar ── */}
      <div className={styles.transport}>
        <div className={styles.bpmGroup}>
          <span className={styles.bpmLabel}>BPM</span>
          <input
            type="range" min={60} max={180} value={bpm}
            className={styles.bpmSlider}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
          <span className={styles.bpmValue}>{bpm}</span>
        </div>

        <button
          className={playing ? styles.stopBtn : styles.playBtn}
          onClick={handlePlayStop}
        >
          {playing ? '■ Stop' : '▶ Play'}
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>Presets</span>
        <button className={styles.toolBtn} onClick={() => applyPreset(basicBeat())}>Basic</button>
        <button className={styles.toolBtn} onClick={() => applyPreset(clavePattern())}>Clave</button>
        <div className={styles.toolDivider} />
        <button className={styles.toolBtn} onClick={() => applyPreset(randomPattern())}>🎲 Random</button>
        <button className={styles.toolBtn} onClick={() => { setDrums(emptyDrums()); setSynths(emptySynths()); }}>Clear</button>
        <div className={styles.toolDivider} />
        <button className={styles.toolBtn} onClick={handleShare}>
          {copied ? '✓ Copied!' : '🔗 Share'}
        </button>
      </div>

      {/* ── Grid ── */}
      <div className={styles.gridScroll}>
        <div className={styles.grid}>

          {/* Step numbers */}
          <div className={styles.stepNumbers}>
            <div className={styles.trackMeta} />
            {Array.from({ length: STEPS }, (_, i) => (
              <div
                key={i}
                className={`${styles.stepNum} ${i % 4 === 0 ? styles.stepNumBeat : ''}`}
                style={i === step ? { color: 'var(--text)' } : undefined}
              >
                {i % 4 === 0 ? i / 4 + 1 : '·'}
              </div>
            ))}
          </div>

          {/* Section divider */}
          <div className={styles.sectionDivider}>
            <span className={styles.sectionLabel}>DRUMS</span>
          </div>

          {/* Drum rows */}
          {DRUM_TRACKS.map((track, ti) => (
            <div key={track.id} className={styles.row}>
              <div className={styles.trackMeta}>
                <span className={styles.trackLabel}>{track.label}</span>
                <button
                  className={`${styles.muteBtn} ${muted[ti] ? styles.muteBtnOn : ''}`}
                  onClick={() => toggleMute(ti)}
                  title="Mute"
                >M</button>
              </div>
              {Array.from({ length: STEPS }, (_, si) => {
                const active = drums[ti][si];
                const isCurrent = si === step;
                return (
                  <button
                    key={si}
                    className={`${styles.cell} ${si % 4 === 0 ? styles.cellBeat : ''}`}
                    style={{
                      background: active
                        ? isCurrent ? `${track.color}ff` : `${track.color}cc`
                        : isCurrent ? 'rgba(255,255,255,0.07)' : undefined,
                      borderColor: active ? track.color : undefined,
                      boxShadow: active && isCurrent ? `0 0 8px ${track.color}99` : undefined,
                    }}
                    onClick={() => toggleDrum(ti, si)}
                  />
                );
              })}
            </div>
          ))}

          {/* Section divider */}
          <div className={styles.sectionDivider}>
            <span className={styles.sectionLabel}>SYNTHS</span>
            <span className={styles.sectionHint}>click to toggle · click again to change note</span>
          </div>

          {/* Synth rows */}
          {SYNTH_TRACKS.map((track, ti) => (
            <div key={track.id} className={styles.row}>
              <div className={styles.trackMeta}>
                <span className={styles.trackLabel}>{track.label}</span>
                <button
                  className={`${styles.muteBtn} ${muted[4 + ti] ? styles.muteBtnOn : ''}`}
                  onClick={() => toggleMute(4 + ti)}
                  title="Mute"
                >M</button>
              </div>
              {Array.from({ length: STEPS }, (_, si) => {
                const noteIdx = synths[ti][si];
                const active  = noteIdx !== null;
                const isCurrent = si === step;
                const label = active ? track.notes[noteIdx].replace('b', '♭') : '';
                return (
                  <button
                    key={si}
                    className={`${styles.cell} ${styles.cellSynth} ${si % 4 === 0 ? styles.cellBeat : ''}`}
                    style={{
                      background: active
                        ? isCurrent ? `${track.color}ee` : `${track.color}99`
                        : isCurrent ? 'rgba(255,255,255,0.07)' : undefined,
                      borderColor: active ? track.color : undefined,
                      color: active ? '#000' : undefined,
                      boxShadow: active && isCurrent ? `0 0 8px ${track.color}99` : undefined,
                    }}
                    onClick={() => cycleSynth(ti, si)}
                  >
                    {label && <span className={styles.noteLabel}>{label}</span>}
                  </button>
                );
              })}
            </div>
          ))}

        </div>
      </div>

      <p className={styles.hint}>
        Pro tip: use headphones for the best experience.
        {' '}Pattern is saved to the URL — hit Share to copy the link.
      </p>
    </div>
  );
}

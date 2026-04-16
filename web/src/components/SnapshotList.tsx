'use client';

import { useState, useEffect, useRef } from 'react';
import type { SnapshotRecord } from '@/lib/dynamo';
import styles from './SnapshotList.module.css';

const POLL_INTERVAL_MS = 4000;

interface Props {
  snapshots: SnapshotRecord[];
  projectId: string;
  userId: string;
  readonly?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  // Timestamps are stored as e.g. "2026-04-14T14-32-10" — normalize to ISO 8601.
  const normalized = iso.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
  const d = new Date(normalized);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function SnapshotRow({
  snap,
  projectId,
  onSummaryUpdate,
  readonly = false,
}: {
  snap: SnapshotRecord;
  projectId: string;
  onSummaryUpdate: (timestamp: string, summary: string) => void;
  readonly?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [expanded, setExpanded]       = useState(false);
  const [editing, setEditing]         = useState(false);
  const [draft, setDraft]             = useState(snap.summary ?? '');
  const [saving, setSaving]           = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const encodedTs = encodeURIComponent(snap.timestamp);
      const res = await fetch(`/api/projects/${projectId}/snapshots/${encodedTs}/download`);
      if (!res.ok) throw new Error('Failed to get download URL');
      const { url } = await res.json();
      window.open(url, '_blank');
    } catch (err) {
      console.error(err);
      alert('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const encodedTs = encodeURIComponent(snap.timestamp);
      const res = await fetch(`/api/projects/${projectId}/snapshots/${encodedTs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: draft }),
      });
      if (res.ok) {
        onSummaryUpdate(snap.timestamp, draft);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(snap.summary ?? '');
    setEditing(false);
  }

  const meta = snap.metadata ? (() => {
    try { return JSON.parse(snap.metadata); } catch { return null; }
  })() : null;

  const canEdit = !readonly && (snap.summary_status === 'done' || snap.summary_status === 'failed');

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowLeft}>
          <div className={styles.timestamp}>{formatDate(snap.timestamp)}</div>
          <div className={styles.summaryWrap}>
            {editing ? (
              <div className={styles.editArea}>
                <textarea
                  ref={textareaRef}
                  className={styles.summaryTextarea}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  disabled={saving}
                />
                <div className={styles.editActions}>
                  <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button className={styles.cancelBtn} onClick={handleCancel} disabled={saving}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.summaryRow}>
                <span className={styles.summary}>
                  {snap.summary_status === 'done' && snap.summary
                    ? snap.summary
                    : snap.summary_status === 'failed'
                    ? <span className={styles.failed}>Summary unavailable</span>
                    : <span className={styles.pending}>Summarizing...</span>}
                </span>
                {canEdit && (
                  <button
                    className={styles.editBtn}
                    onClick={() => { setDraft(snap.summary ?? ''); setEditing(true); }}
                    title="Edit summary"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className={styles.rowRight}>
          <span className={styles.size}>{formatBytes(snap.file_size)}</span>
          {meta && (
            <button
              className={styles.expandBtn}
              onClick={() => setExpanded((v) => !v)}
              title="Toggle metadata"
            >
              {expanded ? '▲' : '▼'}
            </button>
          )}
          <button
            className={styles.downloadBtn}
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? '...' : 'Download'}
          </button>
        </div>
      </div>

      {snap.audio_url && (
        <div className={styles.audioWrap}>
          <audio
            className={styles.audioPlayer}
            controls
            preload="none"
            src={snap.audio_url}
          />
          <span className={styles.audioLabel}>90s preview</span>
        </div>
      )}
      {snap.audio_status === 'rendering' && !snap.audio_url && (
        <div className={styles.audioRendering}>Rendering audio preview…</div>
      )}

      {expanded && meta && (
        <div className={styles.meta}>
          {meta.tempo && <span className={styles.tag}>♩ {meta.tempo} BPM</span>}
          {typeof meta.channel_count === 'number' && (
            <span className={styles.tag}>{meta.channel_count} channels</span>
          )}
          {typeof meta.pattern_count === 'number' && (
            <span className={styles.tag}>{meta.pattern_count} patterns</span>
          )}
          {typeof meta.marker_count === 'number' && meta.marker_count > 0 && (
            <span className={styles.tag}>{meta.marker_count} markers</span>
          )}
          {Array.isArray(meta.channel_names) && meta.channel_names.length > 0 && (
            <div className={styles.names}>
              {meta.channel_names.slice(0, 8).map((n: string) => (
                <span key={n} className={styles.nameTag}>{n}</span>
              ))}
              {meta.channel_names.length > 8 && (
                <span className={styles.nameTag}>+{meta.channel_names.length - 8} more</span>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function hasPending(snaps: SnapshotRecord[]): boolean {
  return snaps.some(
    (s) =>
      (s.summary_status !== 'done' && s.summary_status !== 'failed') ||
      s.audio_status === 'rendering',
  );
}

export function SnapshotList({ snapshots: initial, projectId, readonly = false }: Props) {
  const [snapshots, setSnapshots] = useState(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSummaryUpdate(timestamp: string, summary: string) {
    setSnapshots((prev) =>
      prev.map((s) =>
        s.timestamp === timestamp ? { ...s, summary, summary_status: 'done' } : s,
      ),
    );
  }

  useEffect(() => {
    setSnapshots(initial);
  }, [initial]);

  useEffect(() => {
    if (!hasPending(snapshots)) return;

    async function poll() {
      try {
        const res = await fetch(`/api/projects/${projectId}/snapshots`);
        if (res.ok) {
          const fresh: SnapshotRecord[] = await res.json();
          setSnapshots(fresh);
          if (hasPending(fresh)) {
            timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          }
        }
      } catch {
        // silently retry
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [snapshots, projectId]);

  if (snapshots.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No snapshots yet.</p>
        <p className={styles.hint}>Save your FL Studio project to create the first snapshot.</p>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {snapshots.map((snap) => (
        <SnapshotRow
          key={snap.timestamp}
          snap={snap}
          projectId={projectId}
          onSummaryUpdate={handleSummaryUpdate}
          readonly={readonly}
        />
      ))}
    </ul>
  );
}

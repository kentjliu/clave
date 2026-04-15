'use client';

import { useState } from 'react';
import type { SnapshotRecord } from '@/lib/dynamo';
import styles from './SnapshotList.module.css';

interface Props {
  snapshots: SnapshotRecord[];
  projectId: string;
  userId: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function SnapshotRow({ snap, projectId }: { snap: SnapshotRecord; projectId: string }) {
  const [downloading, setDownloading] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

  const meta = snap.metadata ? (() => {
    try { return JSON.parse(snap.metadata); } catch { return null; }
  })() : null;

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowLeft}>
          <div className={styles.timestamp}>{formatDate(snap.timestamp)}</div>
          <div className={styles.summary}>
            {snap.summary_status === 'done' && snap.summary
              ? snap.summary
              : snap.summary_status === 'failed'
              ? <span className={styles.failed}>Summary unavailable</span>
              : <span className={styles.pending}>Summarizing...</span>}
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

export function SnapshotList({ snapshots, projectId }: Props) {
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
        <SnapshotRow key={snap.timestamp} snap={snap} projectId={projectId} />
      ))}
    </ul>
  );
}

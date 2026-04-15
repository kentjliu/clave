'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './WatchSettings.module.css';

interface Props {
  projectId: string;
  watchPath: string | undefined;
  flpPath: string;
}

export function WatchSettings({ projectId, watchPath: initial, flpPath }: Props) {
  const router = useRouter();
  const [watchPath, setWatchPath] = useState(initial ?? '');
  const [isWatching, setIsWatching] = useState(!!initial);
  const [editing, setEditing] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!watchPath.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/watch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watch_path: watchPath.trim() }),
      });
      if (!res.ok) throw new Error('Failed to save.');
      setIsWatching(true);
      setEditing(false);
      router.refresh();
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStop() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/watch`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to stop watching.');
      setIsWatching(false);
      setWatchPath('');
      setEditing(true);
      router.refresh();
    } catch {
      setError('Could not stop watching. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.sectionTitle}>Agent watch</span>
        <span className={`${styles.badge} ${isWatching ? styles.badgeActive : styles.badgeIdle}`}>
          {isWatching ? 'Watching' : 'Not watching'}
        </span>
      </div>

      {isWatching && !editing ? (
        <div className={styles.watchingRow}>
          <code className={styles.path}>{watchPath}</code>
          <div className={styles.actions}>
            <button className={styles.editBtn} onClick={() => setEditing(true)} disabled={saving}>
              Edit path
            </button>
            <button className={styles.stopBtn} onClick={handleStop} disabled={saving}>
              {saving ? 'Stopping…' : 'Stop watching'}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.form}>
          <input
            className={styles.input}
            type="text"
            value={watchPath}
            onChange={(e) => setWatchPath(e.target.value)}
            placeholder="/Users/you/Music/mytrack.flp"
            disabled={saving}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <div className={styles.actions}>
            {isWatching && (
              <button
                className={styles.editBtn}
                onClick={() => { setEditing(false); setWatchPath(initial ?? ''); }}
                disabled={saving}
              >
                Cancel
              </button>
            )}
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving || !watchPath.trim()}
            >
              {saving ? 'Saving…' : 'Watch this file'}
            </button>
          </div>
          <p className={styles.hint}>
            Tip: drag the .flp file into this field to fill in the path automatically.
          </p>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {!isWatching && (
        <p className={styles.agentNote}>
          The Clave agent must be running on this machine for snapshots to be captured automatically.
          Run <code>clave start</code> to start it.
        </p>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import styles from './AccountSettings.module.css';

interface Props {
  user: { id: string; email?: string | null; name?: string | null };
}

interface StorageBreakdown {
  project_id: string;
  name: string;
  bytes: number;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(2)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

// ── Storage section ───────────────────────────────────────────────────────────

function StorageSection() {
  const [loading, setLoading] = useState(true);
  const [totalBytes, setTotalBytes] = useState(0);
  const [breakdown, setBreakdown] = useState<StorageBreakdown[]>([]);

  useEffect(() => {
    fetch('/api/account')
      .then((r) => r.json())
      .then((d) => { setTotalBytes(d.total_bytes); setBreakdown(d.breakdown); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Storage</h2>
      {loading ? (
        <p className={styles.muted}>Calculating…</p>
      ) : (
        <>
          <p className={styles.storageTotal}>{formatBytes(totalBytes)} used</p>
          {breakdown.length > 0 && (
            <ul className={styles.breakdownList}>
              {breakdown
                .sort((a, b) => b.bytes - a.bytes)
                .map((p) => (
                  <li key={p.project_id} className={styles.breakdownRow}>
                    <span className={styles.breakdownName}>{p.name}</span>
                    <span className={styles.breakdownBytes}>{formatBytes(p.bytes)}</span>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

// ── Password section ──────────────────────────────────────────────────────────

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? 'Something went wrong.' });
      } else {
        setMsg({ ok: true, text: 'Password updated.' });
        setCurrent('');
        setNext('');
      }
    } catch {
      setMsg({ ok: false, text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Password</h2>
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          Current password
          <input
            className={styles.input}
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            disabled={saving}
          />
        </label>
        <label className={styles.label}>
          New password
          <input
            className={styles.input}
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
            disabled={saving}
          />
        </label>
        {msg && (
          <p className={msg.ok ? styles.success : styles.error}>{msg.text}</p>
        )}
        <button className={styles.btn} type="submit" disabled={saving || !current || !next}>
          {saving ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </section>
  );
}

// ── Danger zone ───────────────────────────────────────────────────────────────

function DangerZone() {
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete account.');
      await signOut({ callbackUrl: '/' });
    } catch {
      setError('Something went wrong. Please try again.');
      setDeleting(false);
    }
  }

  return (
    <section className={`${styles.section} ${styles.dangerSection}`}>
      <h2 className={`${styles.sectionTitle} ${styles.dangerTitle}`}>Danger zone</h2>
      <p className={styles.dangerDesc}>
        Permanently deletes your account, all projects, all snapshots, and all
        stored files. This cannot be undone.
      </p>
      <label className={styles.label}>
        Type <strong>DELETE</strong> to confirm
        <input
          className={styles.input}
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={deleting}
          placeholder="DELETE"
        />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <button
        className={styles.deleteBtn}
        onClick={handleDelete}
        disabled={confirm !== 'DELETE' || deleting}
      >
        {deleting ? 'Deleting…' : 'Delete my account'}
      </button>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AccountSettings({ user }: Props) {
  return (
    <div className={styles.container}>

      {/* Profile — designed for V3 expansion (avatar, display name, bio) */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Profile</h2>
        <div className={styles.profileRow}>
          <div className={styles.avatar}>
            {(user.name ?? user.email ?? '?')[0].toUpperCase()}
          </div>
          <div>
            <p className={styles.profileEmail}>{user.email}</p>
            <p className={styles.muted}>User ID: {user.id.slice(0, 8)}…</p>
          </div>
        </div>
      </section>

      <StorageSection />
      <PasswordSection />
      <DangerZone />

    </div>
  );
}

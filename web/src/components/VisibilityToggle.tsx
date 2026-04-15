'use client';

import { useState } from 'react';
import styles from './VisibilityToggle.module.css';

interface Props {
  projectId: string;
  initial: 'public' | 'private';
}

export function VisibilityToggle({ projectId, initial }: Props) {
  const [visibility, setVisibility] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = visibility === 'public' ? 'private' : 'public';
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: next }),
      });
      if (res.ok) setVisibility(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <span className={visibility === 'private' ? styles.labelPrivate : styles.labelPublic}>
        {visibility === 'public' ? '🌐 Public' : '🔒 Private'}
      </span>
      <button className={styles.btn} onClick={toggle} disabled={saving}>
        {saving ? '…' : `Make ${visibility === 'public' ? 'private' : 'public'}`}
      </button>
    </div>
  );
}

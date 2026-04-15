'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import type { CollaboratorRecord } from '@/lib/dynamo';
import styles from './CollaboratorsSection.module.css';

interface Props { projectId: string }

export function CollaboratorsSection({ projectId }: Props) {
  const [collaborators, setCollaborators] = useState<CollaboratorRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [username, setUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  useEffect(() => {
    fetch(`/api/projects/${projectId}/collaborators`)
      .then((r) => r.json())
      .then(setCollaborators)
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setInviting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
      } else {
        setSuccess(`Invite sent to @${username.trim()}.`);
        setUsername('');
        // Refresh list.
        const fresh = await fetch(`/api/projects/${projectId}/collaborators`).then((r) => r.json());
        setCollaborators(fresh);
      }
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(collaboratorId: string) {
    await fetch(`/api/projects/${projectId}/collaborators/${collaboratorId}`, {
      method: 'DELETE',
    });
    setCollaborators((prev) => prev.filter((c) => c.collaborator_id !== collaboratorId));
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Collaborators</h2>

      {/* Invite form */}
      <form onSubmit={handleInvite} className={styles.inviteForm}>
        <input
          className={styles.input}
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={inviting}
        />
        <button className={styles.inviteBtn} type="submit" disabled={!username.trim() || inviting}>
          {inviting ? 'Inviting…' : 'Invite'}
        </button>
      </form>
      {error   && <p className={styles.error}>{error}</p>}
      {success && <p className={styles.success}>{success}</p>}

      {/* Collaborator list */}
      {!loading && collaborators.length > 0 && (
        <ul className={styles.list}>
          {collaborators.map((c) => (
            <li key={c.collaborator_id} className={styles.row}>
              <div className={styles.avatar}>
                {c.avatar_url ? (
                  <Image src={c.avatar_url} alt={c.display_name} width={32} height={32}
                    className={styles.avatarImg} unoptimized />
                ) : (
                  <span className={styles.avatarInitial}>{c.display_name[0].toUpperCase()}</span>
                )}
              </div>
              <div className={styles.info}>
                <span className={styles.name}>{c.display_name}</span>
                <span className={styles.handle}>@{c.username}</span>
              </div>
              <span className={c.status === 'accepted' ? styles.badgeAccepted : styles.badgePending}>
                {c.status === 'accepted' ? 'Collaborator' : 'Pending'}
              </span>
              <button className={styles.removeBtn} onClick={() => handleRemove(c.collaborator_id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

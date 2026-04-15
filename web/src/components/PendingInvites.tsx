'use client';

import { useState } from 'react';
import type { CollaboratorRecord } from '@/lib/dynamo';
import styles from './PendingInvites.module.css';

interface Props {
  invites: CollaboratorRecord[];
  userId: string;
}

export function PendingInvites({ invites: initial, userId }: Props) {
  const [invites, setInvites] = useState(initial);

  async function accept(projectId: string) {
    await fetch(`/api/projects/${projectId}/collaborators/${userId}`, { method: 'PATCH' });
    setInvites((prev) => prev.filter((i) => i.project_id !== projectId));
    // Reload to show the newly accepted project in SharedProjects.
    window.location.reload();
  }

  async function decline(projectId: string) {
    await fetch(`/api/projects/${projectId}/collaborators/${userId}`, { method: 'DELETE' });
    setInvites((prev) => prev.filter((i) => i.project_id !== projectId));
  }

  if (invites.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <p className={styles.heading}>
        You have {invites.length} pending collaboration {invites.length === 1 ? 'invite' : 'invites'}
      </p>
      <ul className={styles.list}>
        {invites.map((invite) => (
          <li key={invite.project_id} className={styles.row}>
            <span className={styles.projectName}>{invite.project_name}</span>
            <div className={styles.actions}>
              <button className={styles.acceptBtn} onClick={() => accept(invite.project_id)}>
                Accept
              </button>
              <button className={styles.declineBtn} onClick={() => decline(invite.project_id)}>
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

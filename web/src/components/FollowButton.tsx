'use client';

import { useState } from 'react';
import styles from './FollowButton.module.css';

interface Props {
  username: string;
  initialFollowing: boolean;
}

export function FollowButton({ username, initialFollowing }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading]     = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      await fetch(`/api/users/${username}/follow`, {
        method: following ? 'DELETE' : 'POST',
      });
      setFollowing(!following);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className={following ? styles.btnFollowing : styles.btnFollow}
      onClick={toggle}
      disabled={loading}
    >
      {loading ? '…' : following ? 'Following' : 'Follow'}
    </button>
  );
}

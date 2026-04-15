'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import styles from './Header.module.css';

interface Props {
  user: { name?: string | null; email?: string | null } | null;
  username?: string;
}

function MessagesLink() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchUnread() {
      try {
        const res = await fetch('/api/messages');
        if (!res.ok) return;
        const conversations = await res.json();
        if (!cancelled) {
          setUnread(conversations.reduce((sum: number, c: { unread: number }) => sum + (c.unread ?? 0), 0));
        }
      } catch { /* ignore */ }
    }

    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <Link href="/messages" className={styles.navLink}>
      Messages
      {unread > 0 && (
        <span className={styles.unreadBadge}>{unread > 99 ? '99+' : unread}</span>
      )}
    </Link>
  );
}

export function Header({ user, username }: Props) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>Clave</Link>
      <nav className={styles.nav}>
        <Link href="/explore" className={styles.navLink}>Explore</Link>
        {user && <Link href="/feed" className={styles.navLink}>Feed</Link>}
        {user && <MessagesLink />}
      </nav>
      <div className={styles.right}>
        {username && (
          <Link href={`/users/${username}`} className={styles.profileLink}>
            @{username}
          </Link>
        )}
        {user && (
          <>
            <Link href="/account" className={styles.email}>
              {user.email ?? user.name}
            </Link>
            <button className={styles.signOut} onClick={() => signOut()}>
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  );
}

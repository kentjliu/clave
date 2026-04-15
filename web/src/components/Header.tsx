'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import styles from './Header.module.css';

interface Props {
  user: { name?: string | null; email?: string | null } | null;
  username?: string;
}

export function Header({ user, username }: Props) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>Clave</Link>
      <nav className={styles.nav}>
        <Link href="/explore" className={styles.navLink}>Explore</Link>
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

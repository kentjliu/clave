'use client';

import { signOut } from 'next-auth/react';
import styles from './Header.module.css';

interface Props {
  user: { name?: string | null; email?: string | null };
}

export function Header({ user }: Props) {
  return (
    <header className={styles.header}>
      <span className={styles.logo}>Clave</span>
      <div className={styles.right}>
        <span className={styles.email}>{user.email ?? user.name}</span>
        <button className={styles.signOut} onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </header>
  );
}

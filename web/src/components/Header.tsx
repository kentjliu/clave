'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import styles from './Header.module.css';

interface Props {
  user: { name?: string | null; email?: string | null };
}

export function Header({ user }: Props) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>Clave</Link>
      <div className={styles.right}>
        <Link href="/account" className={styles.email}>
          {user.email ?? user.name}
        </Link>
        <button className={styles.signOut} onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </header>
  );
}

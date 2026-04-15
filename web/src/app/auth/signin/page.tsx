'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import styles from './signin.module.css';

function SignInContent() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Clave</h1>
        <p className={styles.subtitle}>FL Studio version control</p>
        <button
          className={styles.button}
          onClick={() => signIn('cognito', { callbackUrl })}
        >
          Sign in with Cognito
        </button>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}

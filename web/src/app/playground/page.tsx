import dynamic from 'next/dynamic';
import Link from 'next/link';
import styles from './page.module.css';

// Tone.js is browser-only — never SSR the sequencer.
const Sequencer = dynamic(
  () => import('@/components/Sequencer').then((m) => ({ default: m.Sequencer })),
  { ssr: false, loading: () => <div className={styles.loading}>Loading playground…</div> },
);

export default function PlaygroundPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.logo}>Clave</Link>
          <span className={styles.pill}>Playground</span>
        </div>
        <Link href="/" className={styles.back}>← Back</Link>
      </header>
      <Sequencer />
    </div>
  );
}

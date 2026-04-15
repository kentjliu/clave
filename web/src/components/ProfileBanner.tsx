import Link from 'next/link';
import styles from './ProfileBanner.module.css';

export function ProfileBanner() {
  return (
    <div className={styles.banner}>
      <div className={styles.text}>
        <strong>Set up your profile</strong> — add a username and display name so collaborators can find you.
      </div>
      <Link href="/account" className={styles.link}>
        Set up profile →
      </Link>
    </div>
  );
}

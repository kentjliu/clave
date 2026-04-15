import Link from 'next/link';
import type { CollaboratorRecord } from '@/lib/dynamo';
import styles from './SharedProjects.module.css';

interface Props { collaborations: CollaboratorRecord[] }

export function SharedProjects({ collaborations }: Props) {
  return (
    <div className={styles.wrap}>
      <h2 className={styles.title}>Shared with you</h2>
      <ul className={styles.list}>
        {collaborations.map((c) => (
          <li key={c.project_id}>
            <Link href={`/projects/${c.project_id}`} className={styles.card}>
              <span className={styles.name}>{c.project_name}</span>
              <span className={styles.meta}>→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

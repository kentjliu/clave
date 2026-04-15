import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProjects } from '@/lib/dynamo';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  const projects = await getProjects(session.user.id);

  return (
    <div className={styles.layout}>
      <Header user={session.user} />
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>Projects</h1>
        </div>

        {projects.length === 0 ? (
          <div className={styles.empty}>
            <p>No projects yet.</p>
            <p className={styles.hint}>
              Run <code>clave watch &lt;project.flp&gt;</code> to start tracking a project.
            </p>
          </div>
        ) : (
          <ul className={styles.list}>
            {projects.map((p) => (
              <li key={p.project_id}>
                <Link href={`/projects/${p.project_id}`} className={styles.card}>
                  <div className={styles.cardName}>{p.name}</div>
                  <div className={styles.cardMeta}>
                    <span className={styles.path}>{p.path}</span>
                    <span className={styles.arrow}>→</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

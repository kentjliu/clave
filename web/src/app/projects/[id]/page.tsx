import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProjects, getSnapshots } from '@/lib/dynamo';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { SnapshotList } from '@/components/SnapshotList';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  const { id: projectId } = await params;

  const projects = await getProjects(session.user.id);
  const project = projects.find((p) => p.project_id === projectId);
  if (!project) notFound();

  const snapshots = await getSnapshots(projectId);

  return (
    <div className={styles.layout}>
      <Header user={session.user} />
      <main className={styles.main}>
        <div className={styles.header}>
          <Link href="/" className={styles.back}>← Projects</Link>
          <h1 className={styles.title}>{project.name}</h1>
          <p className={styles.path}>{project.path}</p>
        </div>

        <SnapshotList
          snapshots={snapshots}
          projectId={projectId}
          userId={session.user.id}
        />
      </main>
    </div>
  );
}

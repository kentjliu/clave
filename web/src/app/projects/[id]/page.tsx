import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getProjects,
  getSnapshots,
  getCollaboratorRecord,
  getProfile,
} from '@/lib/dynamo';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { SnapshotList } from '@/components/SnapshotList';
import { WatchSettings } from '@/components/WatchSettings';
import { VisibilityToggle } from '@/components/VisibilityToggle';
import { CollaboratorsSection } from '@/components/CollaboratorsSection';
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

  // Check ownership first.
  const ownedProjects = await getProjects(session.user.id);
  const ownedProject  = ownedProjects.find((p) => p.project_id === projectId);
  const isOwner       = !!ownedProject;

  let project = ownedProject;

  if (!isOwner) {
    // Check if an accepted collaborator.
    const collab = await getCollaboratorRecord(projectId, session.user.id);
    if (!collab || collab.status !== 'accepted') notFound();

    // Load the project via the owner's record.
    const ownerProjects = await getProjects(collab.project_owner_id);
    project = ownerProjects.find((p) => p.project_id === projectId);
    if (!project) notFound();
  }

  const [snapshots, myProfile] = await Promise.all([
    getSnapshots(projectId),
    getProfile(session.user.id),
  ]);

  return (
    <div className={styles.layout}>
      <Header user={session.user} username={myProfile?.username} />
      <main className={styles.main}>
        <div className={styles.header}>
          <Link href="/" className={styles.back}>← Projects</Link>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{project!.name}</h1>
            {isOwner && (
              <VisibilityToggle
                projectId={projectId}
                initial={project!.visibility ?? 'public'}
              />
            )}
          </div>
          <p className={styles.path}>{project!.flp_path}</p>
        </div>

        <SnapshotList
          snapshots={snapshots}
          projectId={projectId}
          userId={session.user.id}
          readonly={!isOwner}
        />

        {isOwner && (
          <>
            <WatchSettings
              projectId={projectId}
              watchPath={project!.watch_path}
              flpPath={project!.flp_path}
            />
            <CollaboratorsSection projectId={projectId} />
          </>
        )}
      </main>
    </div>
  );
}

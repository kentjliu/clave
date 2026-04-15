import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProjects, getProfile, getCollaborations } from '@/lib/dynamo';
import { Header } from '@/components/Header';
import { ProjectsPage } from '@/components/ProjectsPage';
import { LandingPage } from '@/components/LandingPage';
import { ProfileBanner } from '@/components/ProfileBanner';
import { PendingInvites } from '@/components/PendingInvites';
import { SharedProjects } from '@/components/SharedProjects';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return <LandingPage />;
  }

  const [projects, profile, collaborations] = await Promise.all([
    getProjects(session.user.id),
    getProfile(session.user.id),
    getCollaborations(session.user.id),
  ]);

  const pending  = collaborations.filter((c) => c.status === 'pending');
  const accepted = collaborations.filter((c) => c.status === 'accepted');

  return (
    <div className={styles.layout}>
      <Header user={session.user} username={profile?.username} />
      <main className={styles.main}>
        {!profile && <ProfileBanner />}
        {pending.length > 0 && (
          <PendingInvites invites={pending} userId={session.user.id} />
        )}
        <ProjectsPage projects={projects} />
        {accepted.length > 0 && <SharedProjects collaborations={accepted} />}
      </main>
    </div>
  );
}

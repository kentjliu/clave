import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProjects, getProfile } from '@/lib/dynamo';
import { Header } from '@/components/Header';
import { ProjectsPage } from '@/components/ProjectsPage';
import { LandingPage } from '@/components/LandingPage';
import { ProfileBanner } from '@/components/ProfileBanner';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return <LandingPage />;
  }

  const [projects, profile] = await Promise.all([
    getProjects(session.user.id),
    getProfile(session.user.id),
  ]);

  return (
    <div className={styles.layout}>
      <Header user={session.user} username={profile?.username} />
      <main className={styles.main}>
        {!profile && <ProfileBanner />}
        <ProjectsPage projects={projects} />
      </main>
    </div>
  );
}

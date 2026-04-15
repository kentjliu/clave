import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProfile } from '@/lib/dynamo';
import { Header } from '@/components/Header';
import { ExploreView } from '@/components/ExploreView';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function ExplorePage() {
  const session = await getServerSession(authOptions);

  const profile = session?.user?.id ? await getProfile(session.user.id) : null;

  return (
    <div className={styles.layout}>
      <Header user={session?.user ?? null} username={profile?.username} />
      <main className={styles.main}>
        <h1 className={styles.title}>Explore</h1>
        <ExploreView />
      </main>
    </div>
  );
}

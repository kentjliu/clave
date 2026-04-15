import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getProfile, getFeedActivity } from '@/lib/dynamo';
import { Header } from '@/components/Header';
import { FeedView } from '@/components/FeedView';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  const [profile, events] = await Promise.all([
    getProfile(session.user.id),
    getFeedActivity(session.user.id),
  ]);

  return (
    <div className={styles.layout}>
      <Header user={session.user} username={profile?.username} />
      <main className={styles.main}>
        <h1 className={styles.title}>Feed</h1>
        <FeedView initialEvents={events} />
      </main>
    </div>
  );
}

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getProfile, getConversations } from '@/lib/dynamo';
import { Header } from '@/components/Header';
import { InboxView } from '@/components/InboxView';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  const [profile, conversations] = await Promise.all([
    getProfile(session.user.id),
    getConversations(session.user.id),
  ]);

  return (
    <div className={styles.layout}>
      <Header user={session.user} username={profile?.username} />
      <main className={styles.main}>
        <h1 className={styles.title}>Messages</h1>
        <InboxView conversations={conversations} />
      </main>
    </div>
  );
}

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { AccountSettings } from '@/components/AccountSettings';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  return (
    <div className={styles.layout}>
      <Header user={session.user} />
      <main className={styles.main}>
        <h1 className={styles.title}>Account settings</h1>
        <AccountSettings user={session.user} />
      </main>
    </div>
  );
}

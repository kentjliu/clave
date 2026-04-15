import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProjects } from '@/lib/dynamo';
import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { ProjectsPage } from '@/components/ProjectsPage';
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
        <ProjectsPage projects={projects} />
      </main>
    </div>
  );
}

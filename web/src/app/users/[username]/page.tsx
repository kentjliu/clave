import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProfileByUsername, getProjects, getSnapshots } from '@/lib/dynamo';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Header } from '@/components/Header';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const [session, profile] = await Promise.all([
    getServerSession(authOptions),
    getProfileByUsername(username),
  ]);

  if (!profile) notFound();

  const isOwnProfile = session?.user?.id === profile.user_id;

  const allProjects = await getProjects(profile.user_id);
  const projects = isOwnProfile
    ? allProjects
    : allProjects.filter((p) => (p.visibility ?? 'public') === 'public');

  // Fetch latest snapshot for each project (just the first since results are
  // sorted descending). Run in parallel, cap at 10 concurrent.
  const projectsWithActivity = await Promise.all(
    projects.map(async (p) => {
      const snapshots = await getSnapshots(p.project_id);
      return {
        ...p,
        snapshotCount: snapshots.length,
        lastSnapshot: snapshots[0]?.timestamp ?? null,
      };
    }),
  );

  return (
    <div className={styles.layout}>
      <Header user={session?.user ?? null} />
      <main className={styles.main}>

        {/* Profile header */}
        <div className={styles.profileHeader}>
          <div className={styles.avatarWrap}>
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={profile.display_name}
                width={80}
                height={80}
                className={styles.avatar}
                unoptimized
              />
            ) : (
              <div className={styles.avatarFallback}>
                {profile.display_name[0].toUpperCase()}
              </div>
            )}
          </div>

          <div className={styles.profileInfo}>
            <div className={styles.nameRow}>
              <h1 className={styles.displayName}>{profile.display_name}</h1>
              {isOwnProfile && (
                <Link href="/account" className={styles.editLink}>Edit profile</Link>
              )}
            </div>
            <p className={styles.username}>@{profile.username}</p>
            {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
            <p className={styles.joined}>Joined {formatDate(profile.created_at)}</p>
          </div>

          {!isOwnProfile && session?.user && (
            <a href={`/messages/${profile.username}`} className={styles.messageBtn}>
              Message
            </a>
          )}
        </div>

        {/* Projects */}
        <section className={styles.projectsSection}>
          <h2 className={styles.sectionTitle}>
            Projects
            <span className={styles.count}>{projects.length}</span>
          </h2>

          {projectsWithActivity.length === 0 ? (
            <p className={styles.empty}>No projects yet.</p>
          ) : (
            <ul className={styles.projectList}>
              {projectsWithActivity.map((p) => (
                <li key={p.project_id} className={styles.projectCard}>
                  <div className={styles.projectName}>{p.name}</div>
                  <div className={styles.projectMeta}>
                    <span className={styles.snapshotCount}>
                      {p.snapshotCount} {p.snapshotCount === 1 ? 'snapshot' : 'snapshots'}
                    </span>
                    {p.lastSnapshot && (
                      <span className={styles.lastActivity}>
                        {timeAgo(p.lastSnapshot.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3'))}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

      </main>
    </div>
  );
}

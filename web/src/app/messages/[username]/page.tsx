import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import {
  getProfile,
  getProfileByUsername,
  getMessages,
  makeConversationId,
  markConversationRead,
} from '@/lib/dynamo';
import { Header } from '@/components/Header';
import { MessageThread } from '@/components/MessageThread';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  const { username } = await params;

  const [myProfile, otherProfile] = await Promise.all([
    getProfile(session.user.id),
    getProfileByUsername(username),
  ]);

  if (!otherProfile) notFound();

  const conversationId = makeConversationId(session.user.id, otherProfile.user_id);
  const [messages] = await Promise.all([
    getMessages(conversationId),
    markConversationRead(session.user.id, conversationId),
  ]);

  return (
    <div className={styles.layout}>
      <Header user={session.user} username={myProfile?.username} />
      <MessageThread
        myUserId={session.user.id}
        otherUsername={otherProfile.username}
        otherDisplayName={otherProfile.display_name}
        otherAvatarUrl={otherProfile.avatar_url ?? null}
        initialMessages={messages}
        conversationId={conversationId}
      />
    </div>
  );
}

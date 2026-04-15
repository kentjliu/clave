'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ConversationRecord } from '@/lib/dynamo';
import styles from './InboxView.module.css';

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface Props { conversations: ConversationRecord[] }

export function InboxView({ conversations }: Props) {
  if (conversations.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No messages yet.</p>
        <p className={styles.emptyHint}>
          Visit someone&apos;s profile and hit <strong>Message</strong> to start a conversation.
        </p>
      </div>
    );
  }

  const sorted = [...conversations].sort(
    (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime(),
  );

  return (
    <ul className={styles.list}>
      {sorted.map((c) => (
        <li key={c.conversation_id}>
          <Link href={`/messages/${c.other_username}`} className={styles.row}>
            <div className={styles.avatar}>
              {c.other_avatar_url ? (
                <Image
                  src={c.other_avatar_url}
                  alt={c.other_display_name}
                  width={44}
                  height={44}
                  className={styles.avatarImg}
                  unoptimized
                />
              ) : (
                <span className={styles.avatarInitial}>
                  {c.other_display_name[0].toUpperCase()}
                </span>
              )}
              {c.unread > 0 && <span className={styles.badge}>{c.unread}</span>}
            </div>

            <div className={styles.body}>
              <div className={styles.topRow}>
                <span className={styles.name}>{c.other_display_name}</span>
                <span className={styles.time}>{timeAgo(c.last_at)}</span>
              </div>
              <p className={c.unread > 0 ? styles.previewUnread : styles.preview}>
                {c.last_message_preview}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

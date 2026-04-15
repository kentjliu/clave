'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ActivityEvent } from '@/lib/dynamo';
import styles from './FeedView.module.css';

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function EventCard({ event }: { event: ActivityEvent }) {
  const action =
    event.type === 'project_created'
      ? 'created a new project'
      : 'saved a new snapshot to';

  return (
    <div className={styles.card}>
      <Link href={`/users/${event.username}`} className={styles.avatar}>
        {event.avatar_url ? (
          <Image
            src={event.avatar_url}
            alt={event.display_name}
            width={40}
            height={40}
            className={styles.avatarImg}
            unoptimized
          />
        ) : (
          <span className={styles.avatarInitial}>{event.display_name[0].toUpperCase()}</span>
        )}
      </Link>

      <div className={styles.body}>
        <p className={styles.text}>
          <Link href={`/users/${event.username}`} className={styles.nameLink}>
            {event.display_name}
          </Link>
          {' '}{action}{' '}
          <span className={styles.projectName}>{event.project_name}</span>
        </p>
        <p className={styles.time}>{timeAgo(event.created_at)}</p>
      </div>
    </div>
  );
}

interface Props { initialEvents: ActivityEvent[] }

export function FeedView({ initialEvents }: Props) {
  const [events, setEvents] = useState(initialEvents);

  // Refresh feed every 60s.
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/feed')
        .then((r) => r.json())
        .then(setEvents)
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (events.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Nothing here yet.</p>
        <p className={styles.emptyHint}>
          Follow producers on the{' '}
          <Link href="/explore" className={styles.emptyLink}>Explore</Link>{' '}
          page to see their activity here.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.feed}>
      {events.map((e) => (
        <EventCard key={`${e.user_id}-${e.created_at}`} event={e} />
      ))}
    </div>
  );
}

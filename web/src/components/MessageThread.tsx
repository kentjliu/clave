'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { MessageRecord } from '@/lib/dynamo';
import styles from './MessageThread.module.css';

interface Props {
  myUserId:         string;
  otherUsername:    string;
  otherDisplayName: string;
  otherAvatarUrl:   string | null;
  initialMessages:  MessageRecord[];
  conversationId:   string;
}

const POLL_MS = 3000;

export function MessageThread({
  myUserId,
  otherUsername,
  otherDisplayName,
  otherAvatarUrl,
  initialMessages,
  conversationId,
}: Props) {
  const [messages, setMessages] = useState<MessageRecord[]>(initialMessages);
  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const pollRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVisible  = useRef(true);

  // Scroll to bottom whenever messages change.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for new messages every 3s while tab is visible.
  useEffect(() => {
    function poll() {
      if (!isVisible.current) return;
      fetch(`/api/messages/${otherUsername}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.messages) setMessages(data.messages);
        })
        .catch(() => { /* ignore network errors silently */ })
        .finally(() => {
          pollRef.current = setTimeout(poll, POLL_MS);
        });
    }

    pollRef.current = setTimeout(poll, POLL_MS);

    function onVisibility() { isVisible.current = !document.hidden; }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [otherUsername]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    const content = draft.trim();
    setDraft('');
    try {
      const res = await fetch(`/api/messages/${otherUsername}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const msg: MessageRecord = await res.json();
        setMessages((prev) => [...prev, msg]);
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatDay(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }

  // Group messages by day.
  const grouped: { day: string; msgs: MessageRecord[] }[] = [];
  for (const msg of messages) {
    const day = formatDay(msg.created_at);
    const last = grouped[grouped.length - 1];
    if (last?.day === day) {
      last.msgs.push(msg);
    } else {
      grouped.push({ day, msgs: [msg] });
    }
  }

  return (
    <div className={styles.shell}>
      {/* Thread header */}
      <div className={styles.threadHeader}>
        <Link href="/messages" className={styles.back}>←</Link>
        <div className={styles.headerAvatar}>
          {otherAvatarUrl ? (
            <Image
              src={otherAvatarUrl}
              alt={otherDisplayName}
              width={32}
              height={32}
              className={styles.headerAvatarImg}
              unoptimized
            />
          ) : (
            <span className={styles.headerAvatarInitial}>
              {otherDisplayName[0].toUpperCase()}
            </span>
          )}
        </div>
        <Link href={`/users/${otherUsername}`} className={styles.headerName}>
          {otherDisplayName}
        </Link>
        <span className={styles.headerUsername}>@{otherUsername}</span>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 && (
          <p className={styles.emptyThread}>
            No messages yet. Say hello!
          </p>
        )}

        {grouped.map(({ day, msgs }) => (
          <div key={day}>
            <div className={styles.dayDivider}>{day}</div>
            {msgs.map((msg) => {
              const mine = msg.sender_id === myUserId;
              return (
                <div
                  key={msg.created_at}
                  className={mine ? styles.bubbleRowMine : styles.bubbleRowTheirs}
                >
                  <div className={mine ? styles.bubbleMine : styles.bubbleTheirs}>
                    {msg.content}
                  </div>
                  <span className={styles.timestamp}>{formatTime(msg.created_at)}</span>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form className={styles.composer} onSubmit={handleSend}>
        <textarea
          className={styles.input}
          placeholder={`Message ${otherDisplayName}…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={2000}
          disabled={sending}
        />
        <button
          className={styles.sendBtn}
          type="submit"
          disabled={!draft.trim() || sending}
        >
          Send
        </button>
      </form>
    </div>
  );
}

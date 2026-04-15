'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './ExploreView.module.css';

interface Profile {
  user_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
}

export function ExploreView() {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<Profile[]>([]);
  const [loading, setLoading]   = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fetchProfiles(q: string) {
    setLoading(true);
    const url = q ? `/api/users?q=${encodeURIComponent(q)}` : '/api/users';
    fetch(url)
      .then((r) => r.json())
      .then(setResults)
      .finally(() => setLoading(false));
  }

  // Load all profiles on mount.
  useEffect(() => { fetchProfiles(''); }, []);

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchProfiles(val), 300);
  }

  return (
    <div>
      <input
        className={styles.searchInput}
        type="search"
        placeholder="Search by name or username…"
        value={query}
        onChange={handleSearch}
        autoFocus
      />

      {loading ? (
        <p className={styles.status}>Loading…</p>
      ) : results.length === 0 ? (
        <p className={styles.status}>No users found.</p>
      ) : (
        <ul className={styles.grid}>
          {results.map((p) => (
            <li key={p.user_id}>
              <Link href={`/users/${p.username}`} className={styles.card}>
                <div className={styles.cardAvatar}>
                  {p.avatar_url ? (
                    <Image
                      src={p.avatar_url}
                      alt={p.display_name}
                      width={44}
                      height={44}
                      className={styles.avatarImg}
                      unoptimized
                    />
                  ) : (
                    <span className={styles.avatarInitial}>
                      {p.display_name[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.cardName}>{p.display_name}</p>
                  <p className={styles.cardUsername}>@{p.username}</p>
                  {p.bio && (
                    <p className={styles.cardBio}>{p.bio}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

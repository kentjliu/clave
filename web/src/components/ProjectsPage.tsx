'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ProjectRecord } from '@/lib/dynamo';
import { AddProjectModal } from './AddProjectModal';
import styles from '../app/page.module.css';

interface Props {
  projects: ProjectRecord[];
}

export function ProjectsPage({ projects }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>Projects</h1>
        <button className={styles.addBtn} onClick={() => setShowModal(true)}>
          + Add project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className={styles.empty}>
          <p>No projects yet.</p>
          <p className={styles.hint}>
            Upload a snapshot above, or run{' '}
            <code>clave watch &lt;project.flp&gt;</code> to start tracking automatically.
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {projects.map((p) => (
            <li key={p.project_id}>
              <Link href={`/projects/${p.project_id}`} className={styles.card}>
                <div className={styles.cardName}>{p.name}</div>
                <div className={styles.cardMeta}>
                  <span className={styles.path}>{p.flp_path}</span>
                  <span className={styles.arrow}>→</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {showModal && <AddProjectModal onClose={() => setShowModal(false)} />}
    </>
  );
}

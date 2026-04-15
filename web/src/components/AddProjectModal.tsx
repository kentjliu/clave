'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './AddProjectModal.module.css';

interface Props {
  onClose: () => void;
}

type Stage = 'idle' | 'hashing' | 'uploading' | 'done' | 'error';

export function AddProjectModal({ onClose }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) {
      setName(f.name.replace(/\.flp$/i, ''));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name.trim()) return;

    setError('');

    // 1. Hash the file in the browser.
    setStage('hashing');
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // 2. Create project + snapshot record and get a pre-signed S3 upload URL.
    let uploadUrl: string;
    let projectId: string;
    try {
      const res = await fetch('/api/projects/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          filename: file.name,
          hash,
          file_size: file.size,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      ({ upload_url: uploadUrl, project_id: projectId } = await res.json());
    } catch (err) {
      setStage('error');
      setError(err instanceof Error ? err.message : 'Failed to create project.');
      return;
    }

    // 3. Upload the file directly to S3 via the pre-signed URL.
    setStage('uploading');
    setProgress(0);
    try {
      await uploadWithProgress(uploadUrl, file, setProgress);
    } catch (err) {
      setStage('error');
      setError(err instanceof Error ? err.message : 'Upload failed.');
      return;
    }

    setStage('done');
    router.push(`/projects/${projectId}`);
    router.refresh();
    onClose();
  }

  const busy = stage === 'hashing' || stage === 'uploading';

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Add project</h2>
          <button className={styles.close} onClick={onClose} disabled={busy}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Project name
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Track"
              disabled={busy}
              required
            />
          </label>

          <label className={styles.label}>
            FL Studio file
            <div
              className={`${styles.filePicker} ${file ? styles.filePickerSelected : ''}`}
              onClick={() => !busy && fileRef.current?.click()}
            >
              {file ? (
                <span className={styles.fileName}>{file.name}</span>
              ) : (
                <span className={styles.filePlaceholder}>Browse for .flp file…</span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".flp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              disabled={busy}
            />
          </label>

          {stage === 'hashing' && (
            <p className={styles.status}>Computing checksum…</p>
          )}

          {stage === 'uploading' && (
            <div className={styles.progressWrap}>
              <div className={styles.progressBar} style={{ width: `${progress}%` }} />
            </div>
          )}

          {stage === 'error' && (
            <p className={styles.errorMsg}>{error}</p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={busy || !file || !name.trim()}
            >
              {busy ? 'Uploading…' : 'Upload snapshot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`S3 error ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.send(file);
  });
}

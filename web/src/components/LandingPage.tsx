import Link from 'next/link';
import styles from './LandingPage.module.css';

const FEATURES = [
  {
    title: 'Automatic snapshots',
    body: 'Every save is captured — no manual commits, no thinking about it. Just make music.',
  },
  {
    title: 'AI summaries',
    body: 'Claude reads your project metadata and writes a one-sentence summary of what changed each save.',
  },
  {
    title: 'One-click restore',
    body: 'Every snapshot is stored in full. Download any version and open it straight in FL Studio.',
  },
  {
    title: 'Works in the background',
    body: 'The Clave agent runs silently on your Mac. You\'ll never need to think about it.',
  },
  {
    title: 'See your history anywhere',
    body: 'The web UI shows your full timeline across all projects — from any browser, any device.',
  },
  {
    title: 'Built for FL Studio',
    body: 'Handles FL Studio\'s atomic-save behaviour correctly. No duplicate snapshots, no missed saves.',
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Install the agent',
    body: 'A small background app that watches your .flp files and uploads on every save.',
  },
  {
    n: '2',
    title: 'Add your projects',
    body: 'Open the web UI, create a project, and point it at your .flp file.',
  },
  {
    n: '3',
    title: 'Make music',
    body: 'Every Ctrl+S is captured automatically. AI summaries appear within seconds.',
  },
];

export function LandingPage() {
  return (
    <div className={styles.page}>

      {/* ── Nav ── */}
      <nav className={styles.nav}>
        <span className={styles.navLogo}>Clave</span>
        <Link href="/auth/signin" className={styles.navSignIn}>
          Sign in
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>FL Studio version control</div>
        <h1 className={styles.heroTitle}>
          Never lose a<br />good version again.
        </h1>
        <p className={styles.heroSub}>
          Clave watches your FL Studio projects and saves a full snapshot every
          time you hit Ctrl+S — with an AI summary of what changed.
        </p>
        <div className={styles.heroCtas}>
          <Link href="/auth/signin" className={styles.ctaPrimary}>
            Get started free
          </Link>
          <a href="#how-it-works" className={styles.ctaSecondary}>
            See how it works
          </a>
        </div>
        <p className={styles.heroPlayground}>
          Just here to make beats?{' '}
          <Link href="/playground" className={styles.heroPlaygroundLink}>
            Try the Playground →
          </Link>
        </p>
      </section>

      {/* ── Timeline preview ── */}
      <section className={styles.preview}>
        <div className={styles.previewCard}>
          <div className={styles.previewHeader}>
            <span className={styles.previewProject}>Summer EP — Track 3</span>
            <span className={styles.previewBadge}>Watching</span>
          </div>
          {[
            { time: 'Today, 11:42 PM', size: '2.4 MB', summary: 'Added lead synth melody over 4-bar loop, tempo raised to 140 BPM.' },
            { time: 'Today, 9:18 PM',  size: '2.1 MB', summary: 'Layered 808 bass with sidechain compression, 18 channels total.' },
            { time: 'Today, 7:05 PM',  size: '1.8 MB', summary: 'Initial arrangement with drums and chord stabs at 138 BPM.' },
          ].map((row) => (
            <div key={row.time} className={styles.previewRow}>
              <div className={styles.previewRowLeft}>
                <span className={styles.previewTime}>{row.time}</span>
                <span className={styles.previewSummary}>{row.summary}</span>
              </div>
              <div className={styles.previewRowRight}>
                <span className={styles.previewSize}>{row.size}</span>
                <span className={styles.previewDownload}>Download</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className={styles.section} id="how-it-works">
        <h2 className={styles.sectionTitle}>How it works</h2>
        <div className={styles.steps}>
          {STEPS.map((s) => (
            <div key={s.n} className={styles.step}>
              <div className={styles.stepNumber}>{s.n}</div>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepBody}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Everything you need</h2>
        <div className={styles.features}>
          {FEATURES.map((f) => (
            <div key={f.title} className={styles.feature}>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureBody}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className={styles.bottomCta}>
        <h2 className={styles.bottomCtaTitle}>Start tracking your projects today.</h2>
        <Link href="/auth/signin" className={styles.ctaPrimary}>
          Get started free
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span className={styles.footerLogo}>Clave</span>
        <span className={styles.footerCopy}>© {new Date().getFullYear()}</span>
      </footer>

    </div>
  );
}

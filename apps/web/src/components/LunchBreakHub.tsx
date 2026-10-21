import Image from 'next/image';
import { ArrowDown, ArrowUpRight, Coffee, Gamepad2, Monitor } from 'lucide-react';
import type { LunchBreakGame } from '../../../../packages/modules/lunch-break.js';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../packages/modules/navigation.js';
import styles from './LunchBreakHub.module.css';

const labels = {
  module: 'OperatorOS game',
  site: 'Game website',
  preview: 'Preview website',
  planned: 'Not connected yet',
};
const artwork: Record<string, { src: string; caption: string; requirement: string }> = {
  'pool-hall': {
    src: '/lunch-break/pool-hall.webp',
    caption: 'Cover illustration',
    requirement: 'OperatorOS account',
  },
  scrapshift: {
    src: '/lunch-break/scrapshift.jpg',
    caption: 'Garage preview',
    requirement: 'Browser demo',
  },
  'roaming-garden': {
    src: '/lunch-break/roaming-garden.jpg',
    caption: 'Game menu',
    requirement: 'Desktop · WebGL 2',
  },
  'neon-racer': {
    src: '/lunch-break/neon-racer.jpg',
    caption: 'In-game preview',
    requirement: 'Keyboard controls',
  },
  kage: {
    src: '/lunch-break/kage.webp',
    caption: 'Character illustration',
    requirement: 'Keyboard controls',
  },
};

export default function LunchBreakHub({ games }: { games: LunchBreakGame[] }) {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#games">
        Skip to games
      </a>
      <header className={styles.header}>
        <a className={styles.brand} href="https://operatoros.net/" aria-label="OperatorOS home">
          <Gamepad2 aria-hidden="true" size={26} />
          <span>
            OperatorOS <strong>Lunch Break</strong>
          </span>
        </a>
        <nav className={styles.headerNav} aria-label="Lunch Break navigation">
          <a href="#games">The games</a>
          <a href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}>
            My apps <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="lunch-break-title">
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <Coffee size={16} aria-hidden="true" /> A LITTLE SPACE BETWEEN THINGS
            </div>
            <h1 id="lunch-break-title">
              Good work.
              <br />
              <span>Great break.</span>
            </h1>
            <p className={styles.intro}>
              Close a few tabs in your head. Find a game, change the pace, and make a little room
              for play.
            </p>
            <a className={styles.heroLink} href="#games">
              Find your next break <ArrowDown size={18} aria-hidden="true" />
            </a>
            <p className={styles.free}>
              Free for everyone. <span>No credits. No subscription.</span>
            </p>
          </div>
          <figure className={styles.heroArt}>
            <Image
              src="/lunch-break/pool-hall.webp"
              width={960}
              height={540}
              alt=""
              priority
              unoptimized
            />
            <figcaption>
              <span>THE BREAK ROOM IS OPEN</span>
              <strong>
                A little play.
                <br />A fresh perspective.
              </strong>
              <small>Pool Hall · cover illustration</small>
            </figcaption>
          </figure>
        </section>
        <section id="games" className={styles.games} aria-labelledby="games-title" tabIndex={-1}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>YOUR NEXT CHANGE OF SCENERY</span>
              <h2 id="games-title">Pick your kind of break.</h2>
            </div>
            <p>Five games. One place to find them.</p>
          </div>
          <nav className={styles.gameNav} aria-label="Jump to a game">
            {games.map((game) => (
              <a key={game.id} href={`#${game.id}`}>
                {game.name}
              </a>
            ))}
          </nav>
          <div className={styles.grid}>
            {games.map((game, index) => {
              const canOpen = game.url !== null && game.status !== 'planned';
              const art = artwork[game.id];
              return (
                <article
                  id={game.id}
                  key={game.id}
                  className={`${styles.card} ${styles[game.id] ?? ''}`}
                  data-testid={`game-${game.id}`}
                  aria-labelledby={`${game.id}-title`}
                  tabIndex={-1}
                >
                  <div className={styles.cardArt}>
                    <Image
                      src={art.src}
                      width={960}
                      height={540}
                      alt=""
                      unoptimized
                      sizes="(max-width: 680px) 100vw, (max-width: 1000px) 50vw, 33vw"
                    />
                    <span className={styles.number} aria-hidden="true">
                      0{index + 1}
                    </span>
                    <span className={styles.imageCaption}>{art.caption}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardTop}>
                      <span className={styles.genre}>{game.genre}</span>
                      <span className={styles.status}>
                        {game.url === null ? 'Link unavailable' : labels[game.status]}
                      </span>
                    </div>
                    <h3 id={`${game.id}-title`}>{game.name}</h3>
                    <p>{game.description}</p>
                    <p className={styles.requirement}>
                      <Monitor size={14} aria-hidden="true" /> {art.requirement}
                    </p>
                    <p className={styles.note}>{game.note}</p>
                    {canOpen ? (
                      <a
                        className={styles.gameLink}
                        href={game.url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                      >
                        {game.action}
                        <ArrowUpRight size={18} aria-hidden="true" />
                        <span className={styles.srOnly}> (opens in a new tab)</span>
                      </a>
                    ) : (
                      <p className={styles.pending}>
                        {game.url ? (
                          <>
                            Planned: <span>{new URL(game.url).hostname}</span>
                          </>
                        ) : (
                          "We'll add the destination when it's ready."
                        )}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <aside className={styles.footnote}>
          <Coffee size={23} aria-hidden="true" />
          <div>
            <h2>A break is part of the day.</h2>
            <p>
              Lunch Break is free for guests and every OperatorOS plan. No extra hub subscription or
              credits. Games open on their own sites in a new tab; their device and sign-in
              requirements still apply.
            </p>
          </div>
        </aside>
      </main>
      <footer className={styles.footer}>
        <span>OperatorOS / Lunch Break</span>
        <a href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}>
          Back to my apps <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}

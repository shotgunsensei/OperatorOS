'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowUpRight,
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  LifeBuoy,
  Mail,
  Search,
  X,
} from 'lucide-react';
import {
  findHelpGuide,
  findHelpPage,
  HELP_CONTENT_VERSION,
  HELP_GUIDES,
  helpSearchText,
  type HelpGuide,
  type HelpPageGuide,
} from '@/lib/help';
import styles from './HelpCenter.module.css';

type SearchResult = { guide: HelpGuide; page: HelpPageGuide };

function pageAnchor(guide: HelpGuide, page: HelpPageGuide): string {
  return `guide-${guide.id}-${page.id}`;
}

function kindLabel(kind: HelpGuide['kind']): string {
  if (kind === 'main-module') return 'Main Module';
  if (kind === 'companion-application') return 'Companion Application';
  return 'Platform';
}

function GuideCard({
  guide,
  page,
  highlighted,
  forceOpen,
}: {
  guide: HelpGuide;
  page: HelpPageGuide;
  highlighted: boolean;
  forceOpen: boolean;
}) {
  return (
    <details
      id={pageAnchor(guide, page)}
      className={`${styles.pageCard} ${highlighted ? styles.pageCardHighlighted : ''}`}
      open={forceOpen || highlighted || undefined}
      data-testid={`help-page-${guide.id}-${page.id}`}
    >
      <summary className={styles.pageSummary}>
        <span className={styles.summaryIcon}><ChevronRight size={18} aria-hidden="true" /></span>
        <span className={styles.pageIdentity}>
          <span className={styles.pageTitle}>{page.title}</span>
          <code>{page.path}</code>
        </span>
        <span className={styles.guideBadge} style={{ borderColor: `${guide.accent}80`, color: guide.accent }}>
          {guide.name}
        </span>
      </summary>
      <div className={styles.pageBody}>
        <p className={styles.pageDescription}>{page.summary}</p>
        <div className={styles.guideColumns}>
          <section>
            <h3><CheckCircle2 size={17} aria-hidden="true" /> What you can do</h3>
            <ul>{page.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
          </section>
          <section>
            <h3><BookOpenText size={17} aria-hidden="true" /> Normal workflow</h3>
            <ol>{page.workflow.map(step => <li key={step}>{step}</li>)}</ol>
          </section>
        </div>
        {page.access && (
          <div className={styles.boundary}>
            <CircleAlert size={17} aria-hidden="true" />
            <div><strong>Access</strong><span>{page.access}</span></div>
          </div>
        )}
        {page.notes?.map(note => (
          <div className={styles.note} key={note}><LifeBuoy size={16} aria-hidden="true" /><span>{note}</span></div>
        ))}
        <div className={styles.cardActions}>
          <a href={page.href} className={styles.primaryAction}>
            Open this page <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <button
            type="button"
            className={styles.copyAction}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('guide', guide.id);
              url.searchParams.set('page', page.path);
              void navigator.clipboard?.writeText(url.toString());
            }}
          >
            Copy guide link
          </button>
        </div>
      </div>
    </details>
  );
}

export default function HelpCenter({
  initialGuideId,
  initialPagePath,
}: {
  initialGuideId?: string | null;
  initialPagePath?: string | null;
}) {
  const initialGuide = findHelpGuide(initialGuideId);
  const initialPage = findHelpPage(initialGuide, initialPagePath);
  const [selectedGuideId, setSelectedGuideId] = useState(initialGuide.id);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(initialPage?.id ?? null);
  const [query, setQuery] = useState('');
  const selectedGuide = findHelpGuide(selectedGuideId);

  const totals = useMemo(() => ({
    guides: HELP_GUIDES.length,
    pages: HELP_GUIDES.reduce((sum, guide) => sum + guide.pages.length, 0),
  }), []);

  const searchResults = useMemo<SearchResult[]>(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    if (terms.length === 0) return [];
    return HELP_GUIDES.flatMap(guide => guide.pages.map(page => ({ guide, page })))
      .filter(({ guide, page }) => {
        const haystack = helpSearchText(guide, page);
        return terms.every(term => haystack.includes(term));
      });
  }, [query]);

  useEffect(() => {
    if (!selectedPageId || query) return;
    const page = selectedGuide.pages.find(candidate => candidate.id === selectedPageId);
    if (!page) return;
    window.requestAnimationFrame(() => {
      document.getElementById(pageAnchor(selectedGuide, page))?.scrollIntoView({ block: 'center' });
    });
  }, [query, selectedGuide, selectedPageId]);

  function updateAddress(guideId: string, pagePath?: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('guide', guideId);
    url.searchParams.delete('module');
    if (pagePath) url.searchParams.set('page', pagePath);
    else url.searchParams.delete('page');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function chooseGuide(guide: HelpGuide) {
    setSelectedGuideId(guide.id);
    setSelectedPageId(null);
    setQuery('');
    updateAddress(guide.id);
    document.getElementById('help-guide-content')?.scrollIntoView({ block: 'start' });
  }

  function chooseResult(result: SearchResult) {
    setSelectedGuideId(result.guide.id);
    setSelectedPageId(result.page.id);
    setQuery('');
    updateAddress(result.guide.id, result.page.path);
  }

  const guideGroups = [
    { label: 'Platform', guides: HELP_GUIDES.filter(guide => guide.kind === 'platform') },
    { label: 'Main Modules', guides: HELP_GUIDES.filter(guide => guide.kind === 'main-module') },
    { label: 'Companion Applications', guides: HELP_GUIDES.filter(guide => guide.kind === 'companion-application') },
  ];

  return (
    <div className={styles.helpCenter} data-testid="operatoros-help-center">
      <header className={styles.hero}>
        <div className={styles.heroEyebrow}><LifeBuoy size={16} aria-hidden="true" /> OperatorOS Help Center</div>
        <h1>Find the exact page or function you need.</h1>
        <p>
          Search the complete customer-facing guide for OperatorOS, Platform Command, every Main Module,
          and every Companion Application. Each page explains its functions, normal workflow, and access boundary.
        </p>
        <div className={styles.searchWrap}>
          <label htmlFor="help-search">Search all help</label>
          <div className={styles.searchControl}>
            <Search size={20} aria-hidden="true" />
            <input
              id="help-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Try “invite a member”, “invoice”, “Torque Assist”, or “SSO replay”"
              autoComplete="off"
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear help search"><X size={18} /></button>}
          </div>
          <div className={styles.stats} aria-label="Help Center coverage">
            <span><strong>{totals.guides}</strong> product guides</span>
            <span><strong>{totals.pages}</strong> page guides</span>
            <span>Updated with guide contract {HELP_CONTENT_VERSION}</span>
          </div>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.guideIndex} aria-label="Help guide index">
          <div className={styles.indexHeading}>
            <span>Guide index</span>
            <small>Select a product</small>
          </div>
          {guideGroups.map(group => (
            <section key={group.label} className={styles.indexGroup}>
              <h2>{group.label}</h2>
              {group.guides.map(guide => (
                <button
                  type="button"
                  key={guide.id}
                  onClick={() => chooseGuide(guide)}
                  className={selectedGuide.id === guide.id && !query ? styles.indexButtonActive : styles.indexButton}
                  aria-pressed={selectedGuide.id === guide.id && !query}
                >
                  <span className={styles.productDot} style={{ background: guide.accent }} />
                  <span><strong>{guide.name}</strong><small>{guide.pages.length} pages</small></span>
                </button>
              ))}
            </section>
          ))}
        </aside>

        <main id="help-guide-content" className={styles.guideContent} tabIndex={-1}>
          {query ? (
            <>
              <div className={styles.contentHeader}>
                <div>
                  <span className={styles.contentKicker}>Search results</span>
                  <h2>{searchResults.length} {searchResults.length === 1 ? 'page matches' : 'pages match'} “{query.trim()}”</h2>
                  <p>Results match page names, features, workflows, paths, access notes, and product descriptions.</p>
                </div>
              </div>
              {searchResults.length > 0 ? (
                <div className={styles.resultsList}>
                  {searchResults.map(result => (
                    <button
                      type="button"
                      key={`${result.guide.id}-${result.page.id}`}
                      className={styles.resultButton}
                      onClick={() => chooseResult(result)}
                    >
                      <span className={styles.productDot} style={{ background: result.guide.accent }} />
                      <span>
                        <small>{result.guide.name} · {result.page.path}</small>
                        <strong>{result.page.title}</strong>
                        <span>{result.page.summary}</span>
                      </span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState} role="status">
                  <Search size={28} aria-hidden="true" />
                  <h3>No page guide matched that search.</h3>
                  <p>Try a shorter action, product name, page title, role, or error concept.</p>
                  <button type="button" onClick={() => setQuery('')}>Clear search</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className={styles.contentHeader} style={{ '--guide-accent': selectedGuide.accent } as CSSProperties}>
                <div>
                  <span className={styles.contentKicker}>{kindLabel(selectedGuide.kind)}</span>
                  <h2>{selectedGuide.name}</h2>
                  <p>{selectedGuide.description}</p>
                  <span className={styles.availability}>{selectedGuide.availability}</span>
                </div>
                <a href={selectedGuide.startHref} className={styles.startAction}>Open {selectedGuide.name}<ArrowUpRight size={15} /></a>
              </div>
              <nav className={styles.pageJump} aria-label={`${selectedGuide.name} page guide shortcuts`}>
                {selectedGuide.pages.map(page => (
                  <a key={page.id} href={`#${pageAnchor(selectedGuide, page)}`}>{page.title}</a>
                ))}
              </nav>
              <div className={styles.pageList}>
                {selectedGuide.pages.map(page => (
                  <GuideCard
                    key={page.id}
                    guide={selectedGuide}
                    page={page}
                    highlighted={page.id === selectedPageId}
                    forceOpen={false}
                  />
                ))}
              </div>
            </>
          )}

          <section className={styles.supportCard}>
            <div>
              <Mail size={22} aria-hidden="true" />
              <span><strong>Still need a person?</strong><small>Include the module, page path, organization name, and any safe error reference. Never email passwords, tokens, or secret values.</small></span>
            </div>
            <a href="mailto:john@shotgunninjas.com?subject=OperatorOS%20support%20request">Email OperatorOS support</a>
          </section>

          <div className={styles.returnLinks}>
            <Link href="/">OperatorOS home</Link>
            <a href="https://app.operatoros.net/">Open console</a>
            <Link href="/modules">Browse modules</Link>
          </div>
        </main>
      </div>
    </div>
  );
}

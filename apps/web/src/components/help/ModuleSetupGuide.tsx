import { MODULE_SETUP_GUIDES } from '@/lib/help/module-setup';
import styles from './ModuleSetupGuide.module.css';

export default function ModuleSetupGuide({ moduleSlug }: { moduleSlug: string }) {
  const guide = Object.hasOwn(MODULE_SETUP_GUIDES, moduleSlug) ? MODULE_SETUP_GUIDES[moduleSlug] : undefined;
  if (!guide) return null;
  return <section className={styles.card} aria-label="Getting started and connections" data-testid="module-setup-guide">
    <h3>Start here</h3>
    <p>{guide.firstTask}</p>
    <details>
      <summary>What needs to be connected?</summary>
      <p>{guide.services}</p>
      <h4>Check that it works</h4>
      <p>{guide.check}</p>
      <p className={styles.note}>These are setup instructions. Your app shows the current availability for your organization.</p>
      <a href={guide.setupHref}>{guide.nextStep}<span aria-hidden="true"> →</span></a>
    </details>
  </section>;
}

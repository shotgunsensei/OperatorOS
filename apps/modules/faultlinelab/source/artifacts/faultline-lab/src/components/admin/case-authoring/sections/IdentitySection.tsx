import { Wand2 } from 'lucide-react';
import type { AuthoringIssue, CaseDraft, DomainTemplate } from '@/data/cases/authoring';
import { categoryLabels } from '@/data/cases';
import type { CaseCategory, Difficulty } from '@/types';
import { FieldIssues, Labeled, Section, inputCls } from '../primitives';
import {
  CATEGORY_OPTIONS,
  DIFFICULTY_OPTIONS,
  DOMAIN_OPTIONS,
} from '../draftStorage';

interface Props {
  draft: CaseDraft;
  issues: AuthoringIssue[];
  domain: DomainTemplate;
  setDomain: (d: DomainTemplate) => void;
  applyTemplate: () => void;
  resetDraft: () => void;
  update: <K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) => void;
}

export function IdentitySection({
  draft,
  issues,
  domain,
  setDomain,
  applyTemplate,
  resetDraft,
  update,
}: Props) {
  return (
    <>
      <Section
        title="Template"
        description="Pick a domain to scaffold a fresh draft. Existing fields are reset."
        action={
          <button
            onClick={resetDraft}
            className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
          >
            Reset
          </button>
        }
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as DomainTemplate)}
            className={inputCls + ' sm:flex-1'}
          >
            {DOMAIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={applyTemplate}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono uppercase tracking-wider hover:bg-cyan-500/20"
          >
            <Wand2 size={12} /> Apply Template
          </button>
        </div>
      </Section>

      <Section title="Identity">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Labeled label="Case ID">
              <input
                value={draft.id}
                onChange={(e) => update('id', e.target.value)}
                className={inputCls}
              />
            </Labeled>
            <FieldIssues issues={issues.filter((i) => i.code === 'missing-id')} />
          </div>
          <div>
            <Labeled label="Slug">
              <input
                value={draft.slug}
                onChange={(e) => update('slug', e.target.value)}
                className={inputCls}
              />
            </Labeled>
            <FieldIssues issues={issues.filter((i) => i.code === 'missing-slug')} />
          </div>
          <div className="sm:col-span-2">
            <Labeled label="Title">
              <input
                value={draft.title}
                onChange={(e) => update('title', e.target.value)}
                className={inputCls}
              />
            </Labeled>
            <FieldIssues issues={issues.filter((i) => i.code === 'missing-title')} />
          </div>
          <div>
            <Labeled label="Category">
              <select
                value={draft.category}
                onChange={(e) => update('category', e.target.value as CaseCategory)}
                className={inputCls}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabels[c] || c}
                  </option>
                ))}
              </select>
            </Labeled>
            <FieldIssues issues={issues.filter((i) => i.code === 'invalid-category')} />
          </div>
          <div>
            <Labeled label="Difficulty">
              <select
                value={draft.difficulty}
                onChange={(e) => update('difficulty', e.target.value as Difficulty)}
                className={inputCls}
              >
                {DIFFICULTY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Labeled>
            <FieldIssues issues={issues.filter((i) => i.code === 'invalid-difficulty')} />
          </div>
        </div>
        <div>
          <Labeled label="Short description" hint="Shown on the incident card.">
            <input
              value={draft.description}
              onChange={(e) => update('description', e.target.value)}
              className={inputCls}
            />
          </Labeled>
          <FieldIssues issues={issues.filter((i) => i.code === 'missing-description')} />
        </div>
        <div>
          <Labeled label="Briefing" hint="Multi-line operator brief.">
            <textarea
              rows={4}
              value={draft.briefing}
              onChange={(e) => update('briefing', e.target.value)}
              className={inputCls + ' font-mono text-xs'}
            />
          </Labeled>
          <FieldIssues issues={issues.filter((i) => i.code === 'missing-briefing')} />
        </div>
      </Section>
    </>
  );
}

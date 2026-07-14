import type { AuthoringIssue, CaseDraft } from '@/data/cases/authoring';
import { FieldIssues, Labeled, Section, inputCls } from '../primitives';

interface Props {
  draft: CaseDraft;
  issues: AuthoringIssue[];
  update: <K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) => void;
}

export function RootCauseSection({ draft, issues, update }: Props) {
  return (
    <Section title="Root cause">
      <FieldIssues issues={issues.filter((i) => i.code === 'missing-root-cause')} />
      <FieldIssues issues={issues.filter((i) => i.code === 'thin-root-cause')} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Labeled label="Root cause id">
          <input
            value={draft.rootCause.id}
            onChange={(e) =>
              update('rootCause', { ...draft.rootCause, id: e.target.value })
            }
            className={inputCls + ' font-mono text-xs'}
          />
        </Labeled>
        <Labeled label="Root cause title">
          <input
            value={draft.rootCause.title}
            onChange={(e) =>
              update('rootCause', { ...draft.rootCause, title: e.target.value })
            }
            className={inputCls}
          />
        </Labeled>
      </div>
      <Labeled label="Description">
        <textarea
          rows={2}
          value={draft.rootCause.description}
          onChange={(e) =>
            update('rootCause', { ...draft.rootCause, description: e.target.value })
          }
          className={inputCls}
        />
      </Labeled>
      <Labeled label="Technical detail">
        <textarea
          rows={3}
          value={draft.rootCause.technicalDetail}
          onChange={(e) =>
            update('rootCause', {
              ...draft.rootCause,
              technicalDetail: e.target.value,
            })
          }
          className={inputCls + ' font-mono text-xs'}
        />
      </Labeled>
    </Section>
  );
}

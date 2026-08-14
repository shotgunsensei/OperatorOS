import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  adminDeleteCaseDraft,
  adminFetchCaseDrafts,
  adminSaveCaseDraft,
} from '@/lib/api';
import {
  composeCase,
  createTemplate,
  validateDraft,
  type CaseDraft,
  type AuthorEvidence,
  type DomainTemplate,
} from '@/data/cases/authoring';
import type {
  EventLogEntry,
  HintTier,
  Symptom,
  TicketNote,
  ToolCommand,
  ToolType,
} from '@/types';
import {
  blankDraft,
  recordsToMap,
  type StoredDraft,
} from './admin/case-authoring/draftStorage';
import { SymptomsSection } from './admin/case-authoring/sections/SymptomsSection';
import { EvidenceSection } from './admin/case-authoring/sections/EvidenceSection';
import { HintsSection } from './admin/case-authoring/sections/HintsSection';
import { CommandsSection } from './admin/case-authoring/sections/CommandsSection';
import { EventsSection } from './admin/case-authoring/sections/EventsSection';
import { TicketsSection } from './admin/case-authoring/sections/TicketsSection';
import { IdentitySection } from './admin/case-authoring/sections/IdentitySection';
import { RootCauseSection } from './admin/case-authoring/sections/RootCauseSection';
import { ToolsOutcomeSection } from './admin/case-authoring/sections/ToolsOutcomeSection';
import { AuthoringSidebar } from './admin/case-authoring/AuthoringSidebar';

export default function AdminCaseAuthoringPanel() {
  const [draft, setDraft] = useState<CaseDraft>(() => blankDraft());
  const [domain, setDomain] = useState<DomainTemplate>('windows-ad');
  const [storedDrafts, setStoredDrafts] = useState<Record<string, StoredDraft>>({});
  const [showPreview, setShowPreview] = useState(true);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);

  const refreshDrafts = useCallback(async (silent = false) => {
    if (!silent) setDraftsLoading(true);
    try {
      const { drafts } = await adminFetchCaseDrafts();
      setStoredDrafts(recordsToMap(drafts));
    } catch (err) {
      toast.error(
        err instanceof Error ? `Failed to load drafts: ${err.message}` : 'Failed to load drafts.'
      );
    } finally {
      if (!silent) setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  const validation = useMemo(() => validateDraft(draft), [draft]);
  const issues = validation.issues;

  const update = <K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const applyTemplate = () => {
    const next = createTemplate(domain, {
      id: draft.id || 'new-case',
      slug: draft.slug || draft.id || 'new-case',
      title: draft.title || 'Untitled Case',
      difficulty: draft.difficulty,
    });
    setDraft(next);
    toast.success(`Applied ${domain} template.`);
  };

  const resetDraft = () => {
    setDraft(blankDraft());
    setDomain('windows-ad');
    toast.info('Draft cleared.');
  };

  const saveDraft = async () => {
    if (!draft.id.trim()) {
      toast.error('Draft needs an id before it can be saved.');
      return;
    }
    setSavingDraft(true);
    try {
      await adminSaveCaseDraft(draft.id, draft);
      await refreshDrafts(true);
      toast.success(`Saved draft "${draft.id}" to the team workspace.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? `Save failed: ${err.message}` : 'Failed to save draft.'
      );
    } finally {
      setSavingDraft(false);
    }
  };

  const loadDraft = (id: string) => {
    const stored = storedDrafts[id];
    if (!stored) return;
    setDraft(stored.draft);
    toast.info(`Loaded draft "${id}".`);
  };

  const deleteDraft = async (id: string) => {
    try {
      await adminDeleteCaseDraft(id);
      await refreshDrafts(true);
      toast.info(`Deleted draft "${id}".`);
    } catch (err) {
      toast.error(
        err instanceof Error ? `Delete failed: ${err.message}` : 'Failed to delete draft.'
      );
    }
  };

  const exportDraft = async () => {
    if (validation.errorCount > 0) {
      toast.error('Fix validation errors before exporting.');
      return;
    }
    try {
      const composed = composeCase(draft);
      const json = JSON.stringify(composed, null, 2);
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(json);
        toast.success('Composed case copied to clipboard as JSON.');
      } else {
        toast.success('Composed case ready (clipboard unavailable).');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Compose failed.');
    }
  };

  // ---- Symptoms ---------------------------------------------------------
  const updateSymptom = (idx: number, patch: Partial<Symptom>) => {
    update('symptoms', draft.symptoms.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const addSymptom = () => {
    const id = `s${draft.symptoms.length + 1}`;
    update('symptoms', [
      ...draft.symptoms,
      { id, description: '', severity: 'medium' },
    ]);
  };
  const removeSymptom = (idx: number) => {
    update('symptoms', draft.symptoms.filter((_, i) => i !== idx));
  };

  // ---- Evidence ---------------------------------------------------------
  const updateEvidence = (idx: number, patch: Partial<AuthorEvidence>) => {
    update('evidence', draft.evidence.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };
  const addEvidence = () => {
    const id = `e${draft.evidence.length + 1}`;
    update('evidence', [
      ...draft.evidence,
      { id, title: '', description: '', category: 'clue', importance: 'medium' },
    ]);
  };
  const removeEvidence = (idx: number) => {
    update('evidence', draft.evidence.filter((_, i) => i !== idx));
  };

  // ---- Hints ------------------------------------------------------------
  const updateHint = (idx: number, patch: Partial<HintTier>) => {
    update('hints', draft.hints.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  };

  // ---- Commands ---------------------------------------------------------
  const updateCommand = (idx: number, patch: Partial<ToolCommand>) => {
    update(
      'terminalCommands',
      draft.terminalCommands.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    );
  };
  const addCommand = () =>
    update('terminalCommands', [
      ...draft.terminalCommands,
      { command: '', description: '', output: '', revealsEvidence: [] },
    ]);
  const removeCommand = (idx: number) =>
    update('terminalCommands', draft.terminalCommands.filter((_, i) => i !== idx));

  // ---- Event logs -------------------------------------------------------
  const updateEvent = (idx: number, patch: Partial<EventLogEntry>) => {
    update('eventLogs', draft.eventLogs.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };
  const addEvent = () => {
    const id = `el${draft.eventLogs.length + 1}`;
    update('eventLogs', [
      ...draft.eventLogs,
      {
        id,
        timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
        source: draft.category,
        level: 'info',
        message: '',
        revealsEvidence: [],
      },
    ]);
  };
  const removeEvent = (idx: number) =>
    update('eventLogs', draft.eventLogs.filter((_, i) => i !== idx));

  // ---- Tickets ----------------------------------------------------------
  const updateTicket = (idx: number, patch: Partial<TicketNote>) => {
    update(
      'ticketHistory',
      draft.ticketHistory.map((t, i) => (i === idx ? { ...t, ...patch } : t))
    );
  };
  const addTicket = () => {
    const id = `th${draft.ticketHistory.length + 1}`;
    update('ticketHistory', [
      ...draft.ticketHistory,
      {
        id,
        author: '',
        role: '',
        timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
        content: '',
        revealsEvidence: [],
      },
    ]);
  };
  const removeTicket = (idx: number) =>
    update('ticketHistory', draft.ticketHistory.filter((_, i) => i !== idx));

  // ---- Tools ------------------------------------------------------------
  const toggleTool = (tool: ToolType) => {
    const has = draft.availableTools.includes(tool);
    update(
      'availableTools',
      has ? draft.availableTools.filter((t) => t !== tool) : [...draft.availableTools, tool]
    );
  };

  const promote = () => {
    if (validation.errorCount > 0) {
      toast.error('Fix validation errors before promoting.');
      return;
    }
    toast.message('Promotion to the live registry requires a code change.', {
      description:
        'Use Export to copy the composed JSON, then add it to src/data/cases/registry.ts in a follow-up deploy.',
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4 min-w-0">
        <IdentitySection
          draft={draft}
          issues={issues}
          domain={domain}
          setDomain={setDomain}
          applyTemplate={applyTemplate}
          resetDraft={resetDraft}
          update={update}
        />

        <SymptomsSection
          draft={draft}
          issues={issues}
          updateSymptom={updateSymptom}
          addSymptom={addSymptom}
          removeSymptom={removeSymptom}
        />

        <RootCauseSection draft={draft} issues={issues} update={update} />

        <EvidenceSection
          draft={draft}
          issues={issues}
          updateEvidence={updateEvidence}
          addEvidence={addEvidence}
          removeEvidence={removeEvidence}
        />

        <HintsSection draft={draft} issues={issues} updateHint={updateHint} />

        <CommandsSection
          draft={draft}
          issues={issues}
          updateCommand={updateCommand}
          addCommand={addCommand}
          removeCommand={removeCommand}
        />

        <EventsSection
          draft={draft}
          issues={issues}
          updateEvent={updateEvent}
          addEvent={addEvent}
          removeEvent={removeEvent}
        />

        <TicketsSection
          draft={draft}
          issues={issues}
          updateTicket={updateTicket}
          addTicket={addTicket}
          removeTicket={removeTicket}
        />

        <ToolsOutcomeSection
          draft={draft}
          issues={issues}
          toggleTool={toggleTool}
          update={update}
        />
      </div>

      <AuthoringSidebar
        draft={draft}
        issues={issues}
        validation={validation}
        storedDrafts={storedDrafts}
        draftsLoading={draftsLoading}
        savingDraft={savingDraft}
        showPreview={showPreview}
        setShowPreview={setShowPreview}
        refreshDrafts={() => void refreshDrafts()}
        saveDraft={() => void saveDraft()}
        exportDraft={() => void exportDraft()}
        promote={promote}
        loadDraft={loadDraft}
        deleteDraft={(id) => void deleteDraft(id)}
      />
    </div>
  );
}

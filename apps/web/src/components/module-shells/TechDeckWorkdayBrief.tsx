'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  moduleShellApi,
  type TechDeckTicket,
  type TechDeckWorkspaceResponse,
} from '@/lib/auth';
import { buildTechDeckWorkday } from '@/lib/core-suite-workday';
import CoreSuiteWorkdayBrief from './CoreSuiteWorkdayBrief';

const emptyWorkspace: TechDeckWorkspaceResponse = {
  configurationItems: [], relationships: [], folders: [], documents: [], evidence: [], reports: [],
  timeEntries: [], comments: [], alerts: [], lifecycleDue: [], incomplete: [],
  execution: { enabled: false, reason: 'Runbooks are documentation-only.' },
};

export default function TechDeckWorkdayBrief({
  tenantKey,
  hrefFor,
}: {
  tenantKey: string;
  hrefFor: (href: string) => string;
}) {
  const [workspace, setWorkspace] = useState<TechDeckWorkspaceResponse>(emptyWorkspace);
  const [tickets, setTickets] = useState<TechDeckTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void Promise.all([
      moduleShellApi.techdeck.getWorkspace(),
      moduleShellApi.techdeck.list(),
    ]).then(([nextWorkspace, nextTickets]) => {
      if (!active) return;
      setWorkspace(nextWorkspace);
      setTickets(nextTickets.tickets);
    }).catch((requestError: unknown) => {
      if (!active) return;
      const candidate = requestError as { error?: unknown; message?: unknown };
      setError(typeof candidate.error === 'string'
        ? candidate.error
        : typeof candidate.message === 'string'
          ? candidate.message
          : 'The workday brief could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [tenantKey]);

  const brief = useMemo(() => buildTechDeckWorkday(workspace, tickets), [tickets, workspace]);

  if (loading) {
    return <section className="techdeck-workday-state" aria-busy="true" data-testid="techdeck-workday-loading"><span /><span /><span /></section>;
  }
  if (error) {
    return <section className="techdeck-workday-error" role="alert" data-testid="techdeck-workday-error"><AlertTriangle size={17} />{error}<a href={hrefFor('/tickets')}>Open the ticket queue</a></section>;
  }
  return <CoreSuiteWorkdayBrief moduleId="techdeck" eyebrow="Today · risk to proof" brief={brief} hrefFor={hrefFor} />;
}

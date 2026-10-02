'use client';

import { useEffect, useState } from 'react';
export const resolutionBase = '/api/modules/techdeck/resolution-intelligence';
export type RecordRow = Record<string, any>;
export type Page = { items: RecordRow[]; nextCursor?: string | null; fullTextTruncated?: boolean; embeddings?:string };
export async function resolutionRequest<T = RecordRow>(tenantId: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(resolutionBase + path, { ...options, credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId, ...options.headers } });
  const data = await response.json();
  if (!response.ok) {
    const messages: Record<string, string> = {
      RESOLUTION_VERSION_CONFLICT: 'This incident changed. Reload the incident before saving again.',
      RESOLUTION_NOT_FOUND: 'This incident is unavailable for your current access or has been archived.',
      RESOLUTION_RATE_LIMIT: 'Too many requests. Wait one minute and try again.',
      RESOLUTION_REDACTION_REQUIRED: 'Remove or redact credentials before continuing.',
      RESOLUTION_RESEARCH_UNAVAILABLE: 'AI research is unavailable. Review provider and organization settings; local evidence preview still works.',
      RESOLUTION_RESEARCH_INPUT_LIMIT: 'Shorten the problem text to at most 6,000 bytes.',
      RESOLUTION_RESEARCH_EVIDENCE_LIMIT: 'The evidence is too large to send safely. Narrow to one incident or a more specific query; no evidence was silently omitted.',
      RESOLUTION_RESEARCH_RESPONSE_INVALID: 'The provider response could not be grounded in the reviewed evidence and was withheld.',
      RESOLUTION_RESEARCH_PROVIDER_FAILED: 'The provider could not complete research. Your saved evidence is unchanged.',
      RESOLUTION_RESEARCH_DAILY_LIMIT: 'The organization has reached its daily research request limit.',
      RESOLUTION_SEMANTIC_UNAVAILABLE:'Semantic search is unavailable. Check provider and organization settings; exact and text search still work.',
      RESOLUTION_PREVIEW_CHANGED:'The evidence or provider changed. Prepare and review a new preview.',
      RESOLUTION_EGRESS_REVIEW_REQUIRED:'Review the text and provider data-sharing requirements before continuing.',
      RESOLUTION_EMBEDDING_SIZE_LIMIT:'This incident exceeds the 200-excerpt semantic indexing limit. Exact and text search remain available.',
      RESOLUTION_INTERNAL_ACCESS_REQUIRED: 'Resolution evidence is available to internal technicians only.',
      RESOLUTION_IMPORT_CONFLICT: 'This source conflicts with a retained import. Ask an administrator to review it.',
      RESOLUTION_DRAFT_PREVIEW_CHANGED: 'The evidence or access changed. Prepare and review a fresh preview.',
      RESOLUTION_DRAFT_REVIEW_REQUIRED: 'Review the draft and confirm its internal audience before saving.',
      RESOLUTION_DRAFT_UNAVAILABLE: 'A document already exists for this source, but it is unavailable for your current access.',
      RESOLUTION_DRAFT_AUDIENCE_MISMATCH: 'Choose a KB or runbook draft whose audience is at least as restrictive as this incident.',
    };
    const issues = (data.issues ?? []).slice(0, 8).map((issue: RecordRow) => `${issue.path || '/'}: ${issue.expected}`).join('; ');
    throw new Error(`${messages[data.code] ?? (response.status === 403 ? 'Your current access does not allow this action.' : response.status === 401 ? 'Your session has expired. Sign in through OperatorOS.' : data.error ?? 'The request could not be completed.')} ${data.code ? `(${data.code})` : ''}${issues ? ` — ${issues}` : ''}`);
  }
  return data;
}
export function useResolution<T = RecordRow>(tenantId: string, path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: Boolean(path) });
  const [revision, reload] = useState(0);
  useEffect(() => {
    if (!path) { setState({ data: null, error: null, loading: false }); return; }
    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });
    void resolutionRequest<T>(tenantId, path, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setState({ data, error: null, loading: false }); }).catch(error => { if (!controller.signal.aborted) setState({ data: null, error: String(error.message), loading: false }); });
    return () => controller.abort();
  }, [tenantId, path, revision]);
  return { ...state, reload: () => reload(value => value + 1) };
}
export const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
export const display = (value: unknown): string => value === null || value === undefined || value === '' ? 'Not recorded' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
export function saveText(text: string, filename: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

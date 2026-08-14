import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { apiRequest } from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { useSync } from '@/lib/sync';
import { Body, Button, Card, CardTitle, Empty, ErrorState, Field, Hero, Meta, ProductScreen } from '@/components/ui';

type Detail = { diagnostic: Record<string, any>; entries: Record<string, any>[]; codes: Record<string, any>[]; timeline: Record<string, any>[] };
export default function DiagnosticDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const sync = useSync();
  const detail = useResource(() => apiRequest<Detail>(`/modules/torqueshed/diagnostics/${id}`), [id]);
  const assist = useResource(() => apiRequest<{ requests: Record<string, any>[] }>(`/modules/torqueshed/diagnostics/${id}/torque-assist`), [id]);
  const [title, setTitle] = useState(''); const [value, setValue] = useState(''); const [assistBusy, setAssistBusy] = useState(false);
  const addObservation = async () => {
    await sync.queue({ method: 'POST', path: `/modules/torqueshed/diagnostics/${id}/entries`, body: { kind: 'observation', title, valueText: value } });
    setTitle(''); setValue(''); if (sync.online) await detail.reload();
  };
  const runAssist = async () => { setAssistBusy(true); try { await apiRequest('/modules/torqueshed/torque-assist', { method: 'POST', body: { diagnosticSessionId: id }, idempotencyKey: `native-assist-${Crypto.randomUUID()}` }); await assist.reload(); } finally { setAssistBusy(false); } };
  const openBay = async () => { const result = await apiRequest<{ bay: Record<string, any> }>('/modules/torqueshed/live-bays', { method: 'POST', body: { diagnosticId: id, title: `Live bay: ${detail.data?.diagnostic.title ?? 'diagnostic'}`, visibility: 'private' } }); router.push(`/live-bay/${result.bay.id}` as any); };
  return <ProductScreen title={detail.data?.diagnostic.title ?? 'Diagnostic Case'} kicker="Evidence-led reasoning" refreshing={detail.loading} onRefresh={() => void detail.reload()}>
    {detail.error && <ErrorState message={detail.error} />}{detail.data && <Hero eyebrow={detail.data.diagnostic.status} title={detail.data.diagnostic.customerConcern} body={detail.data.diagnostic.symptoms || 'Capture observations, tests, readings, hypotheses, parts, labor, resolution, and follow-up.'} />}
    <Card><CardTitle>Add evidence</CardTitle><Field label="Observation / test" value={title} onChangeText={setTitle} /><Field label="Reading or outcome" value={value} onChangeText={setValue} multiline /><Button label="Record evidence" disabled={!title.trim()} onPress={() => void addObservation()} /></Card>
    <Card><CardTitle>Torque Assist plan</CardTitle><Body>Uses the shared AI provider when ready, with deterministic fallback and audited usage accounting when it is not.</Body><Button label={assistBusy ? 'Building plan…' : 'Generate diagnostic plan'} disabled={assistBusy} onPress={() => void runAssist()} /><Button label="Open live bay" variant="ghost" onPress={() => void openBay()} />{assist.data?.requests.slice(0, 2).map(request => <Body key={request.id}>{request.status} · {request.provider ?? 'deterministic'} · {new Date(request.createdAt).toLocaleString()}</Body>)}</Card>
    {detail.data?.timeline.length === 0 && <Empty title="No evidence yet" body="Record the first DTC, observation, test, reading, hypothesis, or attachment." />}
    {detail.data?.timeline.map(item => <Card key={`${item.timelineType}-${item.id}`}><Meta>{item.timelineType} · {item.kind ?? item.code ?? 'evidence'}</Meta><CardTitle>{item.title ?? item.code ?? item.originalName}</CardTitle><Body>{item.valueText ?? item.description ?? item.outcome ?? 'Evidence recorded.'}</Body></Card>)}
  </ProductScreen>;
}

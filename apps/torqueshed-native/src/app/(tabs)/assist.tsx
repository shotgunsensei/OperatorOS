import { useState } from 'react';
import { router } from 'expo-router';
import { apiRequest } from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { Body, Button, Card, CardTitle, Empty, ErrorState, Field, Hero, Meta, ProductScreen } from '@/components/ui';

type Diagnostic = Record<string, any>; type Vehicle = Record<string, any>; type Bay = Record<string, any>;
export default function AssistScreen() {
  const data = useResource(async () => {
    const [diagnostics, vehicles, bays, status] = await Promise.all([
      apiRequest<{ diagnostics: Diagnostic[] }>('/modules/torqueshed/diagnostics'), apiRequest<{ vehicles: Vehicle[] }>('/modules/torqueshed/vehicles'), apiRequest<{ bays: Bay[] }>('/modules/torqueshed/live-bays'), apiRequest<Record<string, any>>('/modules/torqueshed/torque-assist/status'),
    ]); return { diagnostics: diagnostics.diagnostics, vehicles: vehicles.vehicles, bays: bays.bays, status };
  });
  const [title, setTitle] = useState(''); const [concern, setConcern] = useState('');
  const create = async () => {
    const vehicle = data.data?.vehicles[0]; if (!vehicle) return;
    const diagnostic = await apiRequest<Diagnostic>('/modules/torqueshed/diagnostics', { method: 'POST', body: { vehicleId: vehicle.id, title, customerConcern: concern, symptoms: concern, visibility: 'private' } });
    setTitle(''); setConcern(''); router.push(`/diagnostic/${diagnostic.id}` as any); await data.reload();
  };
  return <ProductScreen title="Torque Assist" kicker="Structured diagnostics" refreshing={data.loading} onRefresh={() => void data.reload()}>
    <Hero eyebrow={data.data?.status?.providerReady ? 'Shared AI ready' : 'Deterministic fallback ready'} title="Test it. Record it. Prove it." body="Work from concern to evidence, hypothesis, verified repair, follow-up, and a durable report." />
    <Card><CardTitle>Open a diagnostic case</CardTitle>{!data.data?.vehicles.length && <Body>Add a garage vehicle before opening a case.</Body>}<Field label="Case title" value={title} onChangeText={setTitle} /><Field label="Concern / symptoms" value={concern} onChangeText={setConcern} multiline /><Button label="Start diagnosis" disabled={!data.data?.vehicles.length || title.trim().length < 2 || concern.trim().length < 2} onPress={() => void create()} /></Card>
    {data.error && <ErrorState message={data.error} />}{data.data?.diagnostics.length === 0 && <Empty title="No open cases" body="Start with the driver concern, then add codes, readings, tests, evidence, and outcomes." />}
    {data.data?.diagnostics.map(item => <Card key={item.id} onPress={() => router.push(`/diagnostic/${item.id}` as any)}><Meta>{item.status} · {item.year} {item.make} {item.model}</Meta><CardTitle>{item.title}</CardTitle><Body>{item.customerConcern}</Body><Meta>tap for evidence and Torque Assist</Meta></Card>)}
    <Card><CardTitle>Live bays</CardTitle><Body>Authorized real-time collaboration with durable history and reconnect cursors.</Body>{data.data?.bays.map(bay => <Button key={bay.id} variant="ghost" label={bay.title} onPress={() => router.push(`/live-bay/${bay.id}` as any)} />)}{!data.data?.bays.length && <Meta>No live bay sessions</Meta>}</Card>
  </ProductScreen>;
}

import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { apiRequest } from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { useSync } from '@/lib/sync';
import {
  Body,
  Button,
  Card,
  CardTitle,
  Empty,
  ErrorState,
  Field,
  Hero,
  Meta,
  ProductScreen,
} from '@/components/ui';

type BuildWorkspace = {
  build: Record<string, any>;
  stages: Record<string, any>[];
  tasks: Record<string, any>[];
  journal: Record<string, any>[];
  parts: Record<string, any>[];
};

export default function BuildDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sync = useSync();
  const workspace = useResource(
    () => apiRequest<BuildWorkspace>(`/modules/torqueshed/builds/${id}/workspace`),
    [id],
  );
  const [entryTitle, setEntryTitle] = useState('');
  const [entryBody, setEntryBody] = useState('');
  const [cost, setCost] = useState('');
  const [partName, setPartName] = useState('');
  const [partCost, setPartCost] = useState('');

  const addJournalEntry = async () => {
    await sync.queue({
      method: 'POST',
      path: `/modules/torqueshed/builds/${id}/journal`,
      body: {
        entryType: cost ? 'cost_update' : 'entry',
        title: entryTitle,
        body: entryBody,
        costMinor: cost ? Math.round(Number(cost) * 100) : undefined,
        visibility: 'private',
      },
    });
    setEntryTitle('');
    setEntryBody('');
    setCost('');
    if (sync.online) await workspace.reload();
  };

  const addPart = async () => {
    await sync.queue({
      method: 'POST',
      path: `/modules/torqueshed/builds/${id}/parts`,
      body: {
        name: partName,
        status: 'planned',
        quantity: 1,
        unitCostMinor: partCost ? Math.round(Number(partCost) * 100) : undefined,
        currency: 'USD',
      },
    });
    setPartName('');
    setPartCost('');
    if (sync.online) await workspace.reload();
  };

  const captureEvidence = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const captured = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    const asset = captured.canceled ? undefined : captured.assets[0];
    if (!asset) return;
    await sync.queue({
      method: 'POST',
      path: `/modules/torqueshed/builds/${id}/attachments`,
      body: {},
      file: {
        uri: asset.uri,
        name: asset.fileName ?? `build-${id}-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        bodyField: 'contentBase64',
      },
    });
    if (sync.online) await workspace.reload();
  };

  const build = workspace.data?.build;
  return (
    <ProductScreen
      title={build?.title ?? 'Build Journal'}
      kicker="Garage record"
      refreshing={workspace.loading}
      onRefresh={() => void workspace.reload()}
    >
      {workspace.error && <ErrorState message={workspace.error} />}
      {build && (
        <Hero
          eyebrow={`${build.status} · ${build.visibility}`}
          title={build.title}
          body={build.description || 'Capture every stage, part, cost, milestone, and proof photo.'}
        />
      )}

      <Card>
        <CardTitle>Add journal entry</CardTitle>
        <Field label="Title" value={entryTitle} onChangeText={setEntryTitle} />
        <Field label="Work performed / milestone" value={entryBody} onChangeText={setEntryBody} multiline />
        <Field label="Cost (USD, optional)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
        <Button label={sync.online ? 'Save entry' : 'Queue entry'} disabled={!entryTitle.trim()} onPress={() => void addJournalEntry()} />
        <Button label="Capture proof photo" variant="ghost" onPress={() => void captureEvidence()} />
      </Card>

      <Card>
        <CardTitle>Add planned part</CardTitle>
        <Field label="Part" value={partName} onChangeText={setPartName} />
        <Field label="Unit cost (USD, optional)" value={partCost} onChangeText={setPartCost} keyboardType="decimal-pad" />
        <Button label={sync.online ? 'Add part' : 'Queue part'} disabled={!partName.trim()} onPress={() => void addPart()} />
      </Card>

      {workspace.data?.journal.length === 0 && (
        <Empty title="No journal entries" body="Record the first stage, modification, cost, or milestone." />
      )}
      {workspace.data?.journal.map((entry) => (
        <Card key={entry.id}>
          <Meta>{entry.entryType} · {new Date(entry.occurredAt).toLocaleDateString()}</Meta>
          <CardTitle>{entry.title}</CardTitle>
          <Body>{entry.body || 'No notes supplied.'}</Body>
          {entry.costMinor ? <Meta>${(Number(entry.costMinor) / 100).toFixed(2)}</Meta> : null}
        </Card>
      ))}

      {workspace.data?.parts.map((part) => (
        <Card key={part.id}>
          <Meta>{part.status} · qty {part.quantity}</Meta>
          <CardTitle>{part.name}</CardTitle>
          <Body>{[part.manufacturer, part.partNumber].filter(Boolean).join(' · ') || 'Part details pending.'}</Body>
          {part.unitCostMinor ? <Meta>${(Number(part.unitCostMinor) / 100).toFixed(2)} each</Meta> : null}
        </Card>
      ))}
    </ProductScreen>
  );
}

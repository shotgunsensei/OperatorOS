import { useState } from 'react';
import { router } from 'expo-router';
import { apiRequest } from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { Body, Button, Card, CardTitle, Empty, ErrorState, Field, Meta, ProductScreen } from '@/components/ui';

type Build = Record<string, any>;
export default function BuildsScreen() {
  const builds = useResource(() => apiRequest<{ builds: Build[] }>('/modules/torqueshed/builds'));
  const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const create = async () => {
    const created = await apiRequest<Build>('/modules/torqueshed/builds', { method: 'POST', body: { title, description, visibility: 'private', status: 'planning' } });
    setTitle(''); setDescription(''); await builds.reload(); router.push(`/build/${created.id}` as any);
  };
  return <ProductScreen title="Build Journals" kicker="Document the work" refreshing={builds.loading} onRefresh={() => void builds.reload()}>
    <Card><CardTitle>Start a build</CardTitle><Field label="Build title" value={title} onChangeText={setTitle} /><Field label="Plan" value={description} onChangeText={setDescription} multiline /><Button label="Create journal" disabled={title.trim().length < 2} onPress={() => void create()} /></Card>
    {builds.error && <ErrorState message={builds.error} />}{builds.data?.builds.length === 0 && <Empty title="No builds on stands" body="Create a journal, then capture stages, parts, cost, media, and milestones." />}
    {builds.data?.builds.map(build => <Card key={build.id} onPress={() => router.push(`/build/${build.id}` as any)}><Meta>{build.status} · {build.visibility}</Meta><CardTitle>{build.title}</CardTitle><Body>{build.description || 'No build notes yet.'}</Body><Meta>{build.budgetMinor ? `$${(Number(build.budgetMinor) / 100).toFixed(2)} budget` : 'Budget open'} · tap for journal</Meta></Card>)}
  </ProductScreen>;
}

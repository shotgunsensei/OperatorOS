import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { apiRequest } from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { Body, Button, Card, CardTitle, Empty, ErrorState, Field, Hero, Meta, ProductScreen } from '@/components/ui';

type Post = Record<string, any>;
export default function FeedScreen() {
  const feed = useResource(() => apiRequest<{ posts: Post[] }>('/modules/torqueshed/community/posts'));
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [saving, setSaving] = useState(false);
  const publish = async () => {
    setSaving(true);
    try {
      const draft = await apiRequest<Post>('/modules/torqueshed/community/posts', { method: 'POST', body: { title, body, topicSlug: 'general', visibility: 'public', tags: [] } });
      await apiRequest(`/modules/torqueshed/community/posts/${draft.id}/publish`, { method: 'POST', body: { expectedVersion: draft.version } });
      setTitle(''); setBody(''); await feed.reload();
    } finally { setSaving(false); }
  };
  return <ProductScreen title="Build Feed" kicker="Community" refreshing={feed.loading} onRefresh={() => void feed.reload()}>
    <Hero eyebrow="Proof over posture" title="What did you wrench on?" body="Share real progress, diagnostic evidence, and lessons with the authorized TorqueShed community." />
    <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button label="Profile" variant="ghost" onPress={() => router.push('/profile')} /></View><View style={{ flex: 1 }}><Button label="Alerts" variant="ghost" onPress={() => router.push('/notifications')} /></View></View>
    <Card><CardTitle>Post to the bay</CardTitle><Field label="Title" value={title} onChangeText={setTitle} /><Field label="Details" value={body} onChangeText={setBody} multiline /><Button disabled={saving || title.trim().length < 4 || body.trim().length < 2} label={saving ? 'Publishing…' : 'Publish update'} onPress={() => void publish()} /></Card>
    {feed.error && <ErrorState message={feed.error} />}
    {feed.data?.posts.length === 0 && <Empty title="Quiet shop floor" body="Published build stories and diagnostic write-ups will appear here." />}
    {feed.data?.posts.map(post => <Card key={post.id}><Meta>{post.topicName ?? post.topicSlug ?? 'Garage'} · {post.authorDisplayName ?? 'TorqueShed member'}</Meta><CardTitle>{post.title}</CardTitle><Body>{post.body}</Body><Meta>{post.reactionCount ?? 0} reactions · {post.commentCount ?? 0} comments</Meta></Card>)}
  </ProductScreen>;
}

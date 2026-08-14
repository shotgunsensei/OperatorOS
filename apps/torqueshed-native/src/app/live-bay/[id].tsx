import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { apiRequest } from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { useSync } from '@/lib/sync';
import { Body, Button, Card, CardTitle, Empty, ErrorState, Field, Meta, ProductScreen } from '@/components/ui';

type BayDetail = { bay: Record<string, any>; messages: Record<string, any>[]; cursor: number };
export default function LiveBayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const sync = useSync(); const [message, setMessage] = useState('');
  const bay = useResource(() => apiRequest<BayDetail>(`/modules/torqueshed/live-bays/${id}`), [id]);
  useEffect(() => { const timer = setInterval(() => { if (sync.online) void bay.reload(); }, 5000); return () => clearInterval(timer); }, [sync.online, bay.reload]);
  const send = async () => { const mutationId = `native-chat-${Crypto.randomUUID()}`; await sync.queue({ id: mutationId, method: 'POST', path: `/modules/torqueshed/live-bays/${id}/messages`, body: { clientMessageId: mutationId, kind: 'message', body: message } }); setMessage(''); if (sync.online) await bay.reload(); };
  return <ProductScreen title={bay.data?.bay.title ?? 'Live Bay'} kicker="Authorized collaboration" refreshing={bay.loading} onRefresh={() => void bay.reload()}>
    {bay.error && <ErrorState message={bay.error} />}{bay.data && <Card><Meta>{bay.data.bay.status} · reconnect cursor {bay.data.cursor}</Meta><Body>Messages persist in sequence. Client mutation IDs prevent duplicate sends after reconnect.</Body></Card>}
    <Card><Field label="Message" value={message} onChangeText={setMessage} multiline /><Button label={sync.online ? 'Send to bay' : 'Queue for reconnect'} disabled={!message.trim()} onPress={() => void send()} /></Card>
    {bay.data?.messages.length === 0 && <Empty title="Bay is open" body="Authorized collaborators and their durable message history appear here." />}
    {bay.data?.messages.map(item => <Card key={item.id}><Meta>#{item.sequence} · {item.senderDisplayName ?? 'Member'}</Meta><Body>{item.body}</Body></Card>)}
  </ProductScreen>;
}

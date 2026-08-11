import { useResource } from '@/hooks/use-resource';
import { apiRequest } from '@/lib/api';
import { Body, Card, CardTitle, Empty, ErrorState, Meta, ProductScreen } from '@/components/ui';
export default function NotificationsScreen() {
  const data = useResource(() => apiRequest<{ notifications: Record<string, any>[] }>('/modules/torqueshed/notifications'));
  return <ProductScreen title="Notifications" kicker="Garage activity" refreshing={data.loading} onRefresh={() => void data.reload()}>{data.error && <ErrorState message={data.error} />}{data.data?.notifications.length === 0 && <Empty title="All clear" body="Build, diagnostic, collaboration, marketplace, and moderation notices appear here." />}{data.data?.notifications.map(item => <Card key={item.id}><Meta>{item.level} · {new Date(item.createdAt).toLocaleString()}</Meta><CardTitle>{item.title}</CardTitle><Body>{item.message}</Body></Card>)}</ProductScreen>;
}

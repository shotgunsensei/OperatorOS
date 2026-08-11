import { useState } from 'react';
import { router } from 'expo-router';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useResource } from '@/hooks/use-resource';
import { Body, Button, Card, CardTitle, ErrorState, Meta, ProductScreen } from '@/components/ui';
import { nativeConfig } from '@/lib/config';
export default function SettingsScreen() {
  const auth = useAuth(); const data = useResource(() => apiRequest<{ settings: Record<string, any> }>('/modules/torqueshed/settings')); const [busy, setBusy] = useState(false);
  const toggleUnits = async () => { const units = data.data?.settings.units === 'metric' ? 'imperial' : 'metric'; await apiRequest('/modules/torqueshed/settings', { method: 'PUT', body: { ...data.data?.settings, units } }); await data.reload(); };
  const logout = async () => { setBusy(true); await auth.logout(); setBusy(false); router.replace('/' as any); };
  return <ProductScreen title="Settings" kicker="Native session and garage defaults" refreshing={data.loading}><Card><CardTitle>{auth.session?.user.name}</CardTitle><Body>{auth.session?.user.email}</Body><Meta>{auth.session?.tenant.name} · TorqueShed entitlement</Meta><Body>Build {nativeConfig.buildId}</Body></Card>{data.error && <ErrorState message={data.error} />}<Card><CardTitle>Units</CardTitle><Body>Current: {data.data?.settings.units ?? 'imperial'}</Body><Button label="Switch units" variant="ghost" onPress={() => void toggleUnits()} /></Card><Card><CardTitle>Session control</CardTitle><Body>Logout revokes the server-side opaque native session, then removes both tokens from OS secure storage.</Body><Button label={busy ? 'Revoking…' : 'Log out of TorqueShed'} variant="danger" disabled={busy} onPress={() => void logout()} /></Card></ProductScreen>;
}

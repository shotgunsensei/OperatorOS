import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { router } from 'expo-router';
import { useResource } from '@/hooks/use-resource';
import { Body, Button, Card, CardTitle, ErrorState, Field, ProductScreen } from '@/components/ui';

export default function ProfileScreen() {
  const profile = useResource(() => apiRequest<{ profile: Record<string, any> | null }>('/modules/torqueshed/community/profile/me'));
  const [displayName, setDisplayName] = useState(''); const [bio, setBio] = useState('');
  useEffect(() => { if (profile.data?.profile) { setDisplayName(profile.data.profile.displayName ?? ''); setBio(profile.data.profile.bio ?? ''); } }, [profile.data]);
  const save = async () => { await apiRequest('/modules/torqueshed/community/profile/me', { method: 'PUT', body: { displayName, bio, specialties: [], visibility: 'tenant', countryCode: 'US' } }); await profile.reload(); };
  return <ProductScreen title="Driver Profile" kicker="Reputation without transaction claims" refreshing={profile.loading}><Card><CardTitle>Community identity</CardTitle><Field label="Display name" value={displayName} onChangeText={setDisplayName} /><Field label="Bio" value={bio} onChangeText={setBio} multiline /><Button label="Save profile" disabled={displayName.trim().length < 2} onPress={() => void save()} /><Body>Reputation reflects community contribution only. It is not a payment guarantee or seller rating.</Body></Card><Button label="Native settings" variant="ghost" onPress={() => router.push('/settings')} />{profile.error && <ErrorState message={profile.error} />}</ProductScreen>;
}

import { useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { Body, Button, Card, CardTitle, Empty, ErrorState, Field, Meta, ProductScreen } from '@/components/ui';

type Vehicle = Record<string, any>;
export default function GarageScreen() {
  const garage = useResource(() => apiRequest<{ vehicles: Vehicle[] }>('/modules/torqueshed/vehicles'));
  const [year, setYear] = useState(''); const [make, setMake] = useState(''); const [model, setModel] = useState(''); const [nickname, setNickname] = useState('');
  const create = async () => {
    await apiRequest('/modules/torqueshed/vehicles', { method: 'POST', body: { year: Number(year), make, model, nickname, visibility: 'private' } });
    setYear(''); setMake(''); setModel(''); setNickname(''); await garage.reload();
  };
  return <ProductScreen title="My Garage" kicker="Private fleet" refreshing={garage.loading} onRefresh={() => void garage.reload()}>
    <Card><CardTitle>Roll in a vehicle</CardTitle><Field label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" /><Field label="Make" value={make} onChangeText={setMake} /><Field label="Model" value={model} onChangeText={setModel} /><Field label="Nickname" value={nickname} onChangeText={setNickname} /><Button label="Add to garage" disabled={!year || !make.trim() || !model.trim()} onPress={() => void create()} /></Card>
    {garage.error && <ErrorState message={garage.error} />}
    {garage.data?.vehicles.length === 0 && <Empty title="The lifts are open" body="Add your first vehicle to start history, builds, diagnostics, and evidence." />}
    {garage.data?.vehicles.map(vehicle => <Card key={vehicle.id}><Meta>{vehicle.ownershipStatus ?? 'owned'} · {vehicle.visibility}</Meta><CardTitle>{vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}</CardTitle><Body>{vehicle.year} {vehicle.make} {vehicle.model} {vehicle.trim ?? ''}</Body><Meta>{vehicle.currentMileage ? `${Number(vehicle.currentMileage).toLocaleString()} mi` : 'Mileage not recorded'} · VIN {vehicle.vinMasked ?? 'not stored'}</Meta></Card>)}
  </ProductScreen>;
}

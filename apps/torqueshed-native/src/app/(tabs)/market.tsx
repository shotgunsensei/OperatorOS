import { useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { Body, Button, Card, CardTitle, Empty, ErrorState, Field, Meta, ProductScreen } from '@/components/ui';

type Listing = Record<string, any>;
export default function MarketScreen() {
  const market = useResource(() => apiRequest<{ listings: Listing[] }>('/modules/torqueshed/marketplace/listings'));
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [price, setPrice] = useState('');
  const create = async () => {
    const draft = await apiRequest<Listing>('/modules/torqueshed/marketplace/listings', { method: 'POST', body: { title, description, type: 'sell', condition: 'working', categorySlug: 'parts', priceMinor: Math.round(Number(price) * 100), currency: 'USD', negotiable: false, countryCode: 'US' } });
    await apiRequest(`/modules/torqueshed/marketplace/listings/${draft.id}/publish`, { method: 'POST', body: { expectedVersion: draft.version } });
    setTitle(''); setDescription(''); setPrice(''); await market.reload();
  };
  return <ProductScreen title="DIY Marketplace" kicker="Contact-only listings" refreshing={market.loading} onRefresh={() => void market.reload()}>
    <Card><CardTitle>List a garage item</CardTitle><Field label="Title" value={title} onChangeText={setTitle} /><Field label="Description" value={description} onChangeText={setDescription} multiline /><Field label="Price (USD)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" /><Button label="Publish listing" disabled={title.trim().length < 4 || description.trim().length < 10 || !(Number(price) >= 0)} onPress={() => void create()} /><Body>TorqueShed is contact-only. Payment and fulfillment happen off-platform; no escrow, payment protection, shipping guarantee, or inspection is implied.</Body></Card>
    {market.error && <ErrorState message={market.error} />}{market.data?.listings.length === 0 && <Empty title="Nothing on the parts wall" body="Published parts, tools, fabrication gear, manuals, wheels, and electronics appear here." />}
    {market.data?.listings.map(item => <Card key={item.id}><Meta>{item.condition} · {item.categoryName ?? item.categorySlug}</Meta><CardTitle>{item.title}</CardTitle><Body>{item.description}</Body><Meta>{item.priceMinor == null ? item.listingType : `$${(Number(item.priceMinor) / 100).toFixed(2)} ${item.currency}`} · contact seller</Meta></Card>)}
  </ProductScreen>;
}

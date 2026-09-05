'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  moduleShellApi,
  type TorqueShedCommunityPost,
  type TorqueShedMarketplaceListing,
} from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';

const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.sm,
  background: semantic.bg,
  color: semantic.text,
  padding: '10px 11px',
  fontSize: fontSize.body,
};
const label: React.CSSProperties = {
  display: 'grid',
  gap: 5,
  color: semantic.textMuted,
  fontSize: fontSize.sm,
};
const button: React.CSSProperties = {
  border: 0,
  borderRadius: radius.sm,
  background: '#f59e0b',
  color: '#18130a',
  padding: '9px 12px',
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

function errorText(error: unknown): string {
  const value = error as { error?: unknown; message?: unknown; code?: unknown };
  const message =
    typeof value?.error === 'string'
      ? value.error
      : typeof value?.message === 'string'
        ? value.message
        : 'TorqueShed could not complete that request.';
  return `${message}${value?.code ? ` (${String(value.code)})` : ''}`;
}

function money(value: number | null, currency = 'USD') {
  return value === null
    ? 'Trade / wanted'
    : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value / 100);
}

async function imagePayload(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  const encoded = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Image could not be read.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
  return { originalName: file.name, declaredMimeType: file.type, contentBase64: encoded };
}

function Feedback({ error, notice }: { error: string; notice: string }) {
  return (
    <>
      {error && (
        <div
          role="alert"
          style={{ ...cardStyle, color: semantic.accentDanger, borderColor: semantic.accentDanger }}
        >
          {error}
        </div>
      )}
      {notice && (
        <div role="status" style={{ ...cardStyle, color: '#22c55e', borderColor: '#16a34a77' }}>
          {notice}
        </div>
      )}
    </>
  );
}

export function TorqueShedMarketplacePanel({ listingId, canWrite }: { listingId?: string; canWrite: boolean }) {
  const [listings, setListings] = useState<TorqueShedMarketplaceListing[]>([]);
  const [categories, setCategories] = useState<Array<{ slug: string; name: string }>>([]);
  const [conversations, setConversations] = useState<Array<Record<string, any>>>([]);
  const [selected, setSelected] = useState<TorqueShedMarketplaceListing | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<Array<Record<string, any>>>([]);
  const [scope, setScope] = useState<'browse' | 'mine' | 'favorites'>('browse');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy('load');
    setError('');
    try {
      const query = new URLSearchParams({ limit: '50', offset: String(page * 50), sort });
      if (scope !== 'browse') query.set('scope', scope);
      if (search.trim()) query.set('search', search.trim());
      if (category) query.set('category', category);
      const settled = await Promise.allSettled([
        moduleShellApi.torqueshed.listMarketplace(query.toString()),
        moduleShellApi.torqueshed.listMarketplaceCategories(),
        moduleShellApi.torqueshed.listMarketplaceConversations(),
      ] as const);
      if (settled[0].status === 'fulfilled') setListings(settled[0].value.listings);
      if (settled[1].status === 'fulfilled') setCategories(settled[1].value.categories);
      if (settled[2].status === 'fulfilled') setConversations(settled[2].value.conversations);
      const failure = settled.find((entry) => entry.status === 'rejected');
      if (failure?.status === 'rejected') setError(errorText(failure.reason));
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }, [category, page, scope, search, sort]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const requestedId = listingId ?? window.location.pathname.match(/\/marketplace\/([0-9a-f-]{36})\/?$/i)?.[1];
    if (!requestedId) return;
    void moduleShellApi.torqueshed
      .getMarketplaceListing(requestedId)
      .then((detail) => {
        setSelected(detail.listing);
        setSelectedMedia(detail.media);
      })
      .catch((next) => setError(errorText(next)));
  }, [listingId]);

  async function run(name: string, operation: () => Promise<unknown>, success: string) {
    if (!canWrite) return false;
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await operation();
      setNotice(success);
      setSelected(null);
      await load();
      return true;
    } catch (next) {
      setError(errorText(next));
      return false;
    } finally {
      setBusy('');
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = String(data.get('price') ?? '').trim();
    void (async () => {
      const saved = await run(
        'create',
        () =>
          moduleShellApi.torqueshed.createMarketplaceListing({
            title: data.get('title'),
            description: data.get('description'),
            categorySlug: data.get('categorySlug'),
            type: data.get('type'),
            condition: data.get('condition'),
            priceMinor: amount ? Math.round(Number(amount) * 100) : null,
            currency: 'USD',
            negotiable: data.get('negotiable') === 'on',
            locality: data.get('locality'),
            region: data.get('region'),
            countryCode: 'US',
          }),
        'Draft listing created. Review it under My listings, add photos if desired, then publish.',
      );
      if (saved) form.reset();
    })();
  }

  return (
    <section data-testid="torqueshed-marketplace" style={{ display: 'grid', gap: space.lg }}>
      <div style={{ ...cardStyle, borderColor: '#f59e0b55', background: '#f59e0b0b' }}>
        <h2 style={{ marginTop: 0, color: semantic.text }}>Marketplace</h2>
        <p style={{ color: semantic.textMuted, marginBottom: 0 }}>
          Signed-in organization members can list automotive parts, tools, manuals, fabrication items,
          and wanted/trade items. Prices are informational. Contact stays in-app; payment and
          fulfillment happen off-platform with no escrow, shipping, inspection, title, tax, or
          payment protection from TorqueShed.
        </p>
      </div>
      {!canWrite && <div role="status" data-testid="torqueshed-marketplace-read-only" style={{ ...cardStyle, color: '#fde68a', borderColor: '#fbbf24' }}>You can browse listings and read existing conversations. Saving listings, publishing, messaging sellers, uploading photos, and reporting content require edit access.</div>}
      <Feedback error={error} notice={notice} />
      <div style={{ ...cardStyle, display: 'grid', gap: space.md }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['browse', 'mine', 'favorites'] as const).map((value) => (
            <button
              key={value}
              style={{
                ...button,
                background: scope === value ? '#f59e0b' : semantic.bgPanel,
                color: scope === value ? '#18130a' : semantic.text,
              }}
              onClick={() => setScope(value)}
            >
              {value === 'browse' ? 'Browse' : value === 'mine' ? 'My listings' : 'Saved'}
            </button>
          ))}
          <button
            style={{
              ...button,
              marginLeft: 'auto',
              background: semantic.bgPanel,
              color: semantic.text,
            }}
            onClick={() => void load()}
            disabled={busy === 'load'}
          >
            {busy === 'load' ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
            gap: 8,
          }}
        >
          <label style={label}>
            Search
            <input
              style={input}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="parts, tools, builds..."
            />
          </label>
          <label style={label}>
            Category
            <select
              style={input}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((row) => (
                <option key={row.slug} value={row.slug}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label style={label}>
            Sort
            <select style={input} value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="recent">Most recent</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
          gap: space.md,
        }}
      >
        {listings.map((row) => (
          <article
            key={row.id}
            data-record-id={row.id}
            style={{ ...cardStyle, display: 'grid', gap: 8 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ color: semantic.text }}>{row.title}</strong>
              <span style={{ color: '#f59e0b', fontWeight: 800 }}>
                {money(row.priceMinor, row.currency)}
              </span>
            </div>
            <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
              {row.categoryName ?? row.categorySlug} / {row.condition} / {row.status}
            </div>
            <p style={{ color: semantic.textMuted, margin: 0 }}>
              {row.description.slice(0, 220)}
              {row.description.length > 220 ? '...' : ''}
            </p>
            <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
              {[row.locality, row.region].filter(Boolean).join(', ') || 'Location not provided'} /
              Seller: {row.sellerDisplayName || 'Organization member'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              <button
                style={button}
                onClick={async () => {
                  setBusy('detail');
                  setError('');
                  try {
                    const detail = await moduleShellApi.torqueshed.getMarketplaceListing(row.id);
                    setSelected(detail.listing);
                    setSelectedMedia(detail.media);
                  } catch (next) {
                    setError(errorText(next));
                  } finally {
                    setBusy('');
                  }
                }}
              >
                {canWrite ? 'Details & actions' : 'View details'}
              </button>
              {canWrite && scope !== 'mine' && row.status === 'published' && (
                <button
                  style={{ ...button, background: semantic.bgPanel, color: semantic.text }}
                  onClick={() =>
                    void run(
                      'favorite',
                      () =>
                        moduleShellApi.torqueshed.setMarketplaceFavorite(row.id, !row.favorited),
                      row.favorited ? 'Listing removed from Saved.' : 'Listing saved.',
                    )
                  }
                >
                  {row.favorited ? 'Unsave' : 'Save'}
                </button>
              )}
              {canWrite && scope === 'mine' && row.status === 'draft' && (
                <button
                  style={{ ...button, background: '#16a34a', color: 'white' }}
                  onClick={() =>
                    void run(
                      'publish',
                      () =>
                        moduleShellApi.torqueshed.publishMarketplaceListing(row.id, row.version),
                      'Listing published for 30 days.',
                    )
                  }
                >
                  Publish
                </button>
              )}
              {canWrite && scope === 'mine' && row.status === 'expired' && (
                <button
                  style={{ ...button, background: '#16a34a', color: 'white' }}
                  onClick={() =>
                    void run(
                      'renew',
                      () => moduleShellApi.torqueshed.renewMarketplaceListing(row.id, row.version),
                      'Listing renewed for 30 days.',
                    )
                  }
                >
                  Renew
                </button>
              )}
            </div>
          </article>
        ))}
        {!listings.length && (
          <div style={{ ...cardStyle, color: semantic.textMuted }}>
            No listings match this view.
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          style={{ ...button, background: semantic.bgPanel, color: semantic.text }}
          disabled={page === 0}
          onClick={() => setPage((value) => Math.max(0, value - 1))}
        >
          Previous
        </button>
        <span style={{ color: semantic.textMuted, alignSelf: 'center' }}>Page {page + 1}</span>
        <button
          style={{ ...button, background: semantic.bgPanel, color: semantic.text }}
          disabled={listings.length < 50}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </div>

      {selected && (
        <ListingActions
          listing={selected}
          media={selectedMedia}
          mine={scope === 'mine'}
          busy={busy}
          run={run}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
        />
      )}

      {canWrite && <form onSubmit={create} style={{ ...cardStyle, display: 'grid', gap: space.md }}>
        <h3 style={{ margin: 0, color: semantic.text }}>Create a draft listing</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
            gap: 8,
          }}
        >
          <label style={label}>
            Title
            <input required minLength={4} maxLength={160} name="title" style={input} />
          </label>
          <label style={label}>
            Category
            <select required name="categorySlug" style={input}>
              <option value="">Choose</option>
              {categories.map((row) => (
                <option key={row.slug} value={row.slug}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label style={label}>
            Type
            <select name="type" style={input}>
              <option value="sell">For sale</option>
              <option value="wanted">Wanted</option>
              <option value="trade">Trade</option>
            </select>
          </label>
          <label style={label}>
            Condition
            <select name="condition" style={input}>
              <option value="working">Working</option>
              <option value="new">New</option>
              <option value="excellent">Excellent</option>
              <option value="parts">For parts</option>
            </select>
          </label>
          <label style={label}>
            Price (USD)
            <input name="price" type="number" min="0" step="0.01" style={input} />
          </label>
          <label style={label}>
            Locality (no street address)
            <input name="locality" style={input} />
          </label>
          <label style={label}>
            State / region
            <input name="region" style={input} />
          </label>
        </div>
        <label style={label}>
          Description
          <textarea
            required
            minLength={10}
            maxLength={8000}
            name="description"
            rows={5}
            style={input}
          />
        </label>
        <label style={{ ...label, display: 'flex', alignItems: 'center' }}>
          <input name="negotiable" type="checkbox" /> Price negotiable
        </label>
        <button style={button} disabled={busy === 'create'}>
          {busy === 'create' ? 'Creating...' : 'Create draft'}
        </button>
      </form>}

      <MarketplaceConversations conversations={conversations} refresh={load} canWrite={canWrite} />
    </section>
  );
}

function MarketplaceConversations({
  conversations,
  refresh,
  canWrite,
}: {
  conversations: Array<Record<string, any>>;
  refresh: () => Promise<void>;
  canWrite: boolean;
}) {
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function open(id: string) {
    setBusy(true);
    setError('');
    try {
      setDetail(await moduleShellApi.torqueshed.getMarketplaceConversation(id));
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ ...cardStyle, display: 'grid', gap: 8 }}>
      <h3 style={{ color: semantic.text, margin: 0 }}>In-app conversations</h3>
      {error && (
        <div role="alert" style={{ color: semantic.accentDanger }}>
          {error}
        </div>
      )}
      {conversations.map((row) => (
        <button
          key={String(row.id)}
          type="button"
          style={{ ...button, background: semantic.bgPanel, color: semantic.text }}
          onClick={() => void open(String(row.id))}
        >
          {String(row.listingTitle)} - {String(row.lastMessage ?? 'No message preview')}
        </button>
      ))}
      {!conversations.length && (
        <div style={{ color: semantic.textMuted }}>No marketplace conversations yet.</div>
      )}
      {detail && (
        <div style={{ display: 'grid', gap: 8 }}>
          {(detail.messages as Array<Record<string, any>>).map((message) => (
            <div key={String(message.id)} style={{ ...cardStyle, padding: 10 }}>
              <div style={{ color: semantic.text, whiteSpace: 'pre-wrap' }}>
                {String(message.body)}
              </div>
              <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
                {new Date(String(message.createdAt)).toLocaleString()}
              </div>
            </div>
          ))}
          {canWrite && <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const body = String(new FormData(form).get('body') ?? '');
              setBusy(true);
              setError('');
              void moduleShellApi.torqueshed
                .sendMarketplaceMessage(String(detail.conversation.id), body)
                .then(async () => {
                  form.reset();
                  await open(String(detail.conversation.id));
                  await refresh();
                })
                .catch((next) => setError(errorText(next)))
                .finally(() => setBusy(false));
            }}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          >
            <input required name="body" maxLength={5000} style={{ ...input, flex: 1 }} />
            <button style={button} disabled={busy}>
              Send reply
            </button>
          </form>}
        </div>
      )}
    </div>
  );
}

function ListingActions({
  listing,
  media,
  mine,
  busy,
  run,
  canWrite,
  onClose,
}: {
  listing: TorqueShedMarketplaceListing;
  media: Array<Record<string, any>>;
  mine: boolean;
  busy: string;
  run: (name: string, operation: () => Promise<unknown>, success: string) => Promise<boolean>;
  canWrite: boolean;
  onClose: () => void;
}) {
  return (
    <div
      data-testid="torqueshed-marketplace-listing-actions"
      data-record-id={listing.id}
      style={{ ...cardStyle, display: 'grid', gap: space.md, borderColor: '#f59e0b66' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, color: semantic.text }}>{listing.title}</h3>
        <button
          type="button"
          style={{ ...button, background: semantic.bgPanel, color: semantic.text }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      {media.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {media.map((item) =>
            (item.scan_status ?? item.scanStatus) === 'clean' ? (
              <img
                key={String(item.id)}
                src={`/api/modules/torqueshed/social/media/marketplace_listing/${encodeURIComponent(listing.id)}/${encodeURIComponent(String(item.id))}/content`}
                alt={String(item.original_name ?? item.originalName ?? 'Listing photo')}
                style={{ width: 160, height: 120, objectFit: 'cover', borderRadius: radius.sm }}
              />
            ) : (
              <span key={String(item.id)} style={{ color: semantic.textMuted }}>
                Image scan: {String(item.scan_status ?? item.scanStatus)}
              </span>
            ),
          )}
        </div>
      )}
      {canWrite && (mine ? (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const file = new FormData(event.currentTarget).get('photo');
              if (!(file instanceof File) || !file.size) return;
              void run(
                'photo',
                async () =>
                  moduleShellApi.torqueshed.uploadSocialMedia(
                    'marketplace_listing',
                    listing.id,
                    await imagePayload(file),
                  ),
                'Photo uploaded and queued for security scanning.',
              );
            }}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}
          >
            <label style={label}>
              Add photo
              <input
                required
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={input}
              />
            </label>
            <button style={button} disabled={busy === 'photo'}>
              Upload
            </button>
          </form>
          {listing.status === 'published' && (
            <button
              style={{ ...button, background: '#16a34a', color: 'white' }}
              onClick={() =>
                void run(
                  'sold',
                  () =>
                    moduleShellApi.torqueshed.setMarketplaceListingStatus(
                      listing.id,
                      'sold',
                      listing.version,
                    ),
                  'Listing marked sold.',
                )
              }
            >
              Mark sold
            </button>
          )}
          {['draft', 'published', 'expired'].includes(listing.status) && (
            <button
              style={{ ...button, background: semantic.accentDanger, color: 'white' }}
              onClick={() =>
                void run(
                  'archive',
                  () =>
                    moduleShellApi.torqueshed.setMarketplaceListingStatus(
                      listing.id,
                      'archived',
                      listing.version,
                    ),
                  'Listing archived.',
                )
              }
            >
              Archive
            </button>
          )}
        </>
      ) : (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const body = String(new FormData(event.currentTarget).get('body') ?? '');
              void run(
                'contact',
                () => moduleShellApi.torqueshed.contactMarketplaceSeller(listing.id, body),
                'Message sent through TorqueShed.',
              );
            }}
            style={{ display: 'grid', gap: 8 }}
          >
            <label style={label}>
              Contact seller
              <textarea
                required
                minLength={1}
                maxLength={5000}
                name="body"
                rows={3}
                style={input}
              />
            </label>
            <button type="submit" style={button}>Send in-app message</button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run(
                'report',
                () =>
                  moduleShellApi.torqueshed.reportMarketplaceListing(listing.id, {
                    reasonCode: data.get('reasonCode'),
                    details: data.get('details'),
                  }),
                'Report submitted to the organization’s moderators.',
              );
            }}
            style={{ display: 'grid', gap: 8 }}
          >
            <label style={label}>
              Report reason
              <select name="reasonCode" style={input}>
                <option value="spam">Spam</option>
                <option value="fraud">Fraud</option>
                <option value="prohibited_item">Prohibited item</option>
                <option value="privacy">Privacy</option>
                <option value="unsafe">Unsafe</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label style={label}>
              Details
              <textarea name="details" rows={2} style={input} />
            </label>
            <button type="submit" style={{ ...button, background: semantic.bgPanel, color: semantic.text }}>
              Submit report
            </button>
          </form>
        </>
      ))}
    </div>
  );
}

export function TorqueShedCommunityPanel({ canWrite, canManage }: { canWrite: boolean; canManage: boolean }) {
  const [posts, setPosts] = useState<TorqueShedCommunityPost[]>([]);
  const [topics, setTopics] = useState<Array<{ slug: string; name: string }>>([]);
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [viewerUserId, setViewerUserId] = useState('');
  const [preferences, setPreferences] = useState<Record<string, any>>({});
  const [moderationReports, setModerationReports] = useState<Array<Record<string, any>>>([]);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [scope, setScope] = useState<'feed' | 'following' | 'mine'>('feed');
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy('load');
    setError('');
    try {
      const query = new URLSearchParams({ limit: '50', offset: String(page * 50) });
      if (scope !== 'feed') query.set('scope', scope);
      if (search.trim()) query.set('search', search.trim());
      if (topic) query.set('topic', topic);
      const settled = await Promise.allSettled([
        moduleShellApi.torqueshed.listCommunityPosts(query.toString()),
        moduleShellApi.torqueshed.listCommunityTopics(),
        moduleShellApi.torqueshed.getCommunityProfile(),
      ] as const);
      if (settled[0].status === 'fulfilled') setPosts(settled[0].value.posts);
      if (settled[1].status === 'fulfilled') setTopics(settled[1].value.topics);
      if (settled[2].status === 'fulfilled') {
        setProfile(settled[2].value.profile);
        setViewerUserId(settled[2].value.viewerUserId);
        setPreferences(settled[2].value.preferences);
      }
      const failure = settled.find((entry) => entry.status === 'rejected');
      if (failure?.status === 'rejected') setError(errorText(failure.reason));
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }, [page, scope, search, topic]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const match = window.location.pathname.match(/\/community\/([0-9a-f-]{36})\/?$/i);
    if (!match?.[1]) return;
    void moduleShellApi.torqueshed
      .getCommunityPost(match[1])
      .then(setDetail)
      .catch((next) => setError(errorText(next)));
  }, []);
  async function run(
    name: string,
    operation: () => Promise<unknown>,
    success: string,
    refreshDetail?: string,
  ) {
    if (!canWrite) return false;
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await operation();
      setNotice(success);
      await load();
      if (refreshDetail) setDetail(await moduleShellApi.torqueshed.getCommunityPost(refreshDetail));
      return true;
    } catch (next) {
      setError(errorText(next));
      return false;
    } finally {
      setBusy('');
    }
  }

  async function loadModeration() {
    if (!canManage) return;
    setBusy('moderation');
    setError('');
    try {
      const result = await moduleShellApi.torqueshed.listModerationReports('open');
      setModerationReports(result.reports);
      setNotice('Open moderation queue loaded.');
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  return (
    <section data-testid="torqueshed-community" style={{ display: 'grid', gap: space.lg }}>
      <div style={{ ...cardStyle, borderColor: '#f59e0b55', background: '#f59e0b0b' }}>
        <h2 style={{ marginTop: 0, color: semantic.text }}>Community</h2>
        <p style={{ color: semantic.textMuted, marginBottom: 0 }}>
          Share automotive knowledge with signed-in members of this organization. "Organization" means
          visible to those members, never published anonymously on the internet. Keep exact addresses, VINs,
          private diagnostics, credentials, and personal contact details out of posts.
        </p>
      </div>
      {!canWrite && <div role="status" data-testid="torqueshed-community-read-only" style={{ ...cardStyle, color: '#fde68a', borderColor: '#fbbf24' }}>You can read organization discussions and profiles. Posting, reacting, following, commenting, reporting, messaging, and profile changes require edit access.</div>}
      <Feedback error={error} notice={notice} />
      <div style={{ ...cardStyle, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['feed', 'following', 'mine'] as const).map((value) => (
            <button
              key={value}
              style={{
                ...button,
                background: scope === value ? '#f59e0b' : semantic.bgPanel,
                color: scope === value ? '#18130a' : semantic.text,
              }}
              onClick={() => setScope(value)}
            >
              {value === 'feed'
                ? 'Community feed'
                : value === 'following'
                  ? 'Following'
                  : 'My posts'}
            </button>
          ))}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
            gap: 8,
          }}
        >
          <label style={label}>
            Search
            <input
              style={input}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label style={label}>
            Topic
            <select style={input} value={topic} onChange={(event) => setTopic(event.target.value)}>
              <option value="">All topics</option>
              {topics.map((row) => (
                <option key={row.slug} value={row.slug}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
          gap: space.md,
        }}
      >
        {posts.map((post) => (
          <article
            key={post.id}
            data-record-id={post.id}
            style={{ ...cardStyle, display: 'grid', gap: 8 }}
          >
            <div style={{ color: '#f59e0b', fontSize: fontSize.sm, fontWeight: 800 }}>
              {post.topicName ?? post.topicSlug} / {post.visibility} / {post.status}
            </div>
            <strong style={{ color: semantic.text }}>{post.title}</strong>
            <p style={{ color: semantic.textMuted, margin: 0 }}>
              {post.body.slice(0, 240)}
              {post.body.length > 240 ? '...' : ''}
            </p>
            <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
              {post.authorDisplayName || 'Organization member'} / {post.commentCount ?? 0} comments /{' '}
              {post.reactionCount ?? 0} reactions
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <button
                style={button}
                onClick={async () => {
                  setBusy('detail');
                  try {
                    setDetail(await moduleShellApi.torqueshed.getCommunityPost(post.id));
                  } catch (next) {
                    setError(errorText(next));
                  } finally {
                    setBusy('');
                  }
                }}
              >
                Open discussion
              </button>
              {canWrite && scope === 'mine' && post.status === 'draft' && (
                <button
                  style={{ ...button, background: '#16a34a', color: 'white' }}
                  onClick={() =>
                    void run(
                      'publish',
                      () => moduleShellApi.torqueshed.publishCommunityPost(post.id, post.version),
                      'Post published.',
                    )
                  }
                >
                  Publish
                </button>
              )}
            </div>
          </article>
        ))}
        {!posts.length && (
          <div style={{ ...cardStyle, color: semantic.textMuted }}>No posts match this view.</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          style={{ ...button, background: semantic.bgPanel, color: semantic.text }}
          disabled={page === 0}
          onClick={() => setPage((value) => Math.max(0, value - 1))}
        >
          Previous
        </button>
        <span style={{ color: semantic.textMuted, alignSelf: 'center' }}>Page {page + 1}</span>
        <button
          style={{ ...button, background: semantic.bgPanel, color: semantic.text }}
          disabled={posts.length < 50}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </div>
      {detail && (
        <CommunityDiscussion
          detail={detail}
          mine={String(detail.post.authorUserId) === viewerUserId}
          busy={busy}
          run={run}
          canWrite={canWrite}
          close={() => setDetail(null)}
        />
      )}
      {canWrite && <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          void (async () => {
            const saved = await run(
              'create',
              () =>
                moduleShellApi.torqueshed.createCommunityPost({
                  title: data.get('title'),
                  body: data.get('body'),
                  topicSlug: data.get('topicSlug'),
                  visibility: data.get('visibility'),
                  tags: String(data.get('tags') ?? '')
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                }),
              'Draft post created. Review it under My posts, add media if desired, then publish.',
            );
            if (saved) form.reset();
          })();
        }}
        style={{ ...cardStyle, display: 'grid', gap: 8 }}
      >
        <h3 style={{ margin: 0, color: semantic.text }}>Create a draft post</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
            gap: 8,
          }}
        >
          <label style={label}>
            Title
            <input required minLength={4} maxLength={180} name="title" style={input} />
          </label>
          <label style={label}>
            Topic
            <select name="topicSlug" style={input}>
              {topics.map((row) => (
                <option key={row.slug} value={row.slug}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label style={label}>
            Visibility
            <select name="visibility" style={input}>
              <option value="public">Organization members</option>
              <option value="followers">Followers</option>
              <option value="private">Private draft/view</option>
            </select>
          </label>
          <label style={label}>
            Tags (comma separated)
            <input name="tags" style={input} />
          </label>
        </div>
        <label style={label}>
          Post
          <textarea required minLength={2} maxLength={20000} name="body" rows={6} style={input} />
        </label>
        <button type="submit" style={button}>Create draft</button>
      </form>}
      {canWrite && <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          void run(
            'profile',
            () =>
              moduleShellApi.torqueshed.saveCommunityProfile({
                displayName: data.get('displayName'),
                bio: data.get('bio'),
                specialties: data.get('specialties'),
                locality: data.get('locality'),
                region: data.get('region'),
                countryCode: 'US',
                visibility: data.get('visibility'),
              }),
            'Community profile saved.',
          );
        }}
        style={{ ...cardStyle, display: 'grid', gap: 8 }}
      >
        <h3 style={{ margin: 0, color: semantic.text }}>Community profile</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
            gap: 8,
          }}
        >
          <label style={label}>
            Display name
            <input
              required
              name="displayName"
              defaultValue={profile?.displayName ?? ''}
              style={input}
            />
          </label>
          <label style={label}>
            Specialties
            <input name="specialties" defaultValue={profile?.specialties ?? ''} style={input} />
          </label>
          <label style={label}>
            Locality (no street address)
            <input name="locality" defaultValue={profile?.locality ?? ''} style={input} />
          </label>
          <label style={label}>
            State / region
            <input name="region" defaultValue={profile?.region ?? ''} style={input} />
          </label>
          <label style={label}>
            Visibility
            <select name="visibility" defaultValue={profile?.visibility ?? 'tenant'} style={input}>
              <option value="tenant">Organization members</option>
              <option value="private">Private</option>
            </select>
          </label>
        </div>
        <label style={label}>
          Bio
          <textarea name="bio" defaultValue={profile?.bio ?? ''} rows={3} style={input} />
        </label>
        <button type="submit" style={button}>Save profile</button>
      </form>}
      {canWrite && <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void run(
            'preferences',
            () =>
              moduleShellApi.torqueshed.saveCommunityPreferences({
                messagesEnabled: data.get('messages') === 'on',
                commentsEnabled: data.get('comments') === 'on',
                reactionsEnabled: data.get('reactions') === 'on',
                followsEnabled: data.get('follows') === 'on',
                moderationEnabled: data.get('moderation') === 'on',
              }),
            'Notification preferences saved.',
          );
        }}
        style={{ ...cardStyle, display: 'grid', gap: 8 }}
      >
        <h3 style={{ margin: 0, color: semantic.text }}>Notification preferences</h3>
        {[
          ['messages', 'messagesEnabled', 'Marketplace messages'],
          ['comments', 'commentsEnabled', 'Comments'],
          ['reactions', 'reactionsEnabled', 'Reactions'],
          ['follows', 'followsEnabled', 'New followers'],
          ['moderation', 'moderationEnabled', 'Moderation updates'],
        ].map(([name, key, text]) => (
          <label key={name} style={{ color: semantic.textMuted }}>
            <input
              type="checkbox"
              name={name}
              defaultChecked={preferences[key] ?? key !== 'reactionsEnabled'}
            />{' '}
            {text}
          </label>
        ))}
        <button type="submit" style={button}>Save preferences</button>
      </form>}
      {canManage && <div style={{ ...cardStyle, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, color: semantic.text }}>Organization moderation</h3>
            <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
              Available to organization owners, administrators, and TorqueShed managers.
            </div>
          </div>
          <button
            style={button}
            onClick={() => void loadModeration()}
            disabled={busy === 'moderation'}
          >
            Load open reports
          </button>
        </div>
        {moderationReports.map((report) => (
          <form
            key={String(report.id)}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void (async () => {
                const saved = await run(
                  'moderate',
                  () =>
                    moduleShellApi.torqueshed.moderateSocialReport(String(report.id), {
                      action: data.get('action'),
                      reason: data.get('reason'),
                    }),
                  'Moderation action recorded in the append-only log.',
                );
                if (saved) await loadModeration();
              })();
            }}
            style={{ ...cardStyle, padding: 12, display: 'grid', gap: 8 }}
          >
            <div style={{ color: semantic.text }}>
              {String(report.targetType)} - {String(report.reasonCode)}
            </div>
            <div style={{ color: semantic.textMuted }}>
              {String(report.details ?? 'No details')}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select name="action" style={input}>
                <option value="hide">Hide</option>
                <option value="remove">Remove</option>
                <option value="restore">Restore</option>
                <option value="warn">Warn / resolve</option>
                <option value="dismiss">Dismiss</option>
              </select>
              <input
                required
                minLength={4}
                name="reason"
                placeholder="Moderation reason"
                style={input}
              />
              <button type="submit" style={button}>Record action</button>
            </div>
          </form>
        ))}
      </div>}
    </section>
  );
}

function CommunityDiscussion({
  detail,
  mine,
  busy,
  run,
  canWrite,
  close,
}: {
  detail: Record<string, any>;
  mine: boolean;
  busy: string;
  run: (
    name: string,
    operation: () => Promise<unknown>,
    success: string,
    refreshDetail?: string,
  ) => Promise<boolean>;
  canWrite: boolean;
  close: () => void;
}) {
  const post = detail.post as TorqueShedCommunityPost;
  const comments = detail.comments as Array<Record<string, any>>;
  return (
    <div
      data-testid="torqueshed-community-discussion"
      data-record-id={post.id}
      style={{ ...cardStyle, display: 'grid', gap: space.md, borderColor: '#f59e0b66' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, color: semantic.text }}>{post.title}</h3>
          <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
            {(detail.tags as Array<Record<string, any>>).map((tag) => `#${tag.name}`).join(' ')}
          </div>
        </div>
        <button
          style={{ ...button, background: semantic.bgPanel, color: semantic.text }}
          onClick={close}
        >
          Close
        </button>
      </div>
      <p style={{ color: semantic.text, whiteSpace: 'pre-wrap' }}>{post.body}</p>
      {(detail.media as Array<Record<string, any>>).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(detail.media as Array<Record<string, any>>).map((item) =>
            (item.scan_status ?? item.scanStatus) === 'clean' ? (
              <img
                key={String(item.id)}
                src={`/api/modules/torqueshed/social/media/community_post/${encodeURIComponent(post.id)}/${encodeURIComponent(String(item.id))}/content`}
                alt={String(item.original_name ?? item.originalName ?? 'Community image')}
                style={{ width: 180, height: 135, objectFit: 'cover', borderRadius: radius.sm }}
              />
            ) : (
              <span key={String(item.id)} style={{ color: semantic.textMuted }}>
                Image scan: {String(item.scan_status ?? item.scanStatus)}
              </span>
            ),
          )}
        </div>
      )}
      {canWrite && !mine && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            style={{ ...button, background: semantic.bgPanel, color: semantic.text }}
            onClick={() =>
              void run(
                'follow',
                () => moduleShellApi.torqueshed.setCommunityFollow(post.authorUserId, true),
                'Community member followed.',
                post.id,
              )
            }
          >
            Follow author
          </button>
          <button
            style={{ ...button, background: semantic.accentDanger, color: 'white' }}
            onClick={() =>
              void run(
                'block',
                () => moduleShellApi.torqueshed.setCommunityBlock(post.authorUserId, true),
                'Community member blocked. Their content and interactions are now hidden.',
              )
            }
          >
            Block author
          </button>
        </div>
      )}
      {canWrite && <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {(['like', 'helpful', 'insightful'] as const).map((reaction) => (
          <button
            key={reaction}
            style={{
              ...button,
              background: post.viewerReaction === reaction ? '#f59e0b' : semantic.bgPanel,
              color: post.viewerReaction === reaction ? '#18130a' : semantic.text,
            }}
            onClick={() =>
              void run(
                'reaction',
                () => moduleShellApi.torqueshed.setCommunityPostReaction(post.id, reaction),
                `Marked ${reaction}.`,
                post.id,
              )
            }
          >
            {reaction}
          </button>
        ))}
      </div>}
      {canWrite && mine && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const file = new FormData(event.currentTarget).get('photo');
            if (!(file instanceof File) || !file.size) return;
            void run(
              'photo',
              async () =>
                moduleShellApi.torqueshed.uploadSocialMedia(
                  'community_post',
                  post.id,
                  await imagePayload(file),
                ),
              'Image uploaded and queued for security scanning.',
              post.id,
            );
          }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}
        >
          <label style={label}>
            Add image
            <input
              required
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={input}
            />
          </label>
          <button style={button} disabled={busy === 'photo'}>
            Upload
          </button>
        </form>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {comments.map((comment) => (
          <article key={comment.id} style={{ ...cardStyle, padding: 12 }}>
            <strong style={{ color: semantic.text }}>
              {comment.authorDisplayName || 'Organization member'}
            </strong>
            <p style={{ color: semantic.textMuted, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
              {comment.body}
            </p>
            {canWrite && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {(['like', 'helpful', 'insightful'] as const).map((reaction) => (
                <button
                  key={reaction}
                  style={{
                    ...button,
                    padding: '6px 8px',
                    background: semantic.bgPanel,
                    color: semantic.text,
                  }}
                  onClick={() =>
                    void run(
                      'comment-reaction',
                      () =>
                        moduleShellApi.torqueshed.setCommunityCommentReaction(
                          String(comment.id),
                          reaction,
                        ),
                      `Comment marked ${reaction}.`,
                      post.id,
                    )
                  }
                >
                  {reaction}
                </button>
              ))}
              <button
                style={{
                  ...button,
                  padding: '6px 8px',
                  background: semantic.bgPanel,
                  color: semantic.text,
                }}
                onClick={() =>
                  void run(
                    'comment-report',
                    () =>
                      moduleShellApi.torqueshed.reportCommunityComment(String(comment.id), {
                        reasonCode: 'other',
                        details: 'Submitted from the community discussion.',
                      }),
                    'Comment report submitted to the organization’s moderators.',
                    post.id,
                  )
                }
              >
                Report
              </button>
            </div>}
          </article>
        ))}
        {!comments.length && <div style={{ color: semantic.textMuted }}>No comments yet.</div>}
      </div>
      {canWrite && post.status === 'published' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const body = String(new FormData(form).get('body') ?? '');
            void (async () => {
              const saved = await run(
                'comment',
                () => moduleShellApi.torqueshed.addCommunityComment(post.id, { body }),
                'Comment added.',
                post.id,
              );
              if (saved) form.reset();
            })();
          }}
          style={{ display: 'grid', gap: 8 }}
        >
          <label style={label}>
            Add comment
            <textarea required name="body" rows={3} style={input} />
          </label>
          <button type="submit" style={button}>Comment</button>
        </form>
      )}{' '}
      {canWrite && !mine && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void run(
              'report',
              () =>
                moduleShellApi.torqueshed.reportCommunityPost(post.id, {
                  reasonCode: data.get('reasonCode'),
                  details: data.get('details'),
                }),
              'Report submitted to the organization’s moderators.',
            );
          }}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          <select name="reasonCode" style={input}>
            <option value="spam">Spam</option>
            <option value="harassment">Harassment</option>
            <option value="privacy">Privacy</option>
            <option value="unsafe">Unsafe</option>
            <option value="other">Other</option>
          </select>
          <input name="details" placeholder="Report details" style={input} />
          <button type="submit" style={{ ...button, background: semantic.bgPanel, color: semantic.text }}>
            Report post
          </button>
        </form>
      )}
    </div>
  );
}

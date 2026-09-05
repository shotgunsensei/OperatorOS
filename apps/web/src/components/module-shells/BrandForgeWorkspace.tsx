'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, CalendarDays, Copy, Download, LayoutDashboard, Megaphone, Palette, Plus, Settings, Sparkles, Trash2, Users, Gift, LayoutTemplate, PlugZap, FileText, Activity, ShieldCheck } from 'lucide-react';
import { moduleShellApi, type BrandForgeBrand, type BrandForgeCalendarItem, type BrandForgeCampaign, type BrandForgeCopyAsset, type BrandForgeGeneration, type BrandForgePersona } from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import { ShellWorkspaceBadge } from './ShellChrome';
import { BrandForgeCompletePanel, type BrandForgeCompleteTab } from './BrandForgeCompletePanels';
import CoreSuiteWorkdayBrief from './CoreSuiteWorkdayBrief';
import { buildBrandForgeWorkflowFocus } from '@/lib/companion-workflow';
import BrandSvgConceptExporter from './BrandSvgConceptExporter';
import OutcomeWorkflowAction from './OutcomeWorkflowAction';

type Tab = 'dashboard' | 'brands' | 'personas' | 'offers' | 'campaigns' | 'copy-studio' | 'calendar' | 'analytics' | 'ai-workflows' | 'strategy' | 'templates' | 'integrations' | 'reports' | 'activity' | 'admin' | 'settings';
const tabs: Array<{ id: Tab; label: string; Icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'brands', label: 'Brand Kits', Icon: Palette },
  { id: 'personas', label: 'Personas', Icon: Users },
  { id: 'offers', label: 'Offers', Icon: Gift },
  { id: 'campaigns', label: 'Campaigns', Icon: Megaphone },
  { id: 'copy-studio', label: 'Copy Studio', Icon: Copy },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
  { id: 'ai-workflows', label: 'AI Workflows', Icon: Sparkles },
  { id: 'strategy', label: 'Guided Strategy', Icon: Sparkles },
  { id: 'templates', label: 'Templates', Icon: LayoutTemplate },
  { id: 'integrations', label: 'Integrations', Icon: PlugZap },
  { id: 'reports', label: 'Reports', Icon: FileText },
  { id: 'activity', label: 'Activity', Icon: Activity },
  { id: 'admin', label: 'Plan & Security', Icon: ShieldCheck },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${semantic.border}`,
  background: semantic.bgPanel,
  color: semantic.text,
  borderRadius: radius.sm,
  padding: '10px 12px',
  font: 'inherit',
  boxSizing: 'border-box',
};
const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: radius.sm,
  background: 'linear-gradient(135deg,#a855f7,#ec4899)',
  color: '#fff',
  fontWeight: 700,
  padding: '10px 15px',
  cursor: 'pointer',
};
const subtleButton: React.CSSProperties = {
  ...buttonStyle,
  background: semantic.bgPanel,
  color: semantic.text,
  border: `1px solid ${semantic.border}`,
};

function errorText(error: any) {
  return error?.error || error?.message || 'BrandForgeOS request failed';
}

function isMeaningfulCampaignBrief(value: string | null | undefined) {
  const text = value?.trim() || '';
  return text.length >= 3 && !/^(?:n\/?a|none|tbd|unknown|later|not sure)$/iu.test(text);
}

function uniqueKey(prefix: string) {
  return `${prefix}:${Date.now()}:${crypto.randomUUID()}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function campaignRoute(path?: string): { requested: boolean; id: string | null } {
  const raw = path || '';
  if (/^[a-z][a-z0-9+.-]*:/iu.test(raw) || raw.startsWith('//') || /[\u0000-\u001f\u007f]/u.test(raw)) {
    return { requested: false, id: null };
  }
  const clean = raw.split(/[?#]/u, 1)[0].replace(/^\/modules\/brandforgeos\/?/u, '/');
  const segments = clean.split('/').filter(Boolean);
  if (segments[0] !== 'campaigns') return { requested: false, id: null };
  if (segments.length === 1) return { requested: false, id: null };
  const candidate = segments.length === 2 ? segments[1] : '';
  return { requested: true, id: UUID_PATTERN.test(candidate) ? candidate : null };
}

async function getCampaignById(id: string, tenantKey?: string): Promise<BrandForgeCampaign> {
  const response = await fetch(`/api/modules/brandforgeos/campaigns/${encodeURIComponent(id)}`, {
    credentials: 'include',
    headers: tenantKey ? { 'X-Tenant-Id': tenantKey } : undefined,
  });
  const body = await response.json().catch(() => ({ error: 'The requested campaign could not be loaded.' }));
  if (!response.ok) throw { status: response.status, ...body };
  return body as BrandForgeCampaign;
}

function tabFromRoute(routePath?: string): Tab {
  const root = (routePath || '/').split('/').filter(Boolean)[0] || 'dashboard';
  const aliases: Record<string, Tab> = { content:'copy-studio', assets:'copy-studio', approvals:'campaigns', onboarding:'settings', pricing:'admin', legal:'admin', privacy:'admin', terms:'admin', activity:'activity', home:'dashboard', login:'dashboard', reports:'reports', integrations:'integrations', 'ai-workflows':'ai-workflows', analytics:'analytics', calendar:'calendar', brands:'brands', campaigns:'campaigns' };
  return aliases[root] ?? (tabs.some(item => item.id === root) ? root as Tab : 'dashboard');
}

export default function BrandForgeWorkspace({ routePath, tenantKey, embedded = false, hrefFor = path => path, canWrite = false, canAdmin = false }: { routePath?: string; tenantKey?: string; embedded?: boolean; hrefFor?: (path: string) => string; canWrite?: boolean; canAdmin?: boolean }) {
  const router = useRouter();
  const requestedCampaign = useMemo(() => campaignRoute(routePath), [routePath]);
  const [tab, setTab] = useState<Tab>(() => tabFromRoute(routePath));
  const [dashboard, setDashboard] = useState<any>(null);
  const [brands, setBrands] = useState<BrandForgeBrand[]>([]);
  const [personas, setPersonas] = useState<BrandForgePersona[]>([]);
  const [campaigns, setCampaigns] = useState<BrandForgeCampaign[]>([]);
  const [copyAssets, setCopyAssets] = useState<BrandForgeCopyAsset[]>([]);
  const [calendar, setCalendar] = useState<BrandForgeCalendarItem[]>([]);
  const [generations, setGenerations] = useState<BrandForgeGeneration[]>([]);
  const [provider, setProvider] = useState<{ name: string; configured: boolean }>({
    name: 'disabled',
    configured: false,
  });
  const [workspace, setWorkspace] = useState<any>({
    completed: false,
    profile: { goals: [], channels: [] },
    version: 0,
  });
  const [completeData, setCompleteData] = useState<Record<string, any>>({});
  const [calendarMonth, setCalendarMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'dashboard') {
        const [dash, campaignRows, calendarRows] = await Promise.all([moduleShellApi.brandforgeos.dashboard(), moduleShellApi.brandforgeos.listCampaigns(), moduleShellApi.brandforgeos.listCalendar()]);
        setDashboard(dash); setCampaigns(campaignRows.campaigns); setCalendar(calendarRows.calendarItems);
      } else if (tab === 'brands') {
        setBrands((await moduleShellApi.brandforgeos.listBrands()).brands);
      } else if (tab === 'personas') {
        setPersonas((await moduleShellApi.brandforgeos.listPersonas()).personas);
      } else if (tab === 'campaigns') {
        if (requestedCampaign.requested && !requestedCampaign.id) {
          throw new Error('This campaign link is invalid. Open Campaigns and choose a saved campaign.');
        }
        const [campaignRows, brandRows, personaRows, exactCampaign] = await Promise.all([
          moduleShellApi.brandforgeos.listCampaigns(),
          moduleShellApi.brandforgeos.listBrands(),
          moduleShellApi.brandforgeos.listPersonas(),
          requestedCampaign.id ? getCampaignById(requestedCampaign.id, tenantKey) : Promise.resolve(null),
        ]);
        setCampaigns(exactCampaign && !campaignRows.campaigns.some(item => item.id === exactCampaign.id)
          ? [exactCampaign, ...campaignRows.campaigns]
          : campaignRows.campaigns);
        setBrands(brandRows.brands); setPersonas(personaRows.personas);
      } else if (tab === 'copy-studio') {
        const [copyRows, brandRows, campaignRows, generationRows] = await Promise.all([moduleShellApi.brandforgeos.listCopyAssets(), moduleShellApi.brandforgeos.listBrands(), moduleShellApi.brandforgeos.listCampaigns(), moduleShellApi.brandforgeos.listGenerations()]);
        setCopyAssets(copyRows.copyAssets); setBrands(brandRows.brands); setCampaigns(campaignRows.campaigns); setGenerations(generationRows.generations); setProvider(generationRows.provider);
      } else if (tab === 'calendar') {
        const [calendarRows, brandRows, campaignRows, copyRows] = await Promise.all([moduleShellApi.brandforgeos.listCalendar(), moduleShellApi.brandforgeos.listBrands(), moduleShellApi.brandforgeos.listCampaigns(), moduleShellApi.brandforgeos.listCopyAssets()]);
        setCalendar(calendarRows.calendarItems); setBrands(brandRows.brands); setCampaigns(campaignRows.campaigns); setCopyAssets(copyRows.copyAssets);
      } else if (tab === 'analytics') {
        const [dash, campaignRows, recommendationRows] = await Promise.all([moduleShellApi.brandforgeos.dashboard(), moduleShellApi.brandforgeos.listCampaigns(), moduleShellApi.brandforgeos.listRecommendations()]);
        setDashboard(dash); setCampaigns(campaignRows.campaigns); setCompleteData(current => ({ ...current, recommendations: recommendationRows.recommendations }));
      } else if (tab === 'ai-workflows') {
        const [generationRows, brandRows, campaignRows, contract] = await Promise.all([moduleShellApi.brandforgeos.listGenerations(), moduleShellApi.brandforgeos.listBrands(), moduleShellApi.brandforgeos.listCampaigns(), moduleShellApi.brandforgeos.productContract()]);
        setGenerations(generationRows.generations); setProvider(generationRows.provider); setBrands(brandRows.brands); setCampaigns(campaignRows.campaigns); setCompleteData(current => ({ ...current, contract }));
      } else if (tab === 'settings') {
        setWorkspace(await moduleShellApi.brandforgeos.workspace());
      } else {
        const contract = await moduleShellApi.brandforgeos.productContract();
        if (tab === 'offers') {
          const [product, rows, recommendations] = await Promise.all([moduleShellApi.brandforgeos.productOverview(), moduleShellApi.brandforgeos.listOffers(), moduleShellApi.brandforgeos.listRecommendations()]);
          setCompleteData({ contract, product, offers: rows.offers, recommendations: recommendations.recommendations });
        } else if (tab === 'strategy') {
          const [product, workflows, recommendations, leads] = await Promise.all([moduleShellApi.brandforgeos.productOverview(), moduleShellApi.brandforgeos.listWorkflows(), moduleShellApi.brandforgeos.listRecommendations(), moduleShellApi.brandforgeos.listLeads()]);
          setCompleteData({ contract, product, workflows: workflows.workflows, recommendations: recommendations.recommendations, leads: leads.leads });
        } else if (tab === 'templates') {
          const rows = await moduleShellApi.brandforgeos.listTemplates(); setCompleteData({ contract, templates: rows.templates });
        } else if (tab === 'integrations') {
          const rows = await moduleShellApi.brandforgeos.listIntegrations(); setCompleteData({ contract, integrations: rows.integrations, providerConfigurations: rows.providerConfigurations });
        } else if (tab === 'reports') {
          const [reports, exports] = await Promise.all([moduleShellApi.brandforgeos.listReports(), moduleShellApi.brandforgeos.listExports()]); setCompleteData({ contract, reports: reports.reports, exports: exports.exports });
        } else if (tab === 'activity') {
          const [activity, notifications] = await Promise.all([moduleShellApi.brandforgeos.activity(), moduleShellApi.brandforgeos.notifications()]); setCompleteData({ contract, activity: activity.activity, notifications: notifications.notifications });
        } else if (tab === 'admin') {
          const plan = await moduleShellApi.brandforgeos.planUsage(); setCompleteData({ contract, plan });
        }
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [requestedCampaign.id, requestedCampaign.requested, tab, tenantKey]);

  useEffect(() => { setTab(tabFromRoute(routePath)); }, [routePath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sync = () => {
      const path = window.location.pathname.replace(/\/+$/, '');
      const candidate = path.split('/').filter(Boolean).at(-1) as Tab | undefined;
      const aliases: Record<string, Tab> = {
        onboarding: 'settings',
        pricing: 'admin',
        legal: 'admin',
        privacy: 'admin',
        terms: 'admin',
        home: 'dashboard',
        login: 'dashboard',
      };
      const resolved = candidate && aliases[candidate] ? aliases[candidate] : candidate;
      if (resolved && tabs.some((item) => item.id === resolved)) setTab(resolved);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [routePath]);

  const navigate = (next: Tab) => {
    setTab(next);
    router.push(hrefFor(next === 'dashboard' ? '/' : `/${next}`));
  };

  const openCampaign = useCallback((id: string) => {
    router.push(hrefFor(`/campaigns/${encodeURIComponent(id)}`));
  }, [hrefFor, router]);

  async function mutate(task: () => Promise<unknown>) {
    if (!canWrite) {
      setError('Your BrandForgeOS access is read-only. Ask an organization owner or administrator for edit access.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await task();
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      id="brandforgeos-workspace"
      data-testid="brandforgeos-workspace"
      data-evidence="persisted_records_only"
      tabIndex={-1}
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 80% 0%,rgba(168,85,247,.14),transparent 35%),#09070f',
        color: semantic.text,
        padding: `0 ${space.xxl}px ${space.xxl}px`,
      }}
    >
      {!embedded && <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: space.lg,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          padding: `${space.xl}px 0`,
        }}
      >
        <div>
          <div
            style={{
              color: '#d946ef',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            Creative campaign operating system
          </div>
          <h1 style={{ margin: '6px 0', fontSize: 30 }}>BrandForgeOS</h1>
          <p style={{ margin: 0, color: semantic.textMuted, maxWidth: 760 }}>Build reusable brand systems, campaigns, copy, content calendars, and measurable creative performance in one workspace.</p>
        </div>
        <ShellWorkspaceBadge />
      </header>}

      {!embedded && <nav aria-label="BrandForgeOS workspace" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: space.lg }}>
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            aria-current={tab === id ? 'page' : undefined}
            style={{
              ...subtleButton,
              display: 'inline-flex',
              gap: 7,
              alignItems: 'center',
              whiteSpace: 'nowrap',
              borderColor: tab === id ? '#d946ef' : semantic.border,
              color: tab === id ? '#f0abfc' : semantic.textMuted,
            }}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>}

      {error && (
        <div
          role="alert"
          style={{
            ...cardStyle,
            borderColor: semantic.accentDanger,
            color: semantic.accentDanger,
            marginBottom: space.lg,
          }}
        >
          {error}
        </div>
      )}
      {!canWrite && (
        <div role="status" data-testid="brandforgeos-read-only" style={{ ...cardStyle, borderColor: '#fbbf24', color: '#fde68a', marginBottom: space.lg }}>
          Read-only access: you can review saved brand and campaign work, but editing, approvals, generation, and retirement actions are disabled.
        </div>
      )}
      {loading ? (
        <div style={{ ...cardStyle, color: semantic.textMuted }}>Loading your creative workspace…</div>
      ) : (
        <>
          {tab === 'dashboard' && <DashboardPanel dashboard={dashboard} campaigns={campaigns} calendar={calendar} navigate={navigate} hrefFor={hrefFor} />}
          {tab === 'brands' && (
            <BrandsPanel
              brands={brands}
              saving={saving}
              mutate={mutate}
              canWrite={canWrite}
              onBrandSaved={savedBrand => {
                setBrands(current => current.map(item => item.id === savedBrand.id ? savedBrand : item));
              }}
            />
          )}
          {tab === 'personas' && <PersonasPanel personas={personas} saving={saving} mutate={mutate} canWrite={canWrite} />}
          {tab === 'campaigns' && <CampaignsPanel campaigns={campaigns} brands={brands} personas={personas} requestedCampaignId={requestedCampaign.id} exactRoute={requestedCampaign.requested} onOpenCampaign={openCampaign} saving={saving} mutate={mutate} canWrite={canWrite} />}
          {tab === 'copy-studio' && <CopyPanel assets={copyAssets} brands={brands} campaigns={campaigns} generations={generations} saving={saving} mutate={mutate} canWrite={canWrite} />}
          {tab === 'calendar' && <CalendarPanel items={calendar} brands={brands} campaigns={campaigns} assets={copyAssets} month={calendarMonth} setMonth={setCalendarMonth} saving={saving} mutate={mutate} canWrite={canWrite} />}
          {tab === 'analytics' && <AnalyticsPanel dashboard={dashboard} campaigns={campaigns} saving={saving} mutate={mutate} canWrite={canWrite} />}
          {tab === 'ai-workflows' && <GenerationPanel generations={generations} brands={brands} campaigns={campaigns} provider={provider} contract={completeData.contract} saving={saving} mutate={mutate} canWrite={canWrite} />}
          {tab === 'settings' && <SettingsPanel workspace={workspace} saving={saving} mutate={mutate} canWrite={canWrite} />}
          {(['offers', 'strategy', 'templates', 'integrations', 'reports', 'activity', 'admin'] as BrandForgeCompleteTab[]).includes(tab as BrandForgeCompleteTab) && <BrandForgeCompletePanel tab={tab as BrandForgeCompleteTab} data={completeData} campaigns={campaigns} saving={saving} mutate={mutate} canWrite={canWrite} canAdmin={canAdmin} />}
        </>
      )}
    </div>
  );
}

function Panel({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} data-testid={id} tabIndex={-1}>
      <h2 style={{ marginBottom: 4 }}>{title}</h2>
      <p style={{ color: semantic.textMuted, marginTop: 0 }}>{description}</p>
      {children}
    </section>
  );
}

function DashboardPanel({ dashboard, campaigns, calendar, navigate, hrefFor }: { dashboard: any; campaigns: BrandForgeCampaign[]; calendar: BrandForgeCalendarItem[]; navigate: (tab: Tab) => void; hrefFor: (path: string) => string }) {
  const counts = dashboard?.counts ?? {};
  const brief = buildBrandForgeWorkflowFocus(counts, campaigns, calendar);
  return (
    <Panel id="brandforgeos-dashboard" title="Creative command dashboard" description="See the brands, campaigns, content, and launches your team is actively building.">
      <div style={{ marginBottom: space.lg }}>
        <CoreSuiteWorkdayBrief moduleId="brandforgeos" eyebrow="Next best campaign actions" brief={brief} hrefFor={hrefFor} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
          gap: space.md,
        }}
      >
        {[
          ['Brand kits', counts.brands ?? 0],
          ['Personas', counts.personas ?? 0],
          ['Campaigns', counts.campaigns ?? 0],
          ['Copy assets', counts.copy_assets ?? 0],
          ['Calendar', counts.calendar_items ?? 0],
          ['Generations', counts.generations ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} style={cardStyle}>
            <div style={{ color: semantic.textMuted, fontSize: 12 }}>{label}</div>
            <div style={{ fontSize: 27, fontWeight: 800, marginTop: 5 }}>{String(value)}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
          gap: space.lg,
          marginTop: space.lg,
        }}
      >
        <div style={cardStyle}>
          <h3>Active production</h3>
          {campaigns.length ? (
            campaigns.slice(0, 5).map((item) => (
              <div key={item.id} style={{ padding: '9px 0', borderTop: `1px solid ${semantic.border}` }}>
                <strong>{item.name}</strong>
                <span style={{ float: 'right', color: '#f0abfc' }}>{item.status}</span>
              </div>
            ))
          ) : (
            <Empty text="Create a real campaign brief to start." />
          )}
          <button style={{ ...buttonStyle, marginTop: 12 }} onClick={() => navigate('campaigns')}>
            Open campaigns
          </button>
        </div>
        <div style={cardStyle}>
          <h3>Upcoming content</h3>
          {calendar.length ? (
            calendar.slice(0, 5).map((item) => (
              <div key={item.id} style={{ padding: '9px 0', borderTop: `1px solid ${semantic.border}` }}>
                <strong>{item.title}</strong>
                <div style={{ color: semantic.textMuted, fontSize: 12 }}>
                  {new Date(item.scheduledAt).toLocaleString()} · {item.status}
                </div>
              </div>
            ))
          ) : (
            <Empty text="Schedule the first content deliverable." />
          )}
          <button style={{ ...buttonStyle, marginTop: 12 }} onClick={() => navigate('calendar')}>
            Open calendar
          </button>
        </div>
      </div>
    </Panel>
  );
}

function BrandsPanel({ brands, saving, mutate, canWrite, onBrandSaved }: { brands: BrandForgeBrand[]; saving: boolean; mutate: (task: () => Promise<unknown>) => Promise<void>; canWrite: boolean; onBrandSaved: (brand: BrandForgeBrand) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState('');
  const [headingFont, setHeadingFont] = useState('');
  const [bodyFont, setBodyFont] = useState('');
  const [guidelines, setGuidelines] = useState('');
  const [assets, setAssets] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await moduleShellApi.brandforgeos.createBrand({
        name,
        description: description || null,
        voiceTone: tone || null,
        headingFont: headingFont || null,
        bodyFont: bodyFont || null,
        guidelines: guidelines || null,
        assetSummary: assets
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        primaryColor: '#a855f7',
        secondaryColor: '#ec4899',
        accentColor: '#22d3ee',
      });
      setName('');
      setDescription('');
      setTone('');
      setHeadingFont('');
      setBodyFont('');
      setGuidelines('');
      setAssets('');
    });
  };
  return (
    <Panel id="brandforgeos-brands" title="Brand HQ" description="Manage identities, visual tokens, typography, voice, guidelines, and reusable asset references.">
      <CreateGrid onSubmit={submit} canWrite={canWrite}>
        <Field label="Brand name" value={name} onChange={setName} required />
        <Field label="Voice and tone" value={tone} onChange={setTone} />
        <Field label="Heading font" value={headingFont} onChange={setHeadingFont} />
        <Field label="Body font" value={bodyFont} onChange={setBodyFont} />
        <Field label="Description" value={description} onChange={setDescription} multiline />
        <Field label="Brand guidelines" value={guidelines} onChange={setGuidelines} multiline />
        <Field label="Asset names (one per line)" value={assets} onChange={setAssets} multiline />
        <Submit saving={saving} label="Create brand system" />
      </CreateGrid>
      <CardGrid>
        {brands.length ? (
          brands.map((brand) => (
            <article key={brand.id} style={{ ...cardStyle, borderTop: `3px solid ${brand.primaryColor || '#a855f7'}` }}>
              <h3>{brand.name}</h3>
              <p style={{ color: semantic.textMuted, minHeight: 36 }}>{brand.description || 'No description recorded.'}</p>
              <div style={{ color: '#f0abfc', fontSize: 13 }}>{brand.voiceTone || 'Voice not set'}</div>
              <div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 8 }}>{[brand.headingFont, brand.bodyFont].filter(Boolean).join(' / ') || 'Typography not set'}</div>
              {brand.guidelines && <p style={{ color: semantic.textMuted, fontSize: 12 }}>{brand.guidelines}</p>}
               {brand.assetSummary?.length > 0 && (
                <ul style={{ color: semantic.textMuted, fontSize: 12, paddingLeft: 18 }}>
                  {brand.assetSummary.map((asset) => (
                    <li key={asset}>{asset}</li>
                  ))}
                </ul>
               )}
              <BrandSvgConceptExporter
                brand={brand}
                onSaveLogo={async input => {
                  const saved = await moduleShellApi.brandforgeos.saveLogo(brand.id, input);
                  onBrandSaved(saved.brand);
                  return saved;
                }}
                canWrite={canWrite}
              />
              <button aria-label={`Delete ${brand.name}`} disabled={!canWrite} style={{ ...subtleButton, marginTop: 12 }} onClick={() => void mutate(() => moduleShellApi.brandforgeos.deleteBrand(brand.id))}>
                <Trash2 size={14} /> Retire
              </button>
            </article>
          ))
        ) : (
          <Empty text="No brand systems yet." />
        )}
      </CardGrid>
    </Panel>
  );
}

function PersonasPanel({ personas, saving, mutate, canWrite }: { personas: BrandForgePersona[]; saving: boolean; mutate: (task: () => Promise<unknown>) => Promise<void>; canWrite: boolean }) {
  const [name, setName] = useState('');
  const [pain, setPain] = useState('');
  const [goals, setGoals] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await moduleShellApi.brandforgeos.createPersona({
        name,
        painPoints: pain || null,
        goals: goals || null,
        channels: [],
      });
      setName('');
      setPain('');
      setGoals('');
    });
  };
  return (
    <Panel id="brandforgeos-personas" title="Audience personas" description="Save the customer needs, goals, and channels that should guide every campaign and content draft.">
      <CreateGrid onSubmit={submit} canWrite={canWrite}>
        <Field label="Persona name" value={name} onChange={setName} required />
        <Field label="Pain points" value={pain} onChange={setPain} />
        <Field label="Goals" value={goals} onChange={setGoals} />
        <Submit saving={saving} label="Create persona" />
      </CreateGrid>
      <CardGrid>
        {personas.length ? (
          personas.map((persona) => (
            <article key={persona.id} style={cardStyle}>
              <h3>{persona.name}</h3>
              <p style={{ color: semantic.textMuted }}>{persona.painPoints || 'Pain points not recorded.'}</p>
              <div style={{ fontSize: 13, color: '#c4b5fd' }}>{persona.goals || 'Goals not recorded.'}</div>
              <button disabled={!canWrite} style={{ ...subtleButton, marginTop: 12 }} onClick={() => void mutate(() => moduleShellApi.brandforgeos.deletePersona(persona.id))}>
                <Trash2 size={14} /> Retire
              </button>
            </article>
          ))
        ) : (
          <Empty text="No audience personas yet." />
        )}
      </CardGrid>
    </Panel>
  );
}

function CampaignsPanel({ campaigns, brands, personas, requestedCampaignId, exactRoute, onOpenCampaign, saving, mutate, canWrite }: { campaigns: BrandForgeCampaign[]; brands: BrandForgeBrand[]; personas: BrandForgePersona[]; requestedCampaignId: string | null; exactRoute: boolean; onOpenCampaign: (id: string) => void; saving: boolean; mutate: (task: () => Promise<unknown>) => Promise<void>; canWrite: boolean }) {
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [coreMessage, setCoreMessage] = useState('');
  const [offer, setOffer] = useState('');
  const [channels, setChannels] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [budgetDollars, setBudgetDollars] = useState('');
  const [notes, setNotes] = useState('');
  const [brandId, setBrandId] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [briefError, setBriefError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [production, setProduction] = useState<any>({ tasks: [], comments: [], landingPages: [] });
  const [productionLoading, setProductionLoading] = useState(false);
  const [productionError, setProductionError] = useState<string | null>(null);
  const [productionRetry, setProductionRetry] = useState(0);
  const [taskTitle, setTaskTitle] = useState('');
  const [comment, setComment] = useState('');
  const [landingTitle, setLandingTitle] = useState('');
  const [landingSlug, setLandingSlug] = useState('');
  const [headline, setHeadline] = useState('');
  const resetBrief = () => {
    setName('');
    setObjective('');
    setTargetAudience('');
    setCoreMessage('');
    setOffer('');
    setChannels('');
    setStartAt('');
    setEndAt('');
    setBudgetDollars('');
    setNotes('');
    setBrandId('');
    setPersonaId('');
    setEditingId('');
    setBriefError(null);
  };
  const editBrief = (campaign: BrandForgeCampaign) => {
    setName(campaign.name);
    setObjective(campaign.objective || '');
    setTargetAudience(campaign.targetAudience || '');
    setCoreMessage(campaign.coreMessage || '');
    setOffer(campaign.offer || '');
    setChannels(campaign.channels.join(', '));
    setStartAt(campaign.startAt?.slice(0, 10) || '');
    setEndAt(campaign.endAt?.slice(0, 10) || '');
    setBudgetDollars(campaign.budgetCents === null ? '' : (campaign.budgetCents / 100).toFixed(2));
    setNotes(campaign.notes || '');
    setBrandId(campaign.brandId || '');
    setPersonaId(campaign.personaId || '');
    setEditingId(campaign.id);
    setBriefError(null);
    document.getElementById('brandforge-campaign-brief-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBriefError(null);
    const parsedBudget = budgetDollars.trim() === '' ? null : Number(budgetDollars);
    if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0 || Math.round(parsedBudget * 100) > 2_147_483_647)) {
      setBriefError('Budget must be a positive dollar amount below $21,474,836.47.');
      return;
    }
    if (startAt && endAt && endAt < startAt) {
      setBriefError('Campaign end date cannot be earlier than the start date.');
      return;
    }
    const parsedChannels = [...new Map(
      channels.split(/[\n,]/u).map((value) => value.trim()).filter(Boolean).map((value) => [value.toLocaleLowerCase(), value] as const),
    ).values()];
    if (parsedChannels.length > 12 || parsedChannels.some((value) => value.length > 60)) {
      setBriefError('Use no more than 12 channels, with each channel name under 60 characters.');
      return;
    }
    const input = {
      name,
      objective: objective || null,
      targetAudience: targetAudience || null,
      coreMessage: coreMessage || null,
      offer: offer || null,
      channels: parsedChannels,
      startAt: startAt || null,
      endAt: endAt || null,
      budgetCents: parsedBudget === null ? null : Math.round(parsedBudget * 100),
      notes: notes || null,
      brandId: brandId || null,
      personaId: personaId || null,
    };
    void mutate(async () => {
      if (editingId) {
        const current = campaigns.find((campaign) => campaign.id === editingId);
        if (!current) throw new Error('The campaign changed or is no longer available. Refresh and try again.');
        await moduleShellApi.brandforgeos.updateCampaign(editingId, {
          ...input,
          expectedVersion: current.version,
        });
      } else {
        await moduleShellApi.brandforgeos.createCampaign(input);
      }
      resetBrief();
    });
  };
  const next: Record<string, string | null> = {
    draft: 'planning',
    planning: 'producing',
    producing: 'review',
    review: 'scheduled',
    scheduled: 'active',
    active: 'completed',
    completed: 'archived',
    archived: null,
  };
  useEffect(() => {
    if (requestedCampaignId && campaigns.some(item => item.id === requestedCampaignId)) {
      setSelectedId(requestedCampaignId);
      return;
    }
    if (exactRoute) {
      setSelectedId('');
      return;
    }
    if (!selectedId && campaigns[0]) setSelectedId(campaigns[0].id);
  }, [campaigns, exactRoute, requestedCampaignId, selectedId]);
  useEffect(() => {
    if (!requestedCampaignId || selectedId !== requestedCampaignId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`brandforge-campaign-${requestedCampaignId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [requestedCampaignId, selectedId]);
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setProduction({ tasks: [], comments: [], landingPages: [] });
      setProductionError(null);
      return;
    }
    setProduction({ tasks: [], comments: [], landingPages: [] });
    setProductionError(null);
    setProductionLoading(true);
    void moduleShellApi.brandforgeos
      .campaignProduction(selectedId)
      .then((value) => {
        if (!cancelled) setProduction(value);
      })
      .catch((error) => {
        if (!cancelled) setProductionError(errorText(error));
      })
      .finally(() => {
        if (!cancelled) setProductionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productionRetry, selectedId]);
  const refresh = async () => {
    if (!selectedId) return;
    setProductionError(null);
    try {
      setProduction(await moduleShellApi.brandforgeos.campaignProduction(selectedId));
    } catch (error) {
      setProductionError(errorText(error));
      throw error;
    }
  };
  const addTask = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    void mutate(async () => {
      await moduleShellApi.brandforgeos.createCampaignTask(selectedId, {
        title: taskTitle,
        priority: 'medium',
      });
      setTaskTitle('');
      await refresh();
    });
  };
  const addComment = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    void mutate(async () => {
      await moduleShellApi.brandforgeos.createCampaignComment(selectedId, { body: comment });
      setComment('');
      await refresh();
    });
  };
  const addLanding = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    void mutate(async () => {
      await moduleShellApi.brandforgeos.createLandingPage(selectedId, {
        title: landingTitle,
        slug: landingSlug,
        status: 'draft',
        content: { headline },
        seo: { title: landingTitle },
      });
      setLandingTitle('');
      setLandingSlug('');
      setHeadline('');
      await refresh();
    });
  };
  return (
    <Panel id="brandforgeos-campaigns" title="Campaign production" description="Move a real campaign brief through planning, production, review, scheduling, and completion.">
      <div id="brandforge-campaign-brief-form">
        <CreateGrid onSubmit={submit} canWrite={canWrite}>
          <Field label="Campaign name" value={name} onChange={setName} required />
          <Field label="Business objective" value={objective} onChange={setObjective} required multiline />
          <Field label="Target audience" value={targetAudience} onChange={setTargetAudience} required multiline />
          <Field label="Offer" value={offer} onChange={setOffer} required multiline />
          <Field label="Core message / desired action" value={coreMessage} onChange={setCoreMessage} required multiline />
          <Field label="Channels (comma-separated)" value={channels} onChange={setChannels} required />
          <Field label="Start date" value={startAt} onChange={setStartAt} type="date" />
          <Field label="End date" value={endAt} onChange={setEndAt} type="date" />
          <Field label="Budget (USD)" value={budgetDollars} onChange={setBudgetDollars} type="number" min="0" step="0.01" />
          <Select label="Brand kit" value={brandId} onChange={setBrandId} required options={brands.map((item) => [item.id, item.name])} />
          <Select label="Persona" value={personaId} onChange={setPersonaId} options={personas.map((item) => [item.id, item.name])} />
          <Field label="Campaign notes" value={notes} onChange={setNotes} multiline />
          <Submit saving={saving} label={editingId ? 'Save campaign brief' : 'Create campaign'} />
          {editingId && <button type="button" style={subtleButton} onClick={resetBrief}>Cancel editing</button>}
        </CreateGrid>
      </div>
      {briefError && <div role="alert" style={{ ...cardStyle, borderColor: semantic.accentDanger, color: semantic.accentDanger, marginBottom: space.lg }}>{briefError}</div>}
      <CardGrid>
        {campaigns.length ? (
          campaigns.map((campaign) => (
            <article
              key={campaign.id}
              id={`brandforge-campaign-${campaign.id}`}
              data-highlighted={selectedId === campaign.id ? 'true' : undefined}
              aria-current={selectedId === campaign.id ? 'true' : undefined}
              style={{
                ...cardStyle,
                borderLeft: `3px solid ${selectedId === campaign.id ? '#22d3ee' : '#ec4899'}`,
                background: selectedId === campaign.id ? '#101d2b' : cardStyle.background,
                boxShadow: selectedId === campaign.id ? '0 0 0 3px rgba(34,211,238,.12)' : cardStyle.boxShadow,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <h3 style={{ marginTop: 0 }}>{campaign.name}</h3>
                <strong style={{ color: '#f0abfc' }}>{campaign.status}</strong>
              </div>
              <p style={{ color: semantic.textMuted }}><strong style={{ color: semantic.text }}>Objective:</strong> {campaign.objective || 'Not recorded'}</p>
              <p style={{ color: semantic.textMuted }}><strong style={{ color: semantic.text }}>Audience:</strong> {campaign.targetAudience || 'Not recorded'}</p>
              <p style={{ color: semantic.textMuted }}><strong style={{ color: semantic.text }}>Offer:</strong> {campaign.offer || 'Not recorded'}</p>
              <p style={{ color: semantic.textMuted }}><strong style={{ color: semantic.text }}>Desired action:</strong> {campaign.coreMessage || 'Not recorded'}</p>
              <p style={{ color: semantic.textMuted, fontSize: 12 }}>
                {campaign.channels.length ? campaign.channels.join(' · ') : 'No channels selected'}
                {campaign.startAt ? ` · Starts ${campaign.startAt.slice(0, 10)}` : ''}
                {campaign.endAt ? ` · Ends ${campaign.endAt.slice(0, 10)}` : ''}
                {campaign.budgetCents !== null ? ` · $${(campaign.budgetCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={subtleButton} onClick={() => { setSelectedId(campaign.id); onOpenCampaign(campaign.id); }}>
                  Open production
                </button>
                <button disabled={!canWrite} style={subtleButton} onClick={() => editBrief(campaign)}>
                  Edit brief
                </button>
                {next[campaign.status] && (
                  <button
                    disabled={!canWrite}
                    style={buttonStyle}
                    onClick={() =>
                      void mutate(() =>
                        moduleShellApi.brandforgeos.updateCampaign(campaign.id, {
                          expectedVersion: campaign.version,
                          status: next[campaign.status],
                        }),
                      )
                    }
                  >
                    Move to {next[campaign.status]}
                  </button>
                )}
                <button disabled={!canWrite} style={subtleButton} onClick={() => void mutate(() => moduleShellApi.brandforgeos.deleteCampaign(campaign.id))}>
                  <Trash2 size={14} /> Retire
                </button>
              </div>
            </article>
          ))
        ) : (
          <Empty text="No campaigns yet." />
        )}
      </CardGrid>
      {selectedId && (
        <div id={`brandforge-campaign-production-${selectedId}`} data-testid="brandforge-campaign-production" data-selected-campaign-id={selectedId} style={{ ...cardStyle, marginTop: space.lg }}>
          <h3>Production room · {campaigns.find((item) => item.id === selectedId)?.name}</h3>
          {(() => {
            const campaign = campaigns.find(item => item.id === selectedId);
            const brand = campaign?.brandId ? brands.find(item => item.id === campaign.brandId) : null;
            const missingBriefParts = campaign ? [
              !isMeaningfulCampaignBrief(campaign.targetAudience) ? 'target audience' : null,
              !isMeaningfulCampaignBrief(campaign.offer) ? 'offer' : null,
              !isMeaningfulCampaignBrief(campaign.coreMessage) ? 'desired action / core message' : null,
            ].filter(Boolean) as string[] : [];
            return campaign ? (
              <div style={{ marginBottom: space.lg }}>
                <OutcomeWorkflowAction
                  workflowKey="brandforgeos.campaign_to_launchkit"
                  aggregateId={campaign.id}
                  sourceVersion={campaign.version}
                  sourceDeepLink={`/modules/brandforgeos/campaigns/${campaign.id}`}
                  title="Build the complete campaign package in Deploy Ops"
                  description={`Turn “${campaign.name}” into a review-ready campaign kit using the saved brief${brand ? ` and ${brand.name} brand system` : ''}.`}
                  destinationLabel="Deploy Ops"
                  actionLabel="Review Deploy Ops package"
                  previewItems={[
                    { label: 'One Deploy Ops campaign kit', detail: 'Landing copy, ads, email/SMS, social posts, FAQ, calls to action, flyer copy, and a launch checklist.' },
                    { label: 'One saved package version', detail: 'Keeps the campaign package recoverable and ready for later comparison.' },
                    { label: 'Nine visual-production briefs', detail: 'Structured creative directions that your team can produce or hand to a designer.' },
                    { label: 'A matching Deploy Ops brand profile only when missing', detail: 'The workflow reuses an existing match; otherwise it creates one when this organization’s active access supports brand profiles.' },
                  ]}
                  confirmationText="I reviewed what will be created in Deploy Ops. This creates draft campaign items only; it does not publish ads, send messages, buy media, or deploy a website."
                  disabled={!canWrite || !brand || missingBriefParts.length > 0}
                  disabledReason={!canWrite
                    ? 'You need campaign edit access to create a Deploy Ops package.'
                    : !brand
                      ? 'Choose an active brand for this campaign before building its Deploy Ops package.'
                      : missingBriefParts.length
                        ? `Complete the ${missingBriefParts.join(', ')} before building the Deploy Ops package.`
                        : undefined}
                  testId="brandforge-deployops-handoff"
                />
              </div>
            ) : null;
          })()}
          {productionLoading ? (
            <p style={{ color: semantic.textMuted }}>Loading production history…</p>
          ) : productionError ? (
            <div role="alert" style={{ ...cardStyle, borderColor: semantic.accentDanger }}>
              <strong>Production history could not be loaded.</strong>
              <p style={{ color: semantic.textMuted }}>{productionError}</p>
              <button type="button" style={subtleButton} onClick={() => setProductionRetry((attempt) => attempt + 1)}>
                Retry production history
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))',
                gap: space.md,
              }}
            >
              <section>
                <h4>Checklist</h4>
                <form onSubmit={addTask} aria-disabled={!canWrite} style={{ display: 'flex', gap: 8 }}>
                  <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
                    <input aria-label="Task title" required value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} style={inputStyle} />
                    <button type="submit" disabled={saving} style={buttonStyle}>
                      Add
                    </button>
                  </fieldset>
                </form>
                {production.tasks.map((task: any) => (
                  <div key={task.id} style={{ borderTop: `1px solid ${semantic.border}`, padding: '9px 0' }}>
                    <strong>{task.title}</strong>
                    <div style={{ color: semantic.textMuted, fontSize: 12 }}>
                      {task.priority} · {task.status}
                    </div>
                    <button
                      disabled={!canWrite}
                      style={{ ...subtleButton, marginTop: 6 }}
                      onClick={() =>
                        void mutate(async () => {
                          await moduleShellApi.brandforgeos.updateCampaignTask(task.id, {
                            expectedVersion: task.version,
                            status: task.status === 'done' ? 'todo' : 'done',
                          });
                          await refresh();
                        })
                      }
                    >
                      {task.status === 'done' ? 'Reopen' : 'Complete'}
                    </button>
                  </div>
                ))}
              </section>
              <section>
                <h4>Collaboration</h4>
                <form onSubmit={addComment} aria-disabled={!canWrite}>
                  <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0 }}>
                    <Field label="Comment" value={comment} onChange={setComment} required multiline />
                    <button type="submit" disabled={saving} style={{ ...buttonStyle, marginTop: 8 }}>
                      Post comment
                    </button>
                  </fieldset>
                </form>
                {production.comments.map((item: any) => (
                  <p
                    key={item.id}
                    style={{
                      borderTop: `1px solid ${semantic.border}`,
                      paddingTop: 9,
                      color: semantic.textMuted,
                    }}
                  >
                    {item.body}
                  </p>
                ))}
              </section>
              <section>
                <h4>Landing content</h4>
                <form onSubmit={addLanding} aria-disabled={!canWrite} style={{ display: 'grid', gap: 8 }}>
                  <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
                    <Field label="Page title" value={landingTitle} onChange={setLandingTitle} required />
                    <Field label="Page slug" value={landingSlug} onChange={setLandingSlug} required />
                    <Field label="Headline" value={headline} onChange={setHeadline} required />
                    <button type="submit" disabled={saving} style={buttonStyle}>
                      Save draft
                    </button>
                  </fieldset>
                </form>
                {production.landingPages.map((page: any) => (
                  <div key={page.id} style={{ borderTop: `1px solid ${semantic.border}`, padding: '9px 0' }}>
                    <strong>{page.title}</strong>
                    <div style={{ color: semantic.textMuted, fontSize: 12 }}>
                      /{page.slug} · {page.status}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function CopyPanel({ assets, brands, campaigns, generations, saving, mutate, canWrite }: { assets: BrandForgeCopyAsset[]; brands: BrandForgeBrand[]; campaigns: BrandForgeCampaign[]; generations: BrandForgeGeneration[]; saving: boolean; mutate: (task: () => Promise<unknown>) => Promise<void>; canWrite: boolean }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await moduleShellApi.brandforgeos.createCopyAsset({
        title,
        content,
        copyType: 'marketing_copy',
        campaignId: campaignId || null,
        brandId: brandId || null,
        status: 'draft',
      });
      setTitle('');
      setContent('');
    });
  };
  const generatedVariants = useMemo(() => generations.flatMap((generation) => (generation.generationType === 'copy' && Array.isArray(generation.output.variants) ? (generation.output.variants as any[]).map((variant) => ({ generation, variant })) : [])), [generations]);
  return (
    <Panel id="brandforgeos-copy" title="Copy studio" description="Create, review, approve, and export reusable copy. Each version keeps enough creation detail for the team to understand how it was made.">
      <CreateGrid onSubmit={submit} canWrite={canWrite}>
        <Field label="Title" value={title} onChange={setTitle} required />
        <Field label="Copy content" value={content} onChange={setContent} required multiline />
        <Select label="Campaign" value={campaignId} onChange={setCampaignId} options={campaigns.map((item) => [item.id, item.name])} />
        <Select label="Brand kit" value={brandId} onChange={setBrandId} options={brands.map((item) => [item.id, item.name])} />
        <Submit saving={saving} label="Save copy asset" />
      </CreateGrid>
      {generatedVariants.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: space.lg }}>
          <h3>Unsaved generated variants</h3>
          {generatedVariants.slice(0, 3).map(({ generation, variant }, index) => (
            <div key={`${generation.id}-${index}`} style={{ borderTop: `1px solid ${semantic.border}`, padding: '10px 0' }}>
              <strong>{variant.title}</strong>
              <p style={{ color: semantic.textMuted, whiteSpace: 'pre-wrap' }}>{variant.content}</p>
              <button
                disabled={!canWrite}
                style={subtleButton}
                onClick={() =>
                  void mutate(() =>
                    moduleShellApi.brandforgeos.createCopyAsset({
                      title: variant.title,
                      content: variant.content,
                      copyType: 'generated_copy',
                      generationId: generation.id,
                      brandId: generation.brandId,
                      campaignId: generation.campaignId,
                      status: 'draft',
                    }),
                  )
                }
              >
                Save as copy asset
              </button>
            </div>
          ))}
        </div>
      )}
      {compareIds.length > 0 && (
        <div data-testid="brandforge-copy-compare" style={{ ...cardStyle, marginBottom: space.lg }}>
          <h3>Compare saved copy ({compareIds.length}/2)</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))',
              gap: space.md,
            }}
          >
            {compareIds
              .map((id) => assets.find((asset) => asset.id === id))
              .filter(Boolean)
              .map((asset) => (
                <article key={asset!.id}>
                  <strong>{asset!.title}</strong>
                  <p style={{ color: semantic.textMuted, whiteSpace: 'pre-wrap' }}>{asset!.content}</p>
                </article>
              ))}
          </div>
        </div>
      )}
      <CardGrid>
        {assets.length ? (
          assets.map((asset) => (
            <article key={asset.id} style={{ ...cardStyle, borderColor: asset.favorite ? '#f472b6' : semantic.border }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <h3 style={{ marginTop: 0 }}>
                  {asset.favorite ? '★ ' : ''}
                  {asset.title}
                </h3>
                <strong style={{ color: '#c4b5fd' }}>{asset.status}</strong>
              </div>
              <p style={{ color: semantic.textMuted, whiteSpace: 'pre-wrap' }}>{asset.content}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {Object.entries(asset.scores || {}).map(([label, value]) => (
                  <span
                    key={label}
                    style={{
                      padding: '4px 7px',
                      borderRadius: 999,
                      background: 'rgba(168,85,247,.12)',
                      color: '#e9d5ff',
                      fontSize: 11,
                    }}
                  >
                    {label}: {String(value)}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  disabled={!canWrite}
                  style={subtleButton}
                  onClick={() =>
                    void mutate(() =>
                      moduleShellApi.brandforgeos.updateCopyAsset(asset.id, {
                        expectedVersion: asset.version,
                        favorite: !asset.favorite,
                      }),
                    )
                  }
                >
                  {asset.favorite ? 'Remove favorite' : 'Favorite'}
                </button>
                <button style={subtleButton} aria-pressed={compareIds.includes(asset.id)} onClick={() => setCompareIds((current) => (current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current.slice(-1), asset.id]))}>
                  {compareIds.includes(asset.id) ? 'Remove compare' : 'Compare'}
                </button>
                <button disabled={!canWrite} style={subtleButton} onClick={() => void mutate(() => moduleShellApi.brandforgeos.deleteCopyAsset(asset.id))}>
                  <Trash2 size={14} /> Retire
                </button>
              </div>
            </article>
          ))
        ) : (
          <Empty text="No copy assets yet." />
        )}
      </CardGrid>
    </Panel>
  );
}

function CalendarPanel({ items, brands, campaigns, assets, month, setMonth, saving, mutate, canWrite }: { items: BrandForgeCalendarItem[]; brands: BrandForgeBrand[]; campaigns: BrandForgeCampaign[]; assets: BrandForgeCopyAsset[]; month: string; setMonth: (value: string) => void; saving: boolean; mutate: (task: () => Promise<unknown>) => Promise<void>; canWrite: boolean }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [copyAssetId, setCopyAssetId] = useState('');
  const [channel, setChannel] = useState('');
  const [view, setView] = useState<'month' | 'list'>('month');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [publicationDrafts, setPublicationDrafts] = useState<Record<string, { reference: string; confirmed: boolean }>>({});
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      const scheduledMonth = date.slice(0, 7);
      await moduleShellApi.brandforgeos.createCalendar({
        title,
        scheduledAt: new Date(date).toISOString(),
        itemType: 'content',
        channel: channel || null,
        campaignId: campaignId || null,
        copyAssetId: copyAssetId || null,
        brandId: brands[0]?.id || null,
        status: 'scheduled',
      });
      setMonth(scheduledMonth);
      setTitle('');
      setDate('');
      setChannel('');
    });
  };
  const filtered = items.filter((item) => (statusFilter === 'all' || item.status === statusFilter) && (channelFilter === 'all' || item.channel === channelFilter));
  const channels = Array.from(new Set(items.map((item) => item.channel).filter(Boolean))) as string[];
  const first = new Date(`${month}-01T00:00:00`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const monthItems = filtered.filter((item) => item.scheduledAt.slice(0, 7) === month);
  const isOverdue = (item: BrandForgeCalendarItem) => new Date(item.scheduledAt) < new Date() && !['published', 'cancelled'].includes(item.status);
  return (
    <Panel id="brandforgeos-calendar" title="Content calendar" description="Plan in month or list view, filter the schedule, and surface overdue campaign work from the dates your team saved.">
      <CreateGrid onSubmit={submit} canWrite={canWrite}>
        <Field label="Deliverable title" value={title} onChange={setTitle} required />
        <label style={{ color: semantic.textMuted, fontSize: 12 }}>
          Scheduled time
          <input aria-label="Scheduled time" type="datetime-local" required value={date} onChange={(event) => setDate(event.target.value)} style={{ ...inputStyle, marginTop: 5 }} />
        </label>
        <Field label="Channel" value={channel} onChange={setChannel} />
        <Select label="Campaign" value={campaignId} onChange={setCampaignId} options={campaigns.map((item) => [item.id, item.name])} />
        <Select label="Copy asset" value={copyAssetId} onChange={setCopyAssetId} options={assets.map((item) => [item.id, item.title])} />
        <Submit saving={saving} label="Schedule content" />
      </CreateGrid>
      <div
        style={{
          ...cardStyle,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'end',
          marginBottom: space.md,
        }}
      >
        <button style={view === 'month' ? buttonStyle : subtleButton} onClick={() => setView('month')}>
          Month
        </button>
        <button style={view === 'list' ? buttonStyle : subtleButton} onClick={() => setView('list')}>
          List
        </button>
        <label style={{ color: semantic.textMuted, fontSize: 12 }}>
          Status
          <select aria-label="Calendar status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
            <option value="all">All</option>
            {['idea', 'draft', 'review', 'scheduled', 'published', 'cancelled'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label style={{ color: semantic.textMuted, fontSize: 12 }}>
          Channel
          <select aria-label="Calendar channel filter" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
            <option value="all">All</option>
            {channels.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {view === 'month' && (
          <label style={{ color: semantic.textMuted, fontSize: 12 }}>
            Month
            <input aria-label="Calendar month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
          </label>
        )}
      </div>
      {view === 'month' ? (
        <div data-testid="brandforge-calendar-month">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7,minmax(0,1fr))',
              gap: 4,
              color: semantic.textMuted,
              fontSize: 11,
              textAlign: 'center',
            }}
          >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <strong key={day}>{day}</strong>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4 }}>
            {Array.from({ length: first.getDay() }, (_, index) => (
              <div key={`blank-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
              const rows = monthItems.filter((item) => new Date(item.scheduledAt).getDate() === day);
              return (
                <article
                  key={day}
                  style={{
                    minHeight: 82,
                    padding: 7,
                    border: `1px solid ${semantic.border}`,
                    borderRadius: radius.sm,
                    background: semantic.bgPanel,
                    overflow: 'hidden',
                  }}
                >
                  <strong style={{ fontSize: 11 }}>{day}</strong>
                  {rows.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      title={item.title}
                      style={{
                        color: isOverdue(item) ? semantic.accentDanger : '#e9d5ff',
                        fontSize: 10,
                        marginTop: 4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.title}
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <div data-testid="brandforge-calendar-list" style={{ display: 'grid', gap: space.sm }}>
          {filtered.length ? (
            filtered.map((item) => (
              <article
                key={item.id}
                style={{
                  ...cardStyle,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: space.md,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  borderColor: isOverdue(item) ? semantic.accentDanger : semantic.border,
                }}
              >
                <div>
                  <strong>{item.title}</strong>
                  <div
                    style={{
                      color: isOverdue(item) ? semantic.accentDanger : semantic.textMuted,
                      fontSize: 12,
                    }}
                  >
                    {new Date(item.scheduledAt).toLocaleString()} · {item.channel || 'No channel'} · {item.status}
                    {isOverdue(item) ? ' · Overdue' : ''}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8, minWidth: 260 }}>
                  {item.status === 'scheduled' && (
                    <div style={{ display: 'grid', gap: 7 }}>
                      <input
                        aria-label={`External publication reference for ${item.title}`}
                        placeholder="Published URL, post ID, or campaign receipt"
                        value={publicationDrafts[item.id]?.reference ?? ''}
                        disabled={!canWrite}
                        onChange={event => setPublicationDrafts(current => ({ ...current, [item.id]: { reference: event.target.value, confirmed: current[item.id]?.confirmed ?? false } }))}
                        style={inputStyle}
                      />
                      <label style={{ color: semantic.textMuted, fontSize: 11, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                        <input
                          type="checkbox"
                          checked={publicationDrafts[item.id]?.confirmed ?? false}
                          disabled={!canWrite}
                          onChange={event => setPublicationDrafts(current => ({ ...current, [item.id]: { reference: current[item.id]?.reference ?? '', confirmed: event.target.checked } }))}
                        />
                        I confirm this was published outside OperatorOS. Recording it here does not publish or send anything.
                      </label>
                      <button
                        disabled={!canWrite || !(publicationDrafts[item.id]?.confirmed) || (publicationDrafts[item.id]?.reference.trim().length ?? 0) < 8}
                        style={buttonStyle}
                        onClick={() => void mutate(async () => {
                          await moduleShellApi.brandforgeos.recordCalendarPublication(item.id, {
                            expectedVersion: item.version,
                            externalReference: publicationDrafts[item.id]?.reference.trim(),
                            externalPublicationConfirmed: true,
                            idempotencyKey: uniqueKey(`brandforge-publication:${item.id}`),
                          });
                          setPublicationDrafts(current => {
                            const next = { ...current };
                            delete next[item.id];
                            return next;
                          });
                        })}
                      >
                        Record external publication
                      </button>
                    </div>
                  )}
                  <button disabled={!canWrite} style={{ ...subtleButton, justifySelf: 'end' }} onClick={() => void mutate(() => moduleShellApi.brandforgeos.deleteCalendar(item.id))}>
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </article>
            ))
          ) : (
            <Empty text="No content matches these filters." />
          )}
        </div>
      )}
    </Panel>
  );
}

function AnalyticsPanel({ dashboard, campaigns, saving, mutate, canWrite }: { dashboard: any; campaigns: BrandForgeCampaign[]; saving: boolean; mutate: (task: () => Promise<unknown>) => Promise<void>; canWrite: boolean }) {
  const [campaignId, setCampaignId] = useState('');
  const [impressions, setImpressions] = useState('0');
  const [clicks, setClicks] = useState('0');
  const [conversions, setConversions] = useState('0');
  const performance = dashboard?.performance ?? {};
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(() =>
      moduleShellApi.brandforgeos.addMetric(campaignId, {
        metricDate: new Date().toISOString(),
        impressions: Number(impressions),
        clicks: Number(clicks),
        conversions: Number(conversions),
        spendCents: 0,
        revenueCents: 0,
      }),
    );
  };
  return (
    <Panel id="brandforgeos-analytics" title="Campaign analytics" description="Track the performance results your team records for each campaign and channel.">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
          gap: space.md,
          marginBottom: space.lg,
        }}
      >
        {[
          ['Impressions', performance.impressions ?? 0],
          ['Clicks', performance.clicks ?? 0],
          ['Conversions', performance.conversions ?? 0],
          ['Spend', `$${(Number(performance.spend_cents ?? 0) / 100).toFixed(2)}`],
          ['Revenue', `$${(Number(performance.revenue_cents ?? 0) / 100).toFixed(2)}`],
        ].map(([label, value]) => (
          <div key={String(label)} style={cardStyle}>
            <div style={{ color: semantic.textMuted, fontSize: 12 }}>{label}</div>
            <strong style={{ fontSize: 24 }}>{String(value)}</strong>
          </div>
        ))}
      </div>
      <CreateGrid onSubmit={submit} canWrite={canWrite}>
        <Select label="Campaign" value={campaignId} onChange={setCampaignId} required options={campaigns.map((item) => [item.id, item.name])} />
        <Field label="Impressions" value={impressions} onChange={setImpressions} type="number" />
        <Field label="Clicks" value={clicks} onChange={setClicks} type="number" />
        <Field label="Conversions" value={conversions} onChange={setConversions} type="number" />
        <Submit saving={saving} label="Record metrics" />
      </CreateGrid>
      <a
        href="/api/modules/brandforgeos/export?format=csv"
        style={{
          ...subtleButton,
          display: 'inline-flex',
          gap: 7,
          alignItems: 'center',
          textDecoration: 'none',
        }}
      >
        <Download size={15} /> Download real CSV export
      </a>
    </Panel>
  );
}

function GenerationPanel({ generations, brands, campaigns, provider, contract, saving, mutate, canWrite }: { generations: BrandForgeGeneration[]; brands: BrandForgeBrand[]; campaigns: BrandForgeCampaign[]; provider: { name: string; configured: boolean }; contract: any; saving: boolean; mutate: (task: () => Promise<unknown>) => Promise<void>; canWrite: boolean }) {
  const [type, setType] = useState('copy');
  const [prompt, setPrompt] = useState('');
  const [brandId, setBrandId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [copyType, setCopyType] = useState('email');
  const [tone, setTone] = useState('Professional');
  const [audience, setAudience] = useState('');
  const [objective, setObjective] = useState('conversion');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await moduleShellApi.brandforgeos.generate({
        type,
        prompt,
        brandId: brandId || null,
        campaignId: campaignId || null,
        copyType: type === 'copy' ? copyType : null,
        channel: type === 'copy' ? copyType : null,
        tone: type === 'copy' ? tone : null,
        audience: audience || null,
        objective: objective || null,
        idempotencyKey: uniqueKey('brandforge-ui'),
      });
      setPrompt('');
    });
  };
  return (
    <Panel id="brandforgeos-ai" title="AI workflows" description="Turn an approved brand and campaign brief into review-ready copy and creative directions.">
      <div
        style={{
          ...cardStyle,
          marginBottom: space.lg,
          borderColor: provider.name === 'disabled' ? semantic.accentDanger : '#a855f7',
        }}
      >
        AI-assisted creation: <strong>{provider.name === 'disabled' ? 'Setup needed' : 'Ready'}</strong>
        {provider.name === 'disabled' && <span style={{ color: semantic.accentDanger }}> — ask an administrator to enable AI-assisted creation.</span>}
      </div>
      <CreateGrid onSubmit={submit} canWrite={canWrite}>
        <Select
          label="Workflow"
          value={type}
          onChange={setType}
          required
          options={[
            ['copy', 'Copy variants'],
            ['strategy', 'Campaign strategy'],
            ['campaign_ideas', 'Campaign ideas'],
          ]}
        />
        {type === 'copy' && <Select label="Channel / copy type" value={copyType} onChange={setCopyType} required options={(contract?.copyModes || []).map((value: string) => [value, value.replaceAll('_', ' ')])} />}
        {type === 'copy' && <Select label="Tone" value={tone} onChange={setTone} required options={(contract?.tones || []).map((value: string) => [value, value])} />}
        <Field label="Audience" value={audience} onChange={setAudience} />
        <Field label="Objective" value={objective} onChange={setObjective} />
        <Field label="Brief" value={prompt} onChange={setPrompt} required multiline />
        <Select label="Brand kit" value={brandId} onChange={setBrandId} options={brands.map((item) => [item.id, item.name])} />
        <Select label="Campaign" value={campaignId} onChange={setCampaignId} options={campaigns.map((item) => [item.id, item.name])} />
        <Submit saving={saving || provider.name === 'disabled'} label="Generate material" />
      </CreateGrid>
      <div style={{ display: 'grid', gap: space.md }}>
        {generations.length ? (
          generations.map((generation) => (
            <article key={generation.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{generation.generationType.replaceAll('_', ' ')}</strong>
                <span style={{ color: '#86efac', fontSize: 12 }}>AI-assisted · Saved · Ready to review</span>
              </div>
              <GenerationResult output={generation.output} />
              <details style={{ color: semantic.textMuted, fontSize: 12, marginTop: 10 }}>
                <summary style={{ cursor: 'pointer' }}>Technical details</summary>
                <p>{generation.provider} · {generation.model} · {generation.tokenCount} usage units</p>
              </details>
            </article>
          ))
        ) : (
          <Empty text="No generation results yet." />
        )}
      </div>
    </Panel>
  );
}

function GenerationResult({ output }: { output: Record<string, unknown> }) {
  const variants = Array.isArray(output.variants) ? output.variants as Array<Record<string, unknown>> : [];
  const ideas = Array.isArray(output.ideas) ? output.ideas as Array<Record<string, unknown>> : [];
  const suggestions = Array.isArray(output.suggestions) ? output.suggestions : [];
  if (variants.length) {
    return <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>{variants.map((variant, index) => (
      <section key={`${String(variant.title)}-${index}`} style={{ borderTop: `1px solid ${semantic.border}`, paddingTop: 10 }}>
        <strong>{String(variant.title || `Copy option ${index + 1}`)}</strong>
        <p style={{ color: semantic.textMuted, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{String(variant.content || '')}</p>
      </section>
    ))}</div>;
  }
  if (ideas.length) {
    return <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>{ideas.map((idea, index) => (
      <section key={`${String(idea.name)}-${index}`} style={{ borderTop: `1px solid ${semantic.border}`, paddingTop: 10 }}>
        <strong>{String(idea.name || `Campaign idea ${index + 1}`)}</strong>
        <p style={{ color: '#f0abfc', marginBottom: 4 }}>{String(idea.objective || '')}</p>
        <p style={{ color: semantic.textMuted, lineHeight: 1.55 }}>{String(idea.description || '')}</p>
        {Array.isArray(idea.channels) && <div style={{ color: semantic.textMuted, fontSize: 12 }}>Best channels: {idea.channels.map(String).join(', ')}</div>}
      </section>
    ))}</div>;
  }
  if (typeof output.title === 'string' || typeof output.content === 'string') {
    return <section style={{ borderTop: `1px solid ${semantic.border}`, paddingTop: 10, marginTop: 12 }}>
      {typeof output.title === 'string' && <strong>{output.title}</strong>}
      {typeof output.content === 'string' && <p style={{ color: semantic.textMuted, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{output.content}</p>}
      {suggestions.length > 0 && <ul style={{ color: semantic.textMuted }}>{suggestions.map((item, index) => <li key={`${String(item)}-${index}`}>{String(item)}</li>)}</ul>}
    </section>;
  }
  return <p style={{ color: semantic.textMuted }}>This saved result has no displayable copy yet.</p>;
}

function SettingsPanel({ workspace, saving, mutate, canWrite }: { workspace: any; saving: boolean; mutate: (task: () => Promise<unknown>) => Promise<void>; canWrite: boolean }) {
  const [industry, setIndustry] = useState(workspace.profile?.industry || '');
  const [products, setProducts] = useState(workspace.profile?.products || '');
  const [customer, setCustomer] = useState(workspace.profile?.idealCustomer || '');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(() =>
      moduleShellApi.brandforgeos.saveWorkspace({
        expectedVersion: workspace.version,
        completed: true,
        industry: industry || null,
        businessType: workspace.profile?.businessType || null,
        products: products || null,
        idealCustomer: customer || null,
        geographicMarket: workspace.profile?.geographicMarket || null,
        competitors: workspace.profile?.competitors || null,
        goals: workspace.profile?.goals || [],
        channels: workspace.profile?.channels || [],
      }),
    );
  };
  return (
    <Panel id="brandforgeos-settings" title="Workspace profile" description="These settings guide BrandForgeOS only. Organization name, team members, plans, and billing stay in OperatorOS.">
      <CreateGrid onSubmit={submit} canWrite={canWrite}>
        <Field label="Industry" value={industry} onChange={setIndustry} />
        <Field label="Products and services" value={products} onChange={setProducts} multiline />
        <Field label="Ideal customer" value={customer} onChange={setCustomer} multiline />
        <Submit saving={saving} label="Save workspace profile" />
      </CreateGrid>
      <div style={{ ...cardStyle, color: semantic.textMuted }}>Team access, profile, billing, and support are available from the shared account menu above.</div>
    </Panel>
  );
}

function CreateGrid({ onSubmit, children, canWrite = true }: { onSubmit: (event: FormEvent) => void; children: React.ReactNode; canWrite?: boolean }) {
  return (
    <form
      onSubmit={canWrite ? onSubmit : (event) => event.preventDefault()}
      aria-disabled={!canWrite}
      style={{
        ...cardStyle,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
        gap: space.md,
        alignItems: 'end',
        marginBottom: space.lg,
      }}
    >
      <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
        {children}
      </fieldset>
    </form>
  );
}
function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
        gap: space.md,
      }}
    >
      {children}
    </div>
  );
}
function Field({ label, value, onChange, required, multiline, type = 'text', min, step }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; multiline?: boolean; type?: string; min?: string; step?: string }) {
  return (
    <label style={{ color: semantic.textMuted, fontSize: 12 }}>
      {label}
      {multiline ? <textarea aria-label={label} required={required} value={value} onChange={(event) => onChange(event.target.value)} rows={3} style={{ ...inputStyle, marginTop: 5, resize: 'vertical' }} /> : <input aria-label={label} type={type} min={min} step={step} required={required} value={value} onChange={(event) => onChange(event.target.value)} style={{ ...inputStyle, marginTop: 5 }} />}
    </label>
  );
}
function Select({ label, value, onChange, options, required }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; required?: boolean }) {
  return (
    <label style={{ color: semantic.textMuted, fontSize: 12 }}>
      {label}
      <select aria-label={label} required={required} value={value} onChange={(event) => onChange(event.target.value)} style={{ ...inputStyle, marginTop: 5 }}>
        <option value="">None selected</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Submit({ saving, label }: { saving: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={saving}
      style={{
        ...buttonStyle,
        opacity: saving ? 0.55 : 1,
        display: 'inline-flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 7,
      }}
    >
      <Plus size={15} /> {saving ? 'Saving…' : label}
    </button>
  );
}
function Empty({ text }: { text: string }) {
  return <div style={{ ...cardStyle, color: semantic.textMuted, fontSize: fontSize.sm }}>{text}</div>;
}

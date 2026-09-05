'use client';

import React, { FormEvent, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  CloudCog,
  FileText,
  LockKeyhole,
  PlugZap,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { moduleShellApi, type BrandForgeCampaign } from '@/lib/auth';
import { radius, semantic, space } from '@/lib/design-tokens';

export type BrandForgeCompleteTab =
  | 'offers'
  | 'strategy'
  | 'templates'
  | 'integrations'
  | 'reports'
  | 'activity'
  | 'admin';
type Data = Record<string, any>;
type Mutate = (task: () => Promise<unknown>) => Promise<void>;

const panel: React.CSSProperties = {
  border: '1px solid rgba(216,180,254,.18)',
  background: 'linear-gradient(145deg,rgba(28,18,39,.95),rgba(11,8,18,.98))',
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 18px 50px rgba(0,0,0,.18)',
};
const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid rgba(216,180,254,.24)',
  background: '#100b18',
  color: '#f7efff',
  borderRadius: radius.sm,
  padding: '10px 12px',
  font: 'inherit',
};
const button: React.CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: '9px 14px',
  color: '#fff',
  fontWeight: 750,
  cursor: 'pointer',
  background: 'linear-gradient(135deg,#7c3aed,#db2777)',
};
const quiet: React.CSSProperties = {
  ...button,
  color: '#e9d5ff',
  background: 'rgba(124,58,237,.10)',
  border: '1px solid rgba(216,180,254,.22)',
};

function Heading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  return (
    <header style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: space.lg }}>
      <span
        style={{
          padding: 9,
          borderRadius: 12,
          background: 'linear-gradient(135deg,#7c3aed,#db2777)',
        }}
      >
        <Icon size={18} />
      </span>
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <p style={{ color: semantic.textMuted, margin: '5px 0 0' }}>{description}</p>
      </div>
    </header>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(245px,1fr))',
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}
function Field({
  label,
  value,
  setValue,
  required,
  textarea = false,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  required?: boolean;
  textarea?: boolean;
}) {
  return (
    <label style={{ display: 'grid', gap: 5, color: semantic.textMuted, fontSize: 12 }}>
      {label}
      {textarea ? (
        <textarea
          style={input}
          rows={3}
          value={value}
          required={required}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : (
        <input
          style={input}
          value={value}
          required={required}
          onChange={(event) => setValue(event.target.value)}
        />
      )}
    </label>
  );
}
function Select({
  label,
  value,
  setValue,
  options,
  required,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  options: string[][];
  required?: boolean;
}) {
  return (
    <label style={{ display: 'grid', gap: 5, color: semantic.textMuted, fontSize: 12 }}>
      {label}
      <select
        style={input}
        value={value}
        required={required}
        onChange={(event) => setValue(event.target.value)}
      >
        <option value="">Select…</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ ...panel, color: semantic.textMuted }}>{children}</div>;
}
function ReadOnlyNotice({ canWrite }: { canWrite: boolean }) {
  if (canWrite) return null;
  return <div role="note" style={{ ...panel, color: '#fde68a', marginBottom: 14 }}>Your access is read-only. Ask an organization administrator for edit access to create or change this content.</div>;
}

export function BrandForgeCompletePanel({
  tab,
  data,
  campaigns,
  saving,
  mutate,
  canWrite,
  canAdmin,
}: {
  tab: BrandForgeCompleteTab;
  data: Data;
  campaigns: BrandForgeCampaign[];
  saving: boolean;
  mutate: Mutate;
  canWrite: boolean;
  canAdmin: boolean;
}) {
  if (tab === 'offers') return <Offers data={data} saving={saving} mutate={mutate} canWrite={canWrite} />;
  if (tab === 'strategy')
    return <Workflows data={data} campaigns={campaigns} saving={saving} mutate={mutate} canWrite={canWrite} />;
  if (tab === 'templates') return <Templates data={data} saving={saving} mutate={mutate} canWrite={canWrite} />;
  if (tab === 'integrations') return <Integrations data={data} saving={saving} mutate={mutate} canAdmin={canAdmin} />;
  if (tab === 'reports')
    return <Reports data={data} campaigns={campaigns} saving={saving} mutate={mutate} canWrite={canWrite} />;
  if (tab === 'activity') return <ActivityPanel data={data} />;
  return <AdminProjection data={data} />;
}

function Offers({ data, saving, mutate, canWrite }: { data: Data; saving: boolean; mutate: Mutate; canWrite: boolean }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cta, setCta] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await moduleShellApi.brandforgeos.createOffer({
        name,
        description: description || null,
        callToAction: cta || null,
        status: 'active',
      });
      setName('');
      setDescription('');
      setCta('');
    });
  };
  return (
    <section id="brandforgeos-offers" data-testid="brandforge-offers">
      <Heading
        icon={Sparkles}
        title="Offers and positioning"
        description="Turn pricing, audience, urgency, and calls to action into reusable campaign inputs."
      />
      <ReadOnlyNotice canWrite={canWrite} />
      <form
        onSubmit={submit}
        style={{
          ...panel,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
          gap: 12,
          alignItems: 'end',
          marginBottom: 14,
        }}
      >
        <Field label="Offer name" value={name} setValue={setName} required />
        <Field label="Positioning" value={description} setValue={setDescription} />
        <Field label="Call to action" value={cta} setValue={setCta} />
        <button style={button} disabled={saving || !canWrite}>
          Save offer
        </button>
      </form>
      <Grid>
        {data.offers?.length ? (
          data.offers.map((item: Data) => (
            <article key={item.id} style={panel}>
              <strong>{item.name}</strong>
              <p style={{ color: semantic.textMuted }}>
                {item.description || 'Positioning not added yet.'}
              </p>
              <span style={{ color: '#f0abfc', fontSize: 12 }}>
                {item.status} · {item.offer_type}
              </span>
            </article>
          ))
        ) : (
          <Empty>No offers yet.</Empty>
        )}
      </Grid>
    </section>
  );
}

function Workflows({
  data,
  campaigns,
  saving,
  mutate,
  canWrite,
}: {
  data: Data;
  campaigns: BrandForgeCampaign[];
  saving: boolean;
  mutate: Mutate;
  canWrite: boolean;
}) {
  const [workflowType, setWorkflowType] = useState('product_launch');
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      const workflow = await moduleShellApi.brandforgeos.createWorkflow({
        workflowType,
        name: name || workflowType.replaceAll('_', ' '),
        campaignId: campaignId || null,
        inputs: { context },
      });
      const result = await moduleShellApi.brandforgeos.generate({
        type: 'strategy',
        prompt: `Guided workflow ${workflowType}: ${context}`,
        campaignId: campaignId || null,
        idempotencyKey: `brandforge-workflow:${workflow.id}`,
        objective: workflowType,
      });
      await moduleShellApi.brandforgeos.completeWorkflow(workflow.id, result.generation.id);
      setName('');
      setContext('');
    });
  };
  const options = (
    data.contract?.workflows || [
      'product_launch',
      'content_plan',
      'ad_campaign',
      'lead_gen',
      'email_sequence',
      'refresh_messaging',
    ]
  ).map((id: string) => [id, id.replaceAll('_', ' ')]);
  return (
    <section id="brandforgeos-strategy" data-testid="brandforge-strategy">
      <Heading
        icon={Workflow}
        title="Guided strategy workflows"
        description="Six guided workflows turn your saved brand and campaign details into editable drafts you can review and reuse."
      />
      <ReadOnlyNotice canWrite={canWrite} />
      <form onSubmit={submit} style={{ ...panel, display: 'grid', gap: 12, marginBottom: 14 }}>
        <Grid>
          <Select
            label="Workflow"
            value={workflowType}
            setValue={setWorkflowType}
            options={options}
            required
          />
          <Field label="Workflow name" value={name} setValue={setName} />
          <Select
            label="Campaign"
            value={campaignId}
            setValue={setCampaignId}
            options={campaigns.map((item) => [item.id, item.name])}
          />
        </Grid>
        <Field
          label="Brief and guided inputs"
          value={context}
          setValue={setContext}
          required
          textarea
        />
        <button style={button} disabled={saving || !canWrite}>
          Run guided workflow
        </button>
      </form>
      <Grid>
        {data.workflows?.length ? (
          data.workflows.map((item: Data) => (
            <article key={item.id} style={panel}>
              <strong>{item.name}</strong>
              <p style={{ color: semantic.textMuted, textTransform: 'capitalize' }}>
                {item.workflow_type.replaceAll('_', ' ')}
              </p>
              <span style={{ color: item.status === 'completed' ? '#86efac' : '#f0abfc' }}>
                {item.status}
              </span>
            </article>
          ))
        ) : (
          <Empty>No guided workflow runs yet.</Empty>
        )}
      </Grid>
    </section>
  );
}

function Templates({ data, saving, mutate, canWrite }: { data: Data; saving: boolean; mutate: Mutate; canWrite: boolean }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('campaign');
  const [content, setContent] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await moduleShellApi.brandforgeos.createTemplate({
        name,
        category,
        templateType: 'campaign',
        content: { brief: content },
        tags: [category],
      });
      setName('');
      setContent('');
    });
  };
  return (
    <section id="brandforgeos-templates" data-testid="brandforge-templates">
      <Heading
        icon={Sparkles}
        title="Template marketplace"
        description="Preview built-in and team templates. Application Stack access includes every BrandForgeOS software template; grandfathered access keeps its recorded template permissions."
      />
      <ReadOnlyNotice canWrite={canWrite} />
      <form
        onSubmit={submit}
        style={{
          ...panel,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
          gap: 12,
          alignItems: 'end',
          marginBottom: 14,
        }}
      >
        <Field label="Template name" value={name} setValue={setName} required />
        <Field label="Category" value={category} setValue={setCategory} required />
        <Field label="Reusable brief" value={content} setValue={setContent} required />
        <button style={button} disabled={saving || !canWrite}>
          Create template
        </button>
      </form>
      <Grid>
        {data.templates?.length ? (
          data.templates.map((item: Data) => (
            <article
              key={item.id}
              style={{
                ...panel,
                borderColor: item.is_featured ? 'rgba(236,72,153,.55)' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{item.name}</strong>
                {item.is_premium && <LockKeyhole size={15} />}
              </div>
              <p style={{ color: semantic.textMuted }}>{item.description || item.category}</p>
              <details style={{ marginBottom: 12 }}>
                <summary style={{ color: '#e9d5ff', cursor: 'pointer' }}>Preview template</summary>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: semantic.textMuted,
                    font: 'inherit',
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(item.content, null, 2)}
                </pre>
              </details>
              <button
                style={item.usable ? button : quiet}
                disabled={saving || !canWrite || !item.usable}
                onClick={() => void mutate(() => moduleShellApi.brandforgeos.useTemplate(item.id))}
              >
                {item.usable ? 'Use template' : 'Not included with this access'}
              </button>
            </article>
          ))
        ) : (
          <Empty>No templates available.</Empty>
        )}
      </Grid>
    </section>
  );
}

function Integrations({ data, saving, mutate, canAdmin }: { data: Data; saving: boolean; mutate: Mutate; canAdmin: boolean }) {
  const [mode, setMode] = useState('disabled');
  const [secretReference, setSecretReference] = useState('');
  const runtimeAvailable = data.integrations?.some((item: Data) => item.runtimeAvailable === true) === true;
  return (
    <section id="brandforgeos-integrations" data-testid="brandforge-integrations">
      <Heading
        icon={PlugZap}
        title="Connections and exports"
        description="Download approved campaign packages for the tools your team uses. Direct connections appear only when they are ready to use."
      />
      {!canAdmin && <div role="note" style={{ ...panel, color: '#fde68a', marginBottom: 14 }}>Only organization owners and administrators can change connection settings.</div>}
      {!runtimeAvailable && <div role="status" style={{ ...panel, marginBottom: 14 }}><strong>Direct publishing connections are not available yet.</strong><p style={{ color: semantic.textMuted, marginBottom: 0 }}>Use Reports and Exports to download the approved package. No credential entered here can publish an ad, send a campaign, or change an external account.</p></div>}
      {runtimeAvailable && <div
        style={{
          ...panel,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <Select
          label="Connection mode"
          value={mode}
          setValue={setMode}
          options={[
            ['disabled', 'Disabled'],
            ['test', 'Safe local test'],
          ]}
        />
        <Field
          label="Saved connection credential name"
          value={secretReference}
          setValue={setSecretReference}
        />
        <div style={{ color: semantic.textMuted, fontSize: 12, alignSelf: 'end' }}>
          This checks the saved connection setup and does not send or publish anything.
        </div>
      </div>}
      <Grid>
        {data.integrations?.map((item: Data) => {
          const state = item.connection?.status || 'disconnected';
          return (
            <article key={item.provider} style={panel}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{item.name}</strong>
                <CloudCog size={17} />
              </div>
              <p style={{ color: semantic.textMuted }}>
                Export approved files now; use a direct connection when one is available.
              </p>
              <div
                style={{
                  color:
                    state === 'ready' ? '#86efac' : state === 'degraded' ? '#fde68a' : '#f0abfc',
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                {item.runtimeAvailable === true
                  ? !item.entitled
                    ? 'Not included with this grandfathered access'
                    : state === 'ready' ? 'Ready to use' : state === 'degraded' ? 'Needs attention' : 'Eligible · setup required'
                  : 'File export available · direct connection planned'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {item.runtimeAvailable !== true ? (
                  <a href="/modules/brandforgeos/reports" style={{ ...quiet, textDecoration: 'none' }}>Open exports</a>
                ) : !item.entitled ? (
                  <button style={quiet} disabled>Not included with this access</button>
                ) : !item.connection || state === 'revoked' ? (
                  <button
                    style={button}
                    disabled={saving || !canAdmin}
                    onClick={() =>
                      void mutate(() =>
                        moduleShellApi.brandforgeos.connectIntegration(item.provider, {
                          mode,
                          secretReference: secretReference || null,
                          callbackReady: false,
                          publicConfig: {},
                        }),
                      )
                    }
                  >
                    Configure
                  </button>
                ) : (
                  <>
                    <button
                      style={button}
                      disabled={saving || !canAdmin || !['ready', 'degraded'].includes(state)}
                      onClick={() =>
                        void mutate(() =>
                          moduleShellApi.brandforgeos.syncIntegration(
                            item.provider,
                            `brandforge-sync:${item.provider}:${Date.now()}`,
                          ),
                        )
                      }
                    >
                      Check connection
                    </button>
                    <button
                      style={quiet}
                      disabled={saving || !canAdmin}
                      onClick={() =>
                        void mutate(() =>
                          moduleShellApi.brandforgeos.disconnectIntegration(item.provider),
                        )
                      }
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </Grid>
    </section>
  );
}

function Reports({
  data,
  campaigns,
  saving,
  mutate,
  canWrite,
}: {
  data: Data;
  campaigns: BrandForgeCampaign[];
  saving: boolean;
  mutate: Mutate;
  canWrite: boolean;
}) {
  const [name, setName] = useState('');
  const [reportType, setReportType] = useState('campaign_summary');
  const [campaignId, setCampaignId] = useState('');
  const [whiteLabel, setWhiteLabel] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      const report = await moduleShellApi.brandforgeos.createReport({
        name,
        reportType,
        campaignId: campaignId || null,
        sections: ['kpis', 'channels', 'activity'],
        isWhiteLabel: whiteLabel,
        branding: whiteLabel ? { companyName: 'Workspace brand', color: '#7c3aed' } : {},
      });
      await moduleShellApi.brandforgeos.generateReport(report.id);
      setName('');
    });
  };
  return (
    <section id="brandforgeos-reports" data-testid="brandforge-reports">
      <Heading
        icon={FileText}
        title="Reports and export jobs"
        description="Create a review-ready snapshot of the campaign results recorded at that moment, with verification details included."
      />
      <ReadOnlyNotice canWrite={canWrite} />
      <form
        onSubmit={submit}
        style={{
          ...panel,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
          gap: 12,
          alignItems: 'end',
          marginBottom: 14,
        }}
      >
        <Field label="Report name" value={name} setValue={setName} required />
        <Select
          label="Report type"
          value={reportType}
          setValue={setReportType}
          options={(
            data.contract?.reportTypes || [
              'campaign_summary',
              'content_performance',
              'channel_breakdown',
              'executive_summary',
              'team_activity',
              'brand_health',
            ]
          ).map((id: string) => [id, id.replaceAll('_', ' ')])}
        />
        <Select
          label="Campaign"
          value={campaignId}
          setValue={setCampaignId}
          options={campaigns.map((item) => [item.id, item.name])}
        />
        <label style={{ color: semantic.textMuted, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={whiteLabel}
            onChange={(event) => setWhiteLabel(event.target.checked)}
          />{' '}
          White-label branding
        </label>
        <button style={button} disabled={saving || !canWrite}>
          Generate report
        </button>
      </form>
      <Grid>
        {data.reports?.length ? (
          data.reports.map((item: Data) => (
            <article key={item.id} style={panel}>
              <strong>{item.name}</strong>
              <p style={{ color: semantic.textMuted }}>
                {item.report_type.replaceAll('_', ' ')} · {item.status}
              </p>
              {item.snapshot_sha256 && (
                <details style={{ marginTop: 7, color: semantic.textMuted, fontSize: 11 }}>
                  <summary>File verification details</summary>
                  <code style={{ display: 'block', marginTop: 5, fontSize: 10, color: '#c4b5fd' }}>
                    {item.snapshot_sha256.slice(0, 18)}…
                  </code>
                </details>
              )}
              {item.snapshot?.metrics && (
                <div
                  data-testid="brandforge-report-kpi-preview"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
                    gap: 6,
                    marginTop: 12,
                  }}
                >
                  {[
                    ['Impressions', item.snapshot.metrics.impressions],
                    ['Clicks', item.snapshot.metrics.clicks],
                    ['Conversions', item.snapshot.metrics.conversions],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        padding: 7,
                        borderRadius: 8,
                        background: 'rgba(124,58,237,.10)',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ display: 'block', color: semantic.textMuted, fontSize: 9 }}>
                        {label}
                      </span>
                      <strong>{String(value ?? 0)}</strong>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <button
                  style={quiet}
                  disabled={saving || !canWrite || item.status !== 'generated'}
                  onClick={() =>
                    void mutate(() =>
                      moduleShellApi.brandforgeos.createExport({
                        reportId: item.id,
                        exportType: 'report',
                        format: 'html',
                        idempotencyKey: `brandforge-export:${item.id}:html`,
                      }),
                    )
                  }
                >
                  Queue HTML export
                </button>
              </div>
            </article>
          ))
        ) : (
          <Empty>No reports yet.</Empty>
        )}
      </Grid>
      {data.exports?.length > 0 && (
        <div style={{ ...panel, marginTop: 14 }}>
          <h3>Export history</h3>
          {data.exports.map((item: Data) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderTop: '1px solid rgba(216,180,254,.12)',
              }}
            >
              <span>
                {item.format} · {item.status}
              </span>
              {item.status === 'completed' && (
                <a
                  style={{ color: '#f0abfc' }}
                  href={`/api/modules/brandforgeos/exports/${item.id}/download`}
                >
                  Download
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityPanel({ data }: { data: Data }) {
  return (
    <section id="brandforgeos-activity" data-testid="brandforge-activity">
      <Heading
        icon={Activity}
        title="Activity and notifications"
        description="See recent creative work, team decisions, and alerts in one timeline."
      />
      <Grid>
        <div style={panel}>
          <h3>Recent activity</h3>
          {data.activity?.length ? (
            data.activity.map((item: Data) => (
              <div
                key={item.id}
                style={{ padding: '9px 0', borderTop: '1px solid rgba(216,180,254,.12)' }}
              >
                <strong>{item.summary}</strong>
                <div style={{ fontSize: 11, color: semantic.textMuted }}>{item.event_type}</div>
              </div>
            ))
          ) : (
            <p style={{ color: semantic.textMuted }}>No activity recorded.</p>
          )}
        </div>
        <div style={panel}>
          <h3>Notifications</h3>
          {data.notifications?.length ? (
            data.notifications.map((item: Data) => (
              <div
                key={item.id}
                style={{ padding: '9px 0', borderTop: '1px solid rgba(216,180,254,.12)' }}
              >
                <strong>{item.title}</strong>
                <p style={{ color: semantic.textMuted, fontSize: 12 }}>{item.message}</p>
              </div>
            ))
          ) : (
            <p style={{ color: semantic.textMuted }}>No notifications.</p>
          )}
        </div>
      </Grid>
    </section>
  );
}

function AdminProjection({ data }: { data: Data }) {
  const entitlement = data.plan?.credits || {};
  const applicationStack = data.plan?.accessModel === 'application_stack';
  return (
    <section id="brandforgeos-admin" data-testid="brandforge-admin">
      <Heading
        icon={CheckCircle2}
        title="Access, usage, and protection"
        description="Review BrandForgeOS access and creative usage here. Use OperatorOS to manage the Application Stack, members, roles, or any explicitly configured allowance."
      />
      <Grid>
        <article style={panel}>
          <h3>BrandForgeOS access</h3>
          <strong>{applicationStack ? 'Application Stack · complete software access' : data.plan?.module?.status === 'enabled' ? 'Ready to use' : data.plan?.module?.status === 'disabled' ? 'Not included' : 'Unavailable'}</strong>
          <p style={{ color: semantic.textMuted }}>
            Managed by {data.plan?.authority === 'operatoros' ? 'OperatorOS' : 'your organization'}
          </p>
          <a href="/app" style={{ color: '#f0abfc' }}>
            Open OperatorOS control center
          </a>
        </article>
        <article style={panel}>
          <h3>Generation credits</h3>
          <strong style={{ fontSize: 26 }}>
            {entitlement.used || 0}
            {entitlement.limit === null ? ' used' : ` / ${entitlement.limit}`}
          </strong>
          <p style={{ color: semantic.textMuted }}>
            {entitlement.unmetered
              ? applicationStack
                ? 'Application Stack currently has no numeric BrandForgeOS generation limit.'
                : 'No numeric generation limit is recorded for this grandfathered or manually managed access.'
              : 'Used from this organization’s monthly creative allowance.'}
          </p>
        </article>
        <article style={panel}>
          <h3>How your work is protected</h3>
          <p style={{ color: semantic.textMuted }}>
            Only approved team members can make changes. Connection details stay protected, AI
            drafts are checked before saving, and usage history remains available for review.
          </p>
        </article>
      </Grid>
    </section>
  );
}

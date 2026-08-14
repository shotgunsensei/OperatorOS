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

export function BrandForgeCompletePanel({
  tab,
  data,
  campaigns,
  saving,
  mutate,
}: {
  tab: BrandForgeCompleteTab;
  data: Data;
  campaigns: BrandForgeCampaign[];
  saving: boolean;
  mutate: Mutate;
}) {
  if (tab === 'offers') return <Offers data={data} saving={saving} mutate={mutate} />;
  if (tab === 'strategy')
    return <Workflows data={data} campaigns={campaigns} saving={saving} mutate={mutate} />;
  if (tab === 'templates') return <Templates data={data} saving={saving} mutate={mutate} />;
  if (tab === 'integrations') return <Integrations data={data} saving={saving} mutate={mutate} />;
  if (tab === 'reports')
    return <Reports data={data} campaigns={campaigns} saving={saving} mutate={mutate} />;
  if (tab === 'activity') return <ActivityPanel data={data} />;
  return <AdminProjection data={data} />;
}

function Offers({ data, saving, mutate }: { data: Data; saving: boolean; mutate: Mutate }) {
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
        <button style={button} disabled={saving}>
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
}: {
  data: Data;
  campaigns: BrandForgeCampaign[];
  saving: boolean;
  mutate: Mutate;
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
        description="Six source workflows persist their inputs, validated generation, usage, and recoverable result."
      />
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
        <button style={button} disabled={saving}>
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

function Templates({ data, saving, mutate }: { data: Data; saving: boolean; mutate: Mutate }) {
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
        description="Preview global and workspace templates. Premium use is enforced by OperatorOS entitlement, not a child checkout."
      />
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
        <button style={button} disabled={saving}>
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
                disabled={saving || !item.usable}
                onClick={() => void mutate(() => moduleShellApi.brandforgeos.useTemplate(item.id))}
              >
                {item.usable ? 'Use template' : 'Upgrade in OperatorOS'}
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

function Integrations({ data, saving, mutate }: { data: Data; saving: boolean; mutate: Mutate }) {
  const [mode, setMode] = useState('disabled');
  const [secretReference, setSecretReference] = useState('');
  return (
    <section id="brandforgeos-integrations" data-testid="brandforge-integrations">
      <Heading
        icon={PlugZap}
        title="Integration control room"
        description="Credentials are encrypted shared references. Health is explicit; a secret alone never marks an adapter ready."
      />
      <div
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
            ['test', 'Deterministic test'],
            ['live', 'Live provider'],
          ]}
        />
        <Field
          label="Shared secret reference"
          value={secretReference}
          setValue={setSecretReference}
        />
        <div style={{ color: semantic.textMuted, fontSize: 12, alignSelf: 'end' }}>
          Live OAuth and webhook providers also require reviewed callback readiness.
        </div>
      </div>
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
                {item.category} · {item.requiredFeature}
              </p>
              <div
                style={{
                  color:
                    state === 'ready' ? '#86efac' : state === 'degraded' ? '#fde68a' : '#f0abfc',
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                {state}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!item.connection || state === 'revoked' ? (
                  <button
                    style={button}
                    disabled={saving}
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
                      disabled={saving || !['ready', 'degraded'].includes(state)}
                      onClick={() =>
                        void mutate(() =>
                          moduleShellApi.brandforgeos.syncIntegration(
                            item.provider,
                            `brandforge-sync:${item.provider}:${Date.now()}`,
                          ),
                        )
                      }
                    >
                      Sync
                    </button>
                    <button
                      style={quiet}
                      disabled={saving}
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
}: {
  data: Data;
  campaigns: BrandForgeCampaign[];
  saving: boolean;
  mutate: Mutate;
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
        description="KPI previews and white-label reports are snapshots of persisted facts with a SHA-256 integrity hash."
      />
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
        <button style={button} disabled={saving}>
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
                <code style={{ fontSize: 10, color: '#c4b5fd' }}>
                  {item.snapshot_sha256.slice(0, 18)}…
                </code>
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
                  disabled={saving || item.status !== 'generated'}
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
        description="Collaboration and generation history are sourced from shared OperatorOS activity and notification services."
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
  return (
    <section id="brandforgeos-admin" data-testid="brandforge-admin">
      <Heading
        icon={CheckCircle2}
        title="Team, security, plan, and usage"
        description="This screen is a read-only projection. Membership, roles, plan changes, feature flags, and credit adjustment stay in OperatorOS."
      />
      <Grid>
        <article style={panel}>
          <h3>Module entitlement</h3>
          <strong>{data.plan?.module?.status || 'Unavailable'}</strong>
          <p style={{ color: semantic.textMuted }}>
            Authority: {data.plan?.authority || 'operatoros'}
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
              ? 'Metered for audit; no numeric cap is assigned.'
              : 'Monthly limit enforced atomically across concurrent requests.'}
          </p>
        </article>
        <article style={panel}>
          <h3>Security boundary</h3>
          <p style={{ color: semantic.textMuted }}>
            Tenant/module-sealed session, role-gated writes, encrypted provider references,
            validated AI output, append-only usage and activity.
          </p>
        </article>
      </Grid>
    </section>
  );
}

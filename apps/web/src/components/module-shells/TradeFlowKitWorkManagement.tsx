'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  GitBranch,
  Loader2,
  Plus,
  Search,
  Star,
  Workflow,
} from 'lucide-react';
import {
  moduleShellApi,
  type TradeFlowKitActivity,
  type TradeFlowKitJob,
  type TradeFlowKitTask,
  type TradeFlowKitWorkflow,
} from '@/lib/auth';

const taskStatuses: TradeFlowKitTask['status'][] = ['todo', 'in_progress', 'blocked', 'completed', 'canceled'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'TradeFlowKit could not complete that action.';
}

export default function TradeFlowKitWorkManagement({
  tenantKey,
  canManage,
}: {
  tenantKey: string;
  canManage: boolean;
}) {
  const [workflows, setWorkflows] = useState<TradeFlowKitWorkflow[]>([]);
  const [tasks, setTasks] = useState<TradeFlowKitTask[]>([]);
  const [jobs, setJobs] = useState<TradeFlowKitJob[]>([]);
  const [activity, setActivity] = useState<TradeFlowKitActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [workflowEntity, setWorkflowEntity] = useState<'job' | 'task'>('job');
  const [workflowStages, setWorkflowStages] = useState('New, Scheduled, In progress, Complete');
  const [workflowDefault, setWorkflowDefault] = useState(false);
  const [newStageNames, setNewStageNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [workflowRows, taskRows, activityRows, operations] = await Promise.all([
        moduleShellApi.tradeflowkit.workflows(),
        moduleShellApi.tradeflowkit.tasks({
          scope: 'team',
          status: taskStatus || undefined,
          search: taskSearch.trim() || undefined,
          limit: 100,
        }),
        moduleShellApi.tradeflowkit.activity({ limit: 50 }),
        moduleShellApi.tradeflowkit.operations({ limit: 100 }),
      ]);
      setWorkflows(workflowRows);
      setTasks(taskRows.items);
      setActivity(activityRows.items);
      setJobs(operations.jobs);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [taskSearch, taskStatus]);

  useEffect(() => {
    void load();
  }, [load, tenantKey]);

  const run = useCallback(async (operation: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await operation();
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }, [load]);

  const createWorkflow = (event: FormEvent) => {
    event.preventDefault();
    const stageNames = workflowStages.split(',').map(value => value.trim()).filter(Boolean);
    if (!workflowName.trim() || stageNames.length === 0) {
      setError('Enter a workflow name and at least one comma-separated stage.');
      return;
    }
    const statusMap = workflowEntity === 'job'
      ? ['lead', 'scheduled', 'in_progress', 'done']
      : ['todo', 'in_progress', 'blocked', 'completed'];
    void run(async () => {
      await moduleShellApi.tradeflowkit.createWorkflow({
        name: workflowName.trim(),
        description: workflowDescription.trim(),
        entityType: workflowEntity,
        isDefault: workflowDefault,
        stages: stageNames.map((name, position) => ({
          name,
          position,
          color: stageColor(position),
          mappedStatus: statusMap[position] ?? null,
        })),
      });
      setWorkflowName('');
      setWorkflowDescription('');
      setWorkflowDefault(false);
    });
  };

  const jobWorkflows = useMemo(
    () => workflows.filter(workflow => workflow.entityType === 'job'),
    [workflows],
  );
  const jobStages = useMemo(
    () => jobWorkflows.flatMap(workflow => workflow.stages.map(stage => ({ ...stage, workflowName: workflow.name }))),
    [jobWorkflows],
  );

  return (
    <section
      id="tradeflowkit-work-management"
      className="tfk-panel tfk-work"
      data-testid="tradeflowkit-work-management"
      tabIndex={-1}
    >
      <style>{css}</style>
      <header className="tfk-work-heading">
        <div>
          <div className="tfk-work-eyebrow"><Workflow size={15} /> Restored operations workspace</div>
          <h2>Workflows, team tasks, and activity</h2>
          <p>Persisted workflow stages coordinate jobs and job-scoped tasks without creating a second tenant or identity system.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || pending}>Refresh</button>
      </header>

      {error && <div className="tfk-work-alert" role="alert" data-testid="tradeflowkit-work-management-error"><AlertTriangle size={17} />{error}</div>}
      {loading ? (
        <div className="tfk-work-state" aria-busy="true" data-testid="tradeflowkit-work-management-loading">
          <Loader2 className="spin" size={19} /> Loading persisted work management…
        </div>
      ) : (
        <>
          <div className="tfk-work-metrics">
            <Metric label="Active workflows" value={workflows.length} />
            <Metric label="Open team tasks" value={tasks.filter(task => !['completed', 'canceled'].includes(task.status)).length} />
            <Metric label="Recent events" value={activity.length} />
          </div>

          <section className="tfk-work-section" aria-labelledby="tfk-workflow-heading">
            <div className="tfk-work-section-heading">
              <div><GitBranch size={18} /><div><h3 id="tfk-workflow-heading">Workflow templates</h3><p>Admins define ordered job or task stages; transitions remain version checked and audited.</p></div></div>
            </div>

            {canManage && (
              <form className="tfk-work-form" onSubmit={createWorkflow} data-testid="tradeflowkit-workflow-create-form">
                <label>Name<input value={workflowName} onChange={event => setWorkflowName(event.target.value)} maxLength={120} required /></label>
                <label>Applies to<select value={workflowEntity} onChange={event => setWorkflowEntity(event.target.value as 'job' | 'task')}><option value="job">Jobs</option><option value="task">Tasks</option></select></label>
                <label className="wide">Description<input value={workflowDescription} onChange={event => setWorkflowDescription(event.target.value)} maxLength={2000} /></label>
                <label className="wide">Stages, comma separated<input value={workflowStages} onChange={event => setWorkflowStages(event.target.value)} required /></label>
                <label className="check"><input type="checkbox" checked={workflowDefault} onChange={event => setWorkflowDefault(event.target.checked)} />Default for new {workflowEntity}s</label>
                <button type="submit" disabled={pending}><Plus size={15} />Create workflow</button>
              </form>
            )}

            {workflows.length === 0 ? (
              <div className="tfk-work-state"><GitBranch size={18} /><span>No workflows yet. An authorized tenant admin can create the first real workflow.</span></div>
            ) : (
              <div className="tfk-workflow-list">
                {workflows.map(workflow => (
                  <article key={workflow.id} className="tfk-workflow-card" data-testid={`tradeflowkit-workflow-${workflow.id}`}>
                    <div className="tfk-workflow-title">
                      <div><strong>{workflow.name}</strong><span>{workflow.entityType} workflow · v{workflow.version}</span></div>
                      {workflow.isDefault && <span className="tfk-work-default"><Star size={12} />Default</span>}
                    </div>
                    {workflow.description && <p>{workflow.description}</p>}
                    <ol className="tfk-stage-list">
                      {workflow.stages.map(stage => (
                        <li key={stage.id}>
                          <span style={{ background: stage.color }} />
                          <strong>{stage.name}</strong>
                          <small>{stage.mappedStatus ? `maps to ${stage.mappedStatus}` : 'no status change'} · v{stage.version}</small>
                        </li>
                      ))}
                    </ol>
                    {canManage && (
                      <div className="tfk-workflow-actions">
                        <input
                          aria-label={`New stage for ${workflow.name}`}
                          placeholder="Add stage"
                          value={newStageNames[workflow.id] ?? ''}
                          onChange={event => setNewStageNames(current => ({ ...current, [workflow.id]: event.target.value }))}
                        />
                        <button
                          type="button"
                          disabled={pending || !(newStageNames[workflow.id] ?? '').trim()}
                          onClick={() => {
                            const name = (newStageNames[workflow.id] ?? '').trim();
                            void run(async () => {
                              await moduleShellApi.tradeflowkit.addWorkflowStage(workflow.id, {
                                expectedWorkflowVersion: workflow.version,
                                name,
                                position: workflow.stages.length,
                                color: stageColor(workflow.stages.length),
                              });
                              setNewStageNames(current => ({ ...current, [workflow.id]: '' }));
                            });
                          }}
                        ><Plus size={14} />Stage</button>
                        {!workflow.isDefault && <button type="button" disabled={pending} onClick={() => void run(() => moduleShellApi.tradeflowkit.updateWorkflow(workflow.id, { expectedVersion: workflow.version, isDefault: true }))}><Star size={14} />Make default</button>}
                        <button className="danger" type="button" disabled={pending} onClick={() => void run(() => moduleShellApi.tradeflowkit.archiveWorkflow(workflow.id, workflow.version))}><Archive size={14} />Archive</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="tfk-work-section" aria-labelledby="tfk-job-board-heading">
            <div className="tfk-work-section-heading">
              <div><Workflow size={18} /><div><h3 id="tfk-job-board-heading">Job workflow board</h3><p>Move persisted jobs through an approved template; mapped stages update canonical job status.</p></div></div>
            </div>
            {jobs.length === 0 ? <div className="tfk-work-state">No jobs are available for workflow assignment.</div> : (
              <div className="tfk-job-workflow-list">
                {jobs.map(job => (
                  <div key={job.id}>
                    <div><strong>{job.title}</strong><span>#{job.number ?? '—'} · {job.status} · v{job.version}</span></div>
                    <select
                      aria-label={`Workflow stage for ${job.title}`}
                      value={job.workflowStageId ?? ''}
                      disabled={!canManage || pending || jobStages.length === 0}
                      onChange={event => {
                        if (event.target.value) void run(() => moduleShellApi.tradeflowkit.transitionJobWorkflow(job.id, event.target.value, job.version));
                      }}
                    >
                      <option value="">No workflow stage</option>
                      {jobStages.map(stage => <option key={stage.id} value={stage.id}>{stage.workflowName} · {stage.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="tfk-work-section" aria-labelledby="tfk-team-task-heading">
            <div className="tfk-work-section-heading">
              <div><CheckCircle2 size={18} /><div><h3 id="tfk-team-task-heading">Team tasks</h3><p>Search and manage every persisted job task in the current tenant.</p></div></div>
              <div className="tfk-task-filters">
                <label><Search size={14} /><input value={taskSearch} onChange={event => setTaskSearch(event.target.value)} placeholder="Search tasks" /></label>
                <select value={taskStatus} onChange={event => setTaskStatus(event.target.value)}><option value="">All statuses</option>{taskStatuses.map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select>
              </div>
            </div>
            {tasks.length === 0 ? <div className="tfk-work-state">No job tasks match this view. Create a task from the operations board.</div> : (
              <div className="tfk-team-tasks">
                {tasks.map(task => (
                  <article key={task.id} data-testid={`tradeflowkit-team-task-${task.id}`}>
                    <div><strong>{task.title}</strong><span>{task.jobTitle ?? 'Job'} · {task.customerName ?? 'Customer'} · v{task.version}</span></div>
                    <select
                      aria-label={`Status for ${task.title}`}
                      value={task.status}
                      disabled={!canManage || pending}
                      onChange={event => void run(() => moduleShellApi.tradeflowkit.updateTask(task.id, {
                        expectedVersion: task.version,
                        status: event.target.value,
                      }))}
                    >
                      {taskStatuses.map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                    </select>
                    {canManage && <button type="button" className="icon danger" title="Archive task" disabled={pending} onClick={() => void run(() => moduleShellApi.tradeflowkit.archiveTask(task.id, task.version))}><Archive size={14} /><span className="sr-only">Archive {task.title}</span></button>}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="tfk-work-section" aria-labelledby="tfk-activity-heading">
            <div className="tfk-work-section-heading">
              <div><Activity size={18} /><div><h3 id="tfk-activity-heading">Recent activity</h3><p>Tenant-scoped audit events from real workflow mutations.</p></div></div>
            </div>
            {activity.length === 0 ? <div className="tfk-work-state">No TradeFlowKit activity has been recorded yet.</div> : (
              <div className="tfk-activity-list">
                {activity.map(item => (
                  <div key={item.id}>
                    <span><Activity size={13} /></span>
                    <div><strong>{item.action.replaceAll('_', ' ')}</strong><small>{item.entityType.replace('tradeflowkit_', '')} · {new Date(item.createdAt).toLocaleString()}</small></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function stageColor(position: number): string {
  return ['#2563eb', '#0f766e', '#b7791f', '#059669', '#6d28d9', '#dc2626'][position % 6];
}

const css = `
  .tfk-work { padding: 18px; display: grid; gap: 16px; }
  .tfk-work-heading, .tfk-work-section-heading, .tfk-workflow-title, .tfk-workflow-actions,
  .tfk-job-workflow-list > div, .tfk-team-tasks article { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .tfk-work-heading { align-items: flex-start; }
  .tfk-work-heading h2, .tfk-work-section h3 { margin: 0; }
  .tfk-work-heading p, .tfk-work-section-heading p, .tfk-workflow-card p { margin: 5px 0 0; color: #587067; font-size: 13px; line-height: 1.45; }
  .tfk-work-eyebrow { display: flex; align-items: center; gap: 7px; color: #059669; font-size: 12px; font-weight: 800; text-transform: uppercase; margin-bottom: 7px; }
  .tfk-work button, .tfk-work input, .tfk-work select { font: inherit; }
  .tfk-work button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid rgba(5,150,105,.28); border-radius: 7px; padding: 8px 10px; background: #fff; color: #10231d; font-size: 12px; font-weight: 800; cursor: pointer; }
  .tfk-work button:disabled { opacity: .52; cursor: not-allowed; }
  .tfk-work button.danger { color: #b91c1c; border-color: rgba(220,38,38,.25); }
  .tfk-work button.icon { padding: 8px; }
  .tfk-work input, .tfk-work select { min-width: 0; border: 1px solid rgba(22,101,52,.2); border-radius: 7px; padding: 8px 9px; background: #fff; color: #10231d; }
  .tfk-work-alert, .tfk-work-state { display: flex; align-items: center; gap: 9px; border: 1px solid rgba(220,38,38,.28); border-radius: 8px; padding: 12px; background: rgba(220,38,38,.06); color: #991b1b; font-size: 13px; }
  .tfk-work-state { border-color: rgba(5,150,105,.2); background: #eef8f2; color: #587067; }
  .tfk-work-metrics { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
  .tfk-work-metrics > div { border: 1px solid rgba(22,101,52,.16); border-radius: 8px; padding: 12px; background: #f8fcfa; }
  .tfk-work-metrics span { color: #587067; font-size: 12px; display: block; }
  .tfk-work-metrics strong { display: block; margin-top: 4px; font-size: 22px; }
  .tfk-work-section { display: grid; gap: 12px; border-top: 1px solid rgba(22,101,52,.14); padding-top: 16px; }
  .tfk-work-section-heading > div:first-child { display: flex; gap: 9px; align-items: flex-start; }
  .tfk-work-form { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; border: 1px solid rgba(5,150,105,.22); border-radius: 8px; padding: 12px; background: #f3faf6; }
  .tfk-work-form label { display: grid; gap: 5px; color: #587067; font-size: 12px; font-weight: 700; }
  .tfk-work-form .wide { grid-column: 1/-1; }
  .tfk-work-form .check { display: flex; align-items: center; flex-direction: row; }
  .tfk-work-form .check input { min-width: auto; }
  .tfk-workflow-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
  .tfk-workflow-card { border: 1px solid rgba(22,101,52,.16); border-radius: 8px; padding: 13px; min-width: 0; }
  .tfk-workflow-title > div, .tfk-job-workflow-list > div > div, .tfk-team-tasks article > div { min-width: 0; }
  .tfk-workflow-title span, .tfk-job-workflow-list span, .tfk-team-tasks span { display: block; color: #587067; font-size: 11px; margin-top: 3px; }
  .tfk-work-default { display: inline-flex !important; align-items: center; gap: 4px; color: #b7791f !important; background: rgba(183,121,31,.1); border-radius: 999px; padding: 5px 8px; margin: 0 !important; font-weight: 800; }
  .tfk-stage-list { list-style: none; padding: 0; margin: 12px 0; display: grid; gap: 7px; }
  .tfk-stage-list li { display: grid; grid-template-columns: 9px minmax(0,1fr); gap: 2px 8px; align-items: center; font-size: 12px; }
  .tfk-stage-list li > span { width: 9px; height: 9px; border-radius: 999px; grid-row: 1/3; }
  .tfk-stage-list small { color: #789189; }
  .tfk-workflow-actions { justify-content: flex-start; flex-wrap: wrap; }
  .tfk-workflow-actions input { flex: 1 1 120px; }
  .tfk-job-workflow-list, .tfk-team-tasks, .tfk-activity-list { display: grid; gap: 8px; }
  .tfk-job-workflow-list > div, .tfk-team-tasks article { border: 1px solid rgba(22,101,52,.14); border-radius: 8px; padding: 10px 11px; }
  .tfk-job-workflow-list select { width: min(360px,45%); }
  .tfk-task-filters { display: flex; gap: 8px; }
  .tfk-task-filters label { display: flex; align-items: center; gap: 5px; border: 1px solid rgba(22,101,52,.2); border-radius: 7px; padding-left: 8px; background: #fff; }
  .tfk-task-filters label input { border: 0; }
  .tfk-team-tasks article { display: grid; grid-template-columns: minmax(0,1fr) 150px auto; }
  .tfk-activity-list > div { display: flex; align-items: flex-start; gap: 9px; font-size: 12px; padding: 8px 0; border-bottom: 1px solid rgba(22,101,52,.1); }
  .tfk-activity-list small { display: block; color: #789189; margin-top: 2px; }
  .spin { animation: tfk-work-spin 1s linear infinite; }
  @keyframes tfk-work-spin { to { transform: rotate(360deg); } }
  @media (max-width: 820px) {
    .tfk-workflow-list { grid-template-columns: 1fr; }
    .tfk-work-section-heading { align-items: flex-start; flex-direction: column; }
    .tfk-task-filters { width: 100%; flex-direction: column; }
    .tfk-team-tasks article { grid-template-columns: minmax(0,1fr) auto; }
    .tfk-team-tasks article select { grid-column: 1/-1; }
  }
  @media (max-width: 560px) {
    .tfk-work { padding: 14px; }
    .tfk-work-heading, .tfk-job-workflow-list > div, .tfk-workflow-actions { align-items: stretch; flex-direction: column; }
    .tfk-work-metrics, .tfk-work-form { grid-template-columns: 1fr; }
    .tfk-work-form .wide { grid-column: auto; }
    .tfk-job-workflow-list select { width: 100%; }
  }
`;

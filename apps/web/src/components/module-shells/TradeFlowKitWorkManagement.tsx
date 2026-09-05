'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  CalendarClock,
  CheckCircle2,
  GitBranch,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  Repeat2,
  Search,
  Star,
  Workflow,
} from 'lucide-react';
import {
  moduleShellApi,
  type TradeFlowKitActivity,
  type TradeFlowKitCustomer,
  type TradeFlowKitJob,
  type TradeFlowKitRecurringSchedule,
  type TradeFlowKitTask,
  type TradeFlowKitWorkflow,
} from '@/lib/auth';

const taskStatuses: TradeFlowKitTask['status'][] = ['todo', 'in_progress', 'blocked', 'completed', 'canceled'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'TradeFlowKit could not complete that action.';
}

export type TradeFlowKitWorkView = 'all' | 'jobs' | 'workflows' | 'tasks' | 'recurring' | 'activity';

const viewCopy: Record<TradeFlowKitWorkView, { eyebrow: string; title: string; description: string }> = {
  all: {
    eyebrow: 'Restored operations workspace',
    title: 'Workflows, team tasks, and activity',
    description: 'Coordinate jobs and team tasks through the workflow stages that match how your business delivers work.',
  },
  jobs: {
    eyebrow: 'Scheduled service work',
    title: 'Job workflow and recurring schedules',
    description: 'Move jobs through approved stages and schedule repeat work without rebuilding the same checklist.',
  },
  workflows: {
    eyebrow: 'Workflow studio',
    title: 'Workflow templates and job stages',
    description: 'Define reusable job or task stages and apply them to your organization’s active work.',
  },
  tasks: {
    eyebrow: 'Team execution',
    title: 'Organization task queue',
    description: 'Search, assign, and update job tasks across your organization.',
  },
  recurring: {
    eyebrow: 'Scheduled automation',
    title: 'Recurring job schedules',
    description: 'Create, pause, resume, and review repeat service schedules and their next job date.',
  },
  activity: {
    eyebrow: 'Operational history',
    title: 'Recent TradeFlowKit activity',
    description: 'Review recorded job, task, recurring-work, and workflow changes for this organization.',
  },
};

export default function TradeFlowKitWorkManagement({
  tenantKey,
  canWrite,
  canManage,
  view = 'all',
  recordId,
}: {
  tenantKey: string;
  canWrite: boolean;
  canManage: boolean;
  view?: TradeFlowKitWorkView;
  recordId?: string;
}) {
  const [workflows, setWorkflows] = useState<TradeFlowKitWorkflow[]>([]);
  const [tasks, setTasks] = useState<TradeFlowKitTask[]>([]);
  const [jobs, setJobs] = useState<TradeFlowKitJob[]>([]);
  const [customers, setCustomers] = useState<TradeFlowKitCustomer[]>([]);
  const [recurringSchedules, setRecurringSchedules] = useState<TradeFlowKitRecurringSchedule[]>([]);
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
  const [recurringName, setRecurringName] = useState('');
  const [recurringCustomerId, setRecurringCustomerId] = useState('');
  const [recurringTitle, setRecurringTitle] = useState('');
  const [recurringDescription, setRecurringDescription] = useState('');
  const [recurringPriority, setRecurringPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [recurringIntervalDays, setRecurringIntervalDays] = useState(7);
  const [recurringDurationMinutes, setRecurringDurationMinutes] = useState(60);
  const [recurringNextRunAt, setRecurringNextRunAt] = useState(() => localDateTimeInput(new Date(Date.now() + 86_400_000)));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [workflowRows, taskRows, activityRows, operations, revenue, recurring] = await Promise.all([
        moduleShellApi.tradeflowkit.workflows(),
        moduleShellApi.tradeflowkit.tasks({
          scope: 'team',
          status: taskStatus || undefined,
          search: taskSearch.trim() || undefined,
          limit: 100,
        }),
        moduleShellApi.tradeflowkit.activity({ limit: 50 }),
        moduleShellApi.tradeflowkit.operations({ limit: 100 }),
        moduleShellApi.tradeflowkit.revenue(),
        moduleShellApi.tradeflowkit.recurringJobs(),
      ]);
      setWorkflows(workflowRows);
      setTasks(taskRows.items);
      setActivity(activityRows.items);
      setJobs(operations.jobs);
      setCustomers(revenue.customers);
      setRecurringCustomerId(current => current || revenue.customers[0]?.id || '');
      setRecurringSchedules(recurring.schedules);
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

  const createRecurringSchedule = (event: FormEvent) => {
    event.preventDefault();
    if (!canWrite || !recurringName.trim() || !recurringCustomerId || !recurringTitle.trim() || !recurringNextRunAt) {
      setError('Enter a schedule name, customer, job title, and first run time.');
      return;
    }
    void run(async () => {
      await moduleShellApi.tradeflowkit.createRecurringJob({
        name: recurringName.trim(),
        customerId: recurringCustomerId,
        title: recurringTitle.trim(),
        description: recurringDescription.trim() || undefined,
        priority: recurringPriority,
        intervalDays: recurringIntervalDays,
        durationMinutes: recurringDurationMinutes,
        nextRunAt: new Date(recurringNextRunAt).toISOString(),
      });
      setRecurringName('');
      setRecurringTitle('');
      setRecurringDescription('');
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
  const copy = viewCopy[view];

  return (
    <section
      id="tradeflowkit-work-management"
      className="tfk-panel tfk-work"
      data-testid="tradeflowkit-work-management"
      data-view={view}
      tabIndex={-1}
    >
      <style>{css}</style>
      <header className="tfk-work-heading">
        <div>
          <div className="tfk-work-eyebrow"><Workflow size={15} /> {copy.eyebrow}</div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || pending}>Refresh</button>
      </header>

      {error && <div className="tfk-work-alert" role="alert" data-testid="tradeflowkit-work-management-error"><AlertTriangle size={17} />{error}</div>}
      {loading ? (
        <div className="tfk-work-state" aria-busy="true" data-testid="tradeflowkit-work-management-loading">
          <Loader2 className="spin" size={19} /> Loading work management…
        </div>
      ) : (
        <>
          <div className="tfk-work-metrics">
            <Metric label="Active workflows" value={workflows.length} />
            <Metric label="Open team tasks" value={tasks.filter(task => !['completed', 'canceled'].includes(task.status)).length} />
            <Metric label="Recurring schedules" value={recurringSchedules.filter(schedule => schedule.enabled).length} />
            <Metric label="Recent events" value={activity.length} />
          </div>

          <section id="tradeflowkit-workflows" className="tfk-work-section tfk-workflows-route" aria-labelledby="tfk-workflow-heading" data-testid="tradeflowkit-workflows-route" tabIndex={-1}>
            <div className="tfk-work-section-heading">
              <div><GitBranch size={18} /><div><h3 id="tfk-workflow-heading">Workflow templates</h3><p>Admins define reusable job or task stages, with every change safely tracked.</p></div></div>
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
              <div className="tfk-work-state"><GitBranch size={18} /><span>No workflows yet. A workspace admin can create the first workflow.</span></div>
            ) : (
              <div className="tfk-workflow-list">
                {workflows.map(workflow => (
                  <article key={workflow.id} className="tfk-workflow-card" data-testid={`tradeflowkit-workflow-${workflow.id}`}>
                    <div className="tfk-workflow-title">
                      <div><strong>{workflow.name}</strong><span>{workflow.entityType} workflow</span></div>
                      {workflow.isDefault && <span className="tfk-work-default"><Star size={12} />Default</span>}
                    </div>
                    {workflow.description && <p>{workflow.description}</p>}
                    <ol className="tfk-stage-list">
                      {workflow.stages.map(stage => (
                        <li key={stage.id}>
                          <span style={{ background: stage.color }} />
                          <strong>{stage.name}</strong>
                          <small>{stage.mappedStatus ? `moves work to ${stage.mappedStatus.replaceAll('_', ' ')}` : 'keeps the current status'}</small>
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

          <section id="tradeflowkit-job-workflow" className="tfk-work-section tfk-job-workflow-route" aria-labelledby="tfk-job-board-heading" data-testid="tradeflowkit-job-workflow-route" tabIndex={-1}>
            <div className="tfk-work-section-heading">
              <div><Workflow size={18} /><div><h3 id="tfk-job-board-heading">Job workflow board</h3><p>Move jobs through your approved workflow and keep each job status current.</p></div></div>
            </div>
            {jobs.length === 0 ? <div className="tfk-work-state">No jobs are available for workflow assignment.</div> : (
              <div className="tfk-job-workflow-list">
                {jobs.map(job => (
                  <div key={job.id}>
                    <div><strong>{job.title}</strong><span>#{job.number ?? '—'} · {job.status.replaceAll('_', ' ')}</span></div>
                    <select
                      aria-label={`Workflow stage for ${job.title}`}
                      value={job.workflowStageId ?? ''}
                      disabled={!canWrite || pending || jobStages.length === 0}
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

          <section id="tradeflowkit-recurring-jobs" className="tfk-work-section tfk-recurring-route" aria-labelledby="tfk-recurring-heading" data-testid="tradeflowkit-recurring-route" tabIndex={-1}>
            <div className="tfk-work-section-heading">
              <div><Repeat2 size={18} /><div><h3 id="tfk-recurring-heading">Recurring jobs</h3><p>Schedule repeat work so every due visit creates one assigned job with a clear history.</p></div></div>
            </div>

            {canWrite && (
              <form className="tfk-work-form tfk-recurring-form" onSubmit={createRecurringSchedule} data-testid="tradeflowkit-recurring-job-form">
                <label>Schedule name<input value={recurringName} onChange={event => setRecurringName(event.target.value)} maxLength={120} required /></label>
                <label>Customer<select value={recurringCustomerId} onChange={event => setRecurringCustomerId(event.target.value)} required><option value="">Select a customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
                <label className="wide">Job title<input value={recurringTitle} onChange={event => setRecurringTitle(event.target.value)} maxLength={200} required /></label>
                <label className="wide">Description<input value={recurringDescription} onChange={event => setRecurringDescription(event.target.value)} maxLength={4000} /></label>
                <label>Priority<select value={recurringPriority} onChange={event => setRecurringPriority(event.target.value as typeof recurringPriority)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                <label>Repeat every<input type="number" min={1} max={30} value={recurringIntervalDays} onChange={event => setRecurringIntervalDays(Number(event.target.value))} aria-describedby="tfk-recurring-days-help" /><small id="tfk-recurring-days-help">Days, from 1 to 30</small></label>
                <label>Estimated duration<input type="number" min={15} max={1440} step={15} value={recurringDurationMinutes} onChange={event => setRecurringDurationMinutes(Number(event.target.value))} /><small>Minutes</small></label>
                <label>First run<input type="datetime-local" value={recurringNextRunAt} onChange={event => setRecurringNextRunAt(event.target.value)} required /></label>
                <button type="submit" disabled={pending || customers.length === 0}><CalendarClock size={15} />Save recurring job</button>
              </form>
            )}

            {customers.length === 0 && canWrite && <div className="tfk-work-state"><AlertTriangle size={17} />Create a customer before scheduling recurring work.</div>}
            {recurringSchedules.length === 0 ? (
              <div className="tfk-work-state"><Repeat2 size={18} /><span>No recurring work is scheduled.</span></div>
            ) : (
              <div className="tfk-recurring-list">
                {recurringSchedules.map(schedule => (
                  <article key={schedule.id} data-testid={`tradeflowkit-recurring-${schedule.id}`}>
                    <div className="tfk-recurring-summary">
                      <span className={schedule.enabled ? 'enabled' : 'paused'}>{schedule.enabled ? 'Active' : 'Paused'}</span>
                      <div><strong>{schedule.name}</strong><small>{schedule.payload.title ?? 'Recurring job'} · every {Math.max(1, Math.round(schedule.intervalSeconds / 86_400))} day(s)</small></div>
                    </div>
                    <dl>
                      <div><dt>Next run</dt><dd>{new Date(schedule.nextRunAt).toLocaleString()}</dd></div>
                      <div><dt>Last job created</dt><dd>{schedule.lastEnqueuedAt ? new Date(schedule.lastEnqueuedAt).toLocaleString() : 'Not yet'}</dd></div>
                      <div><dt>Worker state</dt><dd>{schedule.lastErrorCode ? `Retry required: ${schedule.lastErrorCode}` : 'Ready'}</dd></div>
                    </dl>
                    {canWrite && <button type="button" disabled={pending} onClick={() => void run(() => moduleShellApi.tradeflowkit.updateRecurringJob(schedule.id, schedule.version, !schedule.enabled))}>{schedule.enabled ? <PauseCircle size={15} /> : <PlayCircle size={15} />}{schedule.enabled ? 'Pause' : 'Resume'}</button>}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section id="tradeflowkit-tasks" className="tfk-work-section tfk-tasks-route" aria-labelledby="tfk-team-task-heading" data-testid="tradeflowkit-tasks-route" tabIndex={-1}>
            <div className="tfk-work-section-heading">
              <div><CheckCircle2 size={18} /><div><h3 id="tfk-team-task-heading">Team tasks</h3><p>Search, assign, and manage job tasks across the current workspace.</p></div></div>
              <div className="tfk-task-filters">
                <label><Search size={14} /><input value={taskSearch} onChange={event => setTaskSearch(event.target.value)} placeholder="Search tasks" /></label>
                <select aria-label="Filter team tasks by status" value={taskStatus} onChange={event => setTaskStatus(event.target.value)}><option value="">All statuses</option>{taskStatuses.map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select>
              </div>
            </div>
            {tasks.length === 0 ? <div className="tfk-work-state">No job tasks match this view. Create a task from the operations board.</div> : (
              <div className="tfk-team-tasks">
                {tasks.map(task => (
                  <article key={task.id} className={recordId === task.id ? 'selected' : undefined} aria-current={recordId === task.id ? 'true' : undefined} data-testid={`tradeflowkit-team-task-${task.id}`}>
                    <div><strong>{task.title}</strong><span>{task.jobTitle ?? 'Job'} · {task.customerName ?? 'Customer'}</span></div>
                    <select
                      aria-label={`Status for ${task.title}`}
                      value={task.status}
                      disabled={!canWrite || pending}
                      onChange={event => void run(() => moduleShellApi.tradeflowkit.updateTask(task.id, {
                        expectedVersion: task.version,
                        status: event.target.value,
                      }))}
                    >
                      {taskStatuses.map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                    </select>
                    {canWrite && <button type="button" className="icon danger" title="Archive task" disabled={pending} onClick={() => void run(() => moduleShellApi.tradeflowkit.archiveTask(task.id, task.version))}><Archive size={14} /><span className="sr-only">Archive {task.title}</span></button>}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section id="tradeflowkit-activity" className="tfk-work-section tfk-activity-route" aria-labelledby="tfk-activity-heading" data-testid="tradeflowkit-activity-route" tabIndex={-1}>
            <div className="tfk-work-section-heading">
              <div><Activity size={18} /><div><h3 id="tfk-activity-heading">Recent activity</h3><p>See the latest job, task, and workflow changes made by your team.</p></div></div>
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
  return ['#2563eb', '#0f766e', '#b7791f', 'var(--tfk-primary)', '#6d28d9', '#dc2626'][position % 6];
}

function localDateTimeInput(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const css = `
  .tfk-work { padding: 18px; display: grid; gap: 16px; }
  .tfk-work-heading, .tfk-work-section-heading, .tfk-workflow-title, .tfk-workflow-actions,
  .tfk-job-workflow-list > div, .tfk-team-tasks article { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .tfk-work-heading { align-items: flex-start; }
  .tfk-work-heading h2, .tfk-work-section h3 { margin: 0; }
  .tfk-work-heading p, .tfk-work-section-heading p, .tfk-workflow-card p { margin: 5px 0 0; color: #587067; font-size: 13px; line-height: 1.45; }
  .tfk-work-eyebrow { display: flex; align-items: center; gap: 7px; color: var(--tfk-primary); font-size: 12px; font-weight: 800; text-transform: uppercase; margin-bottom: 7px; }
  .tfk-work button, .tfk-work input, .tfk-work select { font: inherit; }
  .tfk-work button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid color-mix(in srgb, var(--tfk-primary) 28%, transparent); border-radius: 7px; padding: 8px 10px; background: #fff; color: #10231d; font-size: 12px; font-weight: 800; cursor: pointer; }
  .tfk-work button:disabled { opacity: .52; cursor: not-allowed; }
  .tfk-work button.danger { color: #b91c1c; border-color: rgba(220,38,38,.25); }
  .tfk-work button.icon { padding: 8px; }
  .tfk-work input, .tfk-work select { min-width: 0; border: 1px solid color-mix(in srgb, var(--tfk-primary) 20%, transparent); border-radius: 7px; padding: 8px 9px; background: #fff; color: #10231d; }
  .tfk-work-alert, .tfk-work-state { display: flex; align-items: center; gap: 9px; border: 1px solid rgba(220,38,38,.28); border-radius: 8px; padding: 12px; background: rgba(220,38,38,.06); color: #991b1b; font-size: 13px; }
  .tfk-work-state { border-color: color-mix(in srgb, var(--tfk-primary) 20%, transparent); background: var(--tfk-primary-soft); color: #587067; }
  .tfk-work-metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; }
  .tfk-work-metrics > div { border: 1px solid color-mix(in srgb, var(--tfk-primary) 16%, transparent); border-radius: 8px; padding: 12px; background: var(--tfk-card); }
  .tfk-work-metrics span { color: #587067; font-size: 12px; display: block; }
  .tfk-work-metrics strong { display: block; margin-top: 4px; font-size: 22px; }
  .tfk-work-section { display: grid; gap: 12px; border-top: 1px solid color-mix(in srgb, var(--tfk-primary) 14%, transparent); padding-top: 16px; }
  .tfk-work-section-heading > div:first-child { display: flex; gap: 9px; align-items: flex-start; }
  .tfk-work-form { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; border: 1px solid color-mix(in srgb, var(--tfk-primary) 22%, transparent); border-radius: 8px; padding: 12px; background: var(--tfk-primary-soft); }
  .tfk-work-form label { display: grid; gap: 5px; color: #587067; font-size: 12px; font-weight: 700; }
  .tfk-work-form .wide { grid-column: 1/-1; }
  .tfk-work-form .check { display: flex; align-items: center; flex-direction: row; }
  .tfk-work-form .check input { min-width: auto; }
  .tfk-work-form small { color: var(--tfk-muted-foreground); font-weight: 500; }
  .tfk-recurring-form button { align-self: end; min-height: 36px; }
  .tfk-recurring-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
  .tfk-recurring-list article { display: grid; gap: 12px; border: 1px solid var(--tfk-border); border-radius: 8px; padding: 13px; background: var(--tfk-card); min-width: 0; }
  .tfk-recurring-summary { display: flex; align-items: flex-start; gap: 9px; min-width: 0; }
  .tfk-recurring-summary > span { border-radius: 999px; padding: 4px 7px; font-size: 10px; font-weight: 900; text-transform: uppercase; }
  .tfk-recurring-summary > span.enabled { color: var(--tfk-success); background: var(--tfk-success-soft); }
  .tfk-recurring-summary > span.paused { color: var(--tfk-muted-foreground); background: var(--tfk-muted); }
  .tfk-recurring-summary div { min-width: 0; }
  .tfk-recurring-summary small { display: block; margin-top: 3px; color: var(--tfk-muted-foreground); }
  .tfk-recurring-list dl { display: grid; gap: 6px; margin: 0; font-size: 11px; }
  .tfk-recurring-list dl > div { display: flex; justify-content: space-between; gap: 12px; }
  .tfk-recurring-list dt { color: var(--tfk-muted-foreground); }
  .tfk-recurring-list dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
  .tfk-workflow-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
  .tfk-workflow-card { border: 1px solid color-mix(in srgb, var(--tfk-primary) 16%, transparent); border-radius: 8px; padding: 13px; min-width: 0; }
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
  .tfk-job-workflow-list > div, .tfk-team-tasks article { border: 1px solid color-mix(in srgb, var(--tfk-primary) 14%, transparent); border-radius: 8px; padding: 10px 11px; }
  .tfk-job-workflow-list select { width: min(360px,45%); }
  .tfk-task-filters { display: flex; gap: 8px; }
  .tfk-task-filters label { display: flex; align-items: center; gap: 5px; border: 1px solid color-mix(in srgb, var(--tfk-primary) 20%, transparent); border-radius: 7px; padding-left: 8px; background: #fff; }
  .tfk-task-filters label input { border: 0; }
  .tfk-team-tasks article { display: grid; grid-template-columns: minmax(0,1fr) 150px auto; }
  .tfk-team-tasks article.selected { border-color: var(--tfk-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--tfk-primary) 18%, transparent); }
  .tfk-activity-list > div { display: flex; align-items: flex-start; gap: 9px; font-size: 12px; padding: 8px 0; border-bottom: 1px solid color-mix(in srgb, var(--tfk-primary) 10%, transparent); }
  .tfk-activity-list small { display: block; color: #789189; margin-top: 2px; }
  .tfk-work[data-view="jobs"] :is(.tfk-workflows-route,.tfk-tasks-route,.tfk-activity-route),
  .tfk-work[data-view="workflows"] :is(.tfk-recurring-route,.tfk-tasks-route,.tfk-activity-route),
  .tfk-work[data-view="tasks"] :is(.tfk-workflows-route,.tfk-job-workflow-route,.tfk-recurring-route,.tfk-activity-route),
  .tfk-work[data-view="recurring"] :is(.tfk-workflows-route,.tfk-job-workflow-route,.tfk-tasks-route,.tfk-activity-route),
  .tfk-work[data-view="activity"] :is(.tfk-workflows-route,.tfk-job-workflow-route,.tfk-recurring-route,.tfk-tasks-route) { display: none; }
  .spin { animation: tfk-work-spin 1s linear infinite; }
  @keyframes tfk-work-spin { to { transform: rotate(360deg); } }
  @media (max-width: 820px) {
    .tfk-workflow-list, .tfk-recurring-list { grid-template-columns: 1fr; }
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
    .tfk-recurring-list dl > div { display: grid; gap: 2px; }
    .tfk-recurring-list dd { text-align: left; }
  }
`;

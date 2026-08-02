'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ClipboardPlus,
  FilterX,
  History,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRoundCog,
} from 'lucide-react';
import {
  moduleShellApi,
  type PulseDeskAssignee,
  type PulseDeskDepartment,
  type PulseDeskEscalationReasonCode,
  type PulseDeskRequest,
  type PulseDeskRequestCategory,
  type PulseDeskRequestDetailResponse,
  type PulseDeskRequestEvent,
  type PulseDeskRequestFilters,
  type PulseDeskRequestPriority,
  type PulseDeskRequestStatus,
} from '@/lib/auth';

const PHI_WARNING =
  'Operational information only. Do not enter patient names, MRNs, dates of birth, diagnoses, or clinical notes.';

const PRIORITIES: Array<{ value: PulseDeskRequestPriority; label: string }> = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const STATUSES: Array<{ value: PulseDeskRequestStatus; label: string }> = [
  { value: 'new', label: 'Intake' },
  { value: 'triage', label: 'Triage' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'waiting_department', label: 'Waiting Department' },
  { value: 'waiting_vendor', label: 'Waiting Vendor' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const CATEGORIES: Array<{ value: PulseDeskRequestCategory; label: string }> = [
  { value: 'it_infrastructure', label: 'IT infrastructure' },
  { value: 'medical_equipment', label: 'Medical equipment' },
  { value: 'supplies_inventory', label: 'Supplies and inventory' },
  { value: 'facilities_building', label: 'Facilities and building' },
  { value: 'housekeeping_environmental', label: 'Housekeeping and environmental' },
  { value: 'safety_compliance', label: 'Safety and compliance' },
  { value: 'vendor_external', label: 'Vendor or external service' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'hr_staff', label: 'HR and staffing' },
  { value: 'other', label: 'Other operational request' },
];

const ESCALATION_REASONS: Array<{ value: PulseDeskEscalationReasonCode; label: string }> = [
  { value: 'patient_care_risk', label: 'Patient care risk' },
  { value: 'safety_risk', label: 'Safety risk' },
  { value: 'department_nonresponse', label: 'Department nonresponse' },
  { value: 'sla_breach', label: 'SLA breach' },
  { value: 'resource_blocked', label: 'Required resource blocked' },
  { value: 'other', label: 'Other structured escalation' },
];

const STATUS_TRANSITIONS: Record<PulseDeskRequestStatus, PulseDeskRequestStatus[]> = {
  new: ['triage', 'assigned', 'escalated'],
  triage: ['assigned', 'waiting_department', 'waiting_vendor', 'in_progress', 'escalated', 'resolved'],
  assigned: ['in_progress', 'waiting_department', 'waiting_vendor', 'escalated', 'resolved'],
  waiting_department: ['assigned', 'in_progress', 'escalated', 'resolved'],
  waiting_vendor: ['assigned', 'in_progress', 'escalated', 'resolved'],
  in_progress: ['waiting_department', 'waiting_vendor', 'escalated', 'resolved'],
  escalated: ['assigned', 'in_progress', 'waiting_department', 'waiting_vendor', 'resolved'],
  resolved: ['closed', 'triage'],
  closed: [],
};

interface IntakeForm {
  summary: string;
  category: PulseDeskRequestCategory;
  priority: PulseDeskRequestPriority;
  departmentId: string;
  locationLabel: string;
  isPatientImpacting: boolean;
  phiAcknowledged: boolean;
}

interface FilterForm {
  search: string;
  status: PulseDeskRequestStatus | 'all';
  priority: PulseDeskRequestPriority | 'all';
  category: PulseDeskRequestCategory | 'all';
  departmentId: string;
  patientImpact: 'all' | 'yes' | 'no';
}

interface WorkflowDraft {
  priority: PulseDeskRequestPriority;
  departmentId: string;
  assignedToUserId: string;
}

interface ActionError {
  scope: 'intake' | 'department' | 'detail';
  message: string;
}

const INITIAL_INTAKE: IntakeForm = {
  summary: '',
  category: 'other',
  priority: 'normal',
  departmentId: '',
  locationLabel: '',
  isPatientImpacting: false,
  phiAcknowledged: false,
};

const INITIAL_FILTERS: FilterForm = {
  search: '',
  status: 'all',
  priority: 'all',
  category: 'all',
  departmentId: '',
  patientImpact: 'all',
};

function apiErrorMessage(error: unknown, fallback: string): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const status = typeof record.status === 'number' ? `HTTP ${record.status}` : null;
  const code = typeof record.code === 'string' && record.code ? record.code : null;
  const serverMessage = typeof record.error === 'string'
    ? record.error
    : error instanceof Error && error.message
      ? error.message
      : fallback;
  const authority = [status, code].filter(Boolean).join(' · ');
  return authority ? `${authority} — ${serverMessage}` : serverMessage;
}

function statusLabel(status: PulseDeskRequestStatus): string {
  return STATUSES.find((option) => option.value === status)?.label ?? status.replaceAll('_', ' ');
}

function priorityLabel(priority: PulseDeskRequestPriority): string {
  return PRIORITIES.find((option) => option.value === priority)?.label ?? priority;
}

function categoryLabel(category: PulseDeskRequestCategory): string {
  return CATEGORIES.find((option) => option.value === category)?.label ?? category.replaceAll('_', ' ');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function workflowDraft(request: PulseDeskRequest): WorkflowDraft {
  return {
    priority: request.priority,
    departmentId: request.departmentId ?? '',
    assignedToUserId: request.assignedToUserId ?? '',
  };
}

function isOverdue(request: PulseDeskRequest, now: number): boolean {
  if (!request.dueAt || request.status === 'resolved' || request.status === 'closed') return false;
  const dueAt = new Date(request.dueAt).getTime();
  return Number.isFinite(dueAt) && dueAt < now;
}

function filterQuery(filters: FilterForm): PulseDeskRequestFilters {
  return {
    ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
    ...(filters.status !== 'all' ? { status: filters.status } : {}),
    ...(filters.priority !== 'all' ? { priority: filters.priority } : {}),
    ...(filters.category !== 'all' ? { category: filters.category } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.patientImpact !== 'all'
      ? { isPatientImpacting: filters.patientImpact === 'yes' }
      : {}),
    limit: 100,
  };
}

export default function PulseDeskDepartmentEscalationQueue({ tenantKey }: { tenantKey: string }) {
  const summaryInputRef = useRef<HTMLInputElement>(null);
  const [requests, setRequests] = useState<PulseDeskRequest[]>([]);
  const [departments, setDepartments] = useState<PulseDeskDepartment[]>([]);
  const [canManageWorkflow, setCanManageWorkflow] = useState(false);
  const [assignees, setAssignees] = useState<PulseDeskAssignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const [assigneeReloadToken, setAssigneeReloadToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [intake, setIntake] = useState<IntakeForm>(INITIAL_INTAKE);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState<FilterForm>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterForm>(INITIAL_FILTERS);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentActionId, setDepartmentActionId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PulseDeskRequestDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDraft | null>(null);
  const [nextStatus, setNextStatus] = useState<PulseDeskRequestStatus | ''>('');
  const [escalationReason, setEscalationReason] = useState<PulseDeskEscalationReasonCode>('patient_care_risk');
  const [requestAction, setRequestAction] = useState<'edit' | 'transition' | null>(null);

  const activeDepartments = useMemo(
    () => departments.filter((department) => department.active),
    [departments],
  );

  const now = Date.now();
  const metrics = useMemo(() => ({
    intake: requests.filter((request) => request.status === 'new').length,
    escalated: requests.filter((request) => request.status === 'escalated').length,
    waitingDepartment: requests.filter((request) => request.status === 'waiting_department').length,
    overdue: requests.filter((request) => isOverdue(request, now)).length,
  }), [now, requests]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    Promise.all([
      moduleShellApi.pulsedesk.listDepartments(true),
      moduleShellApi.pulsedesk.listRequests(filterQuery(appliedFilters)),
    ])
      .then(([departmentResponse, requestResponse]) => {
        if (cancelled) return;
        setDepartments(Array.isArray(departmentResponse.departments) ? departmentResponse.departments : []);
        setRequests(Array.isArray(requestResponse.requests) ? requestResponse.requests : []);
        setCanManageWorkflow(Boolean(
          departmentResponse.capabilities?.canManageWorkflow
          && requestResponse.capabilities?.canManageWorkflow,
        ));
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(apiErrorMessage(error, 'Could not load the PulseDesk department escalation queue.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [
    tenantKey,
    reloadToken,
    appliedFilters.category,
    appliedFilters.departmentId,
    appliedFilters.patientImpact,
    appliedFilters.priority,
    appliedFilters.search,
    appliedFilters.status,
  ]);

  useEffect(() => {
    if (!canManageWorkflow) {
      setAssignees([]);
      setAssigneeError(null);
      return;
    }
    let cancelled = false;
    setAssigneesLoading(true);
    setAssigneeError(null);
    moduleShellApi.pulsedesk.listAssignees()
      .then((response) => {
        if (cancelled) return;
        setCanManageWorkflow(Boolean(response.capabilities?.canManageWorkflow));
        setAssignees(Array.isArray(response.assignees) ? response.assignees : []);
      })
      .catch((error) => {
        if (!cancelled) {
          setAssigneeError(apiErrorMessage(error, 'Could not load eligible PulseDesk assignees.'));
        }
      })
      .finally(() => {
        if (!cancelled) setAssigneesLoading(false);
      });
    return () => { cancelled = true; };
  }, [assigneeReloadToken, canManageWorkflow, tenantKey]);

  async function loadDetail(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setDetailError(null);
    setActionError((current) => current?.scope === 'detail' ? null : current);
    try {
      const response = await moduleShellApi.pulsedesk.getRequest(id);
      setDetail(response);
      setCanManageWorkflow(Boolean(response.capabilities?.canManageWorkflow));
      setWorkflow(workflowDraft(response.request));
      setNextStatus(STATUS_TRANSITIONS[response.request.status][0] ?? '');
      setEscalationReason('patient_care_risk');
    } catch (error) {
      setDetail(null);
      setWorkflow(null);
      setDetailError(apiErrorMessage(error, 'Could not load the request timeline.'));
    } finally {
      setDetailLoading(false);
    }
  }

  function refreshQueue() {
    setReloadToken((value) => value + 1);
  }

  function clearFilters() {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
  }

  async function createRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !intake.summary.trim() || !intake.phiAcknowledged) return;
    setSubmitting(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const created = await moduleShellApi.pulsedesk.createRequest({
        summary: intake.summary.trim(),
        category: intake.category,
        priority: intake.priority,
        departmentId: intake.departmentId || null,
        locationLabel: intake.locationLabel.trim() || null,
        isPatientImpacting: intake.isPatientImpacting,
        phiAcknowledged: true,
      });
      setIntake(INITIAL_INTAKE);
      setSuccessMessage(`${created.requestNumber} entered the department escalation queue.`);
      refreshQueue();
      await loadDetail(created.id);
    } catch (error) {
      setActionError({
        scope: 'intake',
        message: apiErrorMessage(error, 'Could not create the operational request.'),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function createDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = departmentName.trim();
    if (!name || departmentActionId) return;
    setDepartmentActionId('new');
    setActionError(null);
    setSuccessMessage(null);
    try {
      const created = await moduleShellApi.pulsedesk.createDepartment(name);
      setDepartmentName('');
      setDepartments((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSuccessMessage(`${created.name} is available for request routing.`);
    } catch (error) {
      setActionError({
        scope: 'department',
        message: apiErrorMessage(error, 'Could not create the department.'),
      });
    } finally {
      setDepartmentActionId(null);
    }
  }

  async function toggleDepartment(department: PulseDeskDepartment) {
    if (departmentActionId) return;
    setDepartmentActionId(department.id);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const updated = await moduleShellApi.pulsedesk.updateDepartment(department.id, {
        expectedVersion: department.version,
        active: !department.active,
      });
      setDepartments((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSuccessMessage(`${updated.name} is now ${updated.active ? 'active' : 'inactive'}.`);
    } catch (error) {
      setActionError({
        scope: 'department',
        message: apiErrorMessage(error, 'Could not update the department.'),
      });
    } finally {
      setDepartmentActionId(null);
    }
  }

  async function saveWorkflow() {
    if (!detail || !workflow || requestAction) return;
    setActionError(null);
    const update: Parameters<typeof moduleShellApi.pulsedesk.updateRequest>[1] = {
      expectedVersion: detail.request.version,
    };
    if (workflow.priority !== detail.request.priority) update.priority = workflow.priority;
    if ((workflow.departmentId || null) !== detail.request.departmentId) {
      update.departmentId = workflow.departmentId || null;
    }
    if ((workflow.assignedToUserId || null) !== detail.request.assignedToUserId) {
      update.assignedToUserId = workflow.assignedToUserId || null;
    }
    if (Object.keys(update).length === 1) {
      setSuccessMessage(`${detail.request.requestNumber} has no unsaved routing changes.`);
      return;
    }
    setRequestAction('edit');
    setSuccessMessage(null);
    try {
      const updated = await moduleShellApi.pulsedesk.updateRequest(detail.request.id, update);
      setRequests((current) => current.map((request) => request.id === updated.id ? updated : request));
      setSuccessMessage(`${updated.requestNumber} routing controls were updated.`);
      refreshQueue();
      await loadDetail(updated.id);
    } catch (error) {
      setActionError({
        scope: 'detail',
        message: apiErrorMessage(error, 'Could not update the request workflow.'),
      });
    } finally {
      setRequestAction(null);
    }
  }

  async function transitionRequest() {
    if (!detail || !nextStatus || requestAction) return;
    setRequestAction('transition');
    setActionError(null);
    setSuccessMessage(null);
    try {
      const updated = await moduleShellApi.pulsedesk.transitionRequest(detail.request.id, {
        expectedVersion: detail.request.version,
        toStatus: nextStatus,
        ...(nextStatus === 'escalated' ? { reasonCode: escalationReason } : {}),
      });
      setRequests((current) => current.map((request) => request.id === updated.id ? updated : request));
      setSuccessMessage(`${updated.requestNumber} moved to ${statusLabel(updated.status)}.`);
      refreshQueue();
      await loadDetail(updated.id);
    } catch (error) {
      setActionError({
        scope: 'detail',
        message: apiErrorMessage(error, 'Could not transition the request.'),
      });
    } finally {
      setRequestAction(null);
    }
  }

  return (
    <section
      id="pulsedesk-tickets"
      className="pdq-root"
      data-testid="pulsedesk-department-escalation-queue"
    >
      <style>{queueCss}</style>

      <header className="pdq-heading">
        <div>
          <div className="pdq-eyebrow">Live department workflow</div>
          <h2>Department Escalation Queue</h2>
          <p>
            Coordinate operational intake, department routing, escalation, ownership, and SLA state without storing patient or clinical narratives.
          </p>
        </div>
        <div className="pdq-metrics" aria-label="Current queue metrics">
          <Metric label="Intake" value={metrics.intake} tone="blue" />
          <Metric label="Escalated" value={metrics.escalated} tone="red" />
          <Metric label="Waiting Department" value={metrics.waitingDepartment} tone="amber" />
          <Metric label="Overdue" value={metrics.overdue} tone="red" />
        </div>
      </header>

      {loadError && (
        <ErrorBanner message={loadError} testId="pulsedesk-queue-error">
          <button type="button" onClick={refreshQueue} data-testid="pulsedesk-queue-retry">
            <RefreshCw size={15} aria-hidden="true" />
            Retry
          </button>
        </ErrorBanner>
      )}

      {successMessage && (
        <div className="pdq-success" role="status" data-testid="pulsedesk-queue-success">
          <CheckCircle2 size={17} aria-hidden="true" />
          <span>{successMessage}</span>
          <button type="button" onClick={() => setSuccessMessage(null)}>Dismiss</button>
        </div>
      )}

      <form className="pdq-intake" onSubmit={createRequest} data-testid="pulsedesk-request-form">
        <div className="pdq-form-title">
          <ClipboardPlus size={18} aria-hidden="true" />
          <div>
            <strong>Operational intake</strong>
            <span>PulseDesk assigns the request number, owner, SLA target, and starting status automatically.</span>
          </div>
        </div>

        <div className="pdq-warning" data-testid="pulsedesk-phi-warning">
          <ShieldAlert size={18} aria-hidden="true" />
          <strong>{PHI_WARNING}</strong>
        </div>

        <label className="pdq-wide">
          <span>Operational summary *</span>
          <input
            ref={summaryInputRef}
            required
            minLength={5}
            maxLength={160}
            value={intake.summary}
            onChange={(event) => setIntake((current) => ({ ...current, summary: event.target.value }))}
            placeholder="Example: CT control workstation unavailable in imaging suite"
            data-testid="pulsedesk-request-summary"
          />
          <small>{intake.summary.length}/160 characters</small>
        </label>
        <label>
          <span>Category *</span>
          <select
            value={intake.category}
            onChange={(event) => setIntake((current) => ({
              ...current,
              category: event.target.value as PulseDeskRequestCategory,
            }))}
          >
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Priority *</span>
          <select
            value={intake.priority}
            onChange={(event) => setIntake((current) => ({
              ...current,
              priority: event.target.value as PulseDeskRequestPriority,
            }))}
          >
            {PRIORITIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Route to department</span>
          <select
            value={intake.departmentId}
            onChange={(event) => setIntake((current) => ({ ...current, departmentId: event.target.value }))}
          >
            <option value="">Unrouted intake</option>
            {activeDepartments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Operational location</span>
          <input
            maxLength={120}
            value={intake.locationLabel}
            onChange={(event) => setIntake((current) => ({ ...current, locationLabel: event.target.value }))}
            placeholder="Building / department / room only"
          />
        </label>
        <label className="pdq-checkbox">
          <input
            type="checkbox"
            checked={intake.isPatientImpacting}
            onChange={(event) => setIntake((current) => ({
              ...current,
              isPatientImpacting: event.target.checked,
            }))}
          />
          <span>Operational interruption may affect patient-care delivery</span>
        </label>
        <label className="pdq-checkbox pdq-acknowledgement" data-testid="pulsedesk-phi-acknowledgement">
          <input
            type="checkbox"
            required
            checked={intake.phiAcknowledged}
            onChange={(event) => setIntake((current) => ({
              ...current,
              phiAcknowledged: event.target.checked,
            }))}
          />
          <span>I confirm this request contains operational information only and no patient-identifying or clinical information.</span>
        </label>

        {actionError?.scope === 'intake' && (
          <InlineError message={actionError.message} />
        )}

        <div className="pdq-form-action">
          <button
            type="submit"
            disabled={submitting || !intake.summary.trim() || !intake.phiAcknowledged}
            data-testid="pulsedesk-request-create"
          >
            <ClipboardPlus size={16} aria-hidden="true" />
            {submitting ? 'Creating request…' : 'Create operational request'}
          </button>
        </div>
      </form>

      {canManageWorkflow && (
        <details className="pdq-departments" data-testid="pulsedesk-department-manager">
          <summary>
            <Building2 size={17} aria-hidden="true" />
            <span>Department routing administration</span>
            <small>{activeDepartments.length} active</small>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className="pdq-department-body">
            <form onSubmit={createDepartment}>
              <label>
                <span>New department</span>
                <input
                  value={departmentName}
                  maxLength={80}
                  onChange={(event) => setDepartmentName(event.target.value)}
                  placeholder="Department name"
                />
              </label>
              <button type="submit" disabled={!departmentName.trim() || Boolean(departmentActionId)}>
                <Building2 size={15} aria-hidden="true" />
                Add department
              </button>
            </form>
            {actionError?.scope === 'department' && <InlineError message={actionError.message} />}
            <div className="pdq-department-list">
              {departments.map((department) => (
                <div key={department.id}>
                  <span className={department.active ? 'pdq-active-dot' : 'pdq-inactive-dot'} aria-hidden="true" />
                  <strong>{department.name}</strong>
                  <span>{department.active ? 'Active routing target' : 'Inactive'}</span>
                  <button
                    type="button"
                    disabled={Boolean(departmentActionId)}
                    onClick={() => toggleDepartment(department)}
                  >
                    {departmentActionId === department.id
                      ? 'Updating…'
                      : department.active
                        ? 'Deactivate'
                        : 'Reactivate'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      <form
        className="pdq-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedFilters({ ...filters, search: filters.search.trim() });
        }}
        data-testid="pulsedesk-request-filters"
      >
        <label className="pdq-search">
          <Search size={16} aria-hidden="true" />
          <span className="pdq-sr-only">Search operational requests</span>
          <input
            value={filters.search}
            maxLength={100}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search operational summary or location"
          />
        </label>
        <label>
          <span className="pdq-sr-only">Filter by status</span>
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({
              ...current,
              status: event.target.value as FilterForm['status'],
            }))}
          >
            <option value="all">All statuses</option>
            {STATUSES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="pdq-sr-only">Filter by priority</span>
          <select
            value={filters.priority}
            onChange={(event) => setFilters((current) => ({
              ...current,
              priority: event.target.value as FilterForm['priority'],
            }))}
          >
            <option value="all">All priorities</option>
            {PRIORITIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="pdq-sr-only">Filter by category</span>
          <select
            value={filters.category}
            onChange={(event) => setFilters((current) => ({
              ...current,
              category: event.target.value as FilterForm['category'],
            }))}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="pdq-sr-only">Filter by department</span>
          <select
            value={filters.departmentId}
            onChange={(event) => setFilters((current) => ({ ...current, departmentId: event.target.value }))}
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}{department.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="pdq-sr-only">Filter by patient-care impact</span>
          <select
            value={filters.patientImpact}
            onChange={(event) => setFilters((current) => ({
              ...current,
              patientImpact: event.target.value as FilterForm['patientImpact'],
            }))}
          >
            <option value="all">All care-impact states</option>
            <option value="yes">Care delivery affected</option>
            <option value="no">No stated care impact</option>
          </select>
        </label>
        <button type="submit">Apply view</button>
        <button type="button" className="pdq-secondary" onClick={clearFilters}>
          <FilterX size={15} aria-hidden="true" />
          Clear
        </button>
        <button type="button" className="pdq-secondary" onClick={refreshQueue} aria-label="Refresh request queue">
          <RefreshCw size={15} aria-hidden="true" />
          Refresh
        </button>
      </form>

      <div className="pdq-workspace">
        <div className="pdq-list" aria-live="polite">
          {loading && requests.length === 0 ? (
            <QueueSkeleton />
          ) : !loadError && requests.length === 0 ? (
            <div className="pdq-empty" data-testid="pulsedesk-request-empty">
              <CircleDot size={22} aria-hidden="true" />
              <div>
                <strong>No requests in this view</strong>
                <span>
                  {Object.values(appliedFilters).some((value) => value && value !== 'all')
                    ? 'Clear the filters to restore the complete department queue.'
                    : 'Create the first PHI-safe operational request above.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (Object.values(appliedFilters).some((value) => value && value !== 'all')) clearFilters();
                  else summaryInputRef.current?.focus();
                }}
              >
                {Object.values(appliedFilters).some((value) => value && value !== 'all')
                  ? 'Clear filters'
                  : 'Create first request'}
              </button>
            </div>
          ) : (
            requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                selected={selectedId === request.id}
                onOpen={() => {
                  if (selectedId === request.id) {
                    setSelectedId(null);
                    setDetail(null);
                    setWorkflow(null);
                    return;
                  }
                  void loadDetail(request.id);
                }}
              />
            ))
          )}
        </div>

        <aside className="pdq-detail" aria-label="Selected request details" data-testid="pulsedesk-request-detail">
          {!selectedId ? (
            <div className="pdq-detail-empty">
              <History size={21} aria-hidden="true" />
              <strong>Select a request</strong>
              <span>Open a queue item to inspect routing, SLA, and its structured event timeline.</span>
            </div>
          ) : detailLoading ? (
            <div className="pdq-detail-loading" aria-busy="true">
              <div />
              <div />
              <div />
              <span className="pdq-sr-only">Loading request details…</span>
            </div>
          ) : detailError ? (
            <ErrorBanner message={detailError} testId="pulsedesk-detail-error">
              <button type="button" onClick={() => selectedId && void loadDetail(selectedId)}>
                <RefreshCw size={15} aria-hidden="true" />
                Retry detail
              </button>
            </ErrorBanner>
          ) : detail ? (
            <RequestDetail
              detail={detail}
              departments={departments}
              assignees={assignees}
              assigneesLoading={assigneesLoading}
              assigneeError={assigneeError}
              onRetryAssignees={() => setAssigneeReloadToken((value) => value + 1)}
              canManageWorkflow={canManageWorkflow}
              workflow={workflow}
              setWorkflow={setWorkflow}
              nextStatus={nextStatus}
              setNextStatus={setNextStatus}
              escalationReason={escalationReason}
              setEscalationReason={setEscalationReason}
              busy={requestAction !== null}
              actionError={actionError?.scope === 'detail' ? actionError.message : null}
              onSave={() => void saveWorkflow()}
              onTransition={() => void transitionRequest()}
            />
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'amber' | 'red' }) {
  return (
    <div className={`pdq-metric pdq-metric-${tone}`} data-testid={`pulsedesk-queue-metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ErrorBanner({
  message,
  testId,
  children,
}: {
  message: string;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="pdq-error" role="alert" data-testid={testId}>
      <AlertTriangle size={18} aria-hidden="true" />
      <div>
        <strong>PulseDesk request failed</strong>
        <span>{message}</span>
      </div>
      {children}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="pdq-inline-error" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="pdq-skeletons" aria-busy="true" data-testid="pulsedesk-request-loading">
      {[1, 2, 3].map((item) => (
        <div className="pdq-skeleton" key={item} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
      <span className="pdq-sr-only">Loading operational requests…</span>
    </div>
  );
}

function RequestCard({
  request,
  selected,
  onOpen,
}: {
  request: PulseDeskRequest;
  selected: boolean;
  onOpen: () => void;
}) {
  const overdue = isOverdue(request, Date.now());
  return (
    <article className={`pdq-card${selected ? ' pdq-card-selected' : ''}`} data-testid={`pulsedesk-request-${request.id}`}>
      <div className="pdq-card-flags">
        <span className={`pdq-priority pdq-priority-${request.priority}`}>{priorityLabel(request.priority)}</span>
        <span className={`pdq-status pdq-status-${request.status}`}>{statusLabel(request.status)}</span>
        {request.isPatientImpacting && <span className="pdq-impact">Care impact</span>}
      </div>
      <h3><span>{request.requestNumber}</span> {request.summary}</h3>
      <div className="pdq-card-context">
        <span><Building2 size={14} aria-hidden="true" />{request.departmentName || 'Unrouted intake'}</span>
        <span><UserRoundCog size={14} aria-hidden="true" />{request.assignedToName || (request.assignedToUserId ? 'Assigned operator' : 'Unassigned')}</span>
        <span className={overdue ? 'pdq-overdue' : undefined}>
          <CalendarClock size={14} aria-hidden="true" />
          {overdue ? 'Overdue: ' : 'Due: '}{formatDate(request.dueAt)}
        </span>
      </div>
      <div className="pdq-card-footer">
        <span>{categoryLabel(request.category)}</span>
        <button type="button" onClick={onOpen} aria-expanded={selected}>
          {selected ? 'Close details' : 'View details'}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function RequestDetail({
  detail,
  departments,
  assignees,
  assigneesLoading,
  assigneeError,
  onRetryAssignees,
  canManageWorkflow,
  workflow,
  setWorkflow,
  nextStatus,
  setNextStatus,
  escalationReason,
  setEscalationReason,
  busy,
  actionError,
  onSave,
  onTransition,
}: {
  detail: PulseDeskRequestDetailResponse;
  departments: PulseDeskDepartment[];
  assignees: PulseDeskAssignee[];
  assigneesLoading: boolean;
  assigneeError: string | null;
  onRetryAssignees: () => void;
  canManageWorkflow: boolean;
  workflow: WorkflowDraft | null;
  setWorkflow: React.Dispatch<React.SetStateAction<WorkflowDraft | null>>;
  nextStatus: PulseDeskRequestStatus | '';
  setNextStatus: React.Dispatch<React.SetStateAction<PulseDeskRequestStatus | ''>>;
  escalationReason: PulseDeskEscalationReasonCode;
  setEscalationReason: React.Dispatch<React.SetStateAction<PulseDeskEscalationReasonCode>>;
  busy: boolean;
  actionError: string | null;
  onSave: () => void;
  onTransition: () => void;
}) {
  const { request, events } = detail;
  const transitions = STATUS_TRANSITIONS[request.status];
  return (
    <div className="pdq-detail-content">
      <div className="pdq-detail-heading">
        <div className="pdq-card-flags">
          <span className={`pdq-priority pdq-priority-${request.priority}`}>{priorityLabel(request.priority)}</span>
          <span className={`pdq-status pdq-status-${request.status}`}>{statusLabel(request.status)}</span>
        </div>
        <h3>{request.requestNumber}</h3>
        <p>{request.summary}</p>
        <dl>
          <div><dt>Department</dt><dd>{request.departmentName || 'Unrouted'}</dd></div>
          <div><dt>Assignee</dt><dd>{request.assignedToName || (request.assignedToUserId ? 'Assigned operator' : 'Unassigned')}</dd></div>
          <div><dt>Location</dt><dd>{request.locationLabel || 'Not specified'}</dd></div>
          <div><dt>Due</dt><dd>{formatDate(request.dueAt)}</dd></div>
          <div><dt>Revision</dt><dd>{request.version}</dd></div>
        </dl>
      </div>

      {canManageWorkflow && workflow && (
        <section className="pdq-manager-controls" data-testid="pulsedesk-workflow-controls">
          <div className="pdq-subheading">
            <UserRoundCog size={16} aria-hidden="true" />
            <strong>Manager workflow controls</strong>
          </div>
          <label>
            <span>Priority</span>
            <select
              value={workflow.priority}
              disabled={busy}
              onChange={(event) => setWorkflow((current) => current ? {
                ...current,
                priority: event.target.value as PulseDeskRequestPriority,
              } : current)}
            >
              {PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Department route</span>
            <select
              value={workflow.departmentId}
              disabled={busy}
              onChange={(event) => setWorkflow((current) => current ? {
                ...current,
                departmentId: event.target.value,
              } : current)}
            >
              <option value="">Unrouted</option>
              {departments.map((department) => (
                <option
                  key={department.id}
                  value={department.id}
                  disabled={!department.active && department.id !== request.departmentId}
                >
                  {department.name}{department.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Eligible assignee</span>
            <select
              value={workflow.assignedToUserId}
              disabled={busy || assigneesLoading || Boolean(assigneeError)}
              onChange={(event) => setWorkflow((current) => current ? {
                ...current,
                assignedToUserId: event.target.value,
              } : current)}
            >
              <option value="">Unassigned</option>
              {request.assignedToUserId && !assignees.some((assignee) => assignee.id === request.assignedToUserId) && (
                <option value={request.assignedToUserId}>{request.assignedToName || 'Current assignee'}</option>
              )}
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
              ))}
            </select>
          </label>
          {assigneeError && (
            <div className="pdq-assignee-error" role="alert">
              <span>{assigneeError}</span>
              <button type="button" onClick={onRetryAssignees}>Retry assignees</button>
            </div>
          )}
          <button type="button" disabled={busy} onClick={onSave}>
            {busy ? 'Updating…' : 'Save routing'}
          </button>

          <div className="pdq-transition">
            <label>
              <span>Allowed next status</span>
              <select
                value={nextStatus}
                disabled={busy || transitions.length === 0}
                onChange={(event) => setNextStatus(event.target.value as PulseDeskRequestStatus)}
              >
                {transitions.length === 0 && <option value="">Closed — no transitions</option>}
                {transitions.map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
            </label>
            {nextStatus === 'escalated' && (
              <label>
                <span>Escalation reason</span>
                <select
                  value={escalationReason}
                  disabled={busy}
                  onChange={(event) => setEscalationReason(event.target.value as PulseDeskEscalationReasonCode)}
                >
                  {ESCALATION_REASONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" disabled={busy || !nextStatus} onClick={onTransition}>
              <ArrowRight size={15} aria-hidden="true" />
              {busy ? 'Transitioning…' : 'Apply transition'}
            </button>
          </div>
          {actionError && <InlineError message={actionError} />}
        </section>
      )}

      <section className="pdq-timeline" data-testid="pulsedesk-request-timeline">
        <div className="pdq-subheading">
          <History size={16} aria-hidden="true" />
          <strong>Structured event timeline</strong>
        </div>
        {events.length === 0 ? (
          <div className="pdq-timeline-empty">No structured events were returned for this request.</div>
        ) : (
          <ol>
            {events.map((event) => <TimelineEvent key={event.id} event={event} />)}
          </ol>
        )}
      </section>
    </div>
  );
}

function TimelineEvent({ event }: { event: PulseDeskRequestEvent }) {
  const reason = typeof event.metadata?.reasonCode === 'string'
    ? ESCALATION_REASONS.find((option) => option.value === event.metadata?.reasonCode)?.label
    : null;
  const title = event.type.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return (
    <li>
      <span className="pdq-timeline-dot" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {event.fromStatus && event.toStatus && (
          <span>{statusLabel(event.fromStatus)} → {statusLabel(event.toStatus)}</span>
        )}
        {reason && <span>Reason: {reason}</span>}
        <small>
          {event.actorUserId ? `Operator ${event.actorUserId.slice(0, 8)}` : 'System'} · {formatDate(event.createdAt)}
        </small>
      </div>
    </li>
  );
}

const queueCss = `
  .pdq-root { display: grid; gap: 16px; color: #102033; }
  .pdq-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: start; }
  .pdq-heading h2 { margin: 4px 0 0; font-size: 21px; text-wrap: balance; }
  .pdq-heading p { margin: 7px 0 0; max-width: 760px; color: #5b7087; font-size: 13px; line-height: 1.55; text-wrap: pretty; }
  .pdq-eyebrow { color: #0284c7; font-size: 11px; font-weight: 900; text-transform: uppercase; }
  .pdq-metrics { display: grid; grid-template-columns: repeat(4, minmax(90px, auto)); gap: 8px; }
  .pdq-metric { min-width: 0; border: 1px solid rgba(14,116,144,.18); border-radius: 7px; background: #f5fafe; padding: 10px 12px; display: grid; gap: 3px; }
  .pdq-metric span { color: #6a8096; font-size: 10px; font-weight: 800; text-transform: uppercase; }
  .pdq-metric strong { font-size: 18px; font-variant-numeric: tabular-nums; }
  .pdq-metric-blue strong { color: #0369a1; }
  .pdq-metric-amber strong { color: #b45309; }
  .pdq-metric-red strong { color: #b91c1c; }
  .pdq-error, .pdq-success { border-radius: 7px; padding: 11px 12px; display: flex; gap: 10px; align-items: center; font-size: 13px; }
  .pdq-error { border: 1px solid rgba(220,38,38,.35); background: #fef2f2; color: #991b1b; }
  .pdq-success { border: 1px solid rgba(22,163,74,.3); background: #f0fdf4; color: #166534; }
  .pdq-error > div { flex: 1; display: grid; gap: 3px; }
  .pdq-error span { color: #b91c1c; overflow-wrap: anywhere; }
  .pdq-success span { flex: 1; }
  .pdq-error button, .pdq-success button { flex: 0 0 auto; }
  .pdq-intake { border: 1px solid rgba(14,116,144,.24); border-radius: 8px; background: #f5fafe; padding: 14px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 11px; }
  .pdq-form-title, .pdq-warning, .pdq-acknowledgement, .pdq-inline-error { grid-column: 1 / -1; }
  .pdq-form-title { display: flex; gap: 9px; align-items: flex-start; }
  .pdq-form-title > svg { color: #0284c7; flex: 0 0 auto; }
  .pdq-form-title > div { display: grid; gap: 3px; }
  .pdq-form-title span { color: #5b7087; font-size: 12px; }
  .pdq-warning { border: 1px solid rgba(217,119,6,.34); border-radius: 7px; background: #fffbeb; color: #92400e; padding: 10px 11px; display: flex; gap: 9px; align-items: flex-start; font-size: 12px; line-height: 1.45; }
  .pdq-warning svg { flex: 0 0 auto; }
  .pdq-intake label, .pdq-filters label, .pdq-manager-controls label, .pdq-department-body label { min-width: 0; display: grid; gap: 5px; }
  .pdq-intake label > span, .pdq-manager-controls label > span, .pdq-department-body label > span { color: #4d647b; font-size: 11px; font-weight: 800; }
  .pdq-intake input, .pdq-intake select, .pdq-filters input, .pdq-filters select, .pdq-manager-controls input, .pdq-manager-controls select, .pdq-department-body input { width: 100%; box-sizing: border-box; border: 1px solid rgba(34,86,120,.22); border-radius: 6px; background: #fff; color: #102033; padding: 9px 10px; font: inherit; font-size: 13px; }
  .pdq-intake input:focus, .pdq-intake select:focus, .pdq-filters input:focus, .pdq-filters select:focus, .pdq-manager-controls input:focus, .pdq-manager-controls select:focus, .pdq-department-body input:focus, .pdq-root button:focus-visible, .pdq-departments summary:focus-visible { outline: 2px solid rgba(14,165,233,.5); outline-offset: 1px; border-color: #0284c7; }
  .pdq-wide { grid-column: span 2; }
  .pdq-wide small { color: #7f91a6; font-size: 10px; text-align: right; font-variant-numeric: tabular-nums; }
  .pdq-checkbox { display: flex !important; grid-template-columns: auto 1fr; align-items: center; gap: 8px !important; align-self: end; min-height: 38px; }
  .pdq-checkbox input { width: 17px; height: 17px; padding: 0; accent-color: #0284c7; }
  .pdq-checkbox span { color: #294158 !important; line-height: 1.4; }
  .pdq-acknowledgement { border-top: 1px solid rgba(34,86,120,.14); padding-top: 10px; align-self: auto; }
  .pdq-inline-error { border: 1px solid rgba(220,38,38,.3); border-radius: 6px; background: #fef2f2; color: #991b1b; padding: 9px 10px; display: flex; align-items: flex-start; gap: 8px; font-size: 12px; overflow-wrap: anywhere; }
  .pdq-form-action { grid-column: 4; display: flex; align-items: end; }
  .pdq-form-action button { width: 100%; }
  .pdq-root button { min-height: 36px; border: 1px solid #0284c7; border-radius: 6px; background: #0284c7; color: #fff; padding: 8px 11px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
  .pdq-root button:disabled { opacity: .55; cursor: not-allowed; }
  .pdq-root .pdq-secondary, .pdq-error button, .pdq-success button { border-color: rgba(34,86,120,.24); background: #fff; color: #294158; }
  .pdq-departments { border: 1px solid rgba(34,86,120,.18); border-radius: 8px; background: #fff; }
  .pdq-departments summary { list-style: none; cursor: pointer; padding: 12px 14px; display: flex; align-items: center; gap: 9px; color: #294158; }
  .pdq-departments summary::-webkit-details-marker { display: none; }
  .pdq-departments summary > small { margin-left: auto; color: #6a8096; font-size: 11px; }
  .pdq-departments[open] summary { border-bottom: 1px solid rgba(34,86,120,.14); }
  .pdq-department-body { padding: 14px; display: grid; gap: 12px; }
  .pdq-department-body form { display: grid; grid-template-columns: minmax(220px, 1fr) auto; gap: 9px; align-items: end; }
  .pdq-department-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .pdq-department-list > div { border: 1px solid rgba(34,86,120,.15); border-radius: 7px; background: #f8fbfd; padding: 9px 10px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 3px 8px; align-items: center; }
  .pdq-department-list strong { min-width: 0; font-size: 12px; overflow-wrap: anywhere; }
  .pdq-department-list span:nth-child(3) { grid-column: 2; color: #6a8096; font-size: 10px; }
  .pdq-department-list button { grid-column: 3; grid-row: 1 / span 2; min-height: 30px; background: #fff; color: #294158; border-color: rgba(34,86,120,.24); }
  .pdq-active-dot, .pdq-inactive-dot { width: 8px; height: 8px; border-radius: 999px; }
  .pdq-active-dot { background: #16a34a; }
  .pdq-inactive-dot { background: #94a3b8; }
  .pdq-filters { display: grid; grid-template-columns: minmax(240px, 1fr) repeat(5, minmax(125px, auto)) auto auto auto; gap: 8px; align-items: center; }
  .pdq-search { position: relative; }
  .pdq-search > svg { position: absolute; top: 10px; left: 10px; z-index: 1; color: #6a8096; }
  .pdq-search input { padding-left: 34px; }
  .pdq-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 38%); gap: 12px; align-items: start; }
  .pdq-list { min-width: 0; display: grid; gap: 9px; }
  .pdq-card { border: 1px solid rgba(34,86,120,.17); border-radius: 8px; background: #fff; padding: 13px; min-width: 0; }
  .pdq-card-selected { border-color: #0284c7; box-shadow: 0 8px 20px rgba(15,54,77,.09); }
  .pdq-card-flags { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
  .pdq-priority, .pdq-status, .pdq-impact { display: inline-flex; width: fit-content; border-radius: 999px; padding: 3px 7px; font-size: 9px; font-weight: 900; text-transform: uppercase; }
  .pdq-priority { color: #075985; background: #e0f2fe; }
  .pdq-priority-critical { color: #991b1b; background: #fee2e2; }
  .pdq-priority-high { color: #9a3412; background: #ffedd5; }
  .pdq-priority-low { color: #166534; background: #dcfce7; }
  .pdq-status { color: #475569; background: #f1f5f9; }
  .pdq-status-escalated { color: #991b1b; background: #fee2e2; }
  .pdq-status-waiting_department, .pdq-status-waiting_vendor { color: #92400e; background: #fef3c7; }
  .pdq-status-in_progress, .pdq-status-assigned, .pdq-status-triage { color: #075985; background: #e0f2fe; }
  .pdq-status-resolved, .pdq-status-closed { color: #166534; background: #dcfce7; }
  .pdq-impact { color: #9f1239; background: #ffe4e6; }
  .pdq-card h3 { margin: 8px 0 0; font-size: 15px; line-height: 1.4; overflow-wrap: anywhere; text-wrap: balance; }
  .pdq-card h3 > span { color: #0284c7; font-variant-numeric: tabular-nums; }
  .pdq-card-context { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 7px 13px; color: #5b7087; font-size: 11px; }
  .pdq-card-context span { display: inline-flex; align-items: center; gap: 5px; }
  .pdq-card-context .pdq-overdue { color: #b91c1c; font-weight: 800; }
  .pdq-card-footer { margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(34,86,120,.11); display: flex; justify-content: space-between; gap: 10px; align-items: center; }
  .pdq-card-footer > span { color: #6a8096; font-size: 11px; }
  .pdq-card-footer button { min-height: 31px; background: #fff; color: #0369a1; }
  .pdq-detail { position: sticky; top: 18px; min-width: 0; border: 1px solid rgba(34,86,120,.18); border-radius: 8px; background: #fff; overflow: hidden; }
  .pdq-detail-empty { min-height: 210px; padding: 22px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; text-align: center; color: #6a8096; }
  .pdq-detail-empty svg { color: #0284c7; }
  .pdq-detail-empty strong { color: #294158; }
  .pdq-detail-empty span { max-width: 300px; font-size: 12px; line-height: 1.5; text-wrap: pretty; }
  .pdq-detail-loading { padding: 18px; display: grid; gap: 10px; }
  .pdq-detail-loading div, .pdq-skeleton span { display: block; height: 11px; border-radius: 4px; background: #e5edf3; }
  .pdq-detail-loading div:nth-child(1) { width: 34%; }
  .pdq-detail-loading div:nth-child(2) { width: 78%; }
  .pdq-detail-loading div:nth-child(3) { width: 55%; }
  .pdq-detail > .pdq-error { margin: 12px; align-items: flex-start; flex-wrap: wrap; }
  .pdq-detail > .pdq-error button { width: 100%; }
  .pdq-detail-content { display: grid; }
  .pdq-detail-heading, .pdq-manager-controls, .pdq-timeline { padding: 14px; }
  .pdq-manager-controls, .pdq-timeline { border-top: 1px solid rgba(34,86,120,.14); }
  .pdq-detail-heading h3 { margin: 9px 0 0; color: #0284c7; font-size: 13px; font-variant-numeric: tabular-nums; }
  .pdq-detail-heading p { margin: 5px 0 0; color: #102033; font-size: 14px; font-weight: 800; line-height: 1.45; overflow-wrap: anywhere; text-wrap: pretty; }
  .pdq-detail-heading dl { margin: 12px 0 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .pdq-detail-heading dl > div { min-width: 0; border: 1px solid rgba(34,86,120,.12); border-radius: 6px; background: #f8fbfd; padding: 8px; }
  .pdq-detail-heading dt { color: #6a8096; font-size: 9px; font-weight: 800; text-transform: uppercase; }
  .pdq-detail-heading dd { margin: 3px 0 0; color: #294158; font-size: 11px; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .pdq-subheading { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; color: #294158; font-size: 12px; }
  .pdq-subheading svg { color: #0284c7; }
  .pdq-manager-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; background: #f8fbfd; }
  .pdq-manager-controls > .pdq-subheading, .pdq-manager-controls > .pdq-inline-error, .pdq-transition { grid-column: 1 / -1; }
  .pdq-assignee-error { grid-column: 1 / -1; border: 1px solid rgba(220,38,38,.28); border-radius: 6px; background: #fef2f2; color: #991b1b; padding: 8px; display: flex; align-items: center; gap: 8px; font-size: 10px; overflow-wrap: anywhere; }
  .pdq-assignee-error span { flex: 1; }
  .pdq-assignee-error button { min-height: 30px; background: #fff; color: #991b1b; border-color: rgba(220,38,38,.3); }
  .pdq-manager-controls > button { align-self: end; }
  .pdq-transition { border-top: 1px solid rgba(34,86,120,.13); padding-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
  .pdq-transition button { align-self: end; }
  .pdq-timeline ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
  .pdq-timeline li { position: relative; padding: 0 0 14px 20px; min-width: 0; }
  .pdq-timeline li:not(:last-child)::before { content: ''; position: absolute; top: 9px; bottom: 0; left: 5px; width: 1px; background: rgba(14,116,144,.22); }
  .pdq-timeline-dot { position: absolute; top: 4px; left: 1px; width: 9px; height: 9px; border: 2px solid #fff; border-radius: 999px; background: #0284c7; box-shadow: 0 0 0 1px rgba(14,116,144,.28); }
  .pdq-timeline li > div { display: grid; gap: 2px; min-width: 0; }
  .pdq-timeline li strong { color: #294158; font-size: 11px; }
  .pdq-timeline li span, .pdq-timeline li small, .pdq-timeline-empty { color: #6a8096; font-size: 10px; overflow-wrap: anywhere; }
  .pdq-timeline-empty { border: 1px dashed rgba(34,86,120,.2); border-radius: 6px; padding: 10px; text-align: center; }
  .pdq-empty { border: 1px dashed rgba(14,116,144,.3); border-radius: 8px; min-height: 120px; padding: 16px; display: flex; align-items: center; gap: 12px; color: #5b7087; }
  .pdq-empty > svg { color: #0284c7; }
  .pdq-empty > div { flex: 1; display: grid; gap: 4px; }
  .pdq-empty strong { color: #294158; }
  .pdq-empty span { font-size: 12px; line-height: 1.45; }
  .pdq-skeletons { display: grid; gap: 9px; }
  .pdq-skeleton { min-height: 108px; border: 1px solid rgba(34,86,120,.14); border-radius: 8px; background: #fff; padding: 14px; display: grid; align-content: center; gap: 10px; }
  .pdq-skeleton span:first-child { width: 30%; }
  .pdq-skeleton span:nth-child(2) { width: 76%; }
  .pdq-skeleton span:last-child { width: 52%; }
  .pdq-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  @media (max-width: 1180px) {
    .pdq-heading { grid-template-columns: 1fr; }
    .pdq-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .pdq-filters { grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(125px, auto)); }
  }
  @media (max-width: 900px) {
    .pdq-intake { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pdq-form-action { grid-column: 2; }
    .pdq-workspace { grid-template-columns: 1fr; }
    .pdq-detail { position: static; }
  }
  @media (max-width: 700px) {
    .pdq-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pdq-intake, .pdq-filters, .pdq-department-body form, .pdq-department-list { grid-template-columns: 1fr; }
    .pdq-wide, .pdq-form-action { grid-column: auto; }
    .pdq-form-title { flex-wrap: wrap; }
    .pdq-form-action button, .pdq-department-body form button { width: 100%; }
    .pdq-department-list > div { grid-template-columns: auto minmax(0, 1fr); }
    .pdq-department-list button { grid-column: 1 / -1; grid-row: auto; width: 100%; }
    .pdq-empty { align-items: flex-start; flex-wrap: wrap; }
    .pdq-empty > div { min-width: calc(100% - 42px); }
    .pdq-empty button { width: 100%; }
  }
  @media (max-width: 460px) {
    .pdq-manager-controls, .pdq-transition, .pdq-detail-heading dl { grid-template-columns: 1fr; }
  }
`;

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPulseDeskStatusTransition,
  assertPulseDeskVersionMatch,
  calculatePulseDeskDueAt,
  getPulseDeskSlaTargetHours,
  parsePulseDeskExpectedVersion,
  parsePulseDeskDepartmentCreate,
  parsePulseDeskDepartmentListQuery,
  parsePulseDeskDepartmentPatch,
  parsePulseDeskRequestCreate,
  parsePulseDeskRequestListQuery,
  parsePulseDeskRequestPatch,
  parsePulseDeskRequestTransition,
  PULSEDESK_ESCALATION_REASON_CODES,
  PULSEDESK_REQUEST_EVENT_TYPES,
  PULSEDESK_LOCATION_MAX_LENGTH,
  PULSEDESK_PHI_ACKNOWLEDGEMENT,
  PULSEDESK_PHI_WARNING,
  PULSEDESK_REQUEST_CATEGORIES,
  PULSEDESK_REQUEST_PRIORITIES,
  PULSEDESK_REQUEST_STATUSES,
  PULSEDESK_SLA_BASE_HOURS,
  PULSEDESK_STATUS_TRANSITIONS,
  PULSEDESK_SUMMARY_MAX_LENGTH,
  PulseDeskRequestValidationError,
  PulseDeskStatusTransitionError,
  PulseDeskVersionConflictError,
} from '../src/lib/pulsedesk-requests.ts';

const departmentId = '11111111-2222-3333-4444-555555555555';
const assignedToUserId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('PulseDesk domain preserves imported priority, status, and category enums', () => {
  assert.deepEqual(PULSEDESK_REQUEST_PRIORITIES, ['critical', 'high', 'normal', 'low']);
  assert.deepEqual(PULSEDESK_REQUEST_STATUSES, [
    'new',
    'triage',
    'assigned',
    'waiting_department',
    'waiting_vendor',
    'in_progress',
    'escalated',
    'resolved',
    'closed',
  ]);
  assert.deepEqual(PULSEDESK_REQUEST_CATEGORIES, [
    'it_infrastructure',
    'medical_equipment',
    'supplies_inventory',
    'facilities_building',
    'housekeeping_environmental',
    'safety_compliance',
    'vendor_external',
    'administrative',
    'hr_staff',
    'other',
  ]);
  assert.deepEqual(PULSEDESK_ESCALATION_REASON_CODES, [
    'patient_care_risk',
    'safety_risk',
    'department_nonresponse',
    'sla_breach',
    'resource_blocked',
    'other',
  ]);
  assert.deepEqual(PULSEDESK_REQUEST_EVENT_TYPES, [
    'created',
    'updated',
    'department_changed',
    'assignee_changed',
    'priority_changed',
    'status_changed',
    'escalated',
  ]);
});

test('department inputs are bounded, single-line, and strictly allowlisted', () => {
  assert.deepEqual(parsePulseDeskDepartmentCreate({ name: '  Imaging  Operations  ' }), {
    name: 'Imaging Operations',
  });
  assert.deepEqual(parsePulseDeskDepartmentPatch({ name: 'Radiology', active: false }), {
    name: 'Radiology',
    active: false,
  });
  assert.deepEqual(parsePulseDeskDepartmentListQuery(undefined), { includeInactive: false });
  assert.deepEqual(parsePulseDeskDepartmentListQuery({ includeInactive: 'true' }), {
    includeInactive: true,
  });

  for (const body of [
    { name: 'x' },
    { name: 'x'.repeat(81) },
    { name: 'Imaging\nOperations' },
    { name: 'Imaging', tenantId: departmentId },
  ]) {
    assert.throws(() => parsePulseDeskDepartmentCreate(body), PulseDeskRequestValidationError);
  }
  assert.throws(
    () => parsePulseDeskDepartmentPatch({ active: 'false' }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'active',
  );
  assert.throws(
    () => parsePulseDeskDepartmentListQuery({ tenantId: departmentId }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'tenantId',
  );
});

test('create accepts only bounded operational fields after explicit PHI acknowledgement', () => {
  const parsed = parsePulseDeskRequestCreate({
    summary: '  CT scanner room unavailable  ',
    category: 'medical_equipment',
    priority: 'critical',
    departmentId: `  ${departmentId}  `,
    locationLabel: '  Building A  Floor 2  Imaging  ',
    isPatientImpacting: true,
    phiAcknowledged: true,
  });

  assert.deepEqual(parsed, {
    summary: 'CT scanner room unavailable',
    category: 'medical_equipment',
    priority: 'critical',
    departmentId,
    locationLabel: 'Building A Floor 2 Imaging',
    isPatientImpacting: true,
  });
  assert.equal('phiAcknowledged' in parsed, false);
  assert.equal('tenantId' in parsed, false);
  assert.equal('createdByUserId' in parsed, false);
  assert.equal('status' in parsed, false);
  assert.equal('dueAt' in parsed, false);
});

test('create enforces PHI warning semantics and rejects narrative or authority fields', () => {
  const validBase = {
    summary: 'Scanner unavailable',
    category: 'medical_equipment',
    priority: 'high',
  };

  assert.match(PULSEDESK_PHI_WARNING, /patient names, MRNs, dates of birth, diagnoses, or clinical notes/);
  assert.match(PULSEDESK_PHI_ACKNOWLEDGEMENT, /operational information only/);

  assert.throws(
    () => parsePulseDeskRequestCreate(validBase),
    (error: unknown) => error instanceof PulseDeskRequestValidationError
      && error.code === 'PHI_ACKNOWLEDGEMENT_REQUIRED'
      && error.field === 'phiAcknowledged',
  );

  for (const forbiddenField of ['description', 'internalNotes', 'patientName', 'mrn', 'tenantId', 'status', 'dueAt']) {
    assert.throws(
      () => parsePulseDeskRequestCreate({
        ...validBase,
        phiAcknowledged: true,
        [forbiddenField]: 'not accepted',
      }),
      (error: unknown) => error instanceof PulseDeskRequestValidationError
        && error.field === forbiddenField,
    );
  }
});

test('department and assignee identifiers must use canonical UUID hyphen groups', () => {
  assert.throws(
    () => parsePulseDeskRequestCreate({
      summary: 'Scanner unavailable',
      category: 'medical_equipment',
      priority: 'high',
      departmentId: '111111112222-3333-4444-5555-555555555555',
      phiAcknowledged: true,
    }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError
      && error.field === 'departmentId'
      && /canonical UUID/.test(error.message),
  );

  assert.throws(
    () => parsePulseDeskRequestPatch({
      expectedVersion: 1,
      assignedToUserId: 'aaaaaaaabbbb-cccc-dddd-eeee-eeeeeeeeeeee',
    }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError
      && error.field === 'assignedToUserId',
  );
});

test('SLA helpers preserve imported targets and calculate dueAt from the supplied clock', () => {
  assert.deepEqual(PULSEDESK_SLA_BASE_HOURS, {
    critical: 4,
    high: 24,
    normal: 72,
    low: 168,
  });

  assert.equal(getPulseDeskSlaTargetHours('critical', false), 4);
  assert.equal(getPulseDeskSlaTargetHours('high', false), 24);
  assert.equal(getPulseDeskSlaTargetHours('normal', false), 72);
  assert.equal(getPulseDeskSlaTargetHours('low', false), 168);
  assert.equal(getPulseDeskSlaTargetHours('critical', true), 4);
  assert.equal(getPulseDeskSlaTargetHours('high', true), 12);
  assert.equal(getPulseDeskSlaTargetHours('normal', true), 12);
  assert.equal(getPulseDeskSlaTargetHours('low', true), 48);

  const clock = new Date('2026-07-13T12:00:00.000Z');
  assert.deepEqual(
    calculatePulseDeskDueAt('critical', false, clock),
    new Date('2026-07-13T16:00:00.000Z'),
  );
  assert.deepEqual(
    calculatePulseDeskDueAt('high', true, clock),
    new Date('2026-07-14T00:00:00.000Z'),
  );
  assert.deepEqual(
    calculatePulseDeskDueAt('low', false, clock),
    new Date('2026-07-20T12:00:00.000Z'),
  );
  assert.deepEqual(clock, new Date('2026-07-13T12:00:00.000Z'));
  assert.throws(
    () => calculatePulseDeskDueAt('normal', false, new Date('invalid')),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'clock',
  );
});

test('create and patch enforce single-line summary and location limits', () => {
  const base = {
    category: 'other',
    priority: 'normal',
    phiAcknowledged: true,
  };

  assert.throws(
    () => parsePulseDeskRequestCreate({ ...base, summary: 'x'.repeat(PULSEDESK_SUMMARY_MAX_LENGTH + 1) }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'summary',
  );
  assert.throws(
    () => parsePulseDeskRequestCreate({ ...base, summary: 'Valid summary', locationLabel: 'x'.repeat(PULSEDESK_LOCATION_MAX_LENGTH + 1) }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'locationLabel',
  );
  assert.throws(
    () => parsePulseDeskRequestCreate({ ...base, summary: 'Patient detail\nsecond line' }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'summary',
  );
});

test('patch separates optimistic version from an explicit editable-field allowlist', () => {
  const parsed = parsePulseDeskRequestPatch({
    expectedVersion: '7',
    summary: '  MRI room requires facilities review  ',
    priority: 'high',
    departmentId: null,
    assignedToUserId,
    locationLabel: '',
    isPatientImpacting: false,
    phiAcknowledged: true,
  });

  assert.deepEqual(parsed, {
    expectedVersion: 7,
    changes: {
      summary: 'MRI room requires facilities review',
      priority: 'high',
      departmentId: null,
      assignedToUserId,
      locationLabel: null,
      isPatientImpacting: false,
    },
  });

  assert.throws(
    () => parsePulseDeskRequestPatch({ expectedVersion: 1, summary: 'Changed summary' }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError
      && error.code === 'PHI_ACKNOWLEDGEMENT_REQUIRED',
  );
  assert.throws(
    () => parsePulseDeskRequestPatch({ expectedVersion: 1, status: 'closed' }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'status',
  );
  assert.throws(
    () => parsePulseDeskRequestPatch({ expectedVersion: 1, dueAt: '2026-07-15T12:00:00.000Z' }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'dueAt',
  );
  assert.throws(
    () => parsePulseDeskRequestPatch({ expectedVersion: 1 }),
    PulseDeskRequestValidationError,
  );
});

test('transition parser requires optimistic version and structured escalation reason', () => {
  assert.deepEqual(parsePulseDeskRequestTransition({
    expectedVersion: 'W/"4"',
    toStatus: 'escalated',
    reasonCode: 'department_nonresponse',
  }), {
    expectedVersion: 4,
    toStatus: 'escalated',
    reasonCode: 'department_nonresponse',
  });

  assert.deepEqual(parsePulseDeskRequestTransition({
    expectedVersion: 4,
    toStatus: 'in_progress',
  }), {
    expectedVersion: 4,
    toStatus: 'in_progress',
    reasonCode: null,
  });

  assert.throws(
    () => parsePulseDeskRequestTransition({ expectedVersion: 4, toStatus: 'escalated' }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'reasonCode',
  );
  assert.throws(
    () => parsePulseDeskRequestTransition({ expectedVersion: 4, toStatus: 'resolved', reasonCode: 'other' }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'reasonCode',
  );
});

test('transition graph allows controlled workflow changes and returns a 409 domain error otherwise', () => {
  assert.deepEqual(PULSEDESK_STATUS_TRANSITIONS.new, ['triage', 'assigned', 'escalated']);
  assert.deepEqual(PULSEDESK_STATUS_TRANSITIONS.closed, []);
  assert.doesNotThrow(() => assertPulseDeskStatusTransition('new', 'triage'));
  assert.doesNotThrow(() => assertPulseDeskStatusTransition('resolved', 'triage'));

  assert.throws(
    () => assertPulseDeskStatusTransition('new', 'closed'),
    (error: unknown) => error instanceof PulseDeskStatusTransitionError
      && error.statusCode === 409
      && error.code === 'INVALID_STATUS_TRANSITION'
      && error.fromStatus === 'new'
      && error.toStatus === 'closed'
      && error.allowedStatuses.includes('triage'),
  );
  assert.throws(
    () => assertPulseDeskStatusTransition('closed', 'triage'),
    PulseDeskStatusTransitionError,
  );
});

test('list filters normalize supported values and enforce bounded search and result limits', () => {
  assert.deepEqual(parsePulseDeskRequestListQuery({
    status: ' escalated ',
    priority: 'critical',
    category: 'safety_compliance',
    departmentId: ` ${departmentId} `,
    assignedToUserId,
    isPatientImpacting: 'true',
    search: '  imaging  outage  ',
    limit: '25',
  }), {
    status: 'escalated',
    priority: 'critical',
    category: 'safety_compliance',
    departmentId,
    assignedToUserId,
    isPatientImpacting: true,
    search: 'imaging outage',
    limit: 25,
  });
  assert.deepEqual(parsePulseDeskRequestListQuery(undefined), { limit: 50 });

  assert.throws(
    () => parsePulseDeskRequestListQuery({ search: 'x'.repeat(101) }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'search',
  );
  assert.throws(
    () => parsePulseDeskRequestListQuery({ limit: 101 }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'limit',
  );
  assert.throws(
    () => parsePulseDeskRequestListQuery({ tenantId: 'other-tenant' }),
    (error: unknown) => error instanceof PulseDeskRequestValidationError && error.field === 'tenantId',
  );
});

test('optimistic version parser supports body and If-Match forms and exposes 409 conflicts', () => {
  assert.equal(parsePulseDeskExpectedVersion(3), 3);
  assert.equal(parsePulseDeskExpectedVersion('3'), 3);
  assert.equal(parsePulseDeskExpectedVersion('"3"'), 3);
  assert.equal(parsePulseDeskExpectedVersion('W/"3"'), 3);

  for (const invalid of [undefined, null, 0, -1, 1.5, 'abc', '3.5']) {
    assert.throws(
      () => parsePulseDeskExpectedVersion(invalid),
      (error: unknown) => error instanceof PulseDeskRequestValidationError
        && error.field === 'expectedVersion',
    );
  }

  assert.doesNotThrow(() => assertPulseDeskVersionMatch(5, 5));
  assert.throws(
    () => assertPulseDeskVersionMatch(4, 5),
    (error: unknown) => error instanceof PulseDeskVersionConflictError
      && error.statusCode === 409
      && error.code === 'REQUEST_VERSION_CONFLICT'
      && error.expectedVersion === 4
      && error.actualVersion === 5,
  );
});

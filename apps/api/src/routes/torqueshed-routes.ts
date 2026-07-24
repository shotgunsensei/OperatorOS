import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { activityFeed } from '../schema.js';
import {
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  assertDiagnosticTransition,
  maskVin,
  normalizeVin,
  torqueDate,
  torqueEnum,
  torqueId,
  torqueInteger,
  torqueNumber,
  torquePage,
  torqueText,
  TORQUESHED_BUILD_STATUSES,
  TORQUESHED_DIAGNOSTIC_ENTRY_KINDS,
  TORQUESHED_DIAGNOSTIC_STATUSES,
  TORQUESHED_REMINDER_STATUSES,
  TORQUESHED_TASK_STATUSES,
  TORQUESHED_VISIBILITIES,
  TorqueShedValidationError,
} from '../lib/torqueshed-foundation.js';
import { createAttachment, listAttachments } from '../lib/shared-attachments.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('torqueshed')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];

type Context = { tenantId: string; role: 'owner' | 'admin' | 'member'; viaPlatformRole: boolean };
type User = { id: string };
type Executor = Pick<typeof db, 'execute' | 'insert'>;

function tenant(request: FastifyRequest): string {
  return ((request as any).tenantContext as Context).tenantId;
}
function user(request: FastifyRequest): string {
  return ((request as any).user as User).id;
}
function canManage(request: FastifyRequest): boolean {
  const ctx = (request as any).tenantContext as Context;
  const access = (request as any).tenantModuleAccessLevel as string | undefined;
  return (
    ctx.viaPlatformRole || ctx.role === 'owner' || ctx.role === 'admin' || access === 'manager'
  );
}

function objectBody(request: FastifyRequest): Record<string, unknown> {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw new TorqueShedValidationError('A JSON object is required', 'TORQUESHED_BODY_INVALID');
  }
  return request.body as Record<string, unknown>;
}

function jsonObject(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value))
    throw new TorqueShedValidationError(
      `${field} must be an object`,
      'TORQUESHED_OBJECT_INVALID',
      field,
    );
  return value as Record<string, unknown>;
}

function jsonArray(value: unknown, field: string, max = 100): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max)
    throw new TorqueShedValidationError(
      `${field} must be an array of at most ${max} items`,
      'TORQUESHED_ARRAY_INVALID',
      field,
    );
  return value;
}

function camelKey(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}
function camelRow(row: unknown): Record<string, any> {
  if (!row || typeof row !== 'object') return {};
  return Object.fromEntries(
    Object.entries(row as Record<string, unknown>).map(([key, value]) => [camelKey(key), value]),
  );
}
function rows(result: Awaited<ReturnType<typeof db.execute>>): Array<Record<string, any>> {
  return result.rows.map(camelRow);
}
function first(result: Awaited<ReturnType<typeof db.execute>>): Record<string, any> | null {
  return result.rows[0] ? camelRow(result.rows[0]) : null;
}

function safeVehicle(row: Record<string, any> | null): Record<string, any> | null {
  if (!row) return null;
  const { vinSha256: _hash, vinLast6, ...safe } = row;
  return { ...safe, vinMasked: maskVin(vinLast6) };
}

function handleError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof TorqueShedValidationError) {
    reply.code(error.statusCode).send({
      error: error.message,
      code: error.code,
      ...(error.field ? { field: error.field } : {}),
    });
    return true;
  }
  const pg = error as { code?: string; constraint?: string };
  if (pg?.code === '23505') {
    reply.code(409).send({
      error: 'A matching active TorqueShed record already exists',
      code: 'TORQUESHED_DUPLICATE',
      constraint: pg.constraint,
    });
    return true;
  }
  return false;
}

function notFound(reply: FastifyReply, entity: string) {
  return reply.code(404).send({
    error: `${entity} not found`,
    code: `TORQUESHED_${entity.toUpperCase().replaceAll(' ', '_')}_NOT_FOUND`,
  });
}

async function audit(
  executor: Executor,
  request: FastifyRequest,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  await executor.insert(activityFeed).values({
    tenantId: tenant(request),
    userId: user(request),
    action: `torqueshed_${action}`,
    entityType: `torqueshed_${entityType}`,
    entityId,
    metadata,
  });
}

async function moduleId(): Promise<string> {
  const result = await db.execute(sql`SELECT id FROM modules WHERE slug = 'torqueshed' LIMIT 1`);
  const id = result.rows[0]?.id;
  if (!id) throw new Error('TorqueShed module registry row is missing');
  return String(id);
}

async function vehicleRow(request: FastifyRequest, id: string, write = false) {
  const result = await db.execute(sql`
    SELECT * FROM torqueshed_vehicles
    WHERE tenant_id = ${tenant(request)} AND id = ${id} AND archived_at IS NULL
      AND (${canManage(request)} OR owner_user_id = ${user(request)}
        OR (${write === false} AND visibility IN ('tenant','public_build')))
    LIMIT 1
  `);
  return first(result);
}

async function vendorRow(request: FastifyRequest, id: string) {
  const result = await db.execute(sql`
    SELECT * FROM torqueshed_vendors
    WHERE tenant_id = ${tenant(request)} AND id = ${id} AND archived_at IS NULL
      AND (${canManage(request)} OR owner_user_id = ${user(request)})
    LIMIT 1
  `);
  return first(result);
}

async function buildRow(request: FastifyRequest, id: string, write = false) {
  const result = await db.execute(sql`
    SELECT * FROM torqueshed_builds
    WHERE tenant_id = ${tenant(request)} AND id = ${id} AND archived_at IS NULL
      AND (${canManage(request)} OR owner_user_id = ${user(request)}
        OR (${write === false} AND visibility IN ('tenant','public_build')))
    LIMIT 1
  `);
  return first(result);
}

async function diagnosticRow(request: FastifyRequest, id: string, write = false) {
  const result = await db.execute(sql`
    SELECT * FROM torqueshed_diagnostic_sessions
    WHERE tenant_id = ${tenant(request)} AND id = ${id} AND archived_at IS NULL
      AND (${canManage(request)} OR owner_user_id = ${user(request)}
        OR (${write === false} AND visibility = 'tenant'))
    LIMIT 1
  `);
  return first(result);
}

function expectedVersion(body: Record<string, unknown>): number {
  return torqueInteger(body.expectedVersion, 'expectedVersion', 1, 2_147_483_647, true)!;
}

function idempotencyKey(request: FastifyRequest): string | null {
  return torqueText(request.headers['idempotency-key'], 'Idempotency-Key', 200, {
    singleLine: true,
    min: 8,
  });
}

export async function registerTorqueShedRoutes(app: FastifyInstance) {
  app.get('/v1/modules/torqueshed/dashboard', { preHandler: readGuards }, async (request) => {
    const scope = sql`tenant_id = ${tenant(request)} AND archived_at IS NULL`;
    const owner = sql`(${canManage(request)} OR owner_user_id = ${user(request)} OR visibility IN ('tenant','public_build'))`;
    const diagnosticsOwner = sql`(${canManage(request)} OR owner_user_id = ${user(request)} OR visibility = 'tenant')`;
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM torqueshed_vehicles WHERE ${scope} AND ${owner}) AS vehicles,
        (SELECT COUNT(*)::int FROM torqueshed_service_records s
          JOIN torqueshed_vehicles v ON v.tenant_id=s.tenant_id AND v.id=s.vehicle_id
          WHERE s.tenant_id=${tenant(request)} AND s.archived_at IS NULL AND v.archived_at IS NULL
            AND (${canManage(request)} OR v.owner_user_id=${user(request)} OR v.visibility IN ('tenant','public_build'))) AS service_records,
        (SELECT COUNT(*)::int FROM torqueshed_builds WHERE ${scope} AND ${owner}) AS builds,
        (SELECT COUNT(*)::int FROM torqueshed_diagnostic_sessions WHERE ${scope} AND ${diagnosticsOwner}) AS diagnostics,
        (SELECT COUNT(*)::int FROM torqueshed_service_reminders r
          JOIN torqueshed_vehicles v ON v.tenant_id=r.tenant_id AND v.id=r.vehicle_id
          WHERE r.tenant_id=${tenant(request)} AND r.archived_at IS NULL AND v.archived_at IS NULL
            AND r.status IN ('open','snoozed')
            AND (${canManage(request)} OR v.owner_user_id=${user(request)} OR v.visibility IN ('tenant','public_build'))) AS reminders,
        (SELECT COALESCE(SUM(COALESCE(s.labor_cost_minor,0)+COALESCE(s.parts_cost_minor,0)+COALESCE(s.other_cost_minor,0)),0)::bigint
          FROM torqueshed_service_records s
          JOIN torqueshed_vehicles v ON v.tenant_id=s.tenant_id AND v.id=s.vehicle_id
          WHERE s.tenant_id=${tenant(request)} AND s.archived_at IS NULL AND v.archived_at IS NULL
            AND (${canManage(request)} OR v.owner_user_id=${user(request)} OR v.visibility IN ('tenant','public_build'))) AS service_cost_minor
    `);
    return { metrics: camelRow(result.rows[0]), generatedAt: new Date().toISOString() };
  });

  app.get('/v1/modules/torqueshed/vehicles', { preHandler: readGuards }, async (request, reply) => {
    try {
      const query = request.query as Record<string, unknown>;
      const page = torquePage(query);
      const visibility = query.visibility
        ? torqueEnum(query.visibility, 'visibility', TORQUESHED_VISIBILITIES)
        : null;
      const result = await db.execute(sql`
        SELECT *, COUNT(*) OVER()::int AS total_count FROM torqueshed_vehicles
        WHERE tenant_id = ${tenant(request)} AND archived_at IS NULL
          AND (${canManage(request)} OR owner_user_id = ${user(request)} OR visibility IN ('tenant','public_build'))
          AND (${visibility}::text IS NULL OR visibility = ${visibility})
          AND (${page.search} = '' OR nickname ILIKE ${`%${page.search}%`} OR make ILIKE ${`%${page.search}%`} OR model ILIKE ${`%${page.search}%`})
        ORDER BY updated_at DESC, id DESC LIMIT ${page.limit} OFFSET ${page.offset}
      `);
      const vehicles = rows(result).map(safeVehicle);
      return { vehicles, pagination: { ...page, total: vehicles[0]?.totalCount ?? 0 } };
    } catch (error) {
      if (!handleError(reply, error)) throw error;
    }
  });

  app.post(
    '/v1/modules/torqueshed/vehicles',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const body = objectBody(request);
        const vin = normalizeVin(body.vin);
        const year = torqueInteger(body.year, 'year', 1886, new Date().getFullYear() + 2, true)!;
        const make = torqueText(body.make, 'make', 100, {
          required: true,
          min: 1,
          singleLine: true,
        })!;
        const model = torqueText(body.model, 'model', 100, {
          required: true,
          min: 1,
          singleLine: true,
        })!;
        const visibility = torqueEnum(
          body.visibility,
          'visibility',
          TORQUESHED_VISIBILITIES,
          'private',
        );
        const created = await db.transaction(async (tx) => {
          const result = await tx.execute(sql`
          INSERT INTO torqueshed_vehicles (
            tenant_id, owner_user_id, nickname, year, make, model, trim, engine, transmission, drivetrain,
            current_mileage, ownership_status, visibility, vin_sha256, vin_last6, notes, created_by_user_id, updated_by_user_id
          ) VALUES (
            ${tenant(request)}, ${user(request)}, ${torqueText(body.nickname, 'nickname', 100, { singleLine: true })}, ${year}, ${make}, ${model},
            ${torqueText(body.trim, 'trim', 100, { singleLine: true })}, ${torqueText(body.engine, 'engine', 160, { singleLine: true })},
            ${torqueText(body.transmission, 'transmission', 120, { singleLine: true })}, ${torqueText(body.drivetrain, 'drivetrain', 80, { singleLine: true })},
            ${torqueInteger(body.currentMileage ?? body.mileage, 'currentMileage', 0, 10_000_000)},
            ${torqueEnum(body.ownershipStatus, 'ownershipStatus', ['owned', 'leased', 'customer', 'former'] as const, 'owned')},
            ${visibility}, ${vin?.hash ?? null}, ${vin?.last6 ?? null}, ${torqueText(body.notes, 'notes', 10_000)}, ${user(request)}, ${user(request)}
          ) RETURNING *
        `);
          const row = first(result)!;
          await audit(tx, request, 'vehicle_created', 'vehicle', row.id, {
            year,
            make,
            model,
            visibility,
            vinStoredAsMaskedFingerprint: Boolean(vin),
          });
          return row;
        });
        return reply.code(201).send(safeVehicle(created));
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );

  app.get(
    '/v1/modules/torqueshed/vehicles/:id',
    { preHandler: readGuards },
    async (request, reply) => {
      const id = torqueId((request.params as any).id, 'id', true)!;
      const vehicle = await vehicleRow(request, id);
      if (!vehicle) return notFound(reply, 'vehicle');
      const [mileage, service, reminders, builds, diagnostics, files] = await Promise.all([
        db.execute(
          sql`SELECT * FROM torqueshed_mileage_events WHERE tenant_id=${tenant(request)} AND vehicle_id=${id} AND archived_at IS NULL ORDER BY occurred_at DESC, id DESC LIMIT 250`,
        ),
        db.execute(
          sql`SELECT *, (COALESCE(labor_cost_minor,0)+COALESCE(parts_cost_minor,0)+COALESCE(other_cost_minor,0))::bigint AS total_cost_minor FROM torqueshed_service_records WHERE tenant_id=${tenant(request)} AND vehicle_id=${id} AND archived_at IS NULL ORDER BY occurred_at DESC, id DESC LIMIT 250`,
        ),
        db.execute(
          sql`SELECT * FROM torqueshed_service_reminders WHERE tenant_id=${tenant(request)} AND vehicle_id=${id} AND archived_at IS NULL ORDER BY due_at NULLS LAST, due_mileage NULLS LAST`,
        ),
        db.execute(
          sql`SELECT * FROM torqueshed_builds WHERE tenant_id=${tenant(request)} AND vehicle_id=${id} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)} OR visibility IN ('tenant','public_build')) ORDER BY updated_at DESC`,
        ),
        db.execute(
          sql`SELECT * FROM torqueshed_diagnostic_sessions WHERE tenant_id=${tenant(request)} AND vehicle_id=${id} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)} OR visibility='tenant') ORDER BY updated_at DESC`,
        ),
        listAttachments({
          tenantId: tenant(request),
          moduleId: await moduleId(),
          objectType: 'torqueshed_vehicle',
          objectId: id,
          limit: 100,
        }),
      ]);
      return {
        vehicle: safeVehicle(vehicle),
        mileageEvents: rows(mileage),
        serviceRecords: rows(service),
        reminders: rows(reminders),
        builds: rows(builds),
        diagnostics: rows(diagnostics),
        attachments: files.map(camelRow),
      };
    },
  );

  app.patch(
    '/v1/modules/torqueshed/vehicles/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const body = objectBody(request);
        const id = torqueId((request.params as any).id, 'id', true)!;
        if (!(await vehicleRow(request, id, true))) return notFound(reply, 'vehicle');
        const version = expectedVersion(body);
        const vin = Object.prototype.hasOwnProperty.call(body, 'vin')
          ? normalizeVin(body.vin)
          : undefined;
        const year = Object.prototype.hasOwnProperty.call(body, 'year')
          ? torqueInteger(body.year, 'year', 1886, new Date().getFullYear() + 2, true)
          : undefined;
        const make = Object.prototype.hasOwnProperty.call(body, 'make')
          ? torqueText(body.make, 'make', 100, {
              required: true,
              min: 1,
              singleLine: true,
            })
          : undefined;
        const model = Object.prototype.hasOwnProperty.call(body, 'model')
          ? torqueText(body.model, 'model', 100, {
              required: true,
              min: 1,
              singleLine: true,
            })
          : undefined;
        const result = await db.execute(sql`
        UPDATE torqueshed_vehicles SET
          nickname=CASE WHEN ${'nickname' in body} THEN ${torqueText(body.nickname, 'nickname', 100, { singleLine: true })} ELSE nickname END,
          year=CASE WHEN ${year !== undefined} THEN ${year ?? null} ELSE year END,
          make=CASE WHEN ${make !== undefined} THEN ${make ?? null} ELSE make END,
          model=CASE WHEN ${model !== undefined} THEN ${model ?? null} ELSE model END,
          trim=CASE WHEN ${'trim' in body} THEN ${torqueText(body.trim, 'trim', 100, { singleLine: true })} ELSE trim END,
          engine=CASE WHEN ${'engine' in body} THEN ${torqueText(body.engine, 'engine', 160, { singleLine: true })} ELSE engine END,
          transmission=CASE WHEN ${'transmission' in body} THEN ${torqueText(body.transmission, 'transmission', 120, { singleLine: true })} ELSE transmission END,
          drivetrain=CASE WHEN ${'drivetrain' in body} THEN ${torqueText(body.drivetrain, 'drivetrain', 80, { singleLine: true })} ELSE drivetrain END,
          current_mileage=CASE WHEN ${'currentMileage' in body} THEN ${torqueInteger(body.currentMileage, 'currentMileage', 0, 10_000_000)} ELSE current_mileage END,
          visibility=CASE WHEN ${'visibility' in body} THEN ${torqueEnum(body.visibility, 'visibility', TORQUESHED_VISIBILITIES, 'private')} ELSE visibility END,
          ownership_status=CASE WHEN ${'ownershipStatus' in body} THEN ${torqueEnum(body.ownershipStatus, 'ownershipStatus', ['owned', 'leased', 'customer', 'former'] as const, 'owned')} ELSE ownership_status END,
          vin_sha256=CASE WHEN ${vin !== undefined} THEN ${vin?.hash ?? null} ELSE vin_sha256 END,
          vin_last6=CASE WHEN ${vin !== undefined} THEN ${vin?.last6 ?? null} ELSE vin_last6 END,
          notes=CASE WHEN ${'notes' in body} THEN ${torqueText(body.notes, 'notes', 10_000)} ELSE notes END,
          version=version+1, updated_by_user_id=${user(request)}, updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${version} AND archived_at IS NULL RETURNING *
      `);
        const updated = first(result);
        if (!updated)
          return reply.code(409).send({
            error: 'Vehicle changed in another session',
            code: 'TORQUESHED_VERSION_CONFLICT',
          });
        await audit(db, request, 'vehicle_updated', 'vehicle', id, {
          fromVersion: version,
          toVersion: updated.version,
        });
        return safeVehicle(updated);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );

  app.delete(
    '/v1/modules/torqueshed/vehicles/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const body = objectBody(request);
        const id = torqueId((request.params as any).id, 'id', true)!;
        const version = expectedVersion(body);
        if (!(await vehicleRow(request, id, true))) return notFound(reply, 'vehicle');
        const result = await db.execute(
          sql`UPDATE torqueshed_vehicles SET archived_at=NOW(), updated_at=NOW(), updated_by_user_id=${user(request)}, version=version+1 WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${version} AND archived_at IS NULL RETURNING id,version,archived_at`,
        );
        const archived = first(result);
        if (!archived)
          return reply.code(409).send({
            error: 'Vehicle changed in another session',
            code: 'TORQUESHED_VERSION_CONFLICT',
          });
        await audit(db, request, 'vehicle_archived', 'vehicle', id);
        return archived;
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );

  app.post(
    '/v1/modules/torqueshed/vehicles/:id/mileage-events',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const body = objectBody(request);
        const id = torqueId((request.params as any).id, 'id', true)!;
        if (!(await vehicleRow(request, id, true))) return notFound(reply, 'vehicle');
        const mileage = torqueInteger(body.mileage, 'mileage', 0, 10_000_000, true)!;
        const occurredAt = torqueDate(body.occurredAt, 'occurredAt') ?? new Date();
        const key = idempotencyKey(request);
        const created = await db.transaction(async (tx) => {
          const existing = key
            ? first(
                await tx.execute(
                  sql`SELECT * FROM torqueshed_mileage_events WHERE tenant_id=${tenant(request)} AND created_by_user_id=${user(request)} AND idempotency_key=${key} LIMIT 1`,
                ),
              )
            : null;
          if (existing) return existing;
          const row = first(
            await tx.execute(
              sql`INSERT INTO torqueshed_mileage_events (tenant_id,vehicle_id,mileage,occurred_at,source,notes,idempotency_key,created_by_user_id) VALUES (${tenant(request)},${id},${mileage},${occurredAt},${torqueEnum(body.source, 'source', ['manual', 'maintenance', 'repair', 'inspection', 'import'] as const, 'manual')},${torqueText(body.notes, 'notes', 5000)},${key},${user(request)}) RETURNING *`,
            ),
          )!;
          await tx.execute(
            sql`UPDATE torqueshed_vehicles SET current_mileage=GREATEST(COALESCE(current_mileage,0),${mileage}),version=version+1,updated_at=NOW(),updated_by_user_id=${user(request)} WHERE tenant_id=${tenant(request)} AND id=${id}`,
          );
          await audit(tx, request, 'mileage_recorded', 'mileage_event', row.id, {
            vehicleId: id,
            mileage,
          });
          return row;
        });
        return reply.code(201).send(created);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );

  app.post(
    '/v1/modules/torqueshed/vehicles/:id/service-records',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const body = objectBody(request);
        const vehicleId = torqueId((request.params as any).id, 'id', true)!;
        if (!(await vehicleRow(request, vehicleId, true))) return notFound(reply, 'vehicle');
        const vendorId = torqueId(body.vendorId, 'vendorId');
        if (vendorId && !(await vendorRow(request, vendorId))) return notFound(reply, 'vendor');
        const parts = jsonArray(body.parts, 'parts', 200).map((raw, index) => {
          const part = jsonObject(raw, `parts[${index}]`);
          return {
            vendorId: torqueId(part.vendorId, `parts[${index}].vendorId`),
            name: torqueText(part.name, `parts[${index}].name`, 180, {
              required: true,
              min: 1,
              singleLine: true,
            }),
            manufacturer: torqueText(part.manufacturer, `parts[${index}].manufacturer`, 120, {
              singleLine: true,
            }),
            partNumber: torqueText(part.partNumber, `parts[${index}].partNumber`, 120, {
              singleLine: true,
            }),
            quantity: torqueInteger(
              part.quantity ?? 1,
              `parts[${index}].quantity`,
              1,
              100_000,
              true,
            ),
            unitCostMinor: torqueInteger(
              part.unitCostMinor,
              `parts[${index}].unitCostMinor`,
              0,
              2_147_483_647,
            ),
            currency: (
              torqueText(part.currency, `parts[${index}].currency`, 3, {
                singleLine: true,
              }) ?? 'USD'
            ).toUpperCase(),
            notes: torqueText(part.notes, `parts[${index}].notes`, 2000),
          };
        });
        for (const part of parts) {
          if (part.vendorId && !(await vendorRow(request, part.vendorId)))
            return notFound(reply, 'vendor');
        }
        const key = idempotencyKey(request);
        const record = await db.transaction(async (tx) => {
          const existing = key
            ? first(
                await tx.execute(
                  sql`SELECT * FROM torqueshed_service_records WHERE tenant_id=${tenant(request)} AND created_by_user_id=${user(request)} AND idempotency_key=${key} LIMIT 1`,
                ),
              )
            : null;
          if (existing) return existing;
          const row = first(
            await tx.execute(
              sql`INSERT INTO torqueshed_service_records (tenant_id,vehicle_id,vendor_id,kind,title,description,mileage,occurred_at,labor_minutes,labor_cost_minor,parts_cost_minor,other_cost_minor,currency,status,idempotency_key,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${vehicleId},${vendorId},${torqueEnum(body.kind, 'kind', ['maintenance', 'repair', 'inspection', 'modification'] as const, 'maintenance')},${torqueText(body.title, 'title', 180, { required: true, min: 2, singleLine: true })},${torqueText(body.description, 'description', 10000)},${torqueInteger(body.mileage, 'mileage', 0, 10_000_000)},${torqueDate(body.occurredAt, 'occurredAt') ?? new Date()},${torqueInteger(body.laborMinutes, 'laborMinutes', 0, 1_000_000)},${torqueInteger(body.laborCostMinor, 'laborCostMinor', 0, 2_147_483_647)},${torqueInteger(body.partsCostMinor, 'partsCostMinor', 0, 2_147_483_647)},${torqueInteger(body.otherCostMinor, 'otherCostMinor', 0, 2_147_483_647)},${(torqueText(body.currency, 'currency', 3, { singleLine: true }) ?? 'USD').toUpperCase()},${torqueEnum(body.status, 'status', ['planned', 'in_progress', 'completed', 'canceled'] as const, 'completed')},${key},${user(request)},${user(request)}) RETURNING *`,
            ),
          )!;
          for (const part of parts) {
            await tx.execute(
              sql`INSERT INTO torqueshed_service_parts (tenant_id,service_record_id,vendor_id,name,manufacturer,part_number,quantity,unit_cost_minor,currency,notes,created_by_user_id) VALUES (${tenant(request)},${row.id},${part.vendorId},${part.name},${part.manufacturer},${part.partNumber},${part.quantity},${part.unitCostMinor},${part.currency},${part.notes},${user(request)})`,
            );
          }
          if (row.mileage !== null)
            await tx.execute(
              sql`UPDATE torqueshed_vehicles SET current_mileage=GREATEST(COALESCE(current_mileage,0),${row.mileage}),version=version+1,updated_at=NOW(),updated_by_user_id=${user(request)} WHERE tenant_id=${tenant(request)} AND id=${vehicleId}`,
            );
          await audit(tx, request, 'service_record_created', 'service_record', row.id, {
            vehicleId,
            kind: row.kind,
            partCount: parts.length,
          });
          return row;
        });
        return reply.code(201).send(record);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );

  app.patch(
    '/v1/modules/torqueshed/service-records/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const body = objectBody(request);
        const id = torqueId((request.params as any).id, 'id', true)!;
        const version = expectedVersion(body);
        const result = await db.execute(
          sql`UPDATE torqueshed_service_records r SET title=CASE WHEN ${'title' in body} THEN ${torqueText(body.title, 'title', 180, { required: 'title' in body, min: 2, singleLine: true })} ELSE r.title END,description=CASE WHEN ${'description' in body} THEN ${torqueText(body.description, 'description', 10000)} ELSE r.description END,status=CASE WHEN ${'status' in body} THEN ${torqueEnum(body.status, 'status', ['planned', 'in_progress', 'completed', 'canceled'] as const, 'completed')} ELSE r.status END,labor_minutes=CASE WHEN ${'laborMinutes' in body} THEN ${torqueInteger(body.laborMinutes, 'laborMinutes', 0, 1_000_000)} ELSE r.labor_minutes END,labor_cost_minor=CASE WHEN ${'laborCostMinor' in body} THEN ${torqueInteger(body.laborCostMinor, 'laborCostMinor', 0, 2_147_483_647)} ELSE r.labor_cost_minor END,parts_cost_minor=CASE WHEN ${'partsCostMinor' in body} THEN ${torqueInteger(body.partsCostMinor, 'partsCostMinor', 0, 2_147_483_647)} ELSE r.parts_cost_minor END,other_cost_minor=CASE WHEN ${'otherCostMinor' in body} THEN ${torqueInteger(body.otherCostMinor, 'otherCostMinor', 0, 2_147_483_647)} ELSE r.other_cost_minor END,version=r.version+1,updated_by_user_id=${user(request)},updated_at=NOW() FROM torqueshed_vehicles v WHERE r.tenant_id=${tenant(request)} AND r.id=${id} AND r.version=${version} AND r.archived_at IS NULL AND v.tenant_id=r.tenant_id AND v.id=r.vehicle_id AND v.archived_at IS NULL AND (${canManage(request)} OR v.owner_user_id=${user(request)}) RETURNING r.*`,
        );
        const updated = first(result);
        if (!updated)
          return reply.code(409).send({
            error: 'Service record not found or changed',
            code: 'TORQUESHED_VERSION_CONFLICT',
          });
        await audit(db, request, 'service_record_updated', 'service_record', id);
        return updated;
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );

  app.delete(
    '/v1/modules/torqueshed/service-records/:id',
    { preHandler: writeGuards },
    async (request, reply) =>
      archiveChild(request, reply, 'torqueshed_service_records', 'service_record'),
  );

  app.get('/v1/modules/torqueshed/vendors', { preHandler: readGuards }, async (request) => ({
    vendors: rows(
      await db.execute(
        sql`SELECT * FROM torqueshed_vendors WHERE tenant_id=${tenant(request)} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)}) ORDER BY name`,
      ),
    ),
  }));
  app.post(
    '/v1/modules/torqueshed/vendors',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const result = await db.execute(
          sql`INSERT INTO torqueshed_vendors (tenant_id,owner_user_id,name,website,phone,email,notes,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${user(request)},${torqueText(b.name, 'name', 160, { required: true, min: 2, singleLine: true })},${torqueText(b.website, 'website', 500, { singleLine: true })},${torqueText(b.phone, 'phone', 80, { singleLine: true })},${torqueText(b.email, 'email', 254, { singleLine: true })},${torqueText(b.notes, 'notes', 5000)},${user(request)},${user(request)}) RETURNING *`,
        );
        const created = first(result)!;
        await audit(db, request, 'vendor_created', 'vendor', created.id);
        return reply.code(201).send(created);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.patch(
    '/v1/modules/torqueshed/vendors/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const id = torqueId((request.params as any).id, 'id', true)!;
        const version = expectedVersion(b);
        const result = await db.execute(
          sql`UPDATE torqueshed_vendors SET name=CASE WHEN ${'name' in b} THEN ${torqueText(b.name, 'name', 160, { required: 'name' in b, min: 2, singleLine: true })} ELSE name END,website=CASE WHEN ${'website' in b} THEN ${torqueText(b.website, 'website', 500, { singleLine: true })} ELSE website END,phone=CASE WHEN ${'phone' in b} THEN ${torqueText(b.phone, 'phone', 80, { singleLine: true })} ELSE phone END,email=CASE WHEN ${'email' in b} THEN ${torqueText(b.email, 'email', 254, { singleLine: true })} ELSE email END,notes=CASE WHEN ${'notes' in b} THEN ${torqueText(b.notes, 'notes', 5000)} ELSE notes END,version=version+1,updated_by_user_id=${user(request)},updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${version} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)}) RETURNING *`,
        );
        const updated = first(result);
        if (!updated)
          return reply
            .code(409)
            .send({ error: 'Vendor not found or changed', code: 'TORQUESHED_VERSION_CONFLICT' });
        await audit(db, request, 'vendor_updated', 'vendor', id);
        return updated;
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.delete(
    '/v1/modules/torqueshed/vendors/:id',
    { preHandler: writeGuards },
    async (request, reply) => archiveOwned(request, reply, 'torqueshed_vendors', 'vendor'),
  );

  app.get('/v1/modules/torqueshed/builds', { preHandler: readGuards }, async (request, reply) => {
    try {
      const page = torquePage(request.query as Record<string, unknown>);
      const status = (request.query as any).status
        ? torqueEnum((request.query as any).status, 'status', TORQUESHED_BUILD_STATUSES)
        : null;
      const result = await db.execute(
        sql`SELECT *,COUNT(*)OVER()::int AS total_count FROM torqueshed_builds WHERE tenant_id=${tenant(request)} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)} OR visibility IN ('tenant','public_build')) AND (${status}::text IS NULL OR status=${status}) AND (${page.search}='' OR title ILIKE ${`%${page.search}%`}) ORDER BY updated_at DESC LIMIT ${page.limit} OFFSET ${page.offset}`,
      );
      const builds = rows(result);
      return { builds, pagination: { ...page, total: builds[0]?.totalCount ?? 0 } };
    } catch (error) {
      if (!handleError(reply, error)) throw error;
    }
  });
  app.post('/v1/modules/torqueshed/builds', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const b = objectBody(request);
      const vehicleId = torqueId(b.vehicleId, 'vehicleId');
      if (vehicleId && !(await vehicleRow(request, vehicleId, true)))
        return notFound(reply, 'vehicle');
      const result = await db.execute(
        sql`INSERT INTO torqueshed_builds (tenant_id,owner_user_id,vehicle_id,title,description,status,visibility,budget_minor,currency,started_at,target_at,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${user(request)},${vehicleId},${torqueText(b.title, 'title', 180, { required: true, min: 2, singleLine: true })},${torqueText(b.description, 'description', 10000)},${torqueEnum(b.status, 'status', TORQUESHED_BUILD_STATUSES, 'planning')},${torqueEnum(b.visibility, 'visibility', TORQUESHED_VISIBILITIES, 'private')},${torqueInteger(b.budgetMinor, 'budgetMinor', 0, 2_147_483_647)},${(torqueText(b.currency, 'currency', 3, { singleLine: true }) ?? 'USD').toUpperCase()},${torqueDate(b.startedAt, 'startedAt')},${torqueDate(b.targetAt, 'targetAt')},${user(request)},${user(request)}) RETURNING *`,
      );
      const created = first(result)!;
      await audit(db, request, 'build_created', 'build', created.id, { vehicleId });
      return reply.code(201).send(created);
    } catch (error) {
      if (!handleError(reply, error)) throw error;
    }
  });
  app.get(
    '/v1/modules/torqueshed/builds/:id',
    { preHandler: readGuards },
    async (request, reply) => {
      const id = torqueId((request.params as any).id, 'id', true)!;
      const build = await buildRow(request, id);
      if (!build) return notFound(reply, 'build');
      const [stages, tasks, files] = await Promise.all([
        db.execute(
          sql`SELECT * FROM torqueshed_build_stages WHERE tenant_id=${tenant(request)} AND build_id=${id} AND archived_at IS NULL ORDER BY position,id`,
        ),
        db.execute(
          sql`SELECT * FROM torqueshed_build_tasks WHERE tenant_id=${tenant(request)} AND build_id=${id} AND archived_at IS NULL ORDER BY position,id`,
        ),
        listAttachments({
          tenantId: tenant(request),
          moduleId: await moduleId(),
          objectType: 'torqueshed_build',
          objectId: id,
          limit: 100,
        }),
      ]);
      return { build, stages: rows(stages), tasks: rows(tasks), attachments: files.map(camelRow) };
    },
  );
  app.patch(
    '/v1/modules/torqueshed/builds/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const id = torqueId((request.params as any).id, 'id', true)!;
        if (!(await buildRow(request, id, true))) return notFound(reply, 'build');
        const version = expectedVersion(b);
        const status =
          'status' in b ? torqueEnum(b.status, 'status', TORQUESHED_BUILD_STATUSES) : null;
        const result = await db.execute(
          sql`UPDATE torqueshed_builds SET title=CASE WHEN ${'title' in b} THEN ${torqueText(b.title, 'title', 180, { required: 'title' in b, min: 2, singleLine: true })} ELSE title END,description=CASE WHEN ${'description' in b} THEN ${torqueText(b.description, 'description', 10000)} ELSE description END,status=COALESCE(${status},status),visibility=CASE WHEN ${'visibility' in b} THEN ${torqueEnum(b.visibility, 'visibility', TORQUESHED_VISIBILITIES, 'private')} ELSE visibility END,budget_minor=CASE WHEN ${'budgetMinor' in b} THEN ${torqueInteger(b.budgetMinor, 'budgetMinor', 0, 2_147_483_647)} ELSE budget_minor END,completed_at=CASE WHEN ${status === 'completed'} THEN NOW() WHEN ${status !== null} THEN NULL ELSE completed_at END,version=version+1,updated_by_user_id=${user(request)},updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${version} AND archived_at IS NULL RETURNING *`,
        );
        const updated = first(result);
        if (!updated)
          return reply.code(409).send({
            error: 'Build changed in another session',
            code: 'TORQUESHED_VERSION_CONFLICT',
          });
        await audit(db, request, 'build_updated', 'build', id, { status });
        return updated;
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.delete(
    '/v1/modules/torqueshed/builds/:id',
    { preHandler: writeGuards },
    async (request, reply) => archiveOwned(request, reply, 'torqueshed_builds', 'build'),
  );
  app.post(
    '/v1/modules/torqueshed/builds/:id/stages',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const buildId = torqueId((request.params as any).id, 'id', true)!;
        if (!(await buildRow(request, buildId, true))) return notFound(reply, 'build');
        const row = first(
          await db.execute(
            sql`INSERT INTO torqueshed_build_stages (tenant_id,build_id,title,description,position,status,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${buildId},${torqueText(b.title, 'title', 180, { required: true, min: 1, singleLine: true })},${torqueText(b.description, 'description', 5000)},${torqueInteger(b.position ?? 0, 'position', 0, 100000, true)},${torqueEnum(b.status, 'status', TORQUESHED_TASK_STATUSES, 'open')},${user(request)},${user(request)}) RETURNING *`,
          ),
        )!;
        await audit(db, request, 'build_stage_created', 'build_stage', row.id, { buildId });
        return reply.code(201).send(row);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.post(
    '/v1/modules/torqueshed/builds/:id/tasks',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const buildId = torqueId((request.params as any).id, 'id', true)!;
        if (!(await buildRow(request, buildId, true))) return notFound(reply, 'build');
        const stageId = torqueId(b.stageId, 'stageId');
        if (
          stageId &&
          !first(
            await db.execute(
              sql`SELECT id FROM torqueshed_build_stages WHERE tenant_id=${tenant(request)} AND build_id=${buildId} AND id=${stageId} AND archived_at IS NULL`,
            ),
          )
        )
          return notFound(reply, 'build stage');
        const row = first(
          await db.execute(
            sql`INSERT INTO torqueshed_build_tasks (tenant_id,build_id,stage_id,title,notes,status,position,due_at,cost_minor,currency,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${buildId},${stageId},${torqueText(b.title, 'title', 180, { required: true, min: 1, singleLine: true })},${torqueText(b.notes, 'notes', 5000)},${torqueEnum(b.status, 'status', TORQUESHED_TASK_STATUSES, 'open')},${torqueInteger(b.position ?? 0, 'position', 0, 100000, true)},${torqueDate(b.dueAt, 'dueAt')},${torqueInteger(b.costMinor, 'costMinor', 0, 2_147_483_647)},${(torqueText(b.currency, 'currency', 3, { singleLine: true }) ?? 'USD').toUpperCase()},${user(request)},${user(request)}) RETURNING *`,
          ),
        )!;
        await audit(db, request, 'build_task_created', 'build_task', row.id, { buildId, stageId });
        return reply.code(201).send(row);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.patch(
    '/v1/modules/torqueshed/build-tasks/:id',
    { preHandler: writeGuards },
    async (request, reply) =>
      updateBuildChild(request, reply, 'torqueshed_build_tasks', 'build_task'),
  );
  app.patch(
    '/v1/modules/torqueshed/build-stages/:id',
    { preHandler: writeGuards },
    async (request, reply) =>
      updateBuildChild(request, reply, 'torqueshed_build_stages', 'build_stage'),
  );

  app.get('/v1/modules/torqueshed/reminders', { preHandler: readGuards }, async (request) => ({
    reminders: rows(
      await db.execute(
        sql`SELECT r.* FROM torqueshed_service_reminders r JOIN torqueshed_vehicles v ON v.tenant_id=r.tenant_id AND v.id=r.vehicle_id WHERE r.tenant_id=${tenant(request)} AND r.archived_at IS NULL AND v.archived_at IS NULL AND (${canManage(request)} OR v.owner_user_id=${user(request)} OR v.visibility IN ('tenant','public_build')) ORDER BY r.due_at NULLS LAST,r.due_mileage NULLS LAST`,
      ),
    ),
  }));
  app.post(
    '/v1/modules/torqueshed/vehicles/:id/reminders',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const vehicleId = torqueId((request.params as any).id, 'id', true)!;
        if (!(await vehicleRow(request, vehicleId, true))) return notFound(reply, 'vehicle');
        const dueAt = torqueDate(b.dueAt, 'dueAt');
        const dueMileage = torqueInteger(b.dueMileage, 'dueMileage', 0, 10_000_000);
        if (!dueAt && dueMileage === null)
          throw new TorqueShedValidationError(
            'dueAt or dueMileage is required',
            'TORQUESHED_REMINDER_DUE_REQUIRED',
          );
        const row = first(
          await db.execute(
            sql`INSERT INTO torqueshed_service_reminders (tenant_id,vehicle_id,title,notes,due_at,due_mileage,interval_days,interval_miles,status,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${vehicleId},${torqueText(b.title, 'title', 180, { required: true, min: 2, singleLine: true })},${torqueText(b.notes, 'notes', 5000)},${dueAt},${dueMileage},${torqueInteger(b.intervalDays, 'intervalDays', 1, 36500)},${torqueInteger(b.intervalMiles, 'intervalMiles', 1, 10_000_000)},${torqueEnum(b.status, 'status', TORQUESHED_REMINDER_STATUSES, 'open')},${user(request)},${user(request)}) RETURNING *`,
          ),
        )!;
        await audit(db, request, 'reminder_created', 'reminder', row.id, { vehicleId });
        return reply.code(201).send(row);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.patch(
    '/v1/modules/torqueshed/reminders/:id',
    { preHandler: writeGuards },
    async (request, reply) => updateReminder(request, reply),
  );
  app.delete(
    '/v1/modules/torqueshed/reminders/:id',
    { preHandler: writeGuards },
    async (request, reply) =>
      archiveChild(request, reply, 'torqueshed_service_reminders', 'reminder'),
  );

  app.get(
    '/v1/modules/torqueshed/diagnostics',
    { preHandler: readGuards },
    async (request, reply) => {
      try {
        const page = torquePage(request.query as Record<string, unknown>);
        const status = (request.query as any).status
          ? torqueEnum((request.query as any).status, 'status', TORQUESHED_DIAGNOSTIC_STATUSES)
          : null;
        const vehicleId = torqueId((request.query as any).vehicleId, 'vehicleId');
        const result = await db.execute(
          sql`SELECT d.*,v.year,v.make,v.model,v.nickname,COUNT(*)OVER()::int AS total_count FROM torqueshed_diagnostic_sessions d JOIN torqueshed_vehicles v ON v.tenant_id=d.tenant_id AND v.id=d.vehicle_id WHERE d.tenant_id=${tenant(request)} AND d.archived_at IS NULL AND v.archived_at IS NULL AND (${canManage(request)} OR d.owner_user_id=${user(request)} OR d.visibility='tenant') AND (${status}::text IS NULL OR d.status=${status}) AND (${vehicleId}::text IS NULL OR d.vehicle_id=${vehicleId}) AND (${page.search}='' OR d.title ILIKE ${`%${page.search}%`} OR d.customer_concern ILIKE ${`%${page.search}%`}) ORDER BY d.updated_at DESC LIMIT ${page.limit} OFFSET ${page.offset}`,
        );
        const diagnostics = rows(result);
        return { diagnostics, pagination: { ...page, total: diagnostics[0]?.totalCount ?? 0 } };
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.post(
    '/v1/modules/torqueshed/diagnostics',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const vehicleId = torqueId(b.vehicleId, 'vehicleId', true)!;
        if (!(await vehicleRow(request, vehicleId, true))) return notFound(reply, 'vehicle');
        const row = first(
          await db.execute(
            sql`INSERT INTO torqueshed_diagnostic_sessions (tenant_id,owner_user_id,vehicle_id,title,customer_concern,symptoms,conditions,status,visibility,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${user(request)},${vehicleId},${torqueText(b.title, 'title', 180, { required: true, min: 2, singleLine: true })},${torqueText(b.customerConcern, 'customerConcern', 10000, { required: true, min: 2 })},${torqueText(b.symptoms, 'symptoms', 10000)},${jsonObject(b.conditions, 'conditions')},${torqueEnum(b.status, 'status', TORQUESHED_DIAGNOSTIC_STATUSES, 'open')},${torqueEnum(b.visibility, 'visibility', ['private', 'tenant'] as const, 'private')},${user(request)},${user(request)}) RETURNING *`,
          ),
        )!;
        await audit(db, request, 'diagnostic_created', 'diagnostic_session', row.id, { vehicleId });
        return reply.code(201).send(row);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.get(
    '/v1/modules/torqueshed/diagnostics/:id',
    { preHandler: readGuards },
    async (request, reply) => {
      const id = torqueId((request.params as any).id, 'id', true)!;
      const diagnostic = await diagnosticRow(request, id);
      if (!diagnostic) return notFound(reply, 'diagnostic session');
      const [codes, entries, files] = await Promise.all([
        db.execute(
          sql`SELECT * FROM torqueshed_diagnostic_trouble_codes WHERE tenant_id=${tenant(request)} AND diagnostic_session_id=${id} AND archived_at IS NULL ORDER BY observed_at,id`,
        ),
        db.execute(
          sql`SELECT * FROM torqueshed_diagnostic_entries WHERE tenant_id=${tenant(request)} AND diagnostic_session_id=${id} AND archived_at IS NULL ORDER BY observed_at,id`,
        ),
        listAttachments({
          tenantId: tenant(request),
          moduleId: await moduleId(),
          objectType: 'torqueshed_diagnostic',
          objectId: id,
          limit: 100,
        }),
      ]);
      const timeline = [
        ...rows(codes).map((row) => ({
          ...row,
          timelineType: 'trouble_code',
          timelineAt: row.observedAt,
        })),
        ...rows(entries).map((row) => ({
          ...row,
          timelineType: 'entry',
          timelineAt: row.observedAt,
        })),
        ...files.map((row) => ({
          ...camelRow(row),
          timelineType: 'attachment',
          timelineAt: (row as any).created_at,
        })),
      ].sort((a, b) => new Date(a.timelineAt).getTime() - new Date(b.timelineAt).getTime());
      return {
        diagnostic,
        codes: rows(codes),
        entries: rows(entries),
        attachments: files.map(camelRow),
        timeline,
      };
    },
  );
  app.patch(
    '/v1/modules/torqueshed/diagnostics/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const id = torqueId((request.params as any).id, 'id', true)!;
        const current = await diagnosticRow(request, id, true);
        if (!current) return notFound(reply, 'diagnostic session');
        const version = expectedVersion(b);
        const status =
          'status' in b
            ? torqueEnum(b.status, 'status', TORQUESHED_DIAGNOSTIC_STATUSES)
            : current.status;
        assertDiagnosticTransition(current.status, status);
        const result = await db.execute(
          sql`UPDATE torqueshed_diagnostic_sessions SET title=CASE WHEN ${'title' in b} THEN ${torqueText(b.title, 'title', 180, { required: 'title' in b, min: 2, singleLine: true })} ELSE title END,customer_concern=CASE WHEN ${'customerConcern' in b} THEN ${torqueText(b.customerConcern, 'customerConcern', 10000, { required: 'customerConcern' in b, min: 2 })} ELSE customer_concern END,symptoms=CASE WHEN ${'symptoms' in b} THEN ${torqueText(b.symptoms, 'symptoms', 10000)} ELSE symptoms END,conditions=CASE WHEN ${'conditions' in b} THEN ${jsonObject(b.conditions, 'conditions')} ELSE conditions END,confirmed_cause=CASE WHEN ${'confirmedCause' in b} THEN ${torqueText(b.confirmedCause, 'confirmedCause', 10000)} ELSE confirmed_cause END,repair_performed=CASE WHEN ${'repairPerformed' in b} THEN ${torqueText(b.repairPerformed, 'repairPerformed', 10000)} ELSE repair_performed END,verification=CASE WHEN ${'verification' in b} THEN ${torqueText(b.verification, 'verification', 10000)} ELSE verification END,resolution=CASE WHEN ${'resolution' in b} THEN ${torqueText(b.resolution, 'resolution', 10000)} ELSE resolution END,status=${status},visibility=CASE WHEN ${'visibility' in b} THEN ${torqueEnum(b.visibility, 'visibility', ['private', 'tenant'] as const, 'private')} ELSE visibility END,resolved_at=CASE WHEN ${status === 'resolved'} THEN COALESCE(resolved_at,NOW()) WHEN ${status !== 'resolved'} THEN NULL ELSE resolved_at END,version=version+1,updated_by_user_id=${user(request)},updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${version} AND archived_at IS NULL RETURNING *`,
        );
        const updated = first(result);
        if (!updated)
          return reply.code(409).send({
            error: 'Diagnostic changed in another session',
            code: 'TORQUESHED_VERSION_CONFLICT',
          });
        await audit(db, request, 'diagnostic_updated', 'diagnostic_session', id, {
          fromStatus: current.status,
          toStatus: status,
        });
        return updated;
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.delete(
    '/v1/modules/torqueshed/diagnostics/:id',
    { preHandler: writeGuards },
    async (request, reply) =>
      archiveOwned(request, reply, 'torqueshed_diagnostic_sessions', 'diagnostic_session'),
  );
  app.post(
    '/v1/modules/torqueshed/diagnostics/:id/trouble-codes',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const sessionId = torqueId((request.params as any).id, 'id', true)!;
        if (!(await diagnosticRow(request, sessionId, true)))
          return notFound(reply, 'diagnostic session');
        const code = (
          torqueText(b.code, 'code', 16, { required: true, min: 4, singleLine: true }) ?? ''
        ).toUpperCase();
        if (!/^[A-Z][0-9A-F]{3,7}$/.test(code))
          throw new TorqueShedValidationError(
            'code is not a supported trouble-code format',
            'TORQUESHED_CODE_INVALID',
            'code',
          );
        const row = first(
          await db.execute(
            sql`INSERT INTO torqueshed_diagnostic_trouble_codes (tenant_id,diagnostic_session_id,code,description,code_status,freeze_frame,observed_at,created_by_user_id) VALUES (${tenant(request)},${sessionId},${code},${torqueText(b.description, 'description', 2000)},${torqueEnum(b.codeStatus, 'codeStatus', ['active', 'pending', 'history', 'cleared'] as const, 'active')},${jsonObject(b.freezeFrame, 'freezeFrame')},${torqueDate(b.observedAt, 'observedAt') ?? new Date()},${user(request)}) RETURNING *`,
          ),
        )!;
        await audit(db, request, 'trouble_code_created', 'diagnostic_trouble_code', row.id, {
          sessionId,
          code,
        });
        return reply.code(201).send(row);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.post(
    '/v1/modules/torqueshed/diagnostics/:id/entries',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const sessionId = torqueId((request.params as any).id, 'id', true)!;
        if (!(await diagnosticRow(request, sessionId, true)))
          return notFound(reply, 'diagnostic session');
        const valueText = torqueText(b.valueText ?? b.value, 'valueText', 10000);
        const valueNumeric = torqueNumber(b.valueNumeric, 'valueNumeric', -1e15, 1e15);
        if (valueText === null && valueNumeric === null)
          throw new TorqueShedValidationError(
            'valueText or valueNumeric is required',
            'TORQUESHED_ENTRY_VALUE_REQUIRED',
          );
        const key = idempotencyKey(request);
        const existing = key
          ? first(
              await db.execute(
                sql`SELECT * FROM torqueshed_diagnostic_entries WHERE tenant_id=${tenant(request)} AND created_by_user_id=${user(request)} AND idempotency_key=${key} LIMIT 1`,
              ),
            )
          : null;
        if (existing) return reply.code(200).send(existing);
        const kind = torqueEnum(b.kind, 'kind', TORQUESHED_DIAGNOSTIC_ENTRY_KINDS);
        const row = first(
          await db.execute(
            sql`INSERT INTO torqueshed_diagnostic_entries (tenant_id,diagnostic_session_id,kind,title,value_text,value_numeric,unit,reference_min,reference_max,outcome,metadata,observed_at,idempotency_key,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${sessionId},${kind},${torqueText(b.title, 'title', 180, { required: true, min: 1, singleLine: true })},${valueText},${valueNumeric},${torqueText(b.unit, 'unit', 40, { singleLine: true })},${torqueNumber(b.referenceMin, 'referenceMin', -1e15, 1e15)},${torqueNumber(b.referenceMax, 'referenceMax', -1e15, 1e15)},${torqueText(b.outcome, 'outcome', 5000)},${jsonObject(b.metadata, 'metadata')},${torqueDate(b.observedAt, 'observedAt') ?? new Date()},${key},${user(request)},${user(request)}) RETURNING *`,
          ),
        )!;
        await audit(db, request, 'diagnostic_entry_created', 'diagnostic_entry', row.id, {
          sessionId,
          kind,
        });
        return reply.code(201).send(row);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.patch(
    '/v1/modules/torqueshed/diagnostic-entries/:id',
    { preHandler: writeGuards },
    async (request, reply) => updateDiagnosticEntry(request, reply),
  );
  app.delete(
    '/v1/modules/torqueshed/diagnostic-entries/:id',
    { preHandler: writeGuards },
    async (request, reply) =>
      archiveDiagnosticChild(request, reply, 'torqueshed_diagnostic_entries', 'diagnostic_entry'),
  );
  app.delete(
    '/v1/modules/torqueshed/trouble-codes/:id',
    { preHandler: writeGuards },
    async (request, reply) =>
      archiveDiagnosticChild(
        request,
        reply,
        'torqueshed_diagnostic_trouble_codes',
        'diagnostic_trouble_code',
      ),
  );

  // Compatibility aliases retain the standalone noun without mounting any
  // standalone authority. New clients should prefer /diagnostics.
  app.get(
    '/v1/modules/torqueshed/diagnostic-sessions',
    { preHandler: readGuards },
    async (request) => ({
      sessions: rows(
        await db.execute(
          sql`SELECT * FROM torqueshed_diagnostic_sessions WHERE tenant_id=${tenant(request)} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)} OR visibility='tenant') ORDER BY updated_at DESC LIMIT 100`,
        ),
      ),
    }),
  );
  app.post(
    '/v1/modules/torqueshed/diagnostic-sessions',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const vehicleId = torqueId(b.vehicleId, 'vehicleId', true)!;
        if (!(await vehicleRow(request, vehicleId, true))) return notFound(reply, 'vehicle');
        const row = first(
          await db.execute(
            sql`INSERT INTO torqueshed_diagnostic_sessions (tenant_id,owner_user_id,vehicle_id,title,customer_concern,symptoms,conditions,status,visibility,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${user(request)},${vehicleId},${torqueText(b.title ?? 'Diagnostic session', 'title', 180, { required: true, min: 2, singleLine: true })},${torqueText(b.customerConcern ?? 'Diagnostic concern', 'customerConcern', 10000, { required: true, min: 2 })},${torqueText(b.symptoms, 'symptoms', 10000)},${jsonObject(b.conditions, 'conditions')},'open','private',${user(request)},${user(request)}) RETURNING *`,
          ),
        )!;
        await audit(db, request, 'diagnostic_created', 'diagnostic_session', row.id, {
          vehicleId,
          compatibilityAlias: true,
        });
        return reply.code(201).send(row);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.post(
    '/v1/modules/torqueshed/diagnostic-sessions/:id/trouble-codes',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const sessionId = torqueId((request.params as any).id, 'id', true)!;
        if (!(await diagnosticRow(request, sessionId, true)))
          return notFound(reply, 'diagnostic session');
        const code = (
          torqueText(b.code, 'code', 16, { required: true, min: 4, singleLine: true }) ?? ''
        ).toUpperCase();
        if (!/^[A-Z][0-9A-F]{3,7}$/.test(code))
          throw new TorqueShedValidationError(
            'code is not a supported trouble-code format',
            'TORQUESHED_CODE_INVALID',
            'code',
          );
        const row = first(
          await db.execute(
            sql`INSERT INTO torqueshed_diagnostic_trouble_codes (tenant_id,diagnostic_session_id,code,description,code_status,freeze_frame,observed_at,created_by_user_id) VALUES (${tenant(request)},${sessionId},${code},${torqueText(b.description, 'description', 2000)},'active',${jsonObject(b.freezeFrame, 'freezeFrame')},NOW(),${user(request)}) RETURNING *`,
          ),
        )!;
        await audit(db, request, 'trouble_code_created', 'diagnostic_trouble_code', row.id, {
          sessionId,
          code,
          compatibilityAlias: true,
        });
        return reply.code(201).send(row);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.post(
    '/v1/modules/torqueshed/diagnostic-sessions/:id/measurements',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const sessionId = torqueId((request.params as any).id, 'id', true)!;
        if (!(await diagnosticRow(request, sessionId, true)))
          return notFound(reply, 'diagnostic session');
        const valueNumeric = torqueNumber(b.value, 'value', -1e15, 1e15);
        if (valueNumeric === null)
          throw new TorqueShedValidationError(
            'value is required',
            'TORQUESHED_ENTRY_VALUE_REQUIRED',
            'value',
          );
        const row = first(
          await db.execute(
            sql`INSERT INTO torqueshed_diagnostic_entries (tenant_id,diagnostic_session_id,kind,title,value_numeric,unit,reference_min,reference_max,outcome,metadata,observed_at,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${sessionId},'measurement',${torqueText(b.name ?? b.title, 'name', 180, { required: true, min: 1, singleLine: true })},${valueNumeric},${torqueText(b.unit, 'unit', 40, { singleLine: true })},${torqueNumber(b.referenceMin, 'referenceMin', -1e15, 1e15)},${torqueNumber(b.referenceMax, 'referenceMax', -1e15, 1e15)},${torqueText(b.outcome, 'outcome', 5000)},'{}'::jsonb,NOW(),${user(request)},${user(request)}) RETURNING *`,
          ),
        )!;
        await audit(db, request, 'diagnostic_entry_created', 'diagnostic_entry', row.id, {
          sessionId,
          kind: 'measurement',
          compatibilityAlias: true,
        });
        return reply.code(201).send(row);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );

  app.get(
    '/v1/modules/torqueshed/diagnostic-templates',
    { preHandler: readGuards },
    async (request) => ({
      templates: rows(
        await db.execute(
          sql`SELECT * FROM torqueshed_diagnostic_templates WHERE tenant_id=${tenant(request)} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)} OR visibility='tenant') ORDER BY updated_at DESC`,
        ),
      ),
    }),
  );
  app.post(
    '/v1/modules/torqueshed/diagnostic-templates',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const b = objectBody(request);
        const testPlan = JSON.stringify(jsonArray(b.testPlan, 'testPlan', 100));
        const row = first(
          await db.execute(
            sql`INSERT INTO torqueshed_diagnostic_templates (tenant_id,owner_user_id,name,description,concern_pattern,test_plan,visibility,created_by_user_id,updated_by_user_id) VALUES (${tenant(request)},${user(request)},${torqueText(b.name, 'name', 180, { required: true, min: 2, singleLine: true })},${torqueText(b.description, 'description', 5000)},${torqueText(b.concernPattern, 'concernPattern', 5000)},${testPlan}::jsonb,${torqueEnum(b.visibility, 'visibility', ['private', 'tenant'] as const, 'private')},${user(request)},${user(request)}) RETURNING *`,
          ),
        )!;
        await audit(db, request, 'diagnostic_template_created', 'diagnostic_template', row.id);
        return reply.code(201).send(row);
      } catch (error) {
        if (!handleError(reply, error)) throw error;
      }
    },
  );
  app.patch(
    '/v1/modules/torqueshed/diagnostic-templates/:id',
    { preHandler: writeGuards },
    async (request, reply) => updateTemplate(request, reply),
  );
  app.delete(
    '/v1/modules/torqueshed/diagnostic-templates/:id',
    { preHandler: writeGuards },
    async (request, reply) =>
      archiveOwned(request, reply, 'torqueshed_diagnostic_templates', 'diagnostic_template'),
  );

  app.get(
    '/v1/modules/torqueshed/:objectType/:id/attachments',
    { preHandler: readGuards },
    async (request, reply) => attachmentRoute(request, reply, 'list'),
  );
  app.post(
    '/v1/modules/torqueshed/:objectType/:id/attachments',
    { preHandler: writeGuards },
    async (request, reply) => attachmentRoute(request, reply, 'create'),
  );
}

const ALLOWED_ARCHIVE_TABLES = new Set([
  'torqueshed_service_records',
  'torqueshed_service_reminders',
]);
async function archiveChild(
  request: FastifyRequest,
  reply: FastifyReply,
  table: string,
  entity: string,
) {
  try {
    if (!ALLOWED_ARCHIVE_TABLES.has(table)) throw new Error('Unsupported archive table');
    const b = objectBody(request);
    const id = torqueId((request.params as any).id, 'id', true)!;
    const version = expectedVersion(b);
    const query =
      table === 'torqueshed_service_records'
        ? sql`UPDATE torqueshed_service_records r SET archived_at=NOW(),updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1 FROM torqueshed_vehicles v WHERE r.tenant_id=${tenant(request)} AND r.id=${id} AND r.version=${version} AND r.archived_at IS NULL AND v.tenant_id=r.tenant_id AND v.id=r.vehicle_id AND (${canManage(request)} OR v.owner_user_id=${user(request)}) RETURNING r.id,r.version,r.archived_at`
        : sql`UPDATE torqueshed_service_reminders r SET archived_at=NOW(),updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1 FROM torqueshed_vehicles v WHERE r.tenant_id=${tenant(request)} AND r.id=${id} AND r.version=${version} AND r.archived_at IS NULL AND v.tenant_id=r.tenant_id AND v.id=r.vehicle_id AND (${canManage(request)} OR v.owner_user_id=${user(request)}) RETURNING r.id,r.version,r.archived_at`;
    const archived = first(await db.execute(query));
    if (!archived)
      return reply
        .code(409)
        .send({ error: `${entity} not found or changed`, code: 'TORQUESHED_VERSION_CONFLICT' });
    await audit(db, request, `${entity}_archived`, entity, id);
    return archived;
  } catch (error) {
    if (!handleError(reply, error)) throw error;
  }
}

const ALLOWED_OWNED_TABLES = new Set([
  'torqueshed_vendors',
  'torqueshed_builds',
  'torqueshed_diagnostic_sessions',
  'torqueshed_diagnostic_templates',
]);
async function archiveOwned(
  request: FastifyRequest,
  reply: FastifyReply,
  table: string,
  entity: string,
) {
  try {
    if (!ALLOWED_OWNED_TABLES.has(table)) throw new Error('Unsupported owned table');
    const b = objectBody(request);
    const id = torqueId((request.params as any).id, 'id', true)!;
    const version = expectedVersion(b);
    const queries: Record<string, ReturnType<typeof sql>> = {
      torqueshed_vendors: sql`UPDATE torqueshed_vendors SET archived_at=NOW(),updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1 WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${version} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)}) RETURNING id,version,archived_at`,
      torqueshed_builds: sql`UPDATE torqueshed_builds SET archived_at=NOW(),updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1 WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${version} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)}) RETURNING id,version,archived_at`,
      torqueshed_diagnostic_sessions: sql`UPDATE torqueshed_diagnostic_sessions SET archived_at=NOW(),status='archived',updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1 WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${version} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)}) RETURNING id,version,archived_at`,
      torqueshed_diagnostic_templates: sql`UPDATE torqueshed_diagnostic_templates SET archived_at=NOW(),updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1 WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${version} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)}) RETURNING id,version,archived_at`,
    };
    const archived = first(await db.execute(queries[table]!));
    if (!archived)
      return reply
        .code(409)
        .send({ error: `${entity} not found or changed`, code: 'TORQUESHED_VERSION_CONFLICT' });
    await audit(db, request, `${entity}_archived`, entity, id);
    return archived;
  } catch (error) {
    if (!handleError(reply, error)) throw error;
  }
}

async function updateBuildChild(
  request: FastifyRequest,
  reply: FastifyReply,
  table: 'torqueshed_build_tasks' | 'torqueshed_build_stages',
  entity: string,
) {
  try {
    const b = objectBody(request);
    const id = torqueId((request.params as any).id, 'id', true)!;
    const version = expectedVersion(b);
    const title = torqueText(b.title, 'title', 180, {
      required: 'title' in b,
      min: 1,
      singleLine: true,
    });
    const status = 'status' in b ? torqueEnum(b.status, 'status', TORQUESHED_TASK_STATUSES) : null;
    const query =
      table === 'torqueshed_build_tasks'
        ? sql`UPDATE torqueshed_build_tasks c SET title=COALESCE(${title},c.title),notes=CASE WHEN ${'notes' in b} THEN ${torqueText(b.notes, 'notes', 5000)} ELSE c.notes END,status=COALESCE(${status},c.status),due_at=CASE WHEN ${'dueAt' in b} THEN ${torqueDate(b.dueAt, 'dueAt')} ELSE c.due_at END,completed_at=CASE WHEN ${status === 'completed'} THEN NOW() WHEN ${status !== null} THEN NULL ELSE c.completed_at END,version=c.version+1,updated_by_user_id=${user(request)},updated_at=NOW() FROM torqueshed_builds p WHERE c.tenant_id=${tenant(request)} AND c.id=${id} AND c.version=${version} AND c.archived_at IS NULL AND p.tenant_id=c.tenant_id AND p.id=c.build_id AND (${canManage(request)} OR p.owner_user_id=${user(request)}) RETURNING c.*`
        : sql`UPDATE torqueshed_build_stages c SET title=COALESCE(${title},c.title),description=CASE WHEN ${'description' in b} THEN ${torqueText(b.description, 'description', 5000)} ELSE c.description END,status=COALESCE(${status},c.status),version=c.version+1,updated_by_user_id=${user(request)},updated_at=NOW() FROM torqueshed_builds p WHERE c.tenant_id=${tenant(request)} AND c.id=${id} AND c.version=${version} AND c.archived_at IS NULL AND p.tenant_id=c.tenant_id AND p.id=c.build_id AND (${canManage(request)} OR p.owner_user_id=${user(request)}) RETURNING c.*`;
    const updated = first(await db.execute(query));
    if (!updated)
      return reply
        .code(409)
        .send({ error: `${entity} not found or changed`, code: 'TORQUESHED_VERSION_CONFLICT' });
    await audit(db, request, `${entity}_updated`, entity, id, { status });
    return updated;
  } catch (error) {
    if (!handleError(reply, error)) throw error;
  }
}

async function updateReminder(request: FastifyRequest, reply: FastifyReply) {
  try {
    const b = objectBody(request);
    const id = torqueId((request.params as any).id, 'id', true)!;
    const version = expectedVersion(b);
    const result = await db.execute(
      sql`UPDATE torqueshed_service_reminders r SET title=CASE WHEN ${'title' in b} THEN ${torqueText(b.title, 'title', 180, { required: 'title' in b, min: 2, singleLine: true })} ELSE r.title END,notes=CASE WHEN ${'notes' in b} THEN ${torqueText(b.notes, 'notes', 5000)} ELSE r.notes END,due_at=CASE WHEN ${'dueAt' in b} THEN ${torqueDate(b.dueAt, 'dueAt')} ELSE r.due_at END,due_mileage=CASE WHEN ${'dueMileage' in b} THEN ${torqueInteger(b.dueMileage, 'dueMileage', 0, 10_000_000)} ELSE r.due_mileage END,status=CASE WHEN ${'status' in b} THEN ${torqueEnum(b.status, 'status', TORQUESHED_REMINDER_STATUSES, 'open')} ELSE r.status END,version=r.version+1,updated_by_user_id=${user(request)},updated_at=NOW() FROM torqueshed_vehicles v WHERE r.tenant_id=${tenant(request)} AND r.id=${id} AND r.version=${version} AND r.archived_at IS NULL AND v.tenant_id=r.tenant_id AND v.id=r.vehicle_id AND (${canManage(request)} OR v.owner_user_id=${user(request)}) RETURNING r.*`,
    );
    const updated = first(result);
    if (!updated)
      return reply
        .code(409)
        .send({ error: 'Reminder not found or changed', code: 'TORQUESHED_VERSION_CONFLICT' });
    await audit(db, request, 'reminder_updated', 'reminder', id);
    return updated;
  } catch (error) {
    if (!handleError(reply, error)) throw error;
  }
}

async function updateDiagnosticEntry(request: FastifyRequest, reply: FastifyReply) {
  try {
    const b = objectBody(request);
    const id = torqueId((request.params as any).id, 'id', true)!;
    const version = expectedVersion(b);
    const result = await db.execute(
      sql`UPDATE torqueshed_diagnostic_entries e SET title=CASE WHEN ${'title' in b} THEN ${torqueText(b.title, 'title', 180, { required: 'title' in b, min: 1, singleLine: true })} ELSE e.title END,value_text=CASE WHEN ${'valueText' in b} THEN ${torqueText(b.valueText, 'valueText', 10000)} ELSE e.value_text END,value_numeric=CASE WHEN ${'valueNumeric' in b} THEN ${torqueNumber(b.valueNumeric, 'valueNumeric', -1e15, 1e15)} ELSE e.value_numeric END,unit=CASE WHEN ${'unit' in b} THEN ${torqueText(b.unit, 'unit', 40, { singleLine: true })} ELSE e.unit END,reference_min=CASE WHEN ${'referenceMin' in b} THEN ${torqueNumber(b.referenceMin, 'referenceMin', -1e15, 1e15)} ELSE e.reference_min END,reference_max=CASE WHEN ${'referenceMax' in b} THEN ${torqueNumber(b.referenceMax, 'referenceMax', -1e15, 1e15)} ELSE e.reference_max END,outcome=CASE WHEN ${'outcome' in b} THEN ${torqueText(b.outcome, 'outcome', 5000)} ELSE e.outcome END,version=e.version+1,updated_by_user_id=${user(request)},updated_at=NOW() FROM torqueshed_diagnostic_sessions d WHERE e.tenant_id=${tenant(request)} AND e.id=${id} AND e.version=${version} AND e.archived_at IS NULL AND d.tenant_id=e.tenant_id AND d.id=e.diagnostic_session_id AND (${canManage(request)} OR d.owner_user_id=${user(request)}) RETURNING e.*`,
    );
    const updated = first(result);
    if (!updated)
      return reply.code(409).send({
        error: 'Diagnostic entry not found or changed',
        code: 'TORQUESHED_VERSION_CONFLICT',
      });
    await audit(db, request, 'diagnostic_entry_updated', 'diagnostic_entry', id);
    return updated;
  } catch (error) {
    if (!handleError(reply, error)) throw error;
  }
}

async function archiveDiagnosticChild(
  request: FastifyRequest,
  reply: FastifyReply,
  table: 'torqueshed_diagnostic_entries' | 'torqueshed_diagnostic_trouble_codes',
  entity: string,
) {
  try {
    const b = objectBody(request);
    const id = torqueId((request.params as any).id, 'id', true)!;
    const version = expectedVersion(b);
    const query =
      table === 'torqueshed_diagnostic_entries'
        ? sql`UPDATE torqueshed_diagnostic_entries e SET archived_at=NOW(),updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1 FROM torqueshed_diagnostic_sessions d WHERE e.tenant_id=${tenant(request)} AND e.id=${id} AND e.version=${version} AND e.archived_at IS NULL AND d.tenant_id=e.tenant_id AND d.id=e.diagnostic_session_id AND (${canManage(request)} OR d.owner_user_id=${user(request)}) RETURNING e.id,e.version,e.archived_at`
        : sql`UPDATE torqueshed_diagnostic_trouble_codes c SET archived_at=NOW(),version=version+1 FROM torqueshed_diagnostic_sessions d WHERE c.tenant_id=${tenant(request)} AND c.id=${id} AND c.version=${version} AND c.archived_at IS NULL AND d.tenant_id=c.tenant_id AND d.id=c.diagnostic_session_id AND (${canManage(request)} OR d.owner_user_id=${user(request)}) RETURNING c.id,c.version,c.archived_at`;
    const archived = first(await db.execute(query));
    if (!archived)
      return reply
        .code(409)
        .send({ error: `${entity} not found or changed`, code: 'TORQUESHED_VERSION_CONFLICT' });
    await audit(db, request, `${entity}_archived`, entity, id);
    return archived;
  } catch (error) {
    if (!handleError(reply, error)) throw error;
  }
}

async function updateTemplate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const b = objectBody(request);
    const id = torqueId((request.params as any).id, 'id', true)!;
    const version = expectedVersion(b);
    const testPlan =
      'testPlan' in b ? JSON.stringify(jsonArray(b.testPlan, 'testPlan', 100)) : undefined;
    const result = await db.execute(
      sql`UPDATE torqueshed_diagnostic_templates SET name=CASE WHEN ${'name' in b} THEN ${torqueText(b.name, 'name', 180, { required: 'name' in b, min: 2, singleLine: true })} ELSE name END,description=CASE WHEN ${'description' in b} THEN ${torqueText(b.description, 'description', 5000)} ELSE description END,concern_pattern=CASE WHEN ${'concernPattern' in b} THEN ${torqueText(b.concernPattern, 'concernPattern', 5000)} ELSE concern_pattern END,test_plan=CASE WHEN ${testPlan !== undefined} THEN ${testPlan ?? '[]'}::jsonb ELSE test_plan END,visibility=CASE WHEN ${'visibility' in b} THEN ${torqueEnum(b.visibility, 'visibility', ['private', 'tenant'] as const, 'private')} ELSE visibility END,version=version+1,updated_by_user_id=${user(request)},updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${version} AND archived_at IS NULL AND (${canManage(request)} OR owner_user_id=${user(request)}) RETURNING *`,
    );
    const updated = first(result);
    if (!updated)
      return reply.code(409).send({
        error: 'Diagnostic template not found or changed',
        code: 'TORQUESHED_VERSION_CONFLICT',
      });
    await audit(db, request, 'diagnostic_template_updated', 'diagnostic_template', id);
    return updated;
  } catch (error) {
    if (!handleError(reply, error)) throw error;
  }
}

async function attachmentRoute(
  request: FastifyRequest,
  reply: FastifyReply,
  mode: 'list' | 'create',
) {
  try {
    const params = request.params as { objectType: string; id: string };
    const id = torqueId(params.id, 'id', true)!;
    const map: Record<
      string,
      { storage: string; check: (write: boolean) => Promise<Record<string, any> | null> }
    > = {
      vehicles: { storage: 'torqueshed_vehicle', check: (write) => vehicleRow(request, id, write) },
      builds: { storage: 'torqueshed_build', check: (write) => buildRow(request, id, write) },
      diagnostics: {
        storage: 'torqueshed_diagnostic',
        check: (write) => diagnosticRow(request, id, write),
      },
    };
    const target = map[params.objectType];
    if (!target)
      throw new TorqueShedValidationError(
        'Unsupported attachment object type',
        'TORQUESHED_ATTACHMENT_TARGET_INVALID',
        'objectType',
      );
    if (!(await target.check(mode === 'create')))
      return notFound(reply, params.objectType.slice(0, -1));
    const mod = await moduleId();
    if (mode === 'list')
      return {
        attachments: (
          await listAttachments({
            tenantId: tenant(request),
            moduleId: mod,
            objectType: target.storage,
            objectId: id,
            limit: 100,
          })
        ).map(camelRow),
      };
    const b = objectBody(request);
    const encoded = torqueText(b.contentBase64, 'contentBase64', 35_000_000, {
      required: true,
      min: 4,
    })!;
    const content = Buffer.from(encoded, 'base64');
    const attachment = await createAttachment({
      tenantId: tenant(request),
      moduleId: mod,
      objectType: target.storage,
      objectId: id,
      originalName: torqueText(b.originalName, 'originalName', 240, {
        required: true,
        min: 1,
        singleLine: true,
      })!,
      declaredMimeType: torqueText(b.declaredMimeType, 'declaredMimeType', 120, {
        singleLine: true,
      }),
      content,
      createdByUserId: user(request),
      correlationId: request.id,
    });
    await audit(db, request, 'attachment_created', 'attachment', String(attachment.id), {
      objectType: target.storage,
      objectId: id,
    });
    return reply.code(201).send(camelRow(attachment));
  } catch (error) {
    const code = (error as any)?.code;
    if (code && String(code).startsWith('ATTACHMENT_'))
      return reply.code(400).send({ error: (error as Error).message, code });
    if (!handleError(reply, error)) throw error;
  }
}

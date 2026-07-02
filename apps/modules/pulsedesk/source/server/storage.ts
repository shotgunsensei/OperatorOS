import { eq, and, desc, sql, inArray, count, ilike, or, gte, lte, type SQL } from "drizzle-orm";
import { db } from "./db";
import { DEFAULT_DEPARTMENTS } from "@shared/schema";
import {
  users,
  orgs,
  memberships,
  inviteCodes,
  departments,
  tickets,
  ticketEvents,
  assets,
  supplyRequests,
  facilityRequests,
  vendors,
  orgAuthConfig,
  orgRoleMappings,
  authAuditLog,
  operatorOsEntitlementSnapshots,
  notifications,
  onboardingItems,
  inboundEmailLog,
  emailSettings,
  mailConnectors,
  type User,
  type InsertUser,
  type Org,
  type InsertOrg,
  type Membership,
  type Department,
  type InsertDepartment,
  type Ticket,
  type InsertTicket,
  type TicketEvent,
  type Asset,
  type InsertAsset,
  type SupplyRequest,
  type InsertSupplyRequest,
  type FacilityRequest,
  type InsertFacilityRequest,
  type Vendor,
  type InsertVendor,
  type InviteCode,
  type Notification,
  type OrgAuthConfig,
  type InsertOrgAuthConfig,
  type OrgRoleMapping,
  type AuthAuditLogEntry,
  type OperatorOsEntitlementSnapshot,
  type OnboardingItem,
  type InboundEmailLog,
} from "@shared/schema";
import { randomBytes } from "crypto";
import type { OperatorOsEntitlementClaims, OperatorOsRole } from "./auth/operatoros-sso";
import { isMasterAdminEmail, normalizeEmail } from "./config/masterAdmin";
import { normalizeRole, type CanonicalRole } from "@shared/roles";
import { computeTicketSla } from "./services/ticketSla";

type PulseDeskMembershipRole = CanonicalRole;

export interface UpsertOperatorOsEntitlementSnapshotInput {
  operatorOsUserId: string;
  operatorOsTenantId: string;
  localUserId?: string | null;
  localOrgId?: string | null;
  moduleSlug: string;
  enabled: boolean;
  accessLevel?: string | null;
  moduleRole?: string | null;
  tenantRole?: string | null;
  tenantRoleAlias?: string | null;
  subscriptionStatus?: string | null;
  features?: Record<string, unknown> | null;
  rawSnapshot?: unknown;
  computedAt: Date;
  revokedAt?: Date | null;
}

function normalizeRoleValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function roleFromEntitlement(entitlement: OperatorOsEntitlementClaims | null | undefined): PulseDeskMembershipRole | null {
  const tenantRole = normalizeRoleValue(entitlement?.tenant_role);
  const tenantRoleAlias = normalizeRoleValue(entitlement?.tenant_role_alias);
  const moduleRole = normalizeRoleValue(entitlement?.target_module_role);
  const accessLevel = normalizeRoleValue(entitlement?.target_module_access_level);

  if (tenantRole === "owner" || tenantRoleAlias === "owner") return "owner";
  if (
    tenantRole === "admin" ||
    tenantRoleAlias === "tenant_admin" ||
    moduleRole === "module_admin" ||
    accessLevel === "manager"
  ) {
    return "admin";
  }

  return null;
}

function mapOperatorOsRoleToPulseDeskRole(input: {
  email: string;
  role: OperatorOsRole;
  entitlement?: OperatorOsEntitlementClaims | null;
}): PulseDeskMembershipRole {
  if (input.role === "super_admin" || isMasterAdminEmail(input.email)) {
    return "owner";
  }
  if (input.role === "admin") {
    return "admin";
  }
  return roleFromEntitlement(input.entitlement) ?? "staff";
}

function withTicketComputedFields<T extends Ticket>(ticket: T) {
  return {
    ...ticket,
    ...computeTicketSla(ticket),
  };
}

function dateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isStaleVendorWait(ticket: Ticket, now: Date): boolean {
  if (ticket.status !== "waiting_vendor") return false;
  const expected = dateOrNull(ticket.vendorExpectedFollowUpAt);
  if (expected && expected.getTime() < now.getTime()) return true;
  const lastVendorTouch = dateOrNull(ticket.vendorContactedAt) ?? dateOrNull(ticket.updatedAt) ?? dateOrNull(ticket.createdAt);
  if (!lastVendorTouch) return false;
  return now.getTime() - lastVendorTouch.getTime() > 48 * 60 * 60 * 1000;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  deleteUser(userId: string): Promise<void>;

  createOrg(org: InsertOrg): Promise<Org>;
  getOrg(id: string): Promise<Org | undefined>;
  updateOrg(id: string, data: Partial<Org>): Promise<Org | undefined>;
  getUserOrgs(userId: string): Promise<Org[]>;
  getAllOrgs(): Promise<Org[]>;
  deleteOrg(id: string): Promise<void>;

  createMembership(orgId: string, userId: string, role: string): Promise<Membership>;
  getMembership(orgId: string, userId: string): Promise<Membership | undefined>;
  getOrgMemberships(orgId: string): Promise<Membership[]>;
  deleteMembership(orgId: string, userId: string): Promise<void>;
  updateMembershipRole(orgId: string, userId: string, role: string): Promise<void>;

  createInviteCode(orgId: string, role: string, createdBy: string): Promise<InviteCode>;
  getInviteCodeByCode(code: string): Promise<InviteCode | undefined>;
  getOrgInviteCodes(orgId: string): Promise<InviteCode[]>;

  getDepartments(orgId: string): Promise<Department[]>;
  getDepartment(orgId: string, id: string): Promise<Department | undefined>;
  createDepartment(orgId: string, data: InsertDepartment): Promise<Department>;
  updateDepartment(orgId: string, id: string, data: Partial<Department>): Promise<Department | undefined>;
  deleteDepartment(orgId: string, id: string): Promise<boolean>;

  getTickets(orgId: string): Promise<(Ticket & { departmentName?: string; reportedByName?: string; assignedToName?: string })[]>;
  getTicket(orgId: string, id: string): Promise<(Ticket & { departmentName?: string; reportedByName?: string; assignedToName?: string }) | undefined>;
  createTicket(orgId: string, data: InsertTicket, reportedBy: string): Promise<Ticket>;
  updateTicket(orgId: string, id: string, data: Partial<Ticket>): Promise<Ticket | undefined>;
  deleteTicket(orgId: string, id: string): Promise<boolean>;
  getNextTicketNumber(orgId: string): Promise<string>;

  getTicketEvents(orgId: string, ticketId: string): Promise<TicketEvent[]>;
  createTicketEvent(orgId: string, ticketId: string, type: string, content: string, createdBy: string | null): Promise<TicketEvent>;

  getAssets(orgId: string): Promise<(Asset & { departmentName?: string })[]>;
  getAsset(orgId: string, id: string): Promise<(Asset & { departmentName?: string }) | undefined>;
  createAsset(orgId: string, data: InsertAsset): Promise<Asset>;
  updateAsset(orgId: string, id: string, data: Partial<Asset>): Promise<Asset | undefined>;
  deleteAsset(orgId: string, id: string): Promise<boolean>;

  getSupplyRequests(orgId: string): Promise<(SupplyRequest & { departmentName?: string; requestedByName?: string })[]>;
  getSupplyRequest(orgId: string, id: string): Promise<(SupplyRequest & { departmentName?: string; requestedByName?: string }) | undefined>;
  createSupplyRequest(orgId: string, data: InsertSupplyRequest, requestedBy: string): Promise<SupplyRequest>;
  updateSupplyRequest(orgId: string, id: string, data: Partial<SupplyRequest>): Promise<SupplyRequest | undefined>;
  deleteSupplyRequest(orgId: string, id: string): Promise<boolean>;

  getFacilityRequests(orgId: string): Promise<(FacilityRequest & { requestedByName?: string; assignedToName?: string })[]>;
  getFacilityRequest(orgId: string, id: string): Promise<(FacilityRequest & { requestedByName?: string; assignedToName?: string }) | undefined>;
  createFacilityRequest(orgId: string, data: InsertFacilityRequest, requestedBy: string): Promise<FacilityRequest>;
  updateFacilityRequest(orgId: string, id: string, data: Partial<FacilityRequest>): Promise<FacilityRequest | undefined>;
  deleteFacilityRequest(orgId: string, id: string): Promise<boolean>;

  getVendors(orgId: string): Promise<Vendor[]>;
  getVendor(orgId: string, id: string): Promise<Vendor | undefined>;
  createVendor(orgId: string, data: InsertVendor): Promise<Vendor>;
  updateVendor(orgId: string, id: string, data: Partial<Vendor>): Promise<Vendor | undefined>;
  deleteVendor(orgId: string, id: string): Promise<boolean>;

  createNotification(orgId: string, userId: string, type: string, title: string, message: string, ticketId?: string | null): Promise<Notification>;
  getUserNotifications(orgId: string, userId: string, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(orgId: string, userId: string): Promise<number>;
  markNotificationRead(orgId: string, userId: string, id: string): Promise<void>;
  markAllNotificationsRead(orgId: string, userId: string): Promise<void>;
  notifyOrgMembers(orgId: string, excludeUserId: string, type: string, title: string, message: string, ticketId?: string | null, targetUserId?: string | null): Promise<void>;

  getDashboardStats(orgId: string): Promise<any>;
  getOrgCounts(orgId: string): Promise<{ tickets: number; departments: number; assets: number; members: number }>;

  getOrgAuthConfig(orgId: string): Promise<OrgAuthConfig | undefined>;
  upsertOrgAuthConfig(orgId: string, data: Partial<OrgAuthConfig>): Promise<OrgAuthConfig>;
  getOrgBySlug(slug: string): Promise<Org | undefined>;
  getUserByEntraObjectId(entraObjectId: string, orgId: string): Promise<User | undefined>;

  getUserByOperatorOsId(operatorOsUserId: string): Promise<User | undefined>;
  getOrgByOperatorOsId(operatorOsOrgId: string): Promise<Org | undefined>;
  provisionOperatorOsUser(input: {
    sub: string;
    email: string;
    name?: string;
    role: OperatorOsRole;
    planSlug: string | null;
    organizationId: string | null;
    entitlement?: OperatorOsEntitlementClaims | null;
  }): Promise<{ user: User; org: Org; userCreated: boolean; orgCreated: boolean }>;
  upsertOperatorOsEntitlementSnapshot(input: UpsertOperatorOsEntitlementSnapshotInput): Promise<{
    snapshot: OperatorOsEntitlementSnapshot;
    staleIgnored: boolean;
  }>;
  getOperatorOsEntitlementSnapshotById(id: string): Promise<OperatorOsEntitlementSnapshot | undefined>;
  getOperatorOsEntitlementSnapshot(
    operatorOsUserId: string,
    operatorOsTenantId: string,
    moduleSlug: string
  ): Promise<OperatorOsEntitlementSnapshot | undefined>;
  getCurrentOperatorOsEntitlementSnapshot(
    localUserId: string,
    localOrgId: string,
    moduleSlug: string
  ): Promise<OperatorOsEntitlementSnapshot | undefined>;
  getLatestOperatorOsEntitlementSnapshotForOrg(
    localOrgId: string,
    moduleSlug: string
  ): Promise<OperatorOsEntitlementSnapshot | undefined>;
  revokeOperatorOsEntitlementSnapshot(
    operatorOsUserId: string,
    operatorOsTenantId: string,
    moduleSlug: string,
    computedAt?: Date,
    rawSnapshot?: unknown
  ): Promise<{ snapshot: OperatorOsEntitlementSnapshot; staleIgnored: boolean }>;

  getOrgRoleMappings(orgId: string): Promise<OrgRoleMapping[]>;
  createOrgRoleMapping(orgId: string, entraGroupId: string, pulsedeskRole: string, displayLabel?: string): Promise<OrgRoleMapping>;
  deleteOrgRoleMapping(orgId: string, id: string): Promise<void>;
  deleteAllOrgRoleMappings(orgId: string): Promise<void>;

  getOnboardingItems(orgId: string): Promise<OnboardingItem[]>;
  createOnboardingItem(orgId: string, data: Partial<OnboardingItem>): Promise<OnboardingItem>;
  updateOnboardingItem(orgId: string, id: string, data: Partial<OnboardingItem>): Promise<OnboardingItem | undefined>;
  seedOnboardingItems(orgId: string): Promise<void>;

  purgeAuthAuditLogsOlderThan(days: number): Promise<number>;
  getFailedInboundEmails(limit?: number): Promise<InboundEmailLog[]>;
  createAuthAuditLog(entry: {
    orgId?: string | null;
    userId?: string | null;
    eventType: string;
    authSource?: string | null;
    tenantResolved?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    details?: any;
    success: boolean;
  }): Promise<AuthAuditLogEntry>;
  getAuthAuditLog(orgId: string, limit?: number): Promise<AuthAuditLogEntry[]>;
  getAllAuthAuditLogs(opts: {
    eventTypes?: string[];
    since?: Date;
    until?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    rows: Array<AuthAuditLogEntry & {
      orgName: string | null;
      orgSlug: string | null;
      actorUsername: string | null;
      actorFullName: string | null;
    }>;
    total: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
    return user;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.username));
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(memberships).where(eq(memberships.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  async createOrg(data: InsertOrg): Promise<Org> {
    const [org] = await db.insert(orgs).values(data).returning();
    return org;
  }

  async getOrg(id: string): Promise<Org | undefined> {
    const [org] = await db.select().from(orgs).where(eq(orgs.id, id));
    return org;
  }

  async updateOrg(id: string, data: Partial<Org>): Promise<Org | undefined> {
    const [org] = await db.update(orgs).set(data).where(eq(orgs.id, id)).returning();
    return org;
  }

  async getUserOrgs(userId: string): Promise<Org[]> {
    const mems = await db.select().from(memberships).where(eq(memberships.userId, userId));
    if (mems.length === 0) return [];
    const orgIds = mems.map((m) => m.orgId);
    return db.select().from(orgs).where(inArray(orgs.id, orgIds));
  }

  async getAllOrgs(): Promise<Org[]> {
    return db.select().from(orgs).orderBy(desc(orgs.createdAt));
  }

  async deleteOrg(id: string): Promise<void> {
    await db.delete(onboardingItems).where(eq(onboardingItems.orgId, id));
    await db.delete(notifications).where(eq(notifications.orgId, id));
    await db.delete(authAuditLog).where(eq(authAuditLog.orgId, id));
    await db.delete(orgRoleMappings).where(eq(orgRoleMappings.orgId, id));
    await db.delete(orgAuthConfig).where(eq(orgAuthConfig.orgId, id));
    await db.delete(ticketEvents).where(eq(ticketEvents.orgId, id));
    await db.delete(tickets).where(eq(tickets.orgId, id));
    await db.delete(supplyRequests).where(eq(supplyRequests.orgId, id));
    await db.delete(facilityRequests).where(eq(facilityRequests.orgId, id));
    await db.delete(assets).where(eq(assets.orgId, id));
    await db.delete(vendors).where(eq(vendors.orgId, id));
    await db.delete(departments).where(eq(departments.orgId, id));
    await db.delete(inviteCodes).where(eq(inviteCodes.orgId, id));
    await db.delete(memberships).where(eq(memberships.orgId, id));
    await db.delete(orgs).where(eq(orgs.id, id));
  }

  async createMembership(orgId: string, userId: string, role: string): Promise<Membership> {
    const normalizedRole = normalizeRole(role) ?? "staff";
    const [mem] = await db.insert(memberships).values({ orgId, userId, role: normalizedRole }).returning();
    return mem;
  }

  async getMembership(orgId: string, userId: string): Promise<Membership | undefined> {
    const [mem] = await db.select().from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
    return mem;
  }

  async getOrgMemberships(orgId: string): Promise<Membership[]> {
    return db.select().from(memberships).where(eq(memberships.orgId, orgId));
  }

  async deleteMembership(orgId: string, userId: string): Promise<void> {
    await db.delete(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  }

  async updateMembershipRole(orgId: string, userId: string, role: string): Promise<void> {
    const normalizedRole = normalizeRole(role) ?? "staff";
    await db.update(memberships).set({ role: normalizedRole }).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  }

  async createInviteCode(orgId: string, role: string, createdBy: string): Promise<InviteCode> {
    const code = randomBytes(4).toString("hex").toUpperCase();
    const normalizedRole = normalizeRole(role) ?? "staff";
    const [ic] = await db.insert(inviteCodes).values({ orgId, code, role: normalizedRole, createdBy }).returning();
    return ic;
  }

  async getInviteCodeByCode(code: string): Promise<InviteCode | undefined> {
    const [ic] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code.toUpperCase()));
    return ic;
  }

  async getOrgInviteCodes(orgId: string): Promise<InviteCode[]> {
    return db.select().from(inviteCodes).where(eq(inviteCodes.orgId, orgId)).orderBy(desc(inviteCodes.createdAt));
  }

  async getDepartments(orgId: string): Promise<Department[]> {
    return db.select().from(departments).where(eq(departments.orgId, orgId)).orderBy(departments.name);
  }

  async getDepartment(orgId: string, id: string): Promise<Department | undefined> {
    const [d] = await db.select().from(departments).where(and(eq(departments.orgId, orgId), eq(departments.id, id)));
    return d;
  }

  async createDepartment(orgId: string, data: InsertDepartment): Promise<Department> {
    const [d] = await db.insert(departments).values({ ...data, orgId }).returning();
    return d;
  }

  async updateDepartment(orgId: string, id: string, data: Partial<Department>): Promise<Department | undefined> {
    const [d] = await db.update(departments).set(data).where(and(eq(departments.orgId, orgId), eq(departments.id, id))).returning();
    return d;
  }

  async deleteDepartment(orgId: string, id: string): Promise<boolean> {
    const result = await db.delete(departments).where(and(eq(departments.orgId, orgId), eq(departments.id, id))).returning({ id: departments.id });
    return result.length > 0;
  }

  async getTickets(orgId: string): Promise<(Ticket & { departmentName?: string; reportedByName?: string; assignedToName?: string })[]> {
    const allTickets = await db.select().from(tickets).where(eq(tickets.orgId, orgId)).orderBy(desc(tickets.createdAt));

    const deptIds = [...new Set(allTickets.filter(t => t.departmentId).map(t => t.departmentId!))];
    let deptMap: Record<string, string> = {};
    if (deptIds.length > 0) {
      const depts = await db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, deptIds));
      deptMap = Object.fromEntries(depts.map(d => [d.id, d.name]));
    }

    const userIds = [...new Set([
      ...allTickets.filter(t => t.reportedBy).map(t => t.reportedBy!),
      ...allTickets.filter(t => t.assignedTo).map(t => t.assignedTo!),
    ])];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const usrs = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, userIds));
      userMap = Object.fromEntries(usrs.map(u => [u.id, u.fullName]));
    }

    return allTickets.map(t => withTicketComputedFields({
      ...t,
      departmentName: t.departmentId ? deptMap[t.departmentId] : undefined,
      reportedByName: t.reportedBy ? userMap[t.reportedBy] : undefined,
      assignedToName: t.assignedTo ? userMap[t.assignedTo] : undefined,
    }));
  }

  async getTicket(orgId: string, id: string): Promise<(Ticket & { departmentName?: string; reportedByName?: string; assignedToName?: string }) | undefined> {
    const [t] = await db.select().from(tickets).where(and(eq(tickets.orgId, orgId), eq(tickets.id, id)));
    if (!t) return undefined;

    let departmentName: string | undefined;
    if (t.departmentId) {
      const [d] = await db.select({ name: departments.name }).from(departments).where(eq(departments.id, t.departmentId));
      departmentName = d?.name;
    }

    let reportedByName: string | undefined;
    if (t.reportedBy) {
      const [u] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, t.reportedBy));
      reportedByName = u?.fullName;
    }

    let assignedToName: string | undefined;
    if (t.assignedTo) {
      const [u] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, t.assignedTo));
      assignedToName = u?.fullName;
    }

    return withTicketComputedFields({ ...t, departmentName, reportedByName, assignedToName });
  }

  async getNextTicketNumber(orgId: string): Promise<string> {
    const [result] = await db.select({ cnt: count() }).from(tickets).where(eq(tickets.orgId, orgId));
    const num = (result?.cnt || 0) as number;
    return `PD-${String(num + 1).padStart(5, "0")}`;
  }

  async createTicket(orgId: string, data: InsertTicket, reportedBy: string): Promise<Ticket> {
    const ticketNumber = await this.getNextTicketNumber(orgId);
    const [t] = await db.insert(tickets).values({
      ...data,
      orgId,
      ticketNumber,
      reportedBy,
      dueDate: data.dueDate ? new Date(data.dueDate as any) : null,
      vendorContactedAt: data.vendorContactedAt ? new Date(data.vendorContactedAt as any) : null,
      vendorExpectedFollowUpAt: data.vendorExpectedFollowUpAt ? new Date(data.vendorExpectedFollowUpAt as any) : null,
    }).returning();
    await this.createTicketEvent(orgId, t.id, "created", "Ticket created", reportedBy);
    return t;
  }

  async updateTicket(orgId: string, id: string, data: Partial<Ticket>): Promise<Ticket | undefined> {
    const updateData: any = { ...data, updatedAt: new Date() };
    if (updateData.dueDate && typeof updateData.dueDate === "string") {
      updateData.dueDate = new Date(updateData.dueDate);
    }
    if (updateData.vendorContactedAt && typeof updateData.vendorContactedAt === "string") {
      updateData.vendorContactedAt = new Date(updateData.vendorContactedAt);
    }
    if (updateData.vendorExpectedFollowUpAt && typeof updateData.vendorExpectedFollowUpAt === "string") {
      updateData.vendorExpectedFollowUpAt = new Date(updateData.vendorExpectedFollowUpAt);
    }
    const [t] = await db.update(tickets).set(updateData).where(and(eq(tickets.orgId, orgId), eq(tickets.id, id))).returning();
    return t;
  }

  async deleteTicket(orgId: string, id: string): Promise<boolean> {
    await db.delete(ticketEvents).where(and(eq(ticketEvents.orgId, orgId), eq(ticketEvents.ticketId, id)));
    const result = await db.delete(tickets).where(and(eq(tickets.orgId, orgId), eq(tickets.id, id))).returning({ id: tickets.id });
    return result.length > 0;
  }

  async getTicketEvents(orgId: string, ticketId: string): Promise<TicketEvent[]> {
    return db.select().from(ticketEvents).where(and(eq(ticketEvents.orgId, orgId), eq(ticketEvents.ticketId, ticketId))).orderBy(desc(ticketEvents.createdAt));
  }

  async createTicketEvent(orgId: string, ticketId: string, type: string, content: string, createdBy: string | null): Promise<TicketEvent> {
    const [e] = await db.insert(ticketEvents).values({ orgId, ticketId, type, content, createdBy: createdBy || null }).returning();
    return e;
  }

  async getAssets(orgId: string): Promise<(Asset & { departmentName?: string })[]> {
    const allAssets = await db.select().from(assets).where(eq(assets.orgId, orgId)).orderBy(desc(assets.createdAt));
    const deptIds = [...new Set(allAssets.filter(a => a.departmentId).map(a => a.departmentId!))];
    let deptMap: Record<string, string> = {};
    if (deptIds.length > 0) {
      const depts = await db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, deptIds));
      deptMap = Object.fromEntries(depts.map(d => [d.id, d.name]));
    }
    return allAssets.map(a => ({ ...a, departmentName: a.departmentId ? deptMap[a.departmentId] : undefined }));
  }

  async getAsset(orgId: string, id: string): Promise<(Asset & { departmentName?: string }) | undefined> {
    const [a] = await db.select().from(assets).where(and(eq(assets.orgId, orgId), eq(assets.id, id)));
    if (!a) return undefined;
    let departmentName: string | undefined;
    if (a.departmentId) {
      const [d] = await db.select({ name: departments.name }).from(departments).where(eq(departments.id, a.departmentId));
      departmentName = d?.name;
    }
    return { ...a, departmentName };
  }

  async createAsset(orgId: string, data: InsertAsset): Promise<Asset> {
    const [a] = await db.insert(assets).values({ ...data, orgId }).returning();
    return a;
  }

  async updateAsset(orgId: string, id: string, data: Partial<Asset>): Promise<Asset | undefined> {
    const [a] = await db.update(assets).set(data).where(and(eq(assets.orgId, orgId), eq(assets.id, id))).returning();
    return a;
  }

  async deleteAsset(orgId: string, id: string): Promise<boolean> {
    const result = await db.delete(assets).where(and(eq(assets.orgId, orgId), eq(assets.id, id))).returning({ id: assets.id });
    return result.length > 0;
  }

  async getSupplyRequests(orgId: string): Promise<(SupplyRequest & { departmentName?: string; requestedByName?: string })[]> {
    const all = await db.select().from(supplyRequests).where(eq(supplyRequests.orgId, orgId)).orderBy(desc(supplyRequests.createdAt));
    const deptIds = [...new Set(all.filter(s => s.departmentId).map(s => s.departmentId!))];
    let deptMap: Record<string, string> = {};
    if (deptIds.length > 0) {
      const depts = await db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, deptIds));
      deptMap = Object.fromEntries(depts.map(d => [d.id, d.name]));
    }
    const userIds = [...new Set(all.filter(s => s.requestedBy).map(s => s.requestedBy!))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const usrs = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, userIds));
      userMap = Object.fromEntries(usrs.map(u => [u.id, u.fullName]));
    }
    return all.map(s => ({
      ...s,
      departmentName: s.departmentId ? deptMap[s.departmentId] : undefined,
      requestedByName: s.requestedBy ? userMap[s.requestedBy] : undefined,
    }));
  }

  async getSupplyRequest(orgId: string, id: string): Promise<(SupplyRequest & { departmentName?: string; requestedByName?: string }) | undefined> {
    const [s] = await db.select().from(supplyRequests).where(and(eq(supplyRequests.orgId, orgId), eq(supplyRequests.id, id)));
    if (!s) return undefined;
    let departmentName: string | undefined;
    if (s.departmentId) {
      const [d] = await db.select({ name: departments.name }).from(departments).where(eq(departments.id, s.departmentId));
      departmentName = d?.name;
    }
    let requestedByName: string | undefined;
    if (s.requestedBy) {
      const [u] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, s.requestedBy));
      requestedByName = u?.fullName;
    }
    return { ...s, departmentName, requestedByName };
  }

  async createSupplyRequest(orgId: string, data: InsertSupplyRequest, requestedBy: string): Promise<SupplyRequest> {
    const [s] = await db.insert(supplyRequests).values({ ...data, orgId, requestedBy }).returning();
    return s;
  }

  async updateSupplyRequest(orgId: string, id: string, data: Partial<SupplyRequest>): Promise<SupplyRequest | undefined> {
    const [s] = await db.update(supplyRequests).set({ ...data, updatedAt: new Date() }).where(and(eq(supplyRequests.orgId, orgId), eq(supplyRequests.id, id))).returning();
    return s;
  }

  async deleteSupplyRequest(orgId: string, id: string): Promise<boolean> {
    const result = await db.delete(supplyRequests).where(and(eq(supplyRequests.orgId, orgId), eq(supplyRequests.id, id))).returning({ id: supplyRequests.id });
    return result.length > 0;
  }

  async getFacilityRequests(orgId: string): Promise<(FacilityRequest & { requestedByName?: string; assignedToName?: string })[]> {
    const all = await db.select().from(facilityRequests).where(eq(facilityRequests.orgId, orgId)).orderBy(desc(facilityRequests.createdAt));
    const userIds = [...new Set([
      ...all.filter(f => f.requestedBy).map(f => f.requestedBy!),
      ...all.filter(f => f.assignedTo).map(f => f.assignedTo!),
    ])];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const usrs = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, userIds));
      userMap = Object.fromEntries(usrs.map(u => [u.id, u.fullName]));
    }
    return all.map(f => ({
      ...f,
      requestedByName: f.requestedBy ? userMap[f.requestedBy] : undefined,
      assignedToName: f.assignedTo ? userMap[f.assignedTo] : undefined,
    }));
  }

  async getFacilityRequest(orgId: string, id: string): Promise<(FacilityRequest & { requestedByName?: string; assignedToName?: string }) | undefined> {
    const [f] = await db.select().from(facilityRequests).where(and(eq(facilityRequests.orgId, orgId), eq(facilityRequests.id, id)));
    if (!f) return undefined;
    let requestedByName: string | undefined;
    if (f.requestedBy) {
      const [u] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, f.requestedBy));
      requestedByName = u?.fullName;
    }
    let assignedToName: string | undefined;
    if (f.assignedTo) {
      const [u] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, f.assignedTo));
      assignedToName = u?.fullName;
    }
    return { ...f, requestedByName, assignedToName };
  }

  async createFacilityRequest(orgId: string, data: InsertFacilityRequest, requestedBy: string): Promise<FacilityRequest> {
    const [f] = await db.insert(facilityRequests).values({ ...data, orgId, requestedBy }).returning();
    return f;
  }

  async updateFacilityRequest(orgId: string, id: string, data: Partial<FacilityRequest>): Promise<FacilityRequest | undefined> {
    const [f] = await db.update(facilityRequests).set({ ...data, updatedAt: new Date() }).where(and(eq(facilityRequests.orgId, orgId), eq(facilityRequests.id, id))).returning();
    return f;
  }

  async deleteFacilityRequest(orgId: string, id: string): Promise<boolean> {
    const result = await db.delete(facilityRequests).where(and(eq(facilityRequests.orgId, orgId), eq(facilityRequests.id, id))).returning({ id: facilityRequests.id });
    return result.length > 0;
  }

  async getVendors(orgId: string): Promise<Vendor[]> {
    return db.select().from(vendors).where(eq(vendors.orgId, orgId)).orderBy(vendors.name);
  }

  async getVendor(orgId: string, id: string): Promise<Vendor | undefined> {
    const [v] = await db.select().from(vendors).where(and(eq(vendors.orgId, orgId), eq(vendors.id, id)));
    return v;
  }

  async createVendor(orgId: string, data: InsertVendor): Promise<Vendor> {
    const [v] = await db.insert(vendors).values({ ...data, orgId }).returning();
    return v;
  }

  async updateVendor(orgId: string, id: string, data: Partial<Vendor>): Promise<Vendor | undefined> {
    const [v] = await db.update(vendors).set(data).where(and(eq(vendors.orgId, orgId), eq(vendors.id, id))).returning();
    return v;
  }

  async deleteVendor(orgId: string, id: string): Promise<boolean> {
    const result = await db.delete(vendors).where(and(eq(vendors.orgId, orgId), eq(vendors.id, id))).returning({ id: vendors.id });
    return result.length > 0;
  }

  async createNotification(orgId: string, userId: string, type: string, title: string, message: string, ticketId?: string | null): Promise<Notification> {
    const [n] = await db.insert(notifications).values({
      orgId,
      userId,
      type: type as any,
      title,
      message,
      ticketId: ticketId || null,
    }).returning();
    return n;
  }

  async getUserNotifications(orgId: string, userId: string, limit = 50): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId)))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadNotificationCount(orgId: string, userId: string): Promise<number> {
    const [result] = await db.select({ cnt: count() }).from(notifications)
      .where(and(
        eq(notifications.orgId, orgId),
        eq(notifications.userId, userId),
        eq(notifications.read, false)
      ));
    return Number(result?.cnt || 0);
  }

  async markNotificationRead(orgId: string, userId: string, id: string): Promise<void> {
    await db.update(notifications).set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.orgId, orgId), eq(notifications.userId, userId)));
  }

  async markAllNotificationsRead(orgId: string, userId: string): Promise<void> {
    await db.update(notifications).set({ read: true })
      .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId), eq(notifications.read, false)));
  }

  async notifyOrgMembers(orgId: string, excludeUserId: string, type: string, title: string, message: string, ticketId?: string | null, targetUserId?: string | null): Promise<void> {
    try {
      if (targetUserId) {
        if (targetUserId !== excludeUserId) {
          await this.createNotification(orgId, targetUserId, type, title, message, ticketId);
          await this.sendOutboundForNotification(orgId, targetUserId, type, title, message, ticketId);
        }
        return;
      }
      const mems = await db.select().from(memberships).where(eq(memberships.orgId, orgId));
      const userIds = mems.map(m => m.userId).filter(id => id !== excludeUserId);
      for (const uid of userIds) {
        await this.createNotification(orgId, uid, type, title, message, ticketId);
        await this.sendOutboundForNotification(orgId, uid, type, title, message, ticketId);
      }
    } catch (err) {
      console.error("Error creating notifications:", err);
    }
  }

  private async sendOutboundForNotification(orgId: string, userId: string, type: string, title: string, message: string, ticketId?: string | null): Promise<void> {
    try {
      const { isOutboundEnabled, sendOutbound, buildTicketEmail } = await import("./email/outbound");
      if (!isOutboundEnabled()) return;
      const user = await this.getUser(userId);
      if (!user?.email) return;
      if (ticketId && type.startsWith("ticket_")) {
        const ticket = await this.getTicket(orgId, ticketId);
        if (!ticket) return;
        const built = buildTicketEmail({
          type: type as any,
          ticketNumber: ticket.ticketNumber,
          ticketTitle: ticket.title,
          ticketId: ticket.id,
          body: message,
        });
        await sendOutbound({ to: user.email, ...built });
      }
    } catch (err: any) {
      console.error("[outbound] notification send failed:", err?.message || err);
    }
  }

  async getOrgCounts(orgId: string): Promise<{ tickets: number; departments: number; assets: number; members: number }> {
    const [tc] = await db.select({ cnt: count() }).from(tickets).where(eq(tickets.orgId, orgId));
    const [dc] = await db.select({ cnt: count() }).from(departments).where(eq(departments.orgId, orgId));
    const [ac] = await db.select({ cnt: count() }).from(assets).where(eq(assets.orgId, orgId));
    const [mc] = await db.select({ cnt: count() }).from(memberships).where(eq(memberships.orgId, orgId));
    return {
      tickets: Number(tc?.cnt || 0),
      departments: Number(dc?.cnt || 0),
      assets: Number(ac?.cnt || 0),
      members: Number(mc?.cnt || 0),
    };
  }

  async getDashboardStats(orgId: string): Promise<any> {
    const allTickets = await db.select().from(tickets).where(eq(tickets.orgId, orgId));
    const allSupply = await db.select().from(supplyRequests).where(eq(supplyRequests.orgId, orgId));
    const allFacility = await db.select().from(facilityRequests).where(eq(facilityRequests.orgId, orgId));
    const allDepts = await db.select().from(departments).where(eq(departments.orgId, orgId));
    const allAssetsList = await db.select().from(assets).where(eq(assets.orgId, orgId));
    const allConnectors = await db.select().from(mailConnectors).where(eq(mailConnectors.orgId, orgId));
    const [emailSetting] = await db.select().from(emailSettings).where(eq(emailSettings.orgId, orgId));

    const openStatuses = ["new", "triage", "assigned", "waiting_department", "waiting_vendor", "in_progress", "escalated"];
    const allTicketsWithSla = allTickets.map(withTicketComputedFields);
    const openTickets = allTicketsWithSla.filter(t => openStatuses.includes(t.status));
    const now = new Date();

    const statusCounts: Record<string, number> = {};
    for (const t of allTickets) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    }

    const priorityCounts: Record<string, number> = {};
    for (const t of openTickets) {
      priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1;
    }

    const categoryCounts: Record<string, number> = {};
    for (const t of openTickets) {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    }

    const deptCounts: Record<string, number> = {};
    const deptMap = Object.fromEntries(allDepts.map(d => [d.id, d.name]));
    for (const t of openTickets) {
      const dname = t.departmentId ? (deptMap[t.departmentId] || "Unassigned") : "Unassigned";
      deptCounts[dname] = (deptCounts[dname] || 0) + 1;
    }

    const overdueTickets = openTickets.filter(t => t.dueDate && new Date(t.dueDate) < now);
    const equipmentTickets = allTicketsWithSla.filter(t => t.category === "medical_equipment" && openStatuses.includes(t.status));
    const facilityTickets = allTicketsWithSla.filter(t => t.category === "facilities_building" && openStatuses.includes(t.status));
    const pendingSupplies = allSupply.filter(s => s.status === "pending" || s.status === "approved");
    const criticalOpen = openTickets.filter(t => t.priority === "critical" || t.priority === "high");
    const waitingDept = openTickets.filter(t => t.status === "waiting_department");
    const waitingVendor = openTickets.filter(t => t.status === "waiting_vendor");
    const staleVendorWaits = waitingVendor.filter(t => isStaleVendorWait(t, now));
    const escalatedTickets = openTickets.filter(t => t.status === "escalated");
    const patientImpacting = openTickets.filter(t => t.isPatientImpacting);
    const recurringIssues = openTickets.filter(t => t.isRecurring || t.isRepeatIssue);
    const unassignedOpen = openTickets.filter(t => !t.assignedTo);
    const slaCounts = { on_track: 0, due_soon: 0, overdue: 0, blocked: 0 };
    for (const t of openTickets) {
      slaCounts[t.slaState] = (slaCounts[t.slaState] || 0) + 1;
    }

    const summarizeTicket = (t: typeof allTicketsWithSla[number]) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      priority: t.priority,
      category: t.category,
      updatedAt: t.updatedAt,
      dueDate: t.dueDate,
      vendorReference: t.vendorReference,
      vendorExpectedFollowUpAt: t.vendorExpectedFollowUpAt,
      isPatientImpacting: t.isPatientImpacting,
      slaState: t.slaState,
      slaDueAt: t.slaDueAt,
      slaReason: t.slaReason,
      assignedToName: null as string | null,
    });

    const recentActivity = [...allTicketsWithSla]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10)
      .map(summarizeTicket);

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ticketsThisMonth = allTickets.filter(t => new Date(t.createdAt) >= thirtyDaysAgo);
    const resolvedThisMonth = allTickets.filter(t => (t.status === "resolved" || t.status === "closed") && new Date(t.updatedAt) >= thirtyDaysAgo);

    const resolvedTickets = allTicketsWithSla.filter(t => t.status === "resolved" || t.status === "closed");
    let avgResolutionHours = 0;
    if (resolvedTickets.length > 0) {
      const totalHours = resolvedTickets.reduce((sum, t) => {
        return sum + (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
      }, 0);
      avgResolutionHours = Math.round(totalHours / resolvedTickets.length);
    }

    const triageTickets = allTicketsWithSla.filter(t => t.status !== "new");
    let avgTriageHours = 0;
    if (triageTickets.length > 0) {
      const totalHours = triageTickets.reduce((sum, t) => {
        return sum + Math.max(1, (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60));
      }, 0);
      avgTriageHours = Math.round(totalHours / triageTickets.length);
    }

    const agingBuckets = { under24h: 0, "1to3days": 0, "3to7days": 0, over7days: 0 };
    for (const t of openTickets) {
      const ageMs = now.getTime() - new Date(t.createdAt).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours < 24) agingBuckets.under24h++;
      else if (ageHours < 72) agingBuckets["1to3days"]++;
      else if (ageHours < 168) agingBuckets["3to7days"]++;
      else agingBuckets.over7days++;
    }

    const openFacilityCount = allFacility.filter(f => f.status !== "resolved" && f.status !== "closed").length;
    const pendingSupplyApprovals = allSupply
      .filter(s => s.status === "pending")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const connectorHealth = {
      enabledEmailSettings: emailSetting?.enabled ?? false,
      totalConnectors: allConnectors.length,
      activeConnectors: allConnectors.filter(c => c.enabled && c.status === "active").length,
      errorConnectors: allConnectors.filter(c => c.status === "error" || c.consecutiveFailures > 0).length,
      disabledConnectors: allConnectors.filter(c => !c.enabled || c.status === "disabled").length,
      pendingAuthConnectors: allConnectors.filter(c => c.status === "pending_auth").length,
      lastError: allConnectors.find(c => c.lastError)?.lastError ?? null,
    };

    return {
      totalTickets: allTickets.length,
      openTickets: openTickets.length,
      resolvedThisMonth: resolvedThisMonth.length,
      newThisMonth: ticketsThisMonth.length,
      statusCounts,
      priorityCounts,
      categoryCounts,
      departmentCounts: deptCounts,
      overdueCount: overdueTickets.length,
      equipmentIncidents: equipmentTickets.length,
      facilityIncidents: facilityTickets.length,
      pendingSupplyRequests: pendingSupplies.length,
      totalAssets: allAssetsList.length,
      assetsUnderService: allAssetsList.filter(a => a.status === "under_service").length,
      assetsOffline: allAssetsList.filter(a => a.status === "offline").length,
      criticalHighOpen: criticalOpen.length,
      waitingDeptCount: waitingDept.length,
      waitingVendorCount: waitingVendor.length,
      staleVendorWaitCount: staleVendorWaits.length,
      escalatedCount: escalatedTickets.length,
      patientImpactingCount: patientImpacting.length,
      recurringCount: recurringIssues.length,
      unassignedCount: unassignedOpen.length,
      slaCounts,
      avgResolutionHours,
      avgTriageHours,
      agingBuckets,
      openFacilityRequests: openFacilityCount,
      connectorHealth,
      dailyBrief: {
        urgentTickets: criticalOpen
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .slice(0, 5)
          .map(summarizeTicket),
        overdueTickets: overdueTickets
          .sort((a, b) => new Date(a.dueDate ?? a.createdAt).getTime() - new Date(b.dueDate ?? b.createdAt).getTime())
          .slice(0, 5)
          .map(summarizeTicket),
        staleVendorWaits: staleVendorWaits
          .sort((a, b) => new Date(a.vendorExpectedFollowUpAt ?? a.updatedAt).getTime() - new Date(b.vendorExpectedFollowUpAt ?? b.updatedAt).getTime())
          .slice(0, 5)
          .map(summarizeTicket),
        pendingSupplyApprovals: pendingSupplyApprovals.slice(0, 5).map(s => ({
          id: s.id,
          itemName: s.itemName,
          urgency: s.urgency,
          quantity: s.quantity,
          createdAt: s.createdAt,
        })),
        connectorHealth,
      },
      recentActivity,
      isEmpty: allTickets.length === 0,
    };
  }

  async getOrgAuthConfig(orgId: string): Promise<OrgAuthConfig | undefined> {
    const [config] = await db.select().from(orgAuthConfig).where(eq(orgAuthConfig.orgId, orgId));
    return config;
  }

  async upsertOrgAuthConfig(orgId: string, data: Partial<InsertOrgAuthConfig>): Promise<OrgAuthConfig> {
    const existing = await this.getOrgAuthConfig(orgId);
    if (existing) {
      const [updated] = await db.update(orgAuthConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(orgAuthConfig.orgId, orgId))
        .returning();
      return updated;
    }
    const insertData: InsertOrgAuthConfig = {
      orgId,
      authMode: data.authMode || "local",
      ...data,
    };
    const [created] = await db.insert(orgAuthConfig)
      .values(insertData)
      .returning();
    return created;
  }

  async getOrgBySlug(slug: string): Promise<Org | undefined> {
    const [org] = await db.select().from(orgs).where(eq(orgs.slug, slug));
    return org;
  }

  async getUserByEntraObjectId(entraObjectId: string, orgId: string): Promise<User | undefined> {
    const allUsers = await db.select().from(users).where(eq(users.entraObjectId, entraObjectId));
    if (allUsers.length === 0) return undefined;
    for (const u of allUsers) {
      const mem = await this.getMembership(orgId, u.id);
      if (mem) return u;
    }
    return undefined;
  }

  async getUserByOperatorOsId(operatorOsUserId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.operatorOsUserId, operatorOsUserId));
    return user;
  }

  async getOrgByOperatorOsId(operatorOsOrgId: string): Promise<Org | undefined> {
    const [org] = await db.select().from(orgs).where(eq(orgs.operatorOsOrgId, operatorOsOrgId));
    return org;
  }

  async provisionOperatorOsUser(input: {
    sub: string;
    email: string;
    name?: string;
    role: OperatorOsRole;
    planSlug: string | null;
    organizationId: string | null;
    entitlement?: OperatorOsEntitlementClaims | null;
  }): Promise<{ user: User; org: Org; userCreated: boolean; orgCreated: boolean }> {
    const normalizedEmail = normalizeEmail(input.email);
    const isMasterAdmin = input.role === "super_admin" || isMasterAdminEmail(normalizedEmail);
    const desiredOrgRole = mapOperatorOsRoleToPulseDeskRole({
      email: normalizedEmail,
      role: input.role,
      entitlement: input.entitlement,
    });
    const personalSlug = `oos-personal-${input.sub}`.toLowerCase().slice(0, 60);
    const tenantSlug = input.organizationId
      ? `oos-${input.organizationId}`.toLowerCase().slice(0, 60)
      : null;

    const { hashPassword } = await import("./middleware");
    const randomPw = randomBytes(32).toString("hex");
    const passwordHash = await hashPassword(randomPw);

    const result = await db.transaction(async (tx) => {
      let org: Org | undefined;
      let orgCreated = false;

      if (input.organizationId && tenantSlug) {
        const [existingOrg] = await tx.select().from(orgs).where(eq(orgs.operatorOsOrgId, input.organizationId));
        if (existingOrg) {
          org = existingOrg;
        } else {
          const [created] = await tx.insert(orgs).values({
            name: `OperatorOS Tenant ${input.organizationId.slice(0, 8)}`,
            slug: tenantSlug,
            operatorOsOrgId: input.organizationId,
          }).returning();
          org = created;
          orgCreated = true;
        }
      }

      const [existingUser] = await tx.select().from(users).where(eq(users.operatorOsUserId, input.sub));
      let user: User;
      let userCreated = false;
      if (!existingUser) {
        const username = `oos_${input.sub}`.slice(0, 64);
        const [created] = await tx.insert(users).values({
          username,
          password: passwordHash,
          fullName: input.name || normalizedEmail.split("@")[0],
          email: normalizedEmail,
          authSource: "operatoros",
          operatorOsUserId: input.sub,
          operatorOsRole: input.role,
          operatorOsPlanSlug: input.planSlug ?? null,
          operatorOsOrgId: input.organizationId ?? null,
          lastSsoAt: new Date(),
          isSuperAdmin: isMasterAdmin,
        }).returning();
        user = created;
        userCreated = true;
      } else {
        const update: Partial<User> = {
          email: normalizedEmail || existingUser.email,
          operatorOsRole: input.role,
          operatorOsPlanSlug: input.planSlug ?? null,
          operatorOsOrgId: input.organizationId ?? null,
          lastSsoAt: new Date(),
          isSuperAdmin: isMasterAdmin ? true : existingUser.isSuperAdmin,
        };
        if (input.name && !existingUser.fullName) update.fullName = input.name;
        const [updated] = await tx.update(users).set(update).where(eq(users.id, existingUser.id)).returning();
        user = updated;
      }

      if (!org) {
        const [existingPersonal] = await tx.select().from(orgs).where(eq(orgs.slug, personalSlug));
        if (existingPersonal) {
          org = existingPersonal;
        } else {
          const [created] = await tx.insert(orgs).values({
            name: `${input.name || normalizedEmail.split("@")[0]}'s Workspace`,
            slug: personalSlug,
          }).returning();
          org = created;
          orgCreated = true;
        }
      }

      const [existingMembership] = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id)));

      if (!existingMembership) {
        await tx.insert(memberships).values({ orgId: org.id, userId: user.id, role: desiredOrgRole as any });
      } else if (existingMembership.role !== desiredOrgRole) {
        await tx
          .update(memberships)
          .set({ role: desiredOrgRole as any })
          .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id)));
      }

      return { user, org, userCreated, orgCreated };
    });

    if (result.orgCreated) {
      try {
        for (const deptName of DEFAULT_DEPARTMENTS) {
          await this.createDepartment(result.org.id, { name: deptName });
        }
        await this.seedOnboardingItems(result.org.id);
      } catch (err: any) {
        console.error("[provisionOperatorOsUser] post-create seed failed:", err?.message);
      }
    }

    return result;
  }

  async upsertOperatorOsEntitlementSnapshot(input: UpsertOperatorOsEntitlementSnapshotInput): Promise<{
    snapshot: OperatorOsEntitlementSnapshot;
    staleIgnored: boolean;
  }> {
    const moduleSlug = input.moduleSlug.trim().toLowerCase();
    const existing = await this.getOperatorOsEntitlementSnapshot(
      input.operatorOsUserId,
      input.operatorOsTenantId,
      moduleSlug
    );

    if (existing && existing.computedAt && input.computedAt < existing.computedAt) {
      return { snapshot: existing, staleIgnored: true };
    }

    const values = {
      operatorOsUserId: input.operatorOsUserId,
      operatorOsTenantId: input.operatorOsTenantId,
      localUserId: input.localUserId ?? existing?.localUserId ?? null,
      localOrgId: input.localOrgId ?? existing?.localOrgId ?? null,
      moduleSlug,
      enabled: input.enabled,
      accessLevel: input.accessLevel || "none",
      moduleRole: input.moduleRole || "none",
      tenantRole: input.tenantRole ?? null,
      tenantRoleAlias: input.tenantRoleAlias ?? null,
      subscriptionStatus: input.subscriptionStatus ?? null,
      features: input.features ?? {},
      rawSnapshot: input.rawSnapshot ?? {},
      computedAt: input.computedAt,
      receivedAt: new Date(),
      revokedAt: input.enabled ? null : (input.revokedAt ?? new Date()),
    };

    if (!existing) {
      const [created] = await db.insert(operatorOsEntitlementSnapshots).values(values).returning();
      return { snapshot: created, staleIgnored: false };
    }

    const [updated] = await db
      .update(operatorOsEntitlementSnapshots)
      .set(values)
      .where(eq(operatorOsEntitlementSnapshots.id, existing.id))
      .returning();
    return { snapshot: updated, staleIgnored: false };
  }

  async getOperatorOsEntitlementSnapshotById(id: string): Promise<OperatorOsEntitlementSnapshot | undefined> {
    const [snapshot] = await db
      .select()
      .from(operatorOsEntitlementSnapshots)
      .where(eq(operatorOsEntitlementSnapshots.id, id));
    return snapshot;
  }

  async getOperatorOsEntitlementSnapshot(
    operatorOsUserId: string,
    operatorOsTenantId: string,
    moduleSlug: string
  ): Promise<OperatorOsEntitlementSnapshot | undefined> {
    const [snapshot] = await db
      .select()
      .from(operatorOsEntitlementSnapshots)
      .where(and(
        eq(operatorOsEntitlementSnapshots.operatorOsUserId, operatorOsUserId),
        eq(operatorOsEntitlementSnapshots.operatorOsTenantId, operatorOsTenantId),
        eq(operatorOsEntitlementSnapshots.moduleSlug, moduleSlug.trim().toLowerCase())
      ));
    return snapshot;
  }

  async getCurrentOperatorOsEntitlementSnapshot(
    localUserId: string,
    localOrgId: string,
    moduleSlug: string
  ): Promise<OperatorOsEntitlementSnapshot | undefined> {
    const [snapshot] = await db
      .select()
      .from(operatorOsEntitlementSnapshots)
      .where(and(
        eq(operatorOsEntitlementSnapshots.localUserId, localUserId),
        eq(operatorOsEntitlementSnapshots.localOrgId, localOrgId),
        eq(operatorOsEntitlementSnapshots.moduleSlug, moduleSlug.trim().toLowerCase())
      ))
      .orderBy(desc(operatorOsEntitlementSnapshots.computedAt))
      .limit(1);
    return snapshot;
  }

  async getLatestOperatorOsEntitlementSnapshotForOrg(
    localOrgId: string,
    moduleSlug: string
  ): Promise<OperatorOsEntitlementSnapshot | undefined> {
    const [snapshot] = await db
      .select()
      .from(operatorOsEntitlementSnapshots)
      .where(and(
        eq(operatorOsEntitlementSnapshots.localOrgId, localOrgId),
        eq(operatorOsEntitlementSnapshots.moduleSlug, moduleSlug.trim().toLowerCase())
      ))
      .orderBy(desc(operatorOsEntitlementSnapshots.computedAt))
      .limit(1);
    return snapshot;
  }

  async revokeOperatorOsEntitlementSnapshot(
    operatorOsUserId: string,
    operatorOsTenantId: string,
    moduleSlug: string,
    computedAt: Date = new Date(),
    rawSnapshot: unknown = {}
  ): Promise<{ snapshot: OperatorOsEntitlementSnapshot; staleIgnored: boolean }> {
    const existing = await this.getOperatorOsEntitlementSnapshot(operatorOsUserId, operatorOsTenantId, moduleSlug);
    return this.upsertOperatorOsEntitlementSnapshot({
      operatorOsUserId,
      operatorOsTenantId,
      localUserId: existing?.localUserId ?? null,
      localOrgId: existing?.localOrgId ?? null,
      moduleSlug,
      enabled: false,
      accessLevel: "none",
      moduleRole: "none",
      tenantRole: existing?.tenantRole ?? null,
      tenantRoleAlias: existing?.tenantRoleAlias ?? null,
      subscriptionStatus: existing?.subscriptionStatus ?? null,
      features: {},
      rawSnapshot,
      computedAt,
      revokedAt: new Date(),
    });
  }

  async getOrgRoleMappings(orgId: string): Promise<OrgRoleMapping[]> {
    return db.select().from(orgRoleMappings).where(eq(orgRoleMappings.orgId, orgId)).orderBy(orgRoleMappings.createdAt);
  }

  async createOrgRoleMapping(orgId: string, entraGroupId: string, pulsedeskRole: string, displayLabel?: string): Promise<OrgRoleMapping> {
    const [m] = await db.insert(orgRoleMappings).values({
      orgId,
      entraGroupId,
      pulsedeskRole,
      displayLabel: displayLabel || null,
    }).returning();
    return m;
  }

  async deleteOrgRoleMapping(orgId: string, id: string): Promise<void> {
    await db.delete(orgRoleMappings).where(and(eq(orgRoleMappings.orgId, orgId), eq(orgRoleMappings.id, id)));
  }

  async deleteAllOrgRoleMappings(orgId: string): Promise<void> {
    await db.delete(orgRoleMappings).where(eq(orgRoleMappings.orgId, orgId));
  }

  async createAuthAuditLog(entry: {
    orgId?: string | null;
    userId?: string | null;
    eventType: string;
    authSource?: string | null;
    tenantResolved?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    details?: any;
    success: boolean;
  }): Promise<AuthAuditLogEntry> {
    const [log] = await db.insert(authAuditLog).values({
      orgId: entry.orgId || null,
      userId: entry.userId || null,
      eventType: entry.eventType,
      authSource: entry.authSource || null,
      tenantResolved: entry.tenantResolved || null,
      ipAddress: entry.ipAddress || null,
      userAgent: entry.userAgent || null,
      details: entry.details || null,
      success: entry.success,
    }).returning();
    return log;
  }

  async getAuthAuditLog(orgId: string, limit: number = 50): Promise<AuthAuditLogEntry[]> {
    return db.select().from(authAuditLog)
      .where(eq(authAuditLog.orgId, orgId))
      .orderBy(desc(authAuditLog.createdAt))
      .limit(limit);
  }

  async getAllAuthAuditLogs(opts: {
    eventTypes?: string[];
    since?: Date;
    until?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    rows: Array<AuthAuditLogEntry & {
      orgName: string | null;
      orgSlug: string | null;
      actorUsername: string | null;
      actorFullName: string | null;
    }>;
    total: number;
  }> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conds: SQL[] = [];
    if (opts.eventTypes && opts.eventTypes.length > 0) {
      conds.push(inArray(authAuditLog.eventType, opts.eventTypes));
    }
    if (opts.since) conds.push(gte(authAuditLog.createdAt, opts.since));
    if (opts.until) conds.push(lte(authAuditLog.createdAt, opts.until));
    const whereClause: SQL | undefined = conds.length > 0 ? and(...conds) : undefined;

    const baseRows = await db
      .select({
        id: authAuditLog.id,
        orgId: authAuditLog.orgId,
        userId: authAuditLog.userId,
        eventType: authAuditLog.eventType,
        authSource: authAuditLog.authSource,
        tenantResolved: authAuditLog.tenantResolved,
        ipAddress: authAuditLog.ipAddress,
        userAgent: authAuditLog.userAgent,
        details: authAuditLog.details,
        success: authAuditLog.success,
        createdAt: authAuditLog.createdAt,
        orgName: orgs.name,
        orgSlug: orgs.slug,
        actorUsername: users.username,
        actorFullName: users.fullName,
      })
      .from(authAuditLog)
      .leftJoin(orgs, eq(authAuditLog.orgId, orgs.id))
      .leftJoin(users, eq(authAuditLog.userId, users.id))
      .where(whereClause)
      .orderBy(desc(authAuditLog.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(authAuditLog)
      .where(whereClause);

    return { rows: baseRows, total: Number(total) };
  }

  async getFailedInboundEmails(limit: number = 25): Promise<InboundEmailLog[]> {
    return db.select().from(inboundEmailLog)
      .where(eq(inboundEmailLog.status, "failed"))
      .orderBy(desc(inboundEmailLog.createdAt))
      .limit(limit);
  }

  async purgeAuthAuditLogsOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await db.delete(authAuditLog)
      .where(sql`${authAuditLog.createdAt} < ${cutoff}`)
      .returning({ id: authAuditLog.id });
    return result.length;
  }

  async getOnboardingItems(orgId: string): Promise<OnboardingItem[]> {
    return db.select().from(onboardingItems)
      .where(eq(onboardingItems.orgId, orgId))
      .orderBy(onboardingItems.sortOrder);
  }

  async createOnboardingItem(orgId: string, data: Partial<OnboardingItem>): Promise<OnboardingItem> {
    const [item] = await db.insert(onboardingItems).values({
      orgId,
      title: data.title || "",
      description: data.description || "",
      route: data.route || "",
      sortOrder: data.sortOrder || 0,
      status: (data.status as any) || "pending",
      autoCompleteKey: data.autoCompleteKey || null,
      completionSource: data.completionSource || "manual",
    }).returning();
    return item;
  }

  async updateOnboardingItem(orgId: string, id: string, data: Partial<OnboardingItem>): Promise<OnboardingItem | undefined> {
    const updateData: any = { ...data, updatedAt: new Date() };
    const [item] = await db.update(onboardingItems)
      .set(updateData)
      .where(and(eq(onboardingItems.orgId, orgId), eq(onboardingItems.id, id)))
      .returning();
    return item;
  }

  async seedOnboardingItems(orgId: string): Promise<void> {
    const { DEFAULT_ONBOARDING_ITEMS } = await import("@shared/schema");
    const existing = await this.getOnboardingItems(orgId);
    if (existing.length > 0) return;
    for (const item of DEFAULT_ONBOARDING_ITEMS) {
      await this.createOnboardingItem(orgId, item);
    }
  }
}

export const storage = new DatabaseStorage();

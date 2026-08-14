import {
  tenants,
  tenantMembers,
  clients,
  sites,
  assets,
  evidenceItems,
  tags,
  auditLogs,
  clientUserAssignments,
  licenseProducts,
  licenseKeys,
  licenseActivations,
  webhookEndpoints,
  statusPages,
  statusComponents,
  statusIncidents,
  type Tenant,
  type InsertTenant,
  type TenantMember,
  type Client,
  type InsertClient,
  type Site,
  type InsertSite,
  type Asset,
  type InsertAsset,
  type EvidenceItem,
  type InsertEvidence,
  type Tag,
  type InsertTag,
  type AuditLog,
  type ClientUserAccess,
  type LicenseProduct,
  type InsertLicenseProduct,
  type LicenseKey,
  type InsertLicenseKey,
  type LicenseActivation,
  type InsertLicenseActivation,
  type WebhookEndpoint,
  type InsertWebhookEndpoint,
  webhookDeliveries,
  type WebhookDelivery,
  type InsertWebhookDelivery,
  type StatusPage,
  type InsertStatusPage,
  type StatusComponent,
  type InsertStatusComponent,
  type StatusIncident,
  type InsertStatusIncident,
  reportJobs,
  type ReportJob,
  type InsertReportJob,
  apiTokens,
  type ApiToken,
  subscriptionPlans,
  type SubscriptionPlan,
  type InsertSubscriptionPlan,
  tenantSubscriptions,
  type TenantSubscription,
  type InsertTenantSubscription,
  usageCountersMonthly,
  type UsageCounter,
  tickets,
  ticketComments,
  slaProfiles,
  type Ticket,
  type InsertTicket,
  type TicketComment,
  type InsertTicketComment,
  type SlaProfile,
  type InsertSlaProfile,
  appointments,
  timeEntries,
  billingConfigs,
  invoices,
  invoiceLineItems,
  kbArticles,
  recurringTicketTemplates,
  type Appointment,
  type InsertAppointment,
  type TimeEntry,
  type InsertTimeEntry,
  type BillingConfig,
  type InsertBillingConfig,
  type Invoice,
  type InsertInvoice,
  type InvoiceLineItem,
  type InsertInvoiceLineItem,
  type KbArticle,
  type InsertKbArticle,
  type RecurringTicketTemplate,
  type InsertRecurringTicketTemplate,
  intakeSpaces,
  uploadRequests,
  intakeFiles,
  intakeAuditEvents,
  intakePolicies,
  type IntakeSpace,
  type InsertIntakeSpace,
  type UploadRequest,
  type InsertUploadRequest,
  type IntakeFile,
  type InsertIntakeFile,
  type IntakeAuditEvent,
  type InsertIntakeAuditEvent,
  type IntakePolicy,
  type InsertIntakePolicy,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { db } from "./db";
import { eq, and, or, ilike, desc, asc, sql, inArray, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface SearchFilters {
  query?: string;
  clientId?: string;
  assetId?: string;
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
  uploadedBy?: string;
}

export interface TicketFilters {
  status?: string;
  priority?: string;
  assignedToId?: string;
  clientId?: string;
  query?: string;
}

export interface AuditFilters {
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
}

export interface IStorage {
  createTenant(data: InsertTenant): Promise<Tenant>;
  getTenantById(id: string): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;

  addMember(tenantId: string, userId: string, role: string): Promise<TenantMember>;
  getMembersByTenant(tenantId: string): Promise<any[]>;
  getUserMembership(userId: string): Promise<{ tenant: Tenant; role: string } | undefined>;
  getMemberRole(tenantId: string, userId: string): Promise<string | undefined>;
  updateMemberRole(tenantId: string, memberId: string, role: string): Promise<void>;

  createClient(data: InsertClient): Promise<Client>;
  getClientsByTenant(tenantId: string): Promise<Client[]>;
  getClientById(tenantId: string, id: string): Promise<Client | undefined>;
  getClientDetail(tenantId: string, id: string): Promise<any>;
  deleteClient(tenantId: string, id: string): Promise<void>;
  deleteClients(tenantId: string, ids: string[]): Promise<number>;

  createSite(data: InsertSite): Promise<Site>;
  getSitesByTenant(tenantId: string): Promise<Site[]>;
  deleteSite(tenantId: string, id: string): Promise<void>;
  deleteSites(tenantId: string, ids: string[]): Promise<number>;

  createAsset(data: InsertAsset): Promise<Asset>;
  getAssetsByTenant(tenantId: string): Promise<Asset[]>;
  getAssetById(tenantId: string, id: string): Promise<Asset | undefined>;
  deleteAsset(tenantId: string, id: string): Promise<void>;
  deleteAssets(tenantId: string, ids: string[]): Promise<number>;

  createEvidence(data: InsertEvidence): Promise<EvidenceItem>;
  searchEvidence(tenantId: string, filters: SearchFilters): Promise<any[]>;
  getEvidenceById(tenantId: string, id: string): Promise<any>;
  getEvidenceBySha256(tenantId: string, sha256: string): Promise<EvidenceItem | undefined>;
  deleteEvidence(tenantId: string, id: string): Promise<void>;
  getRecentEvidence(tenantId: string, limit?: number): Promise<any[]>;
  getEvidenceByClient(tenantId: string, clientId: string): Promise<EvidenceItem[]>;

  createTag(data: InsertTag): Promise<Tag>;
  getTagsByTenant(tenantId: string): Promise<Tag[]>;
  getTagByName(tenantId: string, name: string): Promise<Tag | undefined>;
  getTagsByIds(ids: string[]): Promise<Tag[]>;

  createAuditLog(data: {
    tenantId: string;
    userId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: any;
  }): Promise<AuditLog>;
  getAuditLogsByTenant(tenantId: string, filters?: AuditFilters): Promise<any[]>;
  getAuditActionTypes(tenantId: string): Promise<string[]>;

  getDashboardStats(tenantId: string): Promise<{
    totalClients: number;
    totalAssets: number;
    totalEvidence: number;
    totalSites: number;
    maxClients: number;
    maxEvidence: number;
    recentEvidence: any[];
    openTickets: number;
    overdueTickets: number;
    upcomingAppointments: number;
    unpaidInvoiceCents: number;
    unbilledMinutes: number;
  }>;

  getClientIdsForUser(userId: string): Promise<string[]>;
  getClientAccessForUser(userId: string): Promise<Array<{ clientId: string; canUpload: boolean }>>;
  getClientAccessByTenant(tenantId: string): Promise<any[]>;
  addClientAccess(tenantId: string, userId: string, clientId: string, canUpload?: boolean): Promise<ClientUserAccess>;
  removeClientAccess(tenantId: string, id: string): Promise<void>;
  updateClientAccessCanUpload(tenantId: string, id: string, canUpload: boolean): Promise<void>;
  canUserUploadForClient(userId: string, clientId: string): Promise<boolean>;

  createLicenseProduct(data: InsertLicenseProduct): Promise<LicenseProduct>;
  getLicenseProductsByTenant(tenantId: string): Promise<LicenseProduct[]>;
  getLicenseProductById(tenantId: string, id: string): Promise<LicenseProduct | undefined>;
  getLicenseProductBySlug(tenantId: string, slug: string): Promise<LicenseProduct | undefined>;
  updateLicenseProduct(tenantId: string, id: string, data: Partial<Pick<LicenseProduct, "name" | "slug" | "description" | "isActive">>): Promise<LicenseProduct | undefined>;

  createLicenseKey(data: InsertLicenseKey): Promise<LicenseKey>;
  getLicenseKeysByProduct(tenantId: string, productId: string): Promise<LicenseKey[]>;
  getLicenseKeyById(tenantId: string, id: string): Promise<LicenseKey | undefined>;
  getLicenseKeyByHash(keyHash: string): Promise<(LicenseKey & { productSlug: string; productIsActive: boolean }) | undefined>;
  revokeLicenseKey(tenantId: string, id: string): Promise<void>;

  createLicenseActivation(data: InsertLicenseActivation): Promise<LicenseActivation>;
  getActivationsByKey(tenantId: string, licenseKeyId: string): Promise<LicenseActivation[]>;
  getActivationCountByKey(licenseKeyId: string): Promise<number>;
  getActivationByFingerprint(licenseKeyId: string, deviceFingerprint: string): Promise<LicenseActivation | undefined>;

  createWebhookEndpoint(data: InsertWebhookEndpoint): Promise<WebhookEndpoint>;
  getWebhookEndpointsByTenant(tenantId: string): Promise<WebhookEndpoint[]>;
  getWebhookEndpointById(tenantId: string, id: string): Promise<WebhookEndpoint | undefined>;
  updateWebhookEndpoint(tenantId: string, id: string, data: Partial<Pick<WebhookEndpoint, "url" | "enabled" | "eventTypes" | "description">>): Promise<WebhookEndpoint | undefined>;
  deleteWebhookEndpoint(tenantId: string, id: string): Promise<void>;
  getEnabledWebhooksForEvent(tenantId: string, eventType: string): Promise<WebhookEndpoint[]>;

  createWebhookDelivery(data: InsertWebhookDelivery): Promise<WebhookDelivery>;
  getWebhookDeliveriesByEndpoint(tenantId: string, endpointId: string, limit?: number): Promise<WebhookDelivery[]>;
  getPendingWebhookDeliveries(limit?: number): Promise<WebhookDelivery[]>;
  updateWebhookDelivery(id: string, data: Partial<Pick<WebhookDelivery, "status" | "responseCode" | "responseBody" | "durationMs" | "attempts" | "nextRetryAt" | "completedAt">>): Promise<void>;

  getStatusPageByTenant(tenantId: string): Promise<StatusPage | undefined>;
  getStatusPageBySlug(slug: string): Promise<StatusPage | undefined>;
  upsertStatusPage(tenantId: string, data: Partial<Pick<StatusPage, "publicSlug" | "isPublic" | "title" | "description">>): Promise<StatusPage>;

  createStatusComponent(data: InsertStatusComponent): Promise<StatusComponent>;
  getStatusComponentsByTenant(tenantId: string): Promise<StatusComponent[]>;
  getStatusComponentById(tenantId: string, id: string): Promise<StatusComponent | undefined>;
  updateStatusComponent(tenantId: string, id: string, data: Partial<Pick<StatusComponent, "name" | "description" | "status" | "displayOrder">>): Promise<StatusComponent | undefined>;
  deleteStatusComponent(tenantId: string, id: string): Promise<void>;

  createStatusIncident(data: InsertStatusIncident): Promise<StatusIncident>;
  getStatusIncidentsByTenant(tenantId: string): Promise<StatusIncident[]>;
  getStatusIncidentById(tenantId: string, id: string): Promise<StatusIncident | undefined>;
  updateStatusIncident(tenantId: string, id: string, data: Partial<Pick<StatusIncident, "title" | "description" | "severity" | "status" | "resolvedAt">>): Promise<StatusIncident | undefined>;
  deleteStatusIncident(tenantId: string, id: string): Promise<void>;
  getActiveIncidentsByTenant(tenantId: string): Promise<StatusIncident[]>;
  getRecentResolvedIncidents(tenantId: string, limit?: number): Promise<StatusIncident[]>;

  createReportJob(data: InsertReportJob): Promise<ReportJob>;
  updateReportJobStatus(id: string, tenantId: string, status: string, updates?: { outputPath?: string; errorMessage?: string }): Promise<ReportJob | undefined>;
  getReportJob(tenantId: string, id: string): Promise<ReportJob | undefined>;
  listReportJobs(tenantId: string): Promise<ReportJob[]>;

  createApiToken(data: { tenantId: string; name: string; scopes: string[]; tokenHash: string }): Promise<ApiToken>;
  listApiTokens(tenantId: string): Promise<ApiToken[]>;
  revokeApiToken(tenantId: string, id: string): Promise<void>;
  validateApiToken(tokenHash: string): Promise<{ tenantId: string; tokenId: string; scopes: string[] } | null>;
  updateApiTokenLastUsed(id: string): Promise<void>;

  getAllSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  getSubscriptionPlanByCode(code: string): Promise<SubscriptionPlan | undefined>;
  upsertSubscriptionPlan(data: InsertSubscriptionPlan): Promise<SubscriptionPlan>;

  getTenantSubscription(tenantId: string): Promise<TenantSubscription | undefined>;
  upsertTenantSubscription(data: InsertTenantSubscription): Promise<TenantSubscription>;
  updateTenantSubscription(tenantId: string, data: Partial<Omit<TenantSubscription, "id" | "tenantId" | "createdAt">>): Promise<TenantSubscription | undefined>;
  getTenantSubscriptionByStripeCustomerId(stripeCustomerId: string): Promise<TenantSubscription | undefined>;
  getTenantSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<TenantSubscription | undefined>;

  getOrCreateUsageCounter(tenantId: string, monthKey: string): Promise<UsageCounter>;
  incrementUsageCounter(tenantId: string, monthKey: string, field: "reportsGenerated" | "webhookDeliveries", amount?: number): Promise<void>;
  incrementEvidenceBytes(tenantId: string, monthKey: string, bytes: number): Promise<void>;
  getWebhookEndpointCountByTenant(tenantId: string): Promise<number>;
  getMemberCountByTenant(tenantId: string): Promise<number>;

  getUserById(userId: string): Promise<any>;
  setSystemAdmin(userId: string, isAdmin: boolean): Promise<void>;
  isUserSystemAdmin(userId: string): Promise<boolean>;
  getAllTenants(): Promise<Array<Tenant & { memberCount: number; subscription?: TenantSubscription | null }>>;
  getAllUsers(): Promise<any[]>;
  deleteTenant(tenantId: string): Promise<void>;
  getPausedTenantsExpiredGrace(graceDays: number): Promise<TenantSubscription[]>;

  // Tickets
  getNextTicketNumber(tenantId: string): Promise<number>;
  createTicket(data: InsertTicket): Promise<Ticket>;
  getTicketsByTenant(tenantId: string, filters?: TicketFilters): Promise<any[]>;
  getTicketById(tenantId: string, id: string): Promise<any>;
  updateTicket(tenantId: string, id: string, data: Partial<Omit<Ticket, "id" | "tenantId" | "createdAt">>): Promise<Ticket | undefined>;
  deleteTicket(tenantId: string, id: string): Promise<void>;
  deleteTickets(tenantId: string, ids: string[]): Promise<number>;

  // Ticket Comments
  createTicketComment(data: InsertTicketComment): Promise<TicketComment>;
  getCommentsByTicket(tenantId: string, ticketId: string): Promise<any[]>;
  updateTicketComment(tenantId: string, id: string, data: { content?: string; isInternal?: boolean }): Promise<TicketComment | undefined>;
  deleteTicketComment(tenantId: string, id: string): Promise<void>;

  // SLA Profiles
  createSlaProfile(data: InsertSlaProfile): Promise<SlaProfile>;
  getSlaProfilesByTenant(tenantId: string): Promise<SlaProfile[]>;
  getSlaProfileById(tenantId: string, id: string): Promise<SlaProfile | undefined>;
  updateSlaProfile(tenantId: string, id: string, data: Partial<Omit<SlaProfile, "id" | "tenantId" | "createdAt">>): Promise<SlaProfile | undefined>;
  deleteSlaProfile(tenantId: string, id: string): Promise<void>;
  getDefaultSlaProfile(tenantId: string): Promise<SlaProfile | undefined>;

  createAppointment(data: InsertAppointment): Promise<Appointment>;
  getAppointmentsByTenant(tenantId: string, filters?: { startDate?: string; endDate?: string; assignedToId?: string }): Promise<any[]>;
  getAppointmentById(tenantId: string, id: string): Promise<any>;
  updateAppointment(tenantId: string, id: string, data: Partial<Omit<Appointment, "id" | "tenantId" | "createdAt">>): Promise<Appointment | undefined>;
  deleteAppointment(tenantId: string, id: string): Promise<void>;

  createTimeEntry(data: InsertTimeEntry): Promise<TimeEntry>;
  getTimeEntriesByTenant(tenantId: string, filters?: { ticketId?: string; clientId?: string; userId?: string; startDate?: string; endDate?: string; billable?: boolean; uninvoiced?: boolean }): Promise<any[]>;
  getTimeEntryById(tenantId: string, id: string): Promise<TimeEntry | undefined>;
  updateTimeEntry(tenantId: string, id: string, data: Partial<Omit<TimeEntry, "id" | "tenantId" | "createdAt">>): Promise<TimeEntry | undefined>;
  deleteTimeEntry(tenantId: string, id: string): Promise<void>;

  getBillingConfig(tenantId: string): Promise<BillingConfig | undefined>;
  upsertBillingConfig(tenantId: string, data: Partial<InsertBillingConfig>): Promise<BillingConfig>;

  createInvoice(data: InsertInvoice): Promise<Invoice>;
  getInvoicesByTenant(tenantId: string, filters?: { status?: string; clientId?: string }): Promise<any[]>;
  getInvoiceById(tenantId: string, id: string): Promise<any>;
  getInvoiceByPublicToken(token: string): Promise<any>;
  updateInvoice(tenantId: string, id: string, data: Partial<Omit<Invoice, "id" | "tenantId" | "createdAt">>): Promise<Invoice | undefined>;
  deleteInvoice(tenantId: string, id: string): Promise<void>;
  getNextInvoiceNumber(tenantId: string): Promise<string>;

  createInvoiceLineItem(data: InsertInvoiceLineItem): Promise<InvoiceLineItem>;
  getLineItemsByInvoice(tenantId: string, invoiceId: string): Promise<InvoiceLineItem[]>;
  updateInvoiceLineItem(tenantId: string, id: string, data: Partial<Omit<InvoiceLineItem, "id" | "tenantId" | "createdAt">>): Promise<InvoiceLineItem | undefined>;
  deleteInvoiceLineItem(tenantId: string, id: string): Promise<void>;
  recalculateInvoiceTotals(tenantId: string, invoiceId: string): Promise<Invoice | undefined>;

  createKbArticle(data: InsertKbArticle): Promise<KbArticle>;
  getKbArticlesByTenant(tenantId: string, filters?: { category?: string; isPublished?: boolean; query?: string }): Promise<any[]>;
  getKbArticleById(tenantId: string, id: string): Promise<any>;
  getKbArticleBySlug(tenantId: string, slug: string): Promise<any>;
  updateKbArticle(tenantId: string, id: string, data: Partial<Omit<KbArticle, "id" | "tenantId" | "createdAt">>): Promise<KbArticle | undefined>;
  deleteKbArticle(tenantId: string, id: string): Promise<void>;

  createRecurringTemplate(data: InsertRecurringTicketTemplate): Promise<RecurringTicketTemplate>;
  getRecurringTemplatesByTenant(tenantId: string): Promise<any[]>;
  getRecurringTemplateById(tenantId: string, id: string): Promise<RecurringTicketTemplate | undefined>;
  updateRecurringTemplate(tenantId: string, id: string, data: Partial<Omit<RecurringTicketTemplate, "id" | "tenantId" | "createdAt">>): Promise<RecurringTicketTemplate | undefined>;
  deleteRecurringTemplate(tenantId: string, id: string): Promise<void>;
  getDueRecurringTemplates(): Promise<RecurringTicketTemplate[]>;

  createIntakeSpace(data: InsertIntakeSpace): Promise<IntakeSpace>;
  getIntakeSpacesByTenant(tenantId: string): Promise<IntakeSpace[]>;
  getIntakeSpaceById(tenantId: string, id: string): Promise<IntakeSpace | undefined>;
  getIntakeSpaceBySlug(tenantId: string, slug: string): Promise<IntakeSpace | undefined>;
  updateIntakeSpace(tenantId: string, id: string, data: Partial<Omit<IntakeSpace, "id" | "tenantId" | "createdAt">>): Promise<IntakeSpace | undefined>;
  deleteIntakeSpace(tenantId: string, id: string): Promise<void>;
  getIntakeSpaceCount(tenantId: string): Promise<number>;

  createUploadRequest(data: InsertUploadRequest): Promise<UploadRequest>;
  getUploadRequestsByTenant(tenantId: string, filters?: { spaceId?: string; status?: string }): Promise<UploadRequest[]>;
  getUploadRequestById(tenantId: string, id: string): Promise<UploadRequest | undefined>;
  getUploadRequestByToken(token: string): Promise<(UploadRequest & { tenantSlug: string; spaceName: string }) | undefined>;
  updateUploadRequest(tenantId: string, id: string, data: Partial<Omit<UploadRequest, "id" | "tenantId" | "createdAt">>): Promise<UploadRequest | undefined>;
  revokeUploadRequest(tenantId: string, id: string): Promise<void>;
  incrementUploadRequestCount(id: string, fileSize: number): Promise<void>;
  getActiveUploadRequestCount(tenantId: string): Promise<number>;

  createIntakeFile(data: InsertIntakeFile): Promise<IntakeFile>;
  getIntakeFilesByTenant(tenantId: string, filters?: { spaceId?: string; status?: string; uploadRequestId?: string; query?: string }): Promise<IntakeFile[]>;
  getIntakeFileById(tenantId: string, id: string): Promise<IntakeFile | undefined>;
  updateIntakeFile(tenantId: string, id: string, data: Partial<Omit<IntakeFile, "id" | "tenantId" | "createdAt">>): Promise<IntakeFile | undefined>;
  deleteIntakeFile(tenantId: string, id: string): Promise<void>;
  getIntakeStorageUsed(tenantId: string): Promise<number>;

  createIntakeAuditEvent(data: InsertIntakeAuditEvent): Promise<IntakeAuditEvent>;
  getIntakeAuditEvents(tenantId: string, filters?: { action?: string; objectType?: string; dateFrom?: string; dateTo?: string }): Promise<IntakeAuditEvent[]>;

  getIntakePolicy(tenantId: string): Promise<IntakePolicy | undefined>;
  upsertIntakePolicy(tenantId: string, data: Partial<Omit<IntakePolicy, "id" | "tenantId" | "createdAt">>): Promise<IntakePolicy>;

  getIntakeDashboardStats(tenantId: string): Promise<{
    totalFiles: number;
    totalSpaces: number;
    activeRequests: number;
    expiredRequests: number;
    storageUsedBytes: number;
    recentFiles: IntakeFile[];
    recentAudit: IntakeAuditEvent[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async createTenant(data: InsertTenant): Promise<Tenant> {
    const [tenant] = await db.insert(tenants).values(data).returning();
    return tenant;
  }

  async getTenantById(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return tenant;
  }

  async addMember(tenantId: string, userId: string, role: string): Promise<TenantMember> {
    const [member] = await db
      .insert(tenantMembers)
      .values({ tenantId, userId, role: role as any })
      .returning();
    return member;
  }

  async getMembersByTenant(tenantId: string): Promise<any[]> {
    const result = await db
      .select({
        id: tenantMembers.id,
        tenantId: tenantMembers.tenantId,
        userId: tenantMembers.userId,
        role: tenantMembers.role,
        createdAt: tenantMembers.createdAt,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        },
      })
      .from(tenantMembers)
      .leftJoin(users, eq(tenantMembers.userId, users.id))
      .where(eq(tenantMembers.tenantId, tenantId));
    return result;
  }

  async getUserMembership(userId: string): Promise<{ tenant: Tenant; role: string } | undefined> {
    const result = await db
      .select({
        tenant: tenants,
        role: tenantMembers.role,
      })
      .from(tenantMembers)
      .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
      .where(eq(tenantMembers.userId, userId))
      .limit(1);

    if (result.length === 0) return undefined;
    return { tenant: result[0].tenant, role: result[0].role };
  }

  async getMemberRole(tenantId: string, userId: string): Promise<string | undefined> {
    const [member] = await db
      .select({ role: tenantMembers.role })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.userId, userId)
        )
      );
    return member?.role;
  }

  async updateMemberRole(tenantId: string, memberId: string, role: string): Promise<void> {
    await db
      .update(tenantMembers)
      .set({ role: role as any })
      .where(and(eq(tenantMembers.id, memberId), eq(tenantMembers.tenantId, tenantId)));
  }

  async createClient(data: InsertClient): Promise<Client> {
    const [client] = await db.insert(clients).values(data).returning();
    return client;
  }

  async getClientsByTenant(tenantId: string): Promise<Client[]> {
    return db
      .select()
      .from(clients)
      .where(eq(clients.tenantId, tenantId))
      .orderBy(desc(clients.createdAt));
  }

  async getClientById(tenantId: string, id: string): Promise<Client | undefined> {
    const [client] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.id, id)));
    return client;
  }

  async getClientDetail(tenantId: string, id: string): Promise<any> {
    const client = await this.getClientById(tenantId, id);
    if (!client) return undefined;

    const clientSites = await db
      .select()
      .from(sites)
      .where(and(eq(sites.tenantId, tenantId), eq(sites.clientId, id)));

    const clientAssets = await db
      .select()
      .from(assets)
      .where(and(eq(assets.tenantId, tenantId), eq(assets.clientId, id)));

    const clientEvidence = await db
      .select()
      .from(evidenceItems)
      .where(and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.clientId, id)))
      .orderBy(desc(evidenceItems.createdAt));

    return {
      ...client,
      sites: clientSites,
      assets: clientAssets,
      evidenceItems: clientEvidence,
    };
  }

  async deleteClient(tenantId: string, id: string): Promise<void> {
    await db
      .delete(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.id, id)));
  }

  async deleteClients(tenantId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .delete(clients)
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, ids)))
      .returning({ id: clients.id });
    return result.length;
  }

  async createSite(data: InsertSite): Promise<Site> {
    const [site] = await db.insert(sites).values(data).returning();
    return site;
  }

  async getSitesByTenant(tenantId: string): Promise<Site[]> {
    return db
      .select()
      .from(sites)
      .where(eq(sites.tenantId, tenantId))
      .orderBy(desc(sites.createdAt));
  }

  async deleteSite(tenantId: string, id: string): Promise<void> {
    await db
      .delete(sites)
      .where(and(eq(sites.tenantId, tenantId), eq(sites.id, id)));
  }

  async deleteSites(tenantId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .delete(sites)
      .where(and(eq(sites.tenantId, tenantId), inArray(sites.id, ids)))
      .returning({ id: sites.id });
    return result.length;
  }

  async createAsset(data: InsertAsset): Promise<Asset> {
    const [asset] = await db.insert(assets).values(data).returning();
    return asset;
  }

  async getAssetsByTenant(tenantId: string): Promise<Asset[]> {
    return db
      .select()
      .from(assets)
      .where(eq(assets.tenantId, tenantId))
      .orderBy(desc(assets.createdAt));
  }

  async getAssetById(tenantId: string, id: string): Promise<Asset | undefined> {
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.tenantId, tenantId), eq(assets.id, id)));
    return asset;
  }

  async deleteAsset(tenantId: string, id: string): Promise<void> {
    await db
      .delete(assets)
      .where(and(eq(assets.tenantId, tenantId), eq(assets.id, id)));
  }

  async deleteAssets(tenantId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .delete(assets)
      .where(and(eq(assets.tenantId, tenantId), inArray(assets.id, ids)))
      .returning({ id: assets.id });
    return result.length;
  }

  async createEvidence(data: InsertEvidence): Promise<EvidenceItem> {
    const [item] = await db.insert(evidenceItems).values(data).returning();
    return item;
  }

  async searchEvidence(tenantId: string, filters: SearchFilters): Promise<any[]> {
    let conditions: any[] = [eq(evidenceItems.tenantId, tenantId)];

    if (filters.clientId) {
      conditions.push(eq(evidenceItems.clientId, filters.clientId));
    }

    if (filters.assetId) {
      conditions.push(eq(evidenceItems.assetId, filters.assetId));
    }

    if (filters.uploadedBy) {
      conditions.push(eq(evidenceItems.uploadedById, filters.uploadedBy));
    }

    if (filters.dateFrom) {
      conditions.push(gte(evidenceItems.createdAt, new Date(filters.dateFrom)));
    }

    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(evidenceItems.createdAt, endDate));
    }

    if (filters.query) {
      const searchTerm = filters.query.trim();
      const tsQuery = searchTerm.split(/\s+/).filter(Boolean).join(" & ");
      conditions.push(
        sql`(
          to_tsvector('english', coalesce(${evidenceItems.title}, '') || ' ' || coalesce(${evidenceItems.notes}, '') || ' ' || coalesce(${evidenceItems.fileName}, ''))
          @@ to_tsquery('english', ${tsQuery + ":*"})
          OR ${evidenceItems.title} ILIKE ${"%" + searchTerm + "%"}
          OR ${evidenceItems.notes} ILIKE ${"%" + searchTerm + "%"}
          OR ${evidenceItems.fileName} ILIKE ${"%" + searchTerm + "%"}
          OR ${clients.name} ILIKE ${"%" + searchTerm + "%"}
          OR ${assets.name} ILIKE ${"%" + searchTerm + "%"}
          OR ${sites.name} ILIKE ${"%" + searchTerm + "%"}
        )`
      );
    }

    let results = await db
      .select({
        id: evidenceItems.id,
        tenantId: evidenceItems.tenantId,
        clientId: evidenceItems.clientId,
        siteId: evidenceItems.siteId,
        assetId: evidenceItems.assetId,
        title: evidenceItems.title,
        notes: evidenceItems.notes,
        fileName: evidenceItems.fileName,
        fileType: evidenceItems.fileType,
        fileSize: evidenceItems.fileSize,
        filePath: evidenceItems.filePath,
        sha256: evidenceItems.sha256,
        tagIds: evidenceItems.tagIds,
        uploadedById: evidenceItems.uploadedById,
        createdAt: evidenceItems.createdAt,
        clientName: clients.name,
        assetName: assets.name,
        siteName: sites.name,
      })
      .from(evidenceItems)
      .leftJoin(clients, eq(evidenceItems.clientId, clients.id))
      .leftJoin(assets, eq(evidenceItems.assetId, assets.id))
      .leftJoin(sites, eq(evidenceItems.siteId, sites.id))
      .where(and(...conditions))
      .orderBy(desc(evidenceItems.createdAt));

    if (filters.tag) {
      const tagRecord = await this.getTagByName(tenantId, filters.tag);
      if (tagRecord) {
        results = results.filter(
          (r) => r.tagIds && r.tagIds.includes(tagRecord.id)
        );
      } else {
        return [];
      }
    }

    return results;
  }

  async getEvidenceById(tenantId: string, id: string): Promise<any> {
    const [result] = await db
      .select({
        id: evidenceItems.id,
        tenantId: evidenceItems.tenantId,
        clientId: evidenceItems.clientId,
        siteId: evidenceItems.siteId,
        assetId: evidenceItems.assetId,
        title: evidenceItems.title,
        notes: evidenceItems.notes,
        fileName: evidenceItems.fileName,
        fileType: evidenceItems.fileType,
        fileSize: evidenceItems.fileSize,
        filePath: evidenceItems.filePath,
        sha256: evidenceItems.sha256,
        tagIds: evidenceItems.tagIds,
        uploadedById: evidenceItems.uploadedById,
        createdAt: evidenceItems.createdAt,
        clientName: clients.name,
        assetName: assets.name,
        siteName: sites.name,
        uploadedByFirstName: users.firstName,
        uploadedByLastName: users.lastName,
      })
      .from(evidenceItems)
      .leftJoin(clients, eq(evidenceItems.clientId, clients.id))
      .leftJoin(assets, eq(evidenceItems.assetId, assets.id))
      .leftJoin(sites, eq(evidenceItems.siteId, sites.id))
      .leftJoin(users, eq(evidenceItems.uploadedById, users.id))
      .where(and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.id, id)));

    if (!result) return undefined;

    let tagNames: string[] = [];
    if (result.tagIds && result.tagIds.length > 0) {
      const tagRecords = await this.getTagsByIds(result.tagIds);
      tagNames = tagRecords.map((t) => t.name);
    }

    return {
      ...result,
      uploadedByName: [result.uploadedByFirstName, result.uploadedByLastName]
        .filter(Boolean)
        .join(" ") || undefined,
      tagNames,
    };
  }

  async getEvidenceBySha256(tenantId: string, sha256: string): Promise<EvidenceItem | undefined> {
    const [result] = await db
      .select()
      .from(evidenceItems)
      .where(and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.sha256, sha256)));
    return result;
  }

  async deleteEvidence(tenantId: string, id: string): Promise<void> {
    await db
      .delete(evidenceItems)
      .where(and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.id, id)));
  }

  async getRecentEvidence(tenantId: string, limit = 5): Promise<any[]> {
    return db
      .select({
        id: evidenceItems.id,
        tenantId: evidenceItems.tenantId,
        clientId: evidenceItems.clientId,
        title: evidenceItems.title,
        fileName: evidenceItems.fileName,
        fileType: evidenceItems.fileType,
        fileSize: evidenceItems.fileSize,
        filePath: evidenceItems.filePath,
        createdAt: evidenceItems.createdAt,
        clientName: clients.name,
      })
      .from(evidenceItems)
      .leftJoin(clients, eq(evidenceItems.clientId, clients.id))
      .where(eq(evidenceItems.tenantId, tenantId))
      .orderBy(desc(evidenceItems.createdAt))
      .limit(limit);
  }

  async getEvidenceByClient(tenantId: string, clientId: string): Promise<EvidenceItem[]> {
    return db
      .select()
      .from(evidenceItems)
      .where(
        and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.clientId, clientId))
      )
      .orderBy(desc(evidenceItems.createdAt));
  }

  async createTag(data: InsertTag): Promise<Tag> {
    const [tag] = await db.insert(tags).values(data).returning();
    return tag;
  }

  async getTagsByTenant(tenantId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.tenantId, tenantId));
  }

  async getTagByName(tenantId: string, name: string): Promise<Tag | undefined> {
    const [tag] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.tenantId, tenantId), eq(tags.name, name)));
    return tag;
  }

  async getTagsByIds(ids: string[]): Promise<Tag[]> {
    if (ids.length === 0) return [];
    return db.select().from(tags).where(inArray(tags.id, ids));
  }

  async createAuditLog(data: {
    tenantId: string;
    userId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: any;
  }): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(data).returning();
    return log;
  }

  async getAuditLogsByTenant(tenantId: string, filters?: AuditFilters): Promise<any[]> {
    const conditions = [eq(auditLogs.tenantId, tenantId)];

    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }
    if (filters?.entityType) {
      conditions.push(eq(auditLogs.entityType, filters.entityType));
    }
    if (filters?.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }
    if (filters?.dateFrom) {
      conditions.push(gte(auditLogs.createdAt, new Date(filters.dateFrom)));
    }
    if (filters?.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setDate(endDate.getDate() + 1);
      conditions.push(lte(auditLogs.createdAt, endDate));
    }

    const result = await db
      .select({
        id: auditLogs.id,
        tenantId: auditLogs.tenantId,
        userId: auditLogs.userId,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(200);

    return result.map((r) => ({
      ...r,
      userName: [r.userFirstName, r.userLastName].filter(Boolean).join(" ") || undefined,
    }));
  }

  async getAuditActionTypes(tenantId: string): Promise<string[]> {
    const result = await db
      .selectDistinct({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(auditLogs.action);
    return result.map((r) => r.action);
  }

  async getDashboardStats(tenantId: string) {
    const tenant = await this.getTenantById(tenantId);

    const [clientCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.tenantId, tenantId));

    const [siteCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sites)
      .where(eq(sites.tenantId, tenantId));

    const [assetCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assets)
      .where(eq(assets.tenantId, tenantId));

    const [evidenceCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(evidenceItems)
      .where(eq(evidenceItems.tenantId, tenantId));

    const recentEvidence = await this.getRecentEvidence(tenantId, 5);

    const [openTicketCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), inArray(tickets.status, ["open", "in_progress"])));

    const [overdueTicketCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(
        eq(tickets.tenantId, tenantId),
        inArray(tickets.status, ["open", "in_progress"]),
        lte(tickets.resolutionDeadline, new Date())
      ));

    const [upcomingApptCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(appointments)
      .where(and(eq(appointments.tenantId, tenantId), gte(appointments.startTime, new Date())));

    const [unpaidInvoiceSum] = await db
      .select({ total: sql<number>`coalesce(sum(total_cents - amount_paid_cents), 0)::int` })
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), inArray(invoices.status, ["sent", "viewed", "overdue", "partial"])));

    const [unbilledMinutesSum] = await db
      .select({ total: sql<number>`coalesce(sum(minutes), 0)::int` })
      .from(timeEntries)
      .where(and(eq(timeEntries.tenantId, tenantId), eq(timeEntries.billable, true), sql`${timeEntries.invoiceId} IS NULL`));

    return {
      totalClients: clientCount.count,
      totalAssets: assetCount.count,
      totalEvidence: evidenceCount.count,
      totalSites: siteCount.count,
      // Legacy compatibility fields only. OperatorOS entitlement snapshots
      // own enforceable limits.
      maxClients: tenant?.maxClients || 5,
      maxEvidence: tenant?.maxEvidence || 50,
      recentEvidence,
      openTickets: openTicketCount.count,
      overdueTickets: overdueTicketCount.count,
      upcomingAppointments: upcomingApptCount.count,
      unpaidInvoiceCents: unpaidInvoiceSum.total,
      unbilledMinutes: unbilledMinutesSum.total,
    };
  }

  async getClientIdsForUser(userId: string): Promise<string[]> {
    const assignments = await db
      .select({ clientId: clientUserAssignments.clientId })
      .from(clientUserAssignments)
      .where(eq(clientUserAssignments.userId, userId));
    return assignments.map((a) => a.clientId);
  }

  async getClientAccessForUser(userId: string): Promise<Array<{ clientId: string; canUpload: boolean }>> {
    return db
      .select({
        clientId: clientUserAssignments.clientId,
        canUpload: clientUserAssignments.canUpload,
      })
      .from(clientUserAssignments)
      .where(eq(clientUserAssignments.userId, userId));
  }

  async getClientAccessByTenant(tenantId: string): Promise<any[]> {
    return db
      .select({
        id: clientUserAssignments.id,
        tenantId: clientUserAssignments.tenantId,
        clientId: clientUserAssignments.clientId,
        userId: clientUserAssignments.userId,
        canUpload: clientUserAssignments.canUpload,
        createdAt: clientUserAssignments.createdAt,
        clientName: clients.name,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(clientUserAssignments)
      .leftJoin(clients, eq(clientUserAssignments.clientId, clients.id))
      .leftJoin(users, eq(clientUserAssignments.userId, users.id))
      .where(eq(clientUserAssignments.tenantId, tenantId))
      .orderBy(desc(clientUserAssignments.createdAt));
  }

  async addClientAccess(tenantId: string, userId: string, clientId: string, canUpload = false): Promise<ClientUserAccess> {
    const [access] = await db
      .insert(clientUserAssignments)
      .values({ tenantId, userId, clientId, canUpload })
      .returning();
    return access;
  }

  async removeClientAccess(tenantId: string, id: string): Promise<void> {
    await db
      .delete(clientUserAssignments)
      .where(and(eq(clientUserAssignments.tenantId, tenantId), eq(clientUserAssignments.id, id)));
  }

  async updateClientAccessCanUpload(tenantId: string, id: string, canUpload: boolean): Promise<void> {
    await db
      .update(clientUserAssignments)
      .set({ canUpload })
      .where(and(eq(clientUserAssignments.tenantId, tenantId), eq(clientUserAssignments.id, id)));
  }

  async canUserUploadForClient(userId: string, clientId: string): Promise<boolean> {
    const [access] = await db
      .select({ canUpload: clientUserAssignments.canUpload })
      .from(clientUserAssignments)
      .where(
        and(
          eq(clientUserAssignments.userId, userId),
          eq(clientUserAssignments.clientId, clientId)
        )
      );
    return access?.canUpload ?? false;
  }

  async createLicenseProduct(data: InsertLicenseProduct): Promise<LicenseProduct> {
    const [product] = await db.insert(licenseProducts).values(data).returning();
    return product;
  }

  async getLicenseProductsByTenant(tenantId: string): Promise<LicenseProduct[]> {
    return db
      .select()
      .from(licenseProducts)
      .where(eq(licenseProducts.tenantId, tenantId))
      .orderBy(desc(licenseProducts.createdAt));
  }

  async getLicenseProductById(tenantId: string, id: string): Promise<LicenseProduct | undefined> {
    const [product] = await db
      .select()
      .from(licenseProducts)
      .where(and(eq(licenseProducts.tenantId, tenantId), eq(licenseProducts.id, id)));
    return product;
  }

  async getLicenseProductBySlug(tenantId: string, slug: string): Promise<LicenseProduct | undefined> {
    const [product] = await db
      .select()
      .from(licenseProducts)
      .where(and(eq(licenseProducts.tenantId, tenantId), eq(licenseProducts.slug, slug)));
    return product;
  }

  async updateLicenseProduct(tenantId: string, id: string, data: Partial<Pick<LicenseProduct, "name" | "slug" | "description" | "isActive">>): Promise<LicenseProduct | undefined> {
    const [product] = await db
      .update(licenseProducts)
      .set(data)
      .where(and(eq(licenseProducts.tenantId, tenantId), eq(licenseProducts.id, id)))
      .returning();
    return product;
  }

  async createLicenseKey(data: InsertLicenseKey): Promise<LicenseKey> {
    const [key] = await db.insert(licenseKeys).values(data).returning();
    return key;
  }

  async getLicenseKeysByProduct(tenantId: string, productId: string): Promise<LicenseKey[]> {
    return db
      .select()
      .from(licenseKeys)
      .where(and(eq(licenseKeys.tenantId, tenantId), eq(licenseKeys.productId, productId)))
      .orderBy(desc(licenseKeys.createdAt));
  }

  async getLicenseKeyById(tenantId: string, id: string): Promise<LicenseKey | undefined> {
    const [key] = await db
      .select()
      .from(licenseKeys)
      .where(and(eq(licenseKeys.tenantId, tenantId), eq(licenseKeys.id, id)));
    return key;
  }

  async getLicenseKeyByHash(keyHash: string): Promise<(LicenseKey & { productSlug: string; productIsActive: boolean }) | undefined> {
    const [result] = await db
      .select({
        id: licenseKeys.id,
        tenantId: licenseKeys.tenantId,
        productId: licenseKeys.productId,
        keyHash: licenseKeys.keyHash,
        label: licenseKeys.label,
        maxActivations: licenseKeys.maxActivations,
        expiresAt: licenseKeys.expiresAt,
        isRevoked: licenseKeys.isRevoked,
        createdAt: licenseKeys.createdAt,
        productSlug: licenseProducts.slug,
        productIsActive: licenseProducts.isActive,
      })
      .from(licenseKeys)
      .innerJoin(licenseProducts, eq(licenseKeys.productId, licenseProducts.id))
      .where(eq(licenseKeys.keyHash, keyHash));
    return result;
  }

  async revokeLicenseKey(tenantId: string, id: string): Promise<void> {
    await db
      .update(licenseKeys)
      .set({ isRevoked: true })
      .where(and(eq(licenseKeys.tenantId, tenantId), eq(licenseKeys.id, id)));
  }

  async createLicenseActivation(data: InsertLicenseActivation): Promise<LicenseActivation> {
    const [activation] = await db.insert(licenseActivations).values(data).returning();
    return activation;
  }

  async getActivationsByKey(tenantId: string, licenseKeyId: string): Promise<LicenseActivation[]> {
    return db
      .select()
      .from(licenseActivations)
      .where(and(eq(licenseActivations.tenantId, tenantId), eq(licenseActivations.licenseKeyId, licenseKeyId)))
      .orderBy(desc(licenseActivations.createdAt));
  }

  async getActivationCountByKey(licenseKeyId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(licenseActivations)
      .where(eq(licenseActivations.licenseKeyId, licenseKeyId));
    return result.count;
  }

  async getActivationByFingerprint(licenseKeyId: string, deviceFingerprint: string): Promise<LicenseActivation | undefined> {
    const [result] = await db
      .select()
      .from(licenseActivations)
      .where(
        and(
          eq(licenseActivations.licenseKeyId, licenseKeyId),
          eq(licenseActivations.deviceFingerprint, deviceFingerprint)
        )
      );
    return result;
  }

  async createWebhookEndpoint(data: InsertWebhookEndpoint): Promise<WebhookEndpoint> {
    const [endpoint] = await db.insert(webhookEndpoints).values(data).returning();
    return endpoint;
  }

  async getWebhookEndpointsByTenant(tenantId: string): Promise<WebhookEndpoint[]> {
    return db.select().from(webhookEndpoints).where(eq(webhookEndpoints.tenantId, tenantId)).orderBy(desc(webhookEndpoints.createdAt));
  }

  async getWebhookEndpointById(tenantId: string, id: string): Promise<WebhookEndpoint | undefined> {
    const [endpoint] = await db.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.id, id)));
    return endpoint;
  }

  async updateWebhookEndpoint(tenantId: string, id: string, data: Partial<Pick<WebhookEndpoint, "url" | "enabled" | "eventTypes" | "description">>): Promise<WebhookEndpoint | undefined> {
    const [updated] = await db.update(webhookEndpoints).set(data).where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.id, id))).returning();
    return updated;
  }

  async deleteWebhookEndpoint(tenantId: string, id: string): Promise<void> {
    await db.delete(webhookEndpoints).where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.id, id)));
  }

  async getEnabledWebhooksForEvent(tenantId: string, eventType: string): Promise<WebhookEndpoint[]> {
    const endpoints = await db.select().from(webhookEndpoints).where(
      and(
        eq(webhookEndpoints.tenantId, tenantId),
        eq(webhookEndpoints.enabled, true)
      )
    );
    return endpoints.filter((ep) => {
      if (!ep.eventTypes || ep.eventTypes.length === 0) return true;
      return ep.eventTypes.includes(eventType) || ep.eventTypes.includes("*");
    });
  }

  async createWebhookDelivery(data: InsertWebhookDelivery): Promise<WebhookDelivery> {
    const [delivery] = await db.insert(webhookDeliveries).values(data).returning();
    return delivery;
  }

  async getWebhookDeliveriesByEndpoint(tenantId: string, endpointId: string, limit = 50): Promise<WebhookDelivery[]> {
    return db.select().from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.tenantId, tenantId), eq(webhookDeliveries.webhookEndpointId, endpointId)))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);
  }

  async getPendingWebhookDeliveries(limit = 20): Promise<WebhookDelivery[]> {
    return db.select().from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.status, "pending"),
          or(
            sql`${webhookDeliveries.nextRetryAt} IS NULL`,
            lte(webhookDeliveries.nextRetryAt, new Date())
          )
        )
      )
      .orderBy(webhookDeliveries.createdAt)
      .limit(limit);
  }

  async updateWebhookDelivery(id: string, data: Partial<Pick<WebhookDelivery, "status" | "responseCode" | "responseBody" | "durationMs" | "attempts" | "nextRetryAt" | "completedAt">>): Promise<void> {
    await db.update(webhookDeliveries).set(data).where(eq(webhookDeliveries.id, id));
  }

  async getStatusPageByTenant(tenantId: string): Promise<StatusPage | undefined> {
    const [page] = await db.select().from(statusPages).where(eq(statusPages.tenantId, tenantId));
    return page;
  }

  async getStatusPageBySlug(slug: string): Promise<StatusPage | undefined> {
    const [page] = await db.select().from(statusPages).where(eq(statusPages.publicSlug, slug));
    return page;
  }

  async upsertStatusPage(tenantId: string, data: Partial<Pick<StatusPage, "publicSlug" | "isPublic" | "title" | "description">>): Promise<StatusPage> {
    const existing = await this.getStatusPageByTenant(tenantId);
    if (existing) {
      const [updated] = await db.update(statusPages).set({ ...data, updatedAt: new Date() }).where(eq(statusPages.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(statusPages).values({
      tenantId,
      publicSlug: data.publicSlug || tenantId.slice(0, 8),
      isPublic: data.isPublic ?? false,
      title: data.title || "Status Page",
      description: data.description,
    }).returning();
    return created;
  }

  async createStatusComponent(data: InsertStatusComponent): Promise<StatusComponent> {
    const [component] = await db.insert(statusComponents).values(data).returning();
    return component;
  }

  async getStatusComponentsByTenant(tenantId: string): Promise<StatusComponent[]> {
    return db.select().from(statusComponents).where(eq(statusComponents.tenantId, tenantId)).orderBy(statusComponents.displayOrder);
  }

  async getStatusComponentById(tenantId: string, id: string): Promise<StatusComponent | undefined> {
    const [component] = await db.select().from(statusComponents).where(and(eq(statusComponents.tenantId, tenantId), eq(statusComponents.id, id)));
    return component;
  }

  async updateStatusComponent(tenantId: string, id: string, data: Partial<Pick<StatusComponent, "name" | "description" | "status" | "displayOrder">>): Promise<StatusComponent | undefined> {
    const [updated] = await db.update(statusComponents).set({ ...data, updatedAt: new Date() }).where(and(eq(statusComponents.tenantId, tenantId), eq(statusComponents.id, id))).returning();
    return updated;
  }

  async deleteStatusComponent(tenantId: string, id: string): Promise<void> {
    await db.delete(statusComponents).where(and(eq(statusComponents.tenantId, tenantId), eq(statusComponents.id, id)));
  }

  async createStatusIncident(data: InsertStatusIncident): Promise<StatusIncident> {
    const [incident] = await db.insert(statusIncidents).values(data).returning();
    return incident;
  }

  async getStatusIncidentsByTenant(tenantId: string): Promise<StatusIncident[]> {
    return db.select().from(statusIncidents).where(eq(statusIncidents.tenantId, tenantId)).orderBy(desc(statusIncidents.createdAt));
  }

  async getStatusIncidentById(tenantId: string, id: string): Promise<StatusIncident | undefined> {
    const [incident] = await db.select().from(statusIncidents).where(and(eq(statusIncidents.tenantId, tenantId), eq(statusIncidents.id, id)));
    return incident;
  }

  async updateStatusIncident(tenantId: string, id: string, data: Partial<Pick<StatusIncident, "title" | "description" | "severity" | "status" | "resolvedAt">>): Promise<StatusIncident | undefined> {
    const [updated] = await db.update(statusIncidents).set({ ...data, updatedAt: new Date() }).where(and(eq(statusIncidents.tenantId, tenantId), eq(statusIncidents.id, id))).returning();
    return updated;
  }

  async deleteStatusIncident(tenantId: string, id: string): Promise<void> {
    await db.delete(statusIncidents).where(and(eq(statusIncidents.tenantId, tenantId), eq(statusIncidents.id, id)));
  }

  async getActiveIncidentsByTenant(tenantId: string): Promise<StatusIncident[]> {
    return db.select().from(statusIncidents).where(
      and(
        eq(statusIncidents.tenantId, tenantId),
        sql`${statusIncidents.status} != 'resolved'`
      )
    ).orderBy(desc(statusIncidents.createdAt));
  }

  async getRecentResolvedIncidents(tenantId: string, limit = 10): Promise<StatusIncident[]> {
    return db.select().from(statusIncidents).where(
      and(
        eq(statusIncidents.tenantId, tenantId),
        sql`${statusIncidents.status} = 'resolved'`
      )
    ).orderBy(desc(statusIncidents.resolvedAt)).limit(limit);
  }
  async createReportJob(data: InsertReportJob): Promise<ReportJob> {
    const [job] = await db.insert(reportJobs).values(data).returning();
    return job;
  }

  async updateReportJobStatus(id: string, tenantId: string, status: string, updates?: { outputPath?: string; errorMessage?: string }): Promise<ReportJob | undefined> {
    const [updated] = await db.update(reportJobs).set({
      status: status as any,
      updatedAt: new Date(),
      ...(updates?.outputPath !== undefined ? { outputPath: updates.outputPath } : {}),
      ...(updates?.errorMessage !== undefined ? { errorMessage: updates.errorMessage } : {}),
    }).where(and(eq(reportJobs.id, id), eq(reportJobs.tenantId, tenantId))).returning();
    return updated;
  }

  async getReportJob(tenantId: string, id: string): Promise<ReportJob | undefined> {
    const [job] = await db.select().from(reportJobs).where(and(eq(reportJobs.tenantId, tenantId), eq(reportJobs.id, id)));
    return job;
  }

  async listReportJobs(tenantId: string): Promise<ReportJob[]> {
    return db.select().from(reportJobs).where(eq(reportJobs.tenantId, tenantId)).orderBy(desc(reportJobs.createdAt));
  }

  async createApiToken(data: { tenantId: string; name: string; scopes: string[]; tokenHash: string }): Promise<ApiToken> {
    const [token] = await db.insert(apiTokens).values(data).returning();
    return token;
  }

  async listApiTokens(tenantId: string): Promise<ApiToken[]> {
    return db.select().from(apiTokens).where(eq(apiTokens.tenantId, tenantId)).orderBy(desc(apiTokens.createdAt));
  }

  async revokeApiToken(tenantId: string, id: string): Promise<void> {
    await db.update(apiTokens).set({ enabled: false, updatedAt: new Date() }).where(and(eq(apiTokens.id, id), eq(apiTokens.tenantId, tenantId)));
  }

  async validateApiToken(tokenHash: string): Promise<{ tenantId: string; tokenId: string; scopes: string[] } | null> {
    const [token] = await db.select().from(apiTokens).where(and(eq(apiTokens.tokenHash, tokenHash), eq(apiTokens.enabled, true)));
    if (!token) return null;
    return { tenantId: token.tenantId, tokenId: token.id, scopes: token.scopes };
  }

  async updateApiTokenLastUsed(id: string): Promise<void> {
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, id));
  }

  async getAllSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return db.select().from(subscriptionPlans).orderBy(subscriptionPlans.monthlyPriceCents);
  }

  async getSubscriptionPlanByCode(code: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, code));
    return plan;
  }

  async upsertSubscriptionPlan(data: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    const [plan] = await db
      .insert(subscriptionPlans)
      .values(data)
      .onConflictDoUpdate({
        target: subscriptionPlans.code,
        set: { name: data.name, monthlyPriceCents: data.monthlyPriceCents, limits: data.limits, updatedAt: new Date() },
      })
      .returning();
    return plan;
  }

  async getTenantSubscription(tenantId: string): Promise<TenantSubscription | undefined> {
    const [sub] = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId));
    return sub;
  }

  async upsertTenantSubscription(data: InsertTenantSubscription): Promise<TenantSubscription> {
    const [sub] = await db
      .insert(tenantSubscriptions)
      .values(data)
      .onConflictDoUpdate({
        target: tenantSubscriptions.tenantId,
        set: {
          stripeCustomerId: data.stripeCustomerId,
          stripeSubscriptionId: data.stripeSubscriptionId,
          stripePriceId: data.stripePriceId,
          planCode: data.planCode,
          status: data.status,
          currentPeriodEnd: data.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
          updatedAt: new Date(),
        },
      })
      .returning();
    return sub;
  }

  async updateTenantSubscription(tenantId: string, data: Partial<Omit<TenantSubscription, "id" | "tenantId" | "createdAt">>): Promise<TenantSubscription | undefined> {
    const [sub] = await db
      .update(tenantSubscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenantSubscriptions.tenantId, tenantId))
      .returning();
    return sub;
  }

  async getTenantSubscriptionByStripeCustomerId(stripeCustomerId: string): Promise<TenantSubscription | undefined> {
    const [sub] = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.stripeCustomerId, stripeCustomerId));
    return sub;
  }

  async getTenantSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<TenantSubscription | undefined> {
    const [sub] = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.stripeSubscriptionId, stripeSubscriptionId));
    return sub;
  }

  async getOrCreateUsageCounter(tenantId: string, monthKey: string): Promise<UsageCounter> {
    const [existing] = await db
      .select()
      .from(usageCountersMonthly)
      .where(and(eq(usageCountersMonthly.tenantId, tenantId), eq(usageCountersMonthly.monthKey, monthKey)));
    if (existing) return existing;
    const [counter] = await db
      .insert(usageCountersMonthly)
      .values({ tenantId, monthKey })
      .onConflictDoNothing()
      .returning();
    if (counter) return counter;
    const [refetch] = await db
      .select()
      .from(usageCountersMonthly)
      .where(and(eq(usageCountersMonthly.tenantId, tenantId), eq(usageCountersMonthly.monthKey, monthKey)));
    return refetch;
  }

  async incrementUsageCounter(tenantId: string, monthKey: string, field: "reportsGenerated" | "webhookDeliveries", amount = 1): Promise<void> {
    await this.getOrCreateUsageCounter(tenantId, monthKey);
    const col = field === "reportsGenerated" ? usageCountersMonthly.reportsGenerated : usageCountersMonthly.webhookDeliveries;
    await db
      .update(usageCountersMonthly)
      .set({ [field]: sql`${col} + ${amount}`, updatedAt: new Date() })
      .where(and(eq(usageCountersMonthly.tenantId, tenantId), eq(usageCountersMonthly.monthKey, monthKey)));
  }

  async incrementEvidenceBytes(tenantId: string, monthKey: string, bytes: number): Promise<void> {
    await this.getOrCreateUsageCounter(tenantId, monthKey);
    await db
      .update(usageCountersMonthly)
      .set({ evidenceBytesStored: sql`${usageCountersMonthly.evidenceBytesStored} + ${bytes}`, updatedAt: new Date() })
      .where(and(eq(usageCountersMonthly.tenantId, tenantId), eq(usageCountersMonthly.monthKey, monthKey)));
  }

  async getWebhookEndpointCountByTenant(tenantId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(webhookEndpoints).where(eq(webhookEndpoints.tenantId, tenantId));
    return result[0]?.count ?? 0;
  }

  async getMemberCountByTenant(tenantId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
    return result[0]?.count ?? 0;
  }

  async getUserById(userId: string): Promise<any> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async setSystemAdmin(userId: string, isAdmin: boolean): Promise<void> {
    await db.update(users).set({ isSystemAdmin: isAdmin, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async isUserSystemAdmin(userId: string): Promise<boolean> {
    const [user] = await db.select({ isSystemAdmin: users.isSystemAdmin }).from(users).where(eq(users.id, userId));
    return user?.isSystemAdmin === true;
  }

  async getAllTenants(): Promise<Array<Tenant & { memberCount: number; subscription?: TenantSubscription | null }>> {
    const allTenants = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
    const results = [];
    for (const t of allTenants) {
      const memberCount = await this.getMemberCountByTenant(t.id);
      const [sub] = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, t.id));
      results.push({ ...t, memberCount, subscription: sub || null });
    }
    return results;
  }

  async getAllUsers(): Promise<any[]> {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        isSystemAdmin: users.isSystemAdmin,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
    return allUsers;
  }

  async deleteTenant(tenantId: string): Promise<void> {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  }

  async getPausedTenantsExpiredGrace(graceDays: number): Promise<TenantSubscription[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - graceDays);
    const results = await db
      .select()
      .from(tenantSubscriptions)
      .where(
        and(
          lte(tenantSubscriptions.pausedAt, cutoff),
          or(
            eq(tenantSubscriptions.status, "past_due"),
            eq(tenantSubscriptions.status, "canceled"),
            eq(tenantSubscriptions.status, "unpaid")
          )
        )
      );
    return results;
  }

  async getNextTicketNumber(tenantId: string): Promise<number> {
    const result = await db
      .select({ maxNum: sql<number>`COALESCE(MAX(${tickets.number}), 0)` })
      .from(tickets)
      .where(eq(tickets.tenantId, tenantId));
    return (result[0]?.maxNum || 0) + 1;
  }

  async createTicket(data: InsertTicket): Promise<Ticket> {
    const [ticket] = await db.insert(tickets).values(data).returning();
    return ticket;
  }

  async getTicketsByTenant(tenantId: string, filters?: TicketFilters): Promise<any[]> {
    const assignedUser = alias(users, "assignedUser");
    const creatorUser = alias(users, "creatorUser");

    let conditions: any[] = [eq(tickets.tenantId, tenantId)];

    if (filters?.status) {
      conditions.push(eq(tickets.status, filters.status as any));
    }
    if (filters?.priority) {
      conditions.push(eq(tickets.priority, filters.priority as any));
    }
    if (filters?.assignedToId) {
      conditions.push(eq(tickets.assignedToId, filters.assignedToId));
    }
    if (filters?.clientId) {
      conditions.push(eq(tickets.clientId, filters.clientId));
    }
    if (filters?.query) {
      conditions.push(ilike(tickets.title, `%${filters.query}%`));
    }

    return db
      .select({
        id: tickets.id,
        tenantId: tickets.tenantId,
        number: tickets.number,
        title: tickets.title,
        description: tickets.description,
        priority: tickets.priority,
        status: tickets.status,
        clientId: tickets.clientId,
        siteId: tickets.siteId,
        assetId: tickets.assetId,
        assignedToId: tickets.assignedToId,
        createdById: tickets.createdById,
        slaProfileId: tickets.slaProfileId,
        responseDeadline: tickets.responseDeadline,
        resolutionDeadline: tickets.resolutionDeadline,
        respondedAt: tickets.respondedAt,
        resolvedAt: tickets.resolvedAt,
        closedAt: tickets.closedAt,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
        clientName: clients.name,
        siteName: sites.name,
        assetName: assets.name,
        assignedToFirstName: assignedUser.firstName,
        assignedToLastName: assignedUser.lastName,
        createdByFirstName: creatorUser.firstName,
        createdByLastName: creatorUser.lastName,
      })
      .from(tickets)
      .leftJoin(clients, eq(tickets.clientId, clients.id))
      .leftJoin(sites, eq(tickets.siteId, sites.id))
      .leftJoin(assets, eq(tickets.assetId, assets.id))
      .leftJoin(assignedUser, eq(tickets.assignedToId, assignedUser.id))
      .leftJoin(creatorUser, eq(tickets.createdById, creatorUser.id))
      .where(and(...conditions))
      .orderBy(desc(tickets.createdAt));
  }

  async getTicketById(tenantId: string, id: string): Promise<any> {
    const assignedUser = alias(users, "assignedUser");
    const creatorUser = alias(users, "creatorUser");

    const [result] = await db
      .select({
        id: tickets.id,
        tenantId: tickets.tenantId,
        number: tickets.number,
        title: tickets.title,
        description: tickets.description,
        priority: tickets.priority,
        status: tickets.status,
        clientId: tickets.clientId,
        siteId: tickets.siteId,
        assetId: tickets.assetId,
        assignedToId: tickets.assignedToId,
        createdById: tickets.createdById,
        slaProfileId: tickets.slaProfileId,
        responseDeadline: tickets.responseDeadline,
        resolutionDeadline: tickets.resolutionDeadline,
        respondedAt: tickets.respondedAt,
        resolvedAt: tickets.resolvedAt,
        closedAt: tickets.closedAt,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
        clientName: clients.name,
        siteName: sites.name,
        assetName: assets.name,
        assignedToFirstName: assignedUser.firstName,
        assignedToLastName: assignedUser.lastName,
        createdByFirstName: creatorUser.firstName,
        createdByLastName: creatorUser.lastName,
      })
      .from(tickets)
      .leftJoin(clients, eq(tickets.clientId, clients.id))
      .leftJoin(sites, eq(tickets.siteId, sites.id))
      .leftJoin(assets, eq(tickets.assetId, assets.id))
      .leftJoin(assignedUser, eq(tickets.assignedToId, assignedUser.id))
      .leftJoin(creatorUser, eq(tickets.createdById, creatorUser.id))
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, id)));

    return result;
  }

  async updateTicket(tenantId: string, id: string, data: Partial<Omit<Ticket, "id" | "tenantId" | "createdAt">>): Promise<Ticket | undefined> {
    const [updated] = await db
      .update(tickets)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, id)))
      .returning();
    return updated;
  }

  async deleteTicket(tenantId: string, id: string): Promise<void> {
    await db
      .delete(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, id)));
  }

  async deleteTickets(tenantId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .delete(tickets)
      .where(and(eq(tickets.tenantId, tenantId), inArray(tickets.id, ids)))
      .returning({ id: tickets.id });
    return result.length;
  }

  async createTicketComment(data: InsertTicketComment): Promise<TicketComment> {
    const [comment] = await db.insert(ticketComments).values(data).returning();
    return comment;
  }

  async getCommentsByTicket(tenantId: string, ticketId: string): Promise<any[]> {
    return db
      .select({
        id: ticketComments.id,
        tenantId: ticketComments.tenantId,
        ticketId: ticketComments.ticketId,
        userId: ticketComments.userId,
        content: ticketComments.content,
        isInternal: ticketComments.isInternal,
        createdAt: ticketComments.createdAt,
        updatedAt: ticketComments.updatedAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userProfileImageUrl: users.profileImageUrl,
      })
      .from(ticketComments)
      .leftJoin(users, eq(ticketComments.userId, users.id))
      .where(and(eq(ticketComments.tenantId, tenantId), eq(ticketComments.ticketId, ticketId)))
      .orderBy(asc(ticketComments.createdAt));
  }

  async updateTicketComment(tenantId: string, id: string, data: { content?: string; isInternal?: boolean }): Promise<TicketComment | undefined> {
    const [updated] = await db
      .update(ticketComments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(ticketComments.tenantId, tenantId), eq(ticketComments.id, id)))
      .returning();
    return updated;
  }

  async deleteTicketComment(tenantId: string, id: string): Promise<void> {
    await db
      .delete(ticketComments)
      .where(and(eq(ticketComments.tenantId, tenantId), eq(ticketComments.id, id)));
  }

  async createSlaProfile(data: InsertSlaProfile): Promise<SlaProfile> {
    const [profile] = await db.insert(slaProfiles).values(data).returning();
    return profile;
  }

  async getSlaProfilesByTenant(tenantId: string): Promise<SlaProfile[]> {
    return db
      .select()
      .from(slaProfiles)
      .where(eq(slaProfiles.tenantId, tenantId))
      .orderBy(desc(slaProfiles.createdAt));
  }

  async getSlaProfileById(tenantId: string, id: string): Promise<SlaProfile | undefined> {
    const [profile] = await db
      .select()
      .from(slaProfiles)
      .where(and(eq(slaProfiles.tenantId, tenantId), eq(slaProfiles.id, id)));
    return profile;
  }

  async updateSlaProfile(tenantId: string, id: string, data: Partial<Omit<SlaProfile, "id" | "tenantId" | "createdAt">>): Promise<SlaProfile | undefined> {
    const [updated] = await db
      .update(slaProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(slaProfiles.tenantId, tenantId), eq(slaProfiles.id, id)))
      .returning();
    return updated;
  }

  async deleteSlaProfile(tenantId: string, id: string): Promise<void> {
    await db
      .delete(slaProfiles)
      .where(and(eq(slaProfiles.tenantId, tenantId), eq(slaProfiles.id, id)));
  }

  async getDefaultSlaProfile(tenantId: string): Promise<SlaProfile | undefined> {
    const [profile] = await db
      .select()
      .from(slaProfiles)
      .where(and(eq(slaProfiles.tenantId, tenantId), eq(slaProfiles.isDefault, true)));
    return profile;
  }

  async createAppointment(data: InsertAppointment): Promise<Appointment> {
    const [appointment] = await db.insert(appointments).values(data).returning();
    return appointment;
  }

  async getAppointmentsByTenant(tenantId: string, filters?: { startDate?: string; endDate?: string; assignedToId?: string }): Promise<any[]> {
    const assignedUser = alias(users, "assignedUser");
    const creatorUser = alias(users, "creatorUser");

    let conditions: any[] = [eq(appointments.tenantId, tenantId)];

    if (filters?.startDate) {
      conditions.push(gte(appointments.startTime, new Date(filters.startDate)));
    }
    if (filters?.endDate) {
      conditions.push(lte(appointments.startTime, new Date(filters.endDate)));
    }
    if (filters?.assignedToId) {
      conditions.push(eq(appointments.assignedToId, filters.assignedToId));
    }

    return db
      .select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        title: appointments.title,
        description: appointments.description,
        startTime: appointments.startTime,
        endTime: appointments.endTime,
        ticketId: appointments.ticketId,
        clientId: appointments.clientId,
        siteId: appointments.siteId,
        assignedToId: appointments.assignedToId,
        createdById: appointments.createdById,
        createdAt: appointments.createdAt,
        updatedAt: appointments.updatedAt,
        clientName: clients.name,
        assignedToFirstName: assignedUser.firstName,
        assignedToLastName: assignedUser.lastName,
        createdByFirstName: creatorUser.firstName,
        createdByLastName: creatorUser.lastName,
      })
      .from(appointments)
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(assignedUser, eq(appointments.assignedToId, assignedUser.id))
      .leftJoin(creatorUser, eq(appointments.createdById, creatorUser.id))
      .where(and(...conditions))
      .orderBy(desc(appointments.startTime));
  }

  async getAppointmentById(tenantId: string, id: string): Promise<any> {
    const assignedUser = alias(users, "assignedUser");
    const creatorUser = alias(users, "creatorUser");

    const [result] = await db
      .select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        title: appointments.title,
        description: appointments.description,
        startTime: appointments.startTime,
        endTime: appointments.endTime,
        ticketId: appointments.ticketId,
        clientId: appointments.clientId,
        siteId: appointments.siteId,
        assignedToId: appointments.assignedToId,
        createdById: appointments.createdById,
        createdAt: appointments.createdAt,
        updatedAt: appointments.updatedAt,
        clientName: clients.name,
        assignedToFirstName: assignedUser.firstName,
        assignedToLastName: assignedUser.lastName,
        createdByFirstName: creatorUser.firstName,
        createdByLastName: creatorUser.lastName,
      })
      .from(appointments)
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(assignedUser, eq(appointments.assignedToId, assignedUser.id))
      .leftJoin(creatorUser, eq(appointments.createdById, creatorUser.id))
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, id)));

    return result;
  }

  async updateAppointment(tenantId: string, id: string, data: Partial<Omit<Appointment, "id" | "tenantId" | "createdAt">>): Promise<Appointment | undefined> {
    const [updated] = await db
      .update(appointments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, id)))
      .returning();
    return updated;
  }

  async deleteAppointment(tenantId: string, id: string): Promise<void> {
    await db
      .delete(appointments)
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, id)));
  }

  async createTimeEntry(data: InsertTimeEntry): Promise<TimeEntry> {
    const [entry] = await db.insert(timeEntries).values(data).returning();
    return entry;
  }

  async getTimeEntriesByTenant(tenantId: string, filters?: { ticketId?: string; clientId?: string; userId?: string; startDate?: string; endDate?: string; billable?: boolean; uninvoiced?: boolean }): Promise<any[]> {
    let conditions: any[] = [eq(timeEntries.tenantId, tenantId)];

    if (filters?.ticketId) {
      conditions.push(eq(timeEntries.ticketId, filters.ticketId));
    }
    if (filters?.clientId) {
      conditions.push(eq(timeEntries.clientId, filters.clientId));
    }
    if (filters?.userId) {
      conditions.push(eq(timeEntries.userId, filters.userId));
    }
    if (filters?.startDate) {
      conditions.push(gte(timeEntries.date, new Date(filters.startDate)));
    }
    if (filters?.endDate) {
      conditions.push(lte(timeEntries.date, new Date(filters.endDate)));
    }
    if (filters?.billable !== undefined) {
      conditions.push(eq(timeEntries.billable, filters.billable));
    }
    if (filters?.uninvoiced) {
      conditions.push(sql`${timeEntries.invoiceId} IS NULL`);
    }

    return db
      .select({
        id: timeEntries.id,
        tenantId: timeEntries.tenantId,
        ticketId: timeEntries.ticketId,
        clientId: timeEntries.clientId,
        userId: timeEntries.userId,
        description: timeEntries.description,
        minutes: timeEntries.minutes,
        billable: timeEntries.billable,
        rateOverrideCents: timeEntries.rateOverrideCents,
        date: timeEntries.date,
        invoiceId: timeEntries.invoiceId,
        createdAt: timeEntries.createdAt,
        updatedAt: timeEntries.updatedAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        ticketTitle: tickets.title,
        ticketNumber: tickets.number,
        clientName: clients.name,
      })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .leftJoin(tickets, eq(timeEntries.ticketId, tickets.id))
      .leftJoin(clients, eq(timeEntries.clientId, clients.id))
      .where(and(...conditions))
      .orderBy(desc(timeEntries.date));
  }

  async getTimeEntryById(tenantId: string, id: string): Promise<TimeEntry | undefined> {
    const [entry] = await db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.tenantId, tenantId), eq(timeEntries.id, id)));
    return entry;
  }

  async updateTimeEntry(tenantId: string, id: string, data: Partial<Omit<TimeEntry, "id" | "tenantId" | "createdAt">>): Promise<TimeEntry | undefined> {
    const [updated] = await db
      .update(timeEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(timeEntries.tenantId, tenantId), eq(timeEntries.id, id)))
      .returning();
    return updated;
  }

  async deleteTimeEntry(tenantId: string, id: string): Promise<void> {
    await db
      .delete(timeEntries)
      .where(and(eq(timeEntries.tenantId, tenantId), eq(timeEntries.id, id)));
  }

  async getBillingConfig(tenantId: string): Promise<BillingConfig | undefined> {
    const [config] = await db
      .select()
      .from(billingConfigs)
      .where(eq(billingConfigs.tenantId, tenantId));
    return config;
  }

  async upsertBillingConfig(tenantId: string, data: Partial<InsertBillingConfig>): Promise<BillingConfig> {
    const existing = await this.getBillingConfig(tenantId);
    if (existing) {
      const [updated] = await db
        .update(billingConfigs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(billingConfigs.tenantId, tenantId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(billingConfigs)
      .values({ tenantId, ...data })
      .returning();
    return created;
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db.insert(invoices).values(data).returning();
    return invoice;
  }

  async getInvoicesByTenant(tenantId: string, filters?: { status?: string; clientId?: string }): Promise<any[]> {
    let conditions: any[] = [eq(invoices.tenantId, tenantId)];

    if (filters?.status) {
      conditions.push(eq(invoices.status, filters.status as any));
    }
    if (filters?.clientId) {
      conditions.push(eq(invoices.clientId, filters.clientId));
    }

    return db
      .select({
        id: invoices.id,
        tenantId: invoices.tenantId,
        clientId: invoices.clientId,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        issuedAt: invoices.issuedAt,
        dueAt: invoices.dueAt,
        paidAt: invoices.paidAt,
        subtotalCents: invoices.subtotalCents,
        taxCents: invoices.taxCents,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        currency: invoices.currency,
        notes: invoices.notes,
        publicToken: invoices.publicToken,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
        clientName: clients.name,
        clientEmail: clients.email,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(...conditions))
      .orderBy(desc(invoices.createdAt));
  }

  async getInvoiceById(tenantId: string, id: string): Promise<any> {
    const [invoice] = await db
      .select({
        id: invoices.id,
        tenantId: invoices.tenantId,
        clientId: invoices.clientId,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        issuedAt: invoices.issuedAt,
        dueAt: invoices.dueAt,
        paidAt: invoices.paidAt,
        subtotalCents: invoices.subtotalCents,
        taxCents: invoices.taxCents,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        currency: invoices.currency,
        notes: invoices.notes,
        publicToken: invoices.publicToken,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
        clientName: clients.name,
        clientEmail: clients.email,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, id)));

    if (!invoice) return undefined;

    const lineItems = await db
      .select()
      .from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.tenantId, tenantId), eq(invoiceLineItems.invoiceId, id)))
      .orderBy(asc(invoiceLineItems.sortOrder));

    return { ...invoice, lineItems };
  }

  async getInvoiceByPublicToken(token: string): Promise<any> {
    const [invoice] = await db
      .select({
        id: invoices.id,
        tenantId: invoices.tenantId,
        clientId: invoices.clientId,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        issuedAt: invoices.issuedAt,
        dueAt: invoices.dueAt,
        paidAt: invoices.paidAt,
        subtotalCents: invoices.subtotalCents,
        taxCents: invoices.taxCents,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        currency: invoices.currency,
        notes: invoices.notes,
        publicToken: invoices.publicToken,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
        clientName: clients.name,
        clientEmail: clients.email,
        clientCompany: clients.company,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(eq(invoices.publicToken, token));

    if (!invoice) return undefined;

    const lineItems = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id))
      .orderBy(asc(invoiceLineItems.sortOrder));

    const billingConfig = await this.getBillingConfig(invoice.tenantId);

    return { ...invoice, lineItems, billingConfig };
  }

  async updateInvoice(tenantId: string, id: string, data: Partial<Omit<Invoice, "id" | "tenantId" | "createdAt">>): Promise<Invoice | undefined> {
    const [updated] = await db
      .update(invoices)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, id)))
      .returning();
    return updated;
  }

  async deleteInvoice(tenantId: string, id: string): Promise<void> {
    await db
      .delete(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, id)));
  }

  async getNextInvoiceNumber(tenantId: string): Promise<string> {
    const config = await this.getBillingConfig(tenantId);
    const prefix = config?.invoicePrefix || "INV";
    const nextNum = config?.invoiceNextNumber || 1001;

    if (config) {
      await db
        .update(billingConfigs)
        .set({ invoiceNextNumber: nextNum + 1, updatedAt: new Date() })
        .where(eq(billingConfigs.tenantId, tenantId));
    }

    return `${prefix}-${String(nextNum).padStart(4, "0")}`;
  }

  async createInvoiceLineItem(data: InsertInvoiceLineItem): Promise<InvoiceLineItem> {
    const [item] = await db.insert(invoiceLineItems).values(data).returning();
    return item;
  }

  async getLineItemsByInvoice(tenantId: string, invoiceId: string): Promise<InvoiceLineItem[]> {
    return db
      .select()
      .from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.tenantId, tenantId), eq(invoiceLineItems.invoiceId, invoiceId)))
      .orderBy(asc(invoiceLineItems.sortOrder));
  }

  async updateInvoiceLineItem(tenantId: string, id: string, data: Partial<Omit<InvoiceLineItem, "id" | "tenantId" | "createdAt">>): Promise<InvoiceLineItem | undefined> {
    const [updated] = await db
      .update(invoiceLineItems)
      .set(data)
      .where(and(eq(invoiceLineItems.tenantId, tenantId), eq(invoiceLineItems.id, id)))
      .returning();
    return updated;
  }

  async deleteInvoiceLineItem(tenantId: string, id: string): Promise<void> {
    await db
      .delete(invoiceLineItems)
      .where(and(eq(invoiceLineItems.tenantId, tenantId), eq(invoiceLineItems.id, id)));
  }

  async recalculateInvoiceTotals(tenantId: string, invoiceId: string): Promise<Invoice | undefined> {
    const items = await this.getLineItemsByInvoice(tenantId, invoiceId);
    const subtotalCents = items.reduce((sum, item) => sum + item.totalCents, 0);

    const [updated] = await db
      .update(invoices)
      .set({ subtotalCents, totalCents: subtotalCents, updatedAt: new Date() })
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
      .returning();
    return updated;
  }

  async createKbArticle(data: InsertKbArticle): Promise<KbArticle> {
    const [article] = await db.insert(kbArticles).values(data).returning();
    return article;
  }

  async getKbArticlesByTenant(tenantId: string, filters?: { category?: string; isPublished?: boolean; query?: string }): Promise<any[]> {
    const authorUser = alias(users, "authorUser");

    let conditions: any[] = [eq(kbArticles.tenantId, tenantId)];

    if (filters?.category) {
      conditions.push(eq(kbArticles.category, filters.category));
    }
    if (filters?.isPublished !== undefined) {
      conditions.push(eq(kbArticles.isPublished, filters.isPublished));
    }
    if (filters?.query) {
      conditions.push(ilike(kbArticles.title, `%${filters.query}%`));
    }

    return db
      .select({
        id: kbArticles.id,
        tenantId: kbArticles.tenantId,
        title: kbArticles.title,
        slug: kbArticles.slug,
        content: kbArticles.content,
        category: kbArticles.category,
        isPublished: kbArticles.isPublished,
        authorId: kbArticles.authorId,
        createdAt: kbArticles.createdAt,
        updatedAt: kbArticles.updatedAt,
        authorFirstName: authorUser.firstName,
        authorLastName: authorUser.lastName,
      })
      .from(kbArticles)
      .leftJoin(authorUser, eq(kbArticles.authorId, authorUser.id))
      .where(and(...conditions))
      .orderBy(desc(kbArticles.updatedAt));
  }

  async getKbArticleById(tenantId: string, id: string): Promise<any> {
    const authorUser = alias(users, "authorUser");

    const [result] = await db
      .select({
        id: kbArticles.id,
        tenantId: kbArticles.tenantId,
        title: kbArticles.title,
        slug: kbArticles.slug,
        content: kbArticles.content,
        category: kbArticles.category,
        isPublished: kbArticles.isPublished,
        authorId: kbArticles.authorId,
        createdAt: kbArticles.createdAt,
        updatedAt: kbArticles.updatedAt,
        authorFirstName: authorUser.firstName,
        authorLastName: authorUser.lastName,
      })
      .from(kbArticles)
      .leftJoin(authorUser, eq(kbArticles.authorId, authorUser.id))
      .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.id, id)));

    return result;
  }

  async getKbArticleBySlug(tenantId: string, slug: string): Promise<any> {
    const authorUser = alias(users, "authorUser");

    const [result] = await db
      .select({
        id: kbArticles.id,
        tenantId: kbArticles.tenantId,
        title: kbArticles.title,
        slug: kbArticles.slug,
        content: kbArticles.content,
        category: kbArticles.category,
        isPublished: kbArticles.isPublished,
        authorId: kbArticles.authorId,
        createdAt: kbArticles.createdAt,
        updatedAt: kbArticles.updatedAt,
        authorFirstName: authorUser.firstName,
        authorLastName: authorUser.lastName,
      })
      .from(kbArticles)
      .leftJoin(authorUser, eq(kbArticles.authorId, authorUser.id))
      .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.slug, slug)));

    return result;
  }

  async updateKbArticle(tenantId: string, id: string, data: Partial<Omit<KbArticle, "id" | "tenantId" | "createdAt">>): Promise<KbArticle | undefined> {
    const [updated] = await db
      .update(kbArticles)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.id, id)))
      .returning();
    return updated;
  }

  async deleteKbArticle(tenantId: string, id: string): Promise<void> {
    await db
      .delete(kbArticles)
      .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.id, id)));
  }

  async createRecurringTemplate(data: InsertRecurringTicketTemplate): Promise<RecurringTicketTemplate> {
    const [template] = await db.insert(recurringTicketTemplates).values(data).returning();
    return template;
  }

  async getRecurringTemplatesByTenant(tenantId: string): Promise<any[]> {
    const assignedUser = alias(users, "assignedUser");

    return db
      .select({
        id: recurringTicketTemplates.id,
        tenantId: recurringTicketTemplates.tenantId,
        title: recurringTicketTemplates.title,
        description: recurringTicketTemplates.description,
        priority: recurringTicketTemplates.priority,
        clientId: recurringTicketTemplates.clientId,
        siteId: recurringTicketTemplates.siteId,
        assetId: recurringTicketTemplates.assetId,
        assignedToId: recurringTicketTemplates.assignedToId,
        cronExpression: recurringTicketTemplates.cronExpression,
        enabled: recurringTicketTemplates.enabled,
        lastGeneratedAt: recurringTicketTemplates.lastGeneratedAt,
        nextRunAt: recurringTicketTemplates.nextRunAt,
        createdAt: recurringTicketTemplates.createdAt,
        updatedAt: recurringTicketTemplates.updatedAt,
        clientName: clients.name,
        assignedToFirstName: assignedUser.firstName,
        assignedToLastName: assignedUser.lastName,
      })
      .from(recurringTicketTemplates)
      .leftJoin(clients, eq(recurringTicketTemplates.clientId, clients.id))
      .leftJoin(assignedUser, eq(recurringTicketTemplates.assignedToId, assignedUser.id))
      .where(eq(recurringTicketTemplates.tenantId, tenantId))
      .orderBy(desc(recurringTicketTemplates.createdAt));
  }

  async getRecurringTemplateById(tenantId: string, id: string): Promise<RecurringTicketTemplate | undefined> {
    const [template] = await db
      .select()
      .from(recurringTicketTemplates)
      .where(and(eq(recurringTicketTemplates.tenantId, tenantId), eq(recurringTicketTemplates.id, id)));
    return template;
  }

  async updateRecurringTemplate(tenantId: string, id: string, data: Partial<Omit<RecurringTicketTemplate, "id" | "tenantId" | "createdAt">>): Promise<RecurringTicketTemplate | undefined> {
    const [updated] = await db
      .update(recurringTicketTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(recurringTicketTemplates.tenantId, tenantId), eq(recurringTicketTemplates.id, id)))
      .returning();
    return updated;
  }

  async deleteRecurringTemplate(tenantId: string, id: string): Promise<void> {
    await db
      .delete(recurringTicketTemplates)
      .where(and(eq(recurringTicketTemplates.tenantId, tenantId), eq(recurringTicketTemplates.id, id)));
  }

  async getDueRecurringTemplates(): Promise<RecurringTicketTemplate[]> {
    return db
      .select()
      .from(recurringTicketTemplates)
      .where(
        and(
          eq(recurringTicketTemplates.enabled, true),
          lte(recurringTicketTemplates.nextRunAt, new Date())
        )
      );
  }

  async createIntakeSpace(data: InsertIntakeSpace): Promise<IntakeSpace> {
    const [space] = await db.insert(intakeSpaces).values(data).returning();
    return space;
  }

  async getIntakeSpacesByTenant(tenantId: string): Promise<IntakeSpace[]> {
    return db.select().from(intakeSpaces).where(eq(intakeSpaces.tenantId, tenantId)).orderBy(asc(intakeSpaces.name));
  }

  async getIntakeSpaceById(tenantId: string, id: string): Promise<IntakeSpace | undefined> {
    const [space] = await db.select().from(intakeSpaces).where(and(eq(intakeSpaces.tenantId, tenantId), eq(intakeSpaces.id, id)));
    return space;
  }

  async getIntakeSpaceBySlug(tenantId: string, slug: string): Promise<IntakeSpace | undefined> {
    const [space] = await db.select().from(intakeSpaces).where(and(eq(intakeSpaces.tenantId, tenantId), eq(intakeSpaces.slug, slug)));
    return space;
  }

  async updateIntakeSpace(tenantId: string, id: string, data: Partial<Omit<IntakeSpace, "id" | "tenantId" | "createdAt">>): Promise<IntakeSpace | undefined> {
    const [updated] = await db.update(intakeSpaces).set({ ...data, updatedAt: new Date() }).where(and(eq(intakeSpaces.tenantId, tenantId), eq(intakeSpaces.id, id))).returning();
    return updated;
  }

  async deleteIntakeSpace(tenantId: string, id: string): Promise<void> {
    await db.delete(intakeSpaces).where(and(eq(intakeSpaces.tenantId, tenantId), eq(intakeSpaces.id, id)));
  }

  async getIntakeSpaceCount(tenantId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(intakeSpaces).where(eq(intakeSpaces.tenantId, tenantId));
    return result?.count || 0;
  }

  async createUploadRequest(data: InsertUploadRequest): Promise<UploadRequest> {
    const [req] = await db.insert(uploadRequests).values(data).returning();
    return req;
  }

  async getUploadRequestsByTenant(tenantId: string, filters?: { spaceId?: string; status?: string }): Promise<UploadRequest[]> {
    const conditions = [eq(uploadRequests.tenantId, tenantId)];
    if (filters?.spaceId) conditions.push(eq(uploadRequests.spaceId, filters.spaceId));
    if (filters?.status) conditions.push(eq(uploadRequests.status, filters.status as any));
    return db.select().from(uploadRequests).where(and(...conditions)).orderBy(desc(uploadRequests.createdAt));
  }

  async getUploadRequestById(tenantId: string, id: string): Promise<UploadRequest | undefined> {
    const [req] = await db.select().from(uploadRequests).where(and(eq(uploadRequests.tenantId, tenantId), eq(uploadRequests.id, id)));
    return req;
  }

  async getUploadRequestByToken(token: string): Promise<(UploadRequest & { tenantSlug: string; spaceName: string }) | undefined> {
    const [result] = await db
      .select({
        id: uploadRequests.id,
        tenantId: uploadRequests.tenantId,
        spaceId: uploadRequests.spaceId,
        title: uploadRequests.title,
        uploaderName: uploadRequests.uploaderName,
        uploaderEmail: uploadRequests.uploaderEmail,
        instructions: uploadRequests.instructions,
        token: uploadRequests.token,
        status: uploadRequests.status,
        maxUploads: uploadRequests.maxUploads,
        maxTotalSizeMb: uploadRequests.maxTotalSizeMb,
        allowedFileTypes: uploadRequests.allowedFileTypes,
        oneTimeUse: uploadRequests.oneTimeUse,
        requiresPassword: uploadRequests.requiresPassword,
        passwordHash: uploadRequests.passwordHash,
        expiresAt: uploadRequests.expiresAt,
        completedAt: uploadRequests.completedAt,
        revokedAt: uploadRequests.revokedAt,
        createdById: uploadRequests.createdById,
        uploadCount: uploadRequests.uploadCount,
        totalUploadedBytes: uploadRequests.totalUploadedBytes,
        createdAt: uploadRequests.createdAt,
        updatedAt: uploadRequests.updatedAt,
        tenantSlug: tenants.slug,
        spaceName: intakeSpaces.name,
      })
      .from(uploadRequests)
      .innerJoin(tenants, eq(uploadRequests.tenantId, tenants.id))
      .innerJoin(intakeSpaces, eq(uploadRequests.spaceId, intakeSpaces.id))
      .where(eq(uploadRequests.token, token));
    return result as any;
  }

  async updateUploadRequest(tenantId: string, id: string, data: Partial<Omit<UploadRequest, "id" | "tenantId" | "createdAt">>): Promise<UploadRequest | undefined> {
    const [updated] = await db.update(uploadRequests).set({ ...data, updatedAt: new Date() }).where(and(eq(uploadRequests.tenantId, tenantId), eq(uploadRequests.id, id))).returning();
    return updated;
  }

  async revokeUploadRequest(tenantId: string, id: string): Promise<void> {
    await db.update(uploadRequests).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(uploadRequests.tenantId, tenantId), eq(uploadRequests.id, id)));
  }

  async incrementUploadRequestCount(id: string, fileSize: number): Promise<void> {
    await db.update(uploadRequests).set({
      uploadCount: sql`${uploadRequests.uploadCount} + 1`,
      totalUploadedBytes: sql`${uploadRequests.totalUploadedBytes} + ${fileSize}`,
      updatedAt: new Date(),
    }).where(eq(uploadRequests.id, id));
  }

  async getActiveUploadRequestCount(tenantId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(uploadRequests).where(and(eq(uploadRequests.tenantId, tenantId), eq(uploadRequests.status, "active")));
    return result?.count || 0;
  }

  async createIntakeFile(data: InsertIntakeFile): Promise<IntakeFile> {
    const [file] = await db.insert(intakeFiles).values(data).returning();
    return file;
  }

  async getIntakeFilesByTenant(tenantId: string, filters?: { spaceId?: string; status?: string; uploadRequestId?: string; query?: string }): Promise<IntakeFile[]> {
    const conditions = [eq(intakeFiles.tenantId, tenantId)];
    if (filters?.spaceId) conditions.push(eq(intakeFiles.spaceId, filters.spaceId));
    if (filters?.status) conditions.push(eq(intakeFiles.status, filters.status as any));
    if (filters?.uploadRequestId) conditions.push(eq(intakeFiles.uploadRequestId, filters.uploadRequestId));
    if (filters?.query) conditions.push(ilike(intakeFiles.originalName, `%${filters.query}%`));
    return db.select().from(intakeFiles).where(and(...conditions)).orderBy(desc(intakeFiles.createdAt));
  }

  async getIntakeFileById(tenantId: string, id: string): Promise<IntakeFile | undefined> {
    const [file] = await db.select().from(intakeFiles).where(and(eq(intakeFiles.tenantId, tenantId), eq(intakeFiles.id, id)));
    return file;
  }

  async updateIntakeFile(tenantId: string, id: string, data: Partial<Omit<IntakeFile, "id" | "tenantId" | "createdAt">>): Promise<IntakeFile | undefined> {
    const [updated] = await db.update(intakeFiles).set(data).where(and(eq(intakeFiles.tenantId, tenantId), eq(intakeFiles.id, id))).returning();
    return updated;
  }

  async deleteIntakeFile(tenantId: string, id: string): Promise<void> {
    await db.delete(intakeFiles).where(and(eq(intakeFiles.tenantId, tenantId), eq(intakeFiles.id, id)));
  }

  async getIntakeStorageUsed(tenantId: string): Promise<number> {
    const [result] = await db.select({ total: sql<number>`coalesce(sum(${intakeFiles.sizeBytes}), 0)::bigint` }).from(intakeFiles).where(eq(intakeFiles.tenantId, tenantId));
    return Number(result?.total) || 0;
  }

  async createIntakeAuditEvent(data: InsertIntakeAuditEvent): Promise<IntakeAuditEvent> {
    const [event] = await db.insert(intakeAuditEvents).values(data).returning();
    return event;
  }

  async getIntakeAuditEvents(tenantId: string, filters?: { action?: string; objectType?: string; dateFrom?: string; dateTo?: string }): Promise<IntakeAuditEvent[]> {
    const conditions = [eq(intakeAuditEvents.tenantId, tenantId)];
    if (filters?.action) conditions.push(eq(intakeAuditEvents.action, filters.action));
    if (filters?.objectType) conditions.push(eq(intakeAuditEvents.objectType, filters.objectType));
    if (filters?.dateFrom) conditions.push(gte(intakeAuditEvents.createdAt, new Date(filters.dateFrom)));
    if (filters?.dateTo) conditions.push(lte(intakeAuditEvents.createdAt, new Date(filters.dateTo)));
    return db.select().from(intakeAuditEvents).where(and(...conditions)).orderBy(desc(intakeAuditEvents.createdAt)).limit(200);
  }

  async getIntakePolicy(tenantId: string): Promise<IntakePolicy | undefined> {
    const [policy] = await db.select().from(intakePolicies).where(eq(intakePolicies.tenantId, tenantId));
    return policy;
  }

  async upsertIntakePolicy(tenantId: string, data: Partial<Omit<IntakePolicy, "id" | "tenantId" | "createdAt">>): Promise<IntakePolicy> {
    const existing = await this.getIntakePolicy(tenantId);
    if (existing) {
      const [updated] = await db.update(intakePolicies).set({ ...data, updatedAt: new Date() }).where(eq(intakePolicies.tenantId, tenantId)).returning();
      return updated;
    }
    const [created] = await db.insert(intakePolicies).values({ tenantId, ...data } as any).returning();
    return created;
  }

  async getIntakeDashboardStats(tenantId: string): Promise<{
    totalFiles: number;
    totalSpaces: number;
    activeRequests: number;
    expiredRequests: number;
    storageUsedBytes: number;
    recentFiles: IntakeFile[];
    recentAudit: IntakeAuditEvent[];
  }> {
    const [fileCount] = await db.select({ count: sql<number>`count(*)::int` }).from(intakeFiles).where(eq(intakeFiles.tenantId, tenantId));
    const [spaceCount] = await db.select({ count: sql<number>`count(*)::int` }).from(intakeSpaces).where(eq(intakeSpaces.tenantId, tenantId));
    const [activeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(uploadRequests).where(and(eq(uploadRequests.tenantId, tenantId), eq(uploadRequests.status, "active")));
    const [expiredCount] = await db.select({ count: sql<number>`count(*)::int` }).from(uploadRequests).where(and(eq(uploadRequests.tenantId, tenantId), eq(uploadRequests.status, "expired")));
    const storageUsed = await this.getIntakeStorageUsed(tenantId);
    const recentFiles = await db.select().from(intakeFiles).where(eq(intakeFiles.tenantId, tenantId)).orderBy(desc(intakeFiles.createdAt)).limit(10);
    const recentAudit = await db.select().from(intakeAuditEvents).where(eq(intakeAuditEvents.tenantId, tenantId)).orderBy(desc(intakeAuditEvents.createdAt)).limit(10);

    return {
      totalFiles: fileCount?.count || 0,
      totalSpaces: spaceCount?.count || 0,
      activeRequests: activeCount?.count || 0,
      expiredRequests: expiredCount?.count || 0,
      storageUsedBytes: storageUsed,
      recentFiles,
      recentAudit,
    };
  }
}

export const storage = new DatabaseStorage();

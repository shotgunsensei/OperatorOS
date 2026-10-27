/** Admission policy for durable integration tokens; independent of the issuer's session. */
export interface CallCommandIngestionAuthorityPorts {
  loadTenantStatus(tenantId: string): Promise<string | null>;
  tenantHasModuleEntitlement(tenantId: string, moduleSlug: string): Promise<boolean>;
}

type IngestionAdmission =
  | { allowed: true }
  | { allowed: false; statusCode: 403 | 503; code: string; message: string };

export async function inspectCallCommandIngestionAuthority(
  tenantId: string,
  ports: CallCommandIngestionAuthorityPorts,
): Promise<IngestionAdmission> {
  try {
    const status = tenantId.trim() ? await ports.loadTenantStatus(tenantId) : null;
    if (status !== 'active') {
      return { allowed: false, statusCode: 403, code: 'CALLCOMMAND_INGESTION_TENANT_UNAVAILABLE', message: 'This tenant is not available for new call ingestion.' };
    }
    // This existing tenant-level resolver includes the platform module kill
    // switch, tenant-module revocation and current entitlement/plan grants.
    if (await ports.tenantHasModuleEntitlement(tenantId, 'callcommand-ai') !== true) {
      return { allowed: false, statusCode: 403, code: 'CALLCOMMAND_INGESTION_MODULE_UNAVAILABLE', message: 'CallCommand is not enabled for this tenant.' };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, statusCode: 503, code: 'CALLCOMMAND_INGESTION_AUTHORITY_UNAVAILABLE', message: 'Ingestion authority could not be confirmed. Try again later.' };
  }
}

import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export async function ensureSharedCustomerLinks() {
  await db.execute(sql`
    ALTER TABLE directory_organizations ADD COLUMN IF NOT EXISTS customer_address TEXT;
    ALTER TABLE brandforge_brands ADD COLUMN IF NOT EXISTS directory_organization_id VARCHAR(36);
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='brandforge_brands'::regclass AND conname='brandforge_shared_customer_fk') THEN
        ALTER TABLE brandforge_brands ADD CONSTRAINT brandforge_shared_customer_fk
          FOREIGN KEY (tenant_id,directory_organization_id) REFERENCES directory_organizations(tenant_id,id);
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS idx_brandforge_shared_customer ON brandforge_brands(tenant_id,directory_organization_id);
  `);
}

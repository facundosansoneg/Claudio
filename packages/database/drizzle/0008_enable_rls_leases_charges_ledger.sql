-- RLS para inquilinos, contratos, cargos y subledger contable (ADR 0006),
-- mismo patrón que 0001_enable_row_level_security.sql.

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
ALTER TABLE "leases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leases" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lease_parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lease_parties" FORCE ROW LEVEL SECURITY;
ALTER TABLE "charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "charges" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ledger_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_entries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "journal_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_allocations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receipts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenants_tenant_isolation" ON "tenants"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "leases_tenant_isolation" ON "leases"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "lease_parties_tenant_isolation" ON "lease_parties"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "charges_tenant_isolation" ON "charges"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "ledger_accounts_tenant_isolation" ON "ledger_accounts"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "journal_entries_tenant_isolation" ON "journal_entries"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "journal_lines_tenant_isolation" ON "journal_lines"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "payments_tenant_isolation" ON "payments"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "payment_allocations_tenant_isolation" ON "payment_allocations"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "receipts_tenant_isolation" ON "receipts"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);


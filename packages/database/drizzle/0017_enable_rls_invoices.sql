-- RLS para invoice_series e invoices (ADR 0006), mismo patrón que 0001.

ALTER TABLE "invoice_series" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_series" FORCE ROW LEVEL SECURITY;

CREATE POLICY "invoice_series_tenant_isolation" ON "invoice_series"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;

CREATE POLICY "invoices_tenant_isolation" ON "invoices"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

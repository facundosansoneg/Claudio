-- RLS para tax_exemptions (ADR 0006), mismo patrón que 0001.

ALTER TABLE "tax_exemptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_exemptions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tax_exemptions_tenant_isolation" ON "tax_exemptions"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

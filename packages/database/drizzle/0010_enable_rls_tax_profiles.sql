-- RLS para tax_profiles (ADR 0006), mismo patrón que 0001.

ALTER TABLE "tax_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_profiles" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tax_profiles_tenant_isolation" ON "tax_profiles"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

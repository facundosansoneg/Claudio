-- RLS para valuations (ADR 0006), mismo patrón que 0001.

ALTER TABLE "valuations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "valuations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "valuations_tenant_isolation" ON "valuations"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

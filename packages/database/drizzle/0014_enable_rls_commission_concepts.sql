-- RLS para commission_concepts y commission_concept_overrides (ADR 0006),
-- mismo patrón que 0001.

ALTER TABLE "commission_concepts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commission_concepts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "commission_concepts_tenant_isolation" ON "commission_concepts"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE "commission_concept_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commission_concept_overrides" FORCE ROW LEVEL SECURITY;

CREATE POLICY "commission_concept_overrides_tenant_isolation" ON "commission_concept_overrides"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

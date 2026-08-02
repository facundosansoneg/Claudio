-- RLS para market_comparables, market_estimates y market_estimate_comparables
-- (ADR 0006), mismo patrón que 0001.

ALTER TABLE "market_comparables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "market_comparables" FORCE ROW LEVEL SECURITY;

CREATE POLICY "market_comparables_tenant_isolation" ON "market_comparables"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE "market_estimates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "market_estimates" FORCE ROW LEVEL SECURITY;

CREATE POLICY "market_estimates_tenant_isolation" ON "market_estimates"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE "market_estimate_comparables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "market_estimate_comparables" FORCE ROW LEVEL SECURITY;

CREATE POLICY "market_estimate_comparables_tenant_isolation" ON "market_estimate_comparables"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

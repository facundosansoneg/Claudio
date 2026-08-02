-- RLS para expenses, allocation_rules, allocation_runs y
-- allocation_lines (ADR 0006), mismo patrón que 0001.

ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" FORCE ROW LEVEL SECURITY;

CREATE POLICY "expenses_tenant_isolation" ON "expenses"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE "allocation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "allocation_rules" FORCE ROW LEVEL SECURITY;

CREATE POLICY "allocation_rules_tenant_isolation" ON "allocation_rules"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE "allocation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "allocation_runs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "allocation_runs_tenant_isolation" ON "allocation_runs"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE "allocation_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "allocation_lines" FORCE ROW LEVEL SECURITY;

CREATE POLICY "allocation_lines_tenant_isolation" ON "allocation_lines"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

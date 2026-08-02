-- RLS para vendors y work_orders (ADR 0006), mismo patrón que 0001.

ALTER TABLE "vendors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendors" FORCE ROW LEVEL SECURITY;

CREATE POLICY "vendors_tenant_isolation" ON "vendors"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE "work_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_orders" FORCE ROW LEVEL SECURITY;

CREATE POLICY "work_orders_tenant_isolation" ON "work_orders"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

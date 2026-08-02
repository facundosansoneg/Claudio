-- RLS para las tablas de propietarios y propiedades (ADR 0006), mismo
-- patrón que 0001_enable_row_level_security.sql.

ALTER TABLE "owners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owners" FORCE ROW LEVEL SECURITY;
ALTER TABLE "owner_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner_groups" FORCE ROW LEVEL SECURITY;
ALTER TABLE "owner_group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner_group_members" FORCE ROW LEVEL SECURITY;
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "properties" FORCE ROW LEVEL SECURITY;
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ownership_interests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ownership_interests" FORCE ROW LEVEL SECURITY;

CREATE POLICY "owners_tenant_isolation" ON "owners"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "owner_groups_tenant_isolation" ON "owner_groups"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "owner_group_members_tenant_isolation" ON "owner_group_members"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "properties_tenant_isolation" ON "properties"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "units_tenant_isolation" ON "units"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "ownership_interests_tenant_isolation" ON "ownership_interests"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

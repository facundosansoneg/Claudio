-- Row-Level Security (ADR 0006): defensa en profundidad además de la
-- autorización de aplicación. Cada tabla de tenant exige que
-- organization_id coincida con app.current_organization_id, seteado por
-- withOrganizationContext() en cada request/job (src/client.ts).
--
-- FORCE ROW LEVEL SECURITY es necesario porque el rol de aplicación es
-- dueño de las tablas (las creó la migración); sin FORCE, Postgres exime
-- al dueño de sus propias policies y la RLS quedaría de adorno.
--
-- NULLIF(..., '') es necesario porque, una vez que "app.*" se usó una vez
-- en el cluster, current_setting(name, true) devuelve '' (no NULL) en una
-- sesión donde nunca se seteó — y '' no castea a uuid. Sin el NULLIF, una
-- query que se ejecuta fuera de withOrganizationContext() rompe con un
-- error de sintaxis en lugar de simplemente no ver ninguna fila.
--
-- "permissions" queda fuera: es el catálogo global de acciones, no un
-- dato de tenant.

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "families" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "families" FORCE ROW LEVEL SECURITY;
ALTER TABLE "parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parties" FORCE ROW LEVEL SECURITY;
ALTER TABLE "party_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "party_contacts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "user_scopes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_scopes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
ALTER TABLE "parameters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parameters" FORCE ROW LEVEL SECURITY;

-- organizations no tiene su propio organization_id: la política compara
-- contra su propio id. USING controla lecturas/updates/deletes, WITH
-- CHECK controla qué se puede insertar/actualizar hacia.
CREATE POLICY "organizations_tenant_isolation" ON "organizations"
  USING (id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "families_tenant_isolation" ON "families"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "parties_tenant_isolation" ON "parties"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "party_contacts_tenant_isolation" ON "party_contacts"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "roles_tenant_isolation" ON "roles"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- role_permissions no tiene organization_id propio; se filtra vía join a roles.
CREATE POLICY "role_permissions_tenant_isolation" ON "role_permissions"
  USING (
    role_id IN (
      SELECT id FROM "roles"
      WHERE organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    )
  )
  WITH CHECK (
    role_id IN (
      SELECT id FROM "roles"
      WHERE organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    )
  );

CREATE POLICY "user_scopes_tenant_isolation" ON "user_scopes"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "users_tenant_isolation" ON "users"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "audit_log_tenant_isolation" ON "audit_log"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY "parameters_tenant_isolation" ON "parameters"
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

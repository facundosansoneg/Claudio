# Modelo de datos y diagrama ER (inicial)

Deriva de la sección 7 del spec. Este documento describe las entidades
lógicas ya normalizadas en tablas relacionales, agrupadas por dominio
(paquete). El detalle campo a campo completo está en la sección 7 del
spec; aquí se documentan las relaciones, claves y decisiones de
normalización que el spec deja implícitas.

Convenciones aplicadas a **todas** las tablas salvo que se indique lo
contrario (ver `CLAUDE.md` y ADR 0006):

- `id UUID` (v7) como clave primaria.
- `organization_id UUID` (FK a `organizations`) + policy RLS.
- `created_at`, `created_by`, `updated_at`, `updated_by`.
- Baja lógica: `status` o `deleted_at`, nunca `DELETE` físico salvo datos
  de prueba.
- Tablas de relación sensibles (participaciones, roles, tasas, drivers,
  reglas de comisión/mora/reajuste, moneda funcional) llevan
  `valid_from DATE NOT NULL` y `valid_to DATE NULL` (abierto = vigente).

## 7.x → paquete de dominio

| Paquete | Tablas principales |
|---|---|
| `organizations` | `organizations`, `families`, `parties`, `party_contacts`, `bank_accounts`, `users`, `roles`, `permissions`, `role_permissions`, `user_scopes`, `audit_log` |
| `owners` | `owners`, `owner_groups`, `owner_group_members`, `ownership_interests`, `tax_profiles`, `property_tax_exemptions` |
| `properties` | `properties`, `units` |
| `tenants` | `tenants`, `guarantee_providers`, `guarantees` |
| `leases` | `leases`, `lease_parties`, `lease_guarantee_allocations`, `adjustment_rules`, `adjustment_schedule` |
| `billing` | `charges`, `payments`, `payment_allocations`, `receipts` |
| `accounting` | `ledger_accounts`, `journal_entries`, `journal_lines`, `accounting_periods` |
| `expenses` | `expenses`, `allocation_rules`, `allocation_runs`, `allocation_lines` |
| `commissions_billing` | `commission_concepts`, `owner_commission_overrides`, `invoices`, `invoice_lines`, `recurring_invoice_rules` |
| `patrimonial` | `valuations`, `market_comparables`, `market_estimates` |
| `operations` | `tasks`, `work_orders`, `vendors` |
| `documents` | `documents`, `document_templates`, `email_deliveries` |
| `market_data` | `currencies`, `index_units`, `exchange_rates`, `index_values` |
| `jobs` | `job_runs` (ver ADR 0004) |

## Diagrama ER — núcleo operativo (SGA)

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ FAMILIES : has
    ORGANIZATIONS ||--o{ PARTIES : has
    FAMILIES ||--o{ OWNERS : groups
    PARTIES ||--o| OWNERS : "is a"
    PARTIES ||--o| TENANTS : "is a"
    OWNERS ||--o{ OWNER_GROUP_MEMBERS : "belongs to"
    OWNER_GROUPS ||--o{ OWNER_GROUP_MEMBERS : contains
    OWNERS ||--o{ OWNERSHIP_INTERESTS : holds
    PROPERTIES ||--o{ OWNERSHIP_INTERESTS : "owned via"
    UNITS ||--o{ OWNERSHIP_INTERESTS : "owned via"
    PROPERTIES ||--o{ UNITS : contains
    UNITS ||--o{ LEASES : "leased under"
    LEASES ||--o{ LEASE_PARTIES : involves
    TENANTS ||--o{ LEASE_PARTIES : "party to"
    LEASES ||--o{ LEASE_GUARANTEE_ALLOCATIONS : covered_by
    GUARANTEES ||--o{ LEASE_GUARANTEE_ALLOCATIONS : allocated_to
    GUARANTEE_PROVIDERS ||--o{ GUARANTEES : issues
    LEASES ||--o{ ADJUSTMENT_SCHEDULE : has
    ADJUSTMENT_RULES ||--o{ ADJUSTMENT_SCHEDULE : applied_by
    LEASES ||--o{ CHARGES : generates
    CHARGES ||--o{ PAYMENT_ALLOCATIONS : "settled by"
    PAYMENTS ||--o{ PAYMENT_ALLOCATIONS : allocates
    PAYMENTS ||--o{ RECEIPTS : evidenced_by
    PAYMENTS ||--o{ JOURNAL_ENTRIES : posts
    JOURNAL_ENTRIES ||--o{ JOURNAL_LINES : contains
    LEDGER_ACCOUNTS ||--o{ JOURNAL_LINES : classifies

    ORGANIZATIONS {
        uuid id PK
        string base_currency
    }
    OWNERSHIP_INTERESTS {
        uuid id PK
        uuid owner_id FK
        uuid property_id FK
        uuid unit_id FK
        numeric legal_percentage
        numeric economic_percentage
        numeric rent_distribution_percentage
        numeric tax_contribution_percentage
        date valid_from
        date valid_to
    }
    LEASES {
        uuid id PK
        uuid unit_id FK
        string lease_number
        string currency
        numeric initial_rent
        string status
        int version
    }
    CHARGES {
        uuid id PK
        uuid lease_id FK
        string charge_type
        string period
        numeric original_amount
        numeric balance
        string status
    }
    PAYMENTS {
        uuid id PK
        uuid payer_party_id FK
        string currency
        numeric amount
        string status
    }
    JOURNAL_LINES {
        uuid id PK
        uuid journal_entry_id FK
        uuid account_id FK
        numeric debit
        numeric credit
        string original_currency
        numeric original_amount
        uuid family_id FK
        uuid owner_id FK
        uuid property_id FK
        uuid unit_id FK
        uuid lease_id FK
        uuid tenant_id FK
        uuid vendor_id FK
    }
```

## Diagrama ER — capa patrimonial

```mermaid
erDiagram
    PROPERTIES ||--o{ VALUATIONS : has
    PROPERTIES ||--o{ MARKET_ESTIMATES : has
    MARKET_ESTIMATES ||--o{ MARKET_COMPARABLES : uses
    PROPERTIES ||--o{ EXPENSES : incurs
    EXPENSES ||--o{ ALLOCATION_LINES : distributed_by
    ALLOCATION_RUNS ||--o{ ALLOCATION_LINES : produces
    ALLOCATION_RULES ||--o{ ALLOCATION_RUNS : "governs"
    OWNERS ||--o{ TAX_PROFILES : has
    PROPERTIES ||--o{ PROPERTY_TAX_EXEMPTIONS : has
    OWNERS ||--o{ OWNER_COMMISSION_OVERRIDES : has
    COMMISSION_CONCEPTS ||--o{ OWNER_COMMISSION_OVERRIDES : overridden_by
    OWNERS ||--o{ INVOICES : billed
    CURRENCIES ||--o{ EXCHANGE_RATES : quoted_as
    INDEX_UNITS ||--o{ INDEX_VALUES : has

    VALUATIONS {
        uuid id PK
        uuid property_id FK
        date as_of_date
        numeric value
        string currency
        string method
        string confidence
    }
    EXPENSES {
        uuid id PK
        uuid property_id FK
        string classification
        string currency
        numeric amount
        string recoverable_from_tenant
        string approval_status
    }
    ALLOCATION_RULES {
        uuid id PK
        string driver
        date valid_from
        date valid_to
    }
```

## Notas de normalización sobre el spec

- **`owners` vs `parties`**: `owners`, `tenants` y proveedores son roles
  sobre una `party` (persona o entidad), no entidades separadas — evita
  duplicar personas que son propietario y garante a la vez, y resuelve de
  forma directa OWN-003 y TAX-002 (el spec pide expresamente no duplicar
  la persona para representar tratamientos fiscales distintos).
- **`ownership_interests` con cuatro porcentajes independientes**
  (legal, económico, de distribución de renta, de aporte fiscal) es la
  pieza central que reemplaza el mecanismo de "propietarios duplicados"
  de SGA (sección 7.2, "Los porcentajes pueden diferir").
- **`charges` → `payment_allocations` → `receipts`** separa devengamiento,
  cobro y comprobante en tres tablas, cumpliendo la regla no negociable de
  sección 3.4 (separación operación/fiscalidad) y permitiendo pagos
  parciales (PAY-005) sin ambigüedad.
- **`journal_lines` con dimensiones explícitas** (familia, propietario,
  propiedad, unidad, contrato, inquilino, proveedor) es lo que permite
  construir todo el reporting patrimonial (sección 9) sobre el mismo
  ledger contable, en vez de mantener un modelo de reporting paralelo.
- Todas las tablas de tasas/reglas (`tax_profiles`,
  `commission_concepts`, `owner_commission_overrides`,
  `allocation_rules`, `adjustment_rules`) son parametrizables y
  versionadas por vigencia — nunca constantes en código (regla no
  negociable 6/10 de `CLAUDE.md`).

## Pendiente para el ADR de plan contable

El plan de cuentas (`ledger_accounts`) mínimo propuesto está en
`docs/accounting-rules.md`, sujeto a validación por contabilidad (ver
`docs/open-decisions.md`, ítem 7).

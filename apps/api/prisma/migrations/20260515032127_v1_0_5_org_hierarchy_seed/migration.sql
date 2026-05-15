-- ═══════════════════════════════════════════════════════════════════════════
-- v1.0.5 ORG-HIERARCHY-SEED — Multi-tenant 4-level model
-- ═══════════════════════════════════════════════════════════════════════════
-- Brand → Organization → LegalEntity → Property
--
-- Migration backwards-compatible. Cada Organization existente recibe
-- automáticamente UNA LegalEntity hija (auto-creada del countryCode/currency
-- de la Org). Toda Property existente queda vinculada a esa LegalEntity.
--
-- Sin breaking changes: el código existente sigue funcionando porque la
-- relación Property.organizationId se conserva. Property.legalEntityId
-- es NULLABLE durante la transición; v1.1+ migration separada lo hará NOT NULL.
--
-- Ver docs/vision/11-multi-tenant-architecture.md para análisis completo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. CreateTable: brands ────────────────────────────────────────────────
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "brand_colors" JSONB,
    "brand_book_url" TEXT,
    "website_url" TEXT,
    "loyalty_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- ─── 2. CreateTable: fiscal_regimes ────────────────────────────────────────
CREATE TABLE "fiscal_regimes" (
    "id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "tax_authority" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "doc_type_enums" JSONB NOT NULL,
    "tax_codes" JSONB NOT NULL,
    "pac_adapter_class" TEXT,
    "pac_config_schema" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_regimes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fiscal_regimes_country_code_idx" ON "fiscal_regimes"("country_code");

-- ─── 3. CreateTable: legal_entities ────────────────────────────────────────
CREATE TABLE "legal_entities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "fiscal_regime_id" TEXT,
    "country_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "legal_address" JSONB NOT NULL,
    "base_currency" TEXT NOT NULL,
    "pac_credentials" JSONB,
    "accounting_period_start" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "legal_entities_organization_id_idx" ON "legal_entities"("organization_id");
CREATE INDEX "legal_entities_country_code_idx" ON "legal_entities"("country_code");
CREATE UNIQUE INDEX "legal_entities_organization_id_tax_id_key" ON "legal_entities"("organization_id", "tax_id");

-- ─── 4. CreateTable: brand_user_roles ──────────────────────────────────────
CREATE TABLE "brand_user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "role" "SystemRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_user_roles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "brand_user_roles_user_id_idx" ON "brand_user_roles"("user_id");
CREATE INDEX "brand_user_roles_brand_id_idx" ON "brand_user_roles"("brand_id");
CREATE UNIQUE INDEX "brand_user_roles_user_id_brand_id_role_key" ON "brand_user_roles"("user_id", "brand_id", "role");

-- ─── 5. CreateTable: legal_entity_user_roles ───────────────────────────────
CREATE TABLE "legal_entity_user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "role" "SystemRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_entity_user_roles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "legal_entity_user_roles_user_id_idx" ON "legal_entity_user_roles"("user_id");
CREATE INDEX "legal_entity_user_roles_legal_entity_id_idx" ON "legal_entity_user_roles"("legal_entity_id");
CREATE UNIQUE INDEX "legal_entity_user_roles_user_id_legal_entity_id_role_key" ON "legal_entity_user_roles"("user_id", "legal_entity_id", "role");

-- ─── 6. AlterTable: organizations.brand_id (NULLABLE) ──────────────────────
ALTER TABLE "organizations" ADD COLUMN "brand_id" TEXT;

-- ─── 7. AlterTable: properties (legal_entity_id + organization_id NOT NULL) ─
-- Drop FK temporal para poder cambiar el tipo de columna
ALTER TABLE "properties" DROP CONSTRAINT "properties_organization_id_fkey";
ALTER TABLE "properties" ADD COLUMN "legal_entity_id" TEXT;
-- GUARD: si alguna property tiene organization_id NULL, este migration fallará aquí
-- (decisión deliberada — no hay caso válido para una property sin tenant).
-- Si fallara: investigar las rows null antes de re-correr el migration.
ALTER TABLE "properties" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "properties_legal_entity_id_idx" ON "properties"("legal_entity_id");

-- ═══════════════════════════════════════════════════════════════════════════
-- DATA BACKFILL — Auto-crear 1 LegalEntity por Organization existente
-- ═══════════════════════════════════════════════════════════════════════════

-- Seed fiscal_regimes con los 10 países LATAM identificados. Solo MX y CO
-- activos inicialmente; el resto inactivos hasta certificar adapter PAC.
-- Cada uno con doc_type_enums + tax_codes mínimo viable. El adapter concreto
-- se construye per país siguiendo el roadmap (MX/CO en v1.0.x; CR/PE/PA en v1.1.x).

INSERT INTO "fiscal_regimes" (id, country_code, display_name, tax_authority, active, doc_type_enums, tax_codes, pac_adapter_class, updated_at)
VALUES
  -- México — más complejo de LATAM, base del producto
  ('MX_CFDI4', 'MX', 'CFDI 4.0 México', 'SAT', true,
   '{"invoice":"I","creditNote":"E","paymentComplement":"P","debitNote":"D","cancellation":"C"}'::jsonb,
   '{"IVA":{"rate":16,"display":"IVA 16%"},"ISH_QR":{"rate":3,"display":"ISH Quintana Roo 3%"},"SANITATION_TULUM":{"flat":4,"display":"Saneamiento Ambiental Tulum USD 4/noche"}}'::jsonb,
   'MX_FacturamaAdapter', CURRENT_TIMESTAMP),

  -- Colombia — UBL XML estándar, segundo mercado objetivo
  ('CO_DIAN', 'CO', 'Facturación Electrónica Colombia', 'DIAN', true,
   '{"invoice":"01","creditNote":"91","debitNote":"92"}'::jsonb,
   '{"IVA":{"rate":19,"display":"IVA 19%"},"INC":{"rate":8,"display":"Impuesto al Consumo 8%"}}'::jsonb,
   'CO_OlimpiaAdapter', CURRENT_TIMESTAMP),

  -- Centroamérica — adapters v1.1.x-v1.2.x
  ('CR_TRIBU', 'CR', 'Factura Electrónica Costa Rica', 'Hacienda', false,
   '{"invoice":"01","creditNote":"03","debitNote":"02"}'::jsonb,
   '{"IVA":{"rate":13,"display":"IVA 13%"},"TURISM":{"rate":0,"display":"Servicios turísticos exentos"}}'::jsonb,
   NULL, CURRENT_TIMESTAMP),

  ('PE_SUNAT', 'PE', 'Comprobante Electrónico Perú', 'SUNAT', false,
   '{"invoice":"01","creditNote":"07","debitNote":"08"}'::jsonb,
   '{"IGV":{"rate":18,"display":"IGV 18%"}}'::jsonb,
   NULL, CURRENT_TIMESTAMP),

  ('PA_DGI', 'PA', 'Factura Electrónica Panamá', 'DGI', false,
   '{"invoice":"01","creditNote":"04","debitNote":"05"}'::jsonb,
   '{"ITBMS":{"rate":7,"display":"ITBMS 7%"},"ISC":{"rate":10,"display":"ISC hospedaje 10%"}}'::jsonb,
   NULL, CURRENT_TIMESTAMP),

  ('GT_FEL', 'GT', 'Factura Electrónica en Línea Guatemala', 'SAT-GT', false,
   '{"invoice":"FACT","creditNote":"NCRE","debitNote":"NDEB"}'::jsonb,
   '{"IVA":{"rate":12,"display":"IVA 12%"}}'::jsonb,
   NULL, CURRENT_TIMESTAMP),

  ('SV_HACIENDA', 'SV', 'DTE El Salvador', 'Ministerio Hacienda', false,
   '{"invoice":"01","creditNote":"05"}'::jsonb,
   '{"IVA":{"rate":13,"display":"IVA 13%"}}'::jsonb,
   NULL, CURRENT_TIMESTAMP),

  ('HN_SAR', 'HN', 'CAI Honduras', 'SAR', false,
   '{"invoice":"01","creditNote":"04"}'::jsonb,
   '{"ISV":{"rate":15,"display":"ISV 15%"},"TURISM_HN":{"rate":4,"display":"Tasa turística 4%"}}'::jsonb,
   NULL, CURRENT_TIMESTAMP),

  -- Brasil + Argentina — adapters v1.3.x (los más complejos por estado/provincia)
  ('BR_NFE', 'BR', 'Nota Fiscal Eletrônica Brasil', 'Receita Federal', false,
   '{"invoice":"NFE","creditNote":"NFE_DEV"}'::jsonb,
   '{"ICMS":{"rate":17,"display":"ICMS variable por estado","perStateRates":true},"ISS":{"rate":5,"display":"ISS hospedaje 5%"}}'::jsonb,
   NULL, CURRENT_TIMESTAMP),

  ('AR_AFIP', 'AR', 'Facturación Electrónica Argentina', 'AFIP', false,
   '{"invoice":"FA","creditNote":"FB"}'::jsonb,
   '{"IVA":{"rate":21,"display":"IVA 21%"}}'::jsonb,
   NULL, CURRENT_TIMESTAMP);

-- Backfill LegalEntities: 1 row por Organization existente.
-- Hereda countryCode/currency del Org legacy. fiscal_regime_id se asigna
-- si el countryCode coincide con un FiscalRegime activo, sino NULL.
-- El taxId placeholder 'PENDING-{org_id}' marca que el cliente debe
-- actualizar su RFC/NIT/RUC real durante Zenix Activate setup.

INSERT INTO "legal_entities" (
  id, organization_id, fiscal_regime_id, country_code, name, tax_id,
  legal_address, base_currency, active, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  o.id,
  -- Auto-link a FiscalRegime activo si countryCode coincide:
  (SELECT id FROM fiscal_regimes WHERE country_code = o.country_code AND active = true LIMIT 1),
  o.country_code,
  o.name || ' — entidad fiscal',
  'PENDING-' || substring(o.id, 1, 8),
  '{}'::jsonb,
  o.currency,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM legal_entities le WHERE le.organization_id = o.id
);

-- Vincular cada Property existente a la LegalEntity de su Organization.
UPDATE properties p
SET legal_entity_id = (
  SELECT id FROM legal_entities le
  WHERE le.organization_id = p.organization_id
  ORDER BY le.created_at ASC
  LIMIT 1
)
WHERE p.legal_entity_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- ADD FOREIGN KEYS (al final — después del backfill para no fallar con orfanas)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_fiscal_regime_id_fkey"
  FOREIGN KEY ("fiscal_regime_id") REFERENCES "fiscal_regimes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "brand_user_roles" ADD CONSTRAINT "brand_user_roles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brand_user_roles" ADD CONSTRAINT "brand_user_roles_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legal_entity_user_roles" ADD CONSTRAINT "legal_entity_user_roles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legal_entity_user_roles" ADD CONSTRAINT "legal_entity_user_roles_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "properties" ADD CONSTRAINT "properties_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

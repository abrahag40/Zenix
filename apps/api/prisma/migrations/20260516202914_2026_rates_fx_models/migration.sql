-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL,
    "quote_currency" TEXT NOT NULL,
    "rate" DECIMAL(12,6) NOT NULL,
    "source" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_fx_rates" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL,
    "quote_currency" TEXT NOT NULL,
    "rate" DECIMAL(12,6) NOT NULL,
    "spread_from_official" DECIMAL(5,4),
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "updated_by_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rates_effective_date_idx" ON "exchange_rates"("effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_organization_id_base_currency_quote_currency_key" ON "exchange_rates"("organization_id", "base_currency", "quote_currency", "effective_date", "source");

-- CreateIndex
CREATE INDEX "property_fx_rates_property_id_base_currency_quote_currency__idx" ON "property_fx_rates"("property_id", "base_currency", "quote_currency", "valid_from");

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_fx_rates" ADD CONSTRAINT "property_fx_rates_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

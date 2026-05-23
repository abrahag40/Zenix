---
Audiencia: Dev preparando Stage 4 cert
Tipo: Setup ops doc
Status: Activo
Padre: docs/ops/channex-cert-stage4-walkthrough.md
Última actualización: 2026-05-22
---

# Channex Sandbox Seed — Setup pre Stage 4

> **Anti-pattern oficial AP-2.4**: "We don't want to see a full sync with all
> rooms with 1 availability and 100 USD as example. Better the availability
> and prices are different like a real hotel."
>
> Este doc lista el seed mínimo que el sandbox property necesita ANTES de
> agendar Stage 4 live screenshare, para que el reviewer vea data
> realísticamente variada.

---

## Property test ya creado en sandbox

- **Channex Property ID**: `ef0bdedf-e7fb-43fd-8664-a4dfb6bcec13`
- **Title**: "Hotel Boutique Test Tulum"
- **Timezone**: `America/Cancun`
- **Currency**: USD
- **Owner**: Abraham Hernandez (abrahag40@gmail.com)

Verificado via `gateway.listProperties()` el 2026-05-22.

---

## Setup mapping en Channex sandbox (manual)

1. Login a `https://staging.channex.io` con la cuenta empresarial
2. Crear los siguientes **room types** (mínimo 2 per Channex cert spec):
   - **Twin Room** — max occupancy 2
   - **Double Room** — max occupancy 2
3. Crear los siguientes **rate plans** (mínimo 4 — 2 per room type):
   - Twin > **Best Available Rate (BAR)** — base $100
   - Twin > **Bed & Breakfast (BB)** — base $120
   - Double > **Best Available Rate (BAR)** — base $100
   - Double > **Bed & Breakfast (BB)** — base $120

Anotar los UUIDs que Channex asigne a cada room type y rate plan —
necesarios para las env vars del cert test.

---

## Env vars necesarias para correr los cert tests

En `apps/api/.env` (gitignored):

```bash
# Sandbox API key (ya seteada Day 1)
CHANNEX_API_KEY="ufGoLwAi..."
CHANNEX_BASE_URL="https://staging.channex.io/api/v1"

# Cert test setup (Day 7+ — agregar antes de Stage 4)
CHANNEX_SANDBOX_PROPERTY_ID="ef0bdedf-e7fb-43fd-8664-a4dfb6bcec13"
CHANNEX_SANDBOX_ROOM_TYPE_ID="<UUID-del-Twin-room-type>"
CHANNEX_SANDBOX_RATE_PLAN_ID="<UUID-del-Twin-BAR-rate-plan>"
```

Sin estos, los integration tests skip los escenarios correspondientes
con mensaje explícito.

---

## Variación de data — anti-AP-2.4

Cuando llegue el momento de seed productivo del sandbox (antes de la
live screenshare), seguir estas reglas:

### Rates
- Variar precio por **día de la semana**: lunes-jueves base, viernes
  +20%, sábado +30%, domingo +10%
- Variar precio por **temporada**: alta (diciembre, semana santa, julio)
  +50%, baja resto
- 4 rate plans con precios distintos entre sí (BAR < BB < Premium)
- Promotions ocasionales (10-15% off) en fechas aleatorias

### Availability
- Iniciar 5 unidades per room type
- Crear ~20 reservas distribuidas en los próximos 60 días para que la
  availability tenga "huecos" naturales

### Restrictions
- Min stay 2 noches en weekends
- Min stay 3 noches en holidays (Navidad, Año Nuevo)
- Stop sell en una fecha específica (ej. mantenimiento programado 15
  enero)
- Closed-to-arrival en domingo (común en boutique)

### Anti-AP-2.4 verification
Antes de la screenshare, correr en Channex sandbox:
```bash
curl -H "user-api-key: $CHANNEX_API_KEY" \
  https://staging.channex.io/api/v1/availability?property_id=...&date_from=...
```

Verificar que la respuesta NO retorna patrones uniformes (todos los
valores iguales). Reviewer espera ver heterogeneidad.

---

## Script Bash para automatizar el seed (post-Stage 4)

> TODO: una vez RATES sprint exista, agregar `apps/api/prisma/seed-channex-sandbox.ts`
> que genere los rate plans + restrictions con variación realista
> automáticamente via Channex API. Por ahora, manual setup en extranet.

---

## Verificación final pre-live-screenshare

- [ ] Property ID seteado en `.env`
- [ ] Al menos 2 room types creados
- [ ] Al menos 4 rate plans con precios distintos
- [ ] ~20 reservas test creadas (puede ser via Booking.com test acct
  conectado al sandbox o creando manualmente en extranet)
- [ ] Min stay configurado en algunas fechas
- [ ] Stop sell configurado en al menos 1 fecha
- [ ] Correr `npx jest channex.cert-tests.integration --runInBand` →
  ≥11 tests verde (los 9 skipped solo si RATES sprint sigue pending)

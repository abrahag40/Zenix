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

## Script automatizado del seed — ✅ LISTO (2026-06-18)

> Ya NO es manual. `apps/api/prisma/scripts/seed-channex-sandbox.ts` crea los
> room types + rate plans con precios variados + empuja disponibilidad y
> restricciones variadas (anti-AP-2.4) **vía la API del sandbox**, idempotente,
> y descubre los UUIDs. Tiene una guarda que aborta si `CHANNEX_BASE_URL` no es
> `staging.channex.io` (nunca toca producción).

```bash
cd apps/api
set -a && source .env && set +a
npx ts-node -r tsconfig-paths/register prisma/scripts/seed-channex-sandbox.ts
```

Imprime las 3 líneas `CHANNEX_SANDBOX_*` para pegar en `.env`. Ejecutado contra
`ef0bdedf-…` el 2026-06-18 → room types Twin/Double + 4 rate plans ($100/$122/
$135/$158) + 120 entries availability + 12 restrictions, todo HTTP 200.

UUIDs descubiertos (sandbox "Hotel Boutique Test Tulum"):
- `CHANNEX_SANDBOX_PROPERTY_ID="ef0bdedf-e7fb-43fd-8664-a4dfb6bcec13"`
- `CHANNEX_SANDBOX_ROOM_TYPE_ID="10844914-07ef-47f0-82e8-2f6857c57166"` (Twin Room)
- `CHANNEX_SANDBOX_RATE_PLAN_ID="14a7353c-f3cf-4d99-ab1b-0d0cf9015e7a"` (Twin BAR)

**Lo único pendiente (acción owner, requiere extranet):** conectar una OTA de
prueba (Booking.com test) y crear ~20 reservas para huecos de availability
reales + para demostrar el Test 11 (recibir reserva) en vivo durante la
screenshare.

---

## Verificación final pre-live-screenshare

- [x] Property ID seteado en `.env` ✅ (2026-06-18)
- [x] Al menos 2 room types creados ✅ (Twin + Double + 5 previos)
- [x] Al menos 4 rate plans con precios distintos ✅ ($100/$122/$135/$158 + previos)
- [ ] ~20 reservas test creadas (acción owner — requiere Booking.com test acct
  conectado al sandbox o creación manual en extranet)
- [x] Min stay configurado en algunas fechas ✅ (fin de semana, vía seed)
- [x] Stop sell configurado en al menos 1 fecha ✅ (vía seed)
- [x] **`npx jest channex.cert-tests.integration --runInBand` → 21/21 verde** ✅
  (2026-06-18, con las 3 vars `CHANNEX_SANDBOX_*` seteadas)

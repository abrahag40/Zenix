# Descongelación de Zenix — 2026-09-20

> **Decisión del CEO (Abraham), 2026-09-19:** *«descongela Zenix»*. Es el **disparador (b)** que
> el roadmap de Zentor dejó escrito el 2026-08-27 (`Zentor/docs/01-empezar/roadmap.md` §Fase 3:
> *«(a) un hotel real que pida las dos cosas, o (b) que el CEO decida reactivar Zenix»*). Y hay
> candidato al (a): **Azucar Hotel Tulum**, el piloto del ecosistema hotelero de ZaharDev, que
> **no opera ningún PMS**.
>
> Este documento registra el **estado medido desde el código** el día de la descongelación —no
> desde la memoria ni desde el `CLAUDE.md`, que sigue diciendo «última actualización 2026-05-29»—
> y las decisiones que hay que tomar **antes** del primer sprint.

## 1 · Estado medido, 2026-09-20

| | Medido |
|---|---|
| Etiqueta | `v1.0.0` (2026-06-11) |
| Commits | 539 · último **2026-06-21** (`7823043`, remediación del rechazo de certificación PMS de Channex) · **91 días sin actividad** |
| Ramas | `main` = `origin/main` (`db7f220`, PR #133). `fix/channex-cert-remediation` estaba **sólo en la Mac** hasta hoy: empujada y abierta como **[PR #134](https://github.com/abrahag40/Zenix/pull/134)**, sin mergear (ver §3) |
| PRs abiertos anteriores | #126, #125, #124, #123 (migración, cash-arqueo) y #42 (LMS), todos de mayo–junio |
| Pruebas unitarias (`apps/api`, `jest --ci`, 407 s) | **94 suites en verde, 1 en rojo, 2 saltadas · 1 205 pruebas pasan, 1 falla, 31 saltadas.** La roja es `nova/channex-crud-schema.spec.ts` (exige el sandbox de Channex con datos vivos; el CI ya la excluye por eso, según `CLAUDE.md`) |
| Esquema | 113 modelos Prisma · apps `api` (NestJS), `web` (React/Vite), `mobile` (Expo) |
| Repositorio | **PÚBLICO** en GitHub |
| Sin versionar en la Mac | `docs/ops/channex-cert-submission-2026-06-21.md` (la 2ª entrega de certificación; **se versiona en este PR**, sólo trae ids del sandbox) y `apps/api/prisma/scripts/seed-azucar-demo.ts` (ver §4) |

**Lo que Zenix ya tiene y el piloto necesita** (leído de `CLAUDE.md` y `docs/sprints/`):
disponibilidad con guard transaccional anti-sobreventa, Channex entrada y salida (certificación
en curso), tarifas y restricciones, `MetricsDailySnapshot` (ocupación, ADR, RevPAR, cancelación,
no-show, LOS, mezcla de canales) con *pickup* y *pace*, housekeeping móvil, pre-check-in con token,
y el plan del **motor de reservas directas** (`BOOKING-ENGINE-plan.md`: el 70 % existe; Fase 1
posible en `PAY_AT_HOTEL` sin Stripe).

## 2 · Qué cambia con el piloto

El sitio del piloto publica hoy una **solicitud sujeta a confirmación** (su ADR-0003) *porque no
hay PMS*. Con Zenix esa premisa cae y la misma página puede pasar al motor de reservas con
disponibilidad real. El módulo de reserva del sitio está aislado (`booking/`) precisamente para
cambiar esa salida. **Es el primer consumidor real del booking engine**, y el primer hotel que
entra por «Zenix Activate».

Lo que el piloto aporta a Zenix, en el orden en que el propio Zenix lo escribió:

| # | Qué | Estado en Zenix | Aporte del piloto |
|---|---|---|---|
| 1 | Saber si la certificación Channex **pasó** | 2ª entrega enviada el 2026-06-21; respuesta del auditor **desconocida** | Nada: es ops |
| 2 | Booking engine Fase 1 (`PAY_AT_HOTEL`) | Plan aprobado; **decisión de secuencia A/B pendiente** | El sitio que lo consume |
| 3 | Zenix pide CFDI, Zentor timbra | Especificado en `Zentor/docs/sprints/EN-COLA-zenix-timbra-con-zentor.md` | El hospedaje con IVA + ISH como caso real |
| 4 | Exponer `MetricsDailySnapshot` al consultor (Nova) y al plugin `zahardev-hotel` | Existe para SUPERVISOR; sin API para partner | La métrica de valor del servicio: mezcla de canales |
| 5 | Marketing capa 1 (transaccional, WhatsApp, UTM, códigos promo) | `ZENIX-MARKETING-research.md` recomienda 3 capas | La franja de promociones del sitio no dice qué promociones son porque no hay dónde definirlas |

## 3 · 🔴 Decisiones antes del primer commit de producto — ninguna es código

1. **Las seis duplicaciones Zenix ↔ Zentor** (dos Novas, dos cobros de suscripción, dos wizards,
   dos modelos de tenencia…): `Zentor/docs/03-decisiones/frontera-zenix-zentor.md` las lista y
   dice que *«no se arreglan con un API: se deciden»*. La regla de frontera ya está: *Zenix es
   dueño del HUÉSPED y del CUARTO; Zentor de la MERCANCÍA y del DINERO ante el SAT.*
2. **Cuál documento de precios manda.** `docs/prices-packages.md` (2026-05-13) dice
   **$149 / $299 / $499** (Essentials / Professional / Enterprise); `docs/vision/02-product-family.md`
   dice **$79 / $179 / …** (Starter / Growth). Los dos se declaran contrato comercial.
3. **PR #134**: mergear o no la remediación de Channex. Sin la respuesta del auditor, `main`
   podría absorber un contrato de ARI que vuelva a cambiar. Con ella delante, se decide en un
   minuto.
4. **Secuencia del booking engine**: opción A (PAY-CORE primero) u opción B (Fase 1
   `PAY_AT_HOTEL`, prepago cuando aterrice PAY-CORE). El plan recomienda B.

## 4 · ⚠️ `seed-azucar-demo.ts` — se queda SIN versionar, a propósito

Existe en la Mac desde una sesión del **2026-09-17** (no consta en este repo ni en el del piloto):
reconfigura la propiedad de demo con el inventario del hotel y **tarifas en MXN por tipo**
atribuidas al dueño. Dos motivos para no commitearlo hoy:

- Este repositorio es **público**. Publicar tarifas de un cliente que en su propio sitio **no
  publica ninguna** (su C3 sigue abierta) no es una decisión que tome un seed.
- Agrupa las 24 unidades en **3 tipos operativos** (bungalow ×6, doble queen ×12, king ×6)
  mientras el sitio vende **10 tipos**. Es una discrepancia útil —la clasificación operativa no
  es la comercial— que hay que resolver con el hotel, no fundir en silencio.

Cuando se decida, entra en una rama con los precios sacados a un archivo ignorado.

## 5 · Lo que NO se hizo en esta sesión, y por qué

- No se tocó el roadmap de **Zentor**: su Fase 3 pide *«decirlo entonces»*, y hay que escribir
  ahí que el disparador se activó — pero Zentor no estaba en el alcance autorizado de esta sesión.
- No se mergeó PR #134 (ver §3.3).
- No se arrancó ningún sprint: los sprints de esta casa no arrancan sin su archivo en
  `docs/sprints/` con Definition of Ready verificada, y la DoR depende de §3.

---
Audiencia: Abraham — llenado del formulario de certificación Channex (Test Scenarios)
Tipo: Resultados de ejecución (task ids) — VERIFICADOS contra Channex
Status: ACTIVO
Última actualización: 2026-06-19
---

# Channex Cert — Task IDs por Test Scenario (set final verificado)

> Cada task id se **verificó consultando a Channex** (`GET /tasks/:id`):
> `success: true` + el número exacto de cambios guardados. No es "confiar en el
> 200" — es leer lo que Channex realmente almacenó.
>
> Valores oficiales exactos (verificados contra la doc). Fix aplicado: las
> tarifas decimales van como STRING (Channex descarta decimales como número).
>
> ⚠️ Pega SOLO el UUID. Un ID por línea. Test #1 = 2 líneas.

## ✅ Set final (corrida verificada 2026-06-19)

| Test | task id | Channex guardó |
|---|---|---|
| **#1 availability** | `e4d71383-b076-4852-9788-1e5a812cdc30` | 2/2 ✓ |
| **#1 rates+restr** | `b2cac0ff-9fa3-40fe-8051-983fc7b2f448` | 4/4 ✓ |
| **#2** | `7090ee6e-2af2-495c-924d-06d2487707f4` | 1/1 ✓ |
| **#3** | `e106418f-b8c4-4ef1-a8a6-ad825ffd2938` | 3/3 ✓ |
| **#4** | `0327dead-122a-43e1-90b7-fa6497233d88` | 3/3 ✓ |
| **#5** | `cd9bedb9-6e67-44cd-a3c4-ff731bc42a13` | 3/3 ✓ |
| **#6** | `21270b34-f84b-414d-a400-2962b78f0ceb` | 3/3 ✓ |
| **#7** | `275ca230-8359-41c5-9205-23b2ab9c3689` | 4/4 ✓ |
| **#8** | `b11da54d-eda1-4c34-80e5-c1e9c1fd3594` | 2/2 ✓ |
| **#9** | `d81490b8-3f19-4fba-baf9-271ce88ed7e5` | 2/2 ✓ |
| **#10** | `8c1d4596-5eee-4e9f-ac74-2c0d115185e9` | 2/2 ✓ |

## Qué ya enviaste y qué hacer (acción mínima)

| Test | Lo que enviaste | ¿Cambiar? |
|---|---|---|
| #1 | `216bb964…` + `cfa9c98c…` | **NO** — válidos (2/2 y 4/4, sin decimales). Déjalos. |
| #2 | `a26e3cd3…` | **NO** — válido (1/1, rate 333 entero). Déjalo. |
| #3 | `3b550de8…` | **SÍ, reemplazar** por `e106418f…` (el viejo guardó 2/3 — le faltaba el decimal $456.23). |
| #4–#10 | (aún no enviados) | usa los del set final de arriba. |

> **Solo el Test #3 necesita corregirse en el formulario.** Todo lo demás que ya
> subiste está bien.

## Hallazgos técnicos (por si el reviewer pregunta)

1. **Decimales en tarifas**: Channex DESCARTA una tarifa decimal enviada como
   número JSON (`456.23` → no crea task). Debe ir como string (`"456.23"`).
   Arreglado en `channex.gateway.ts` (siempre stringify del rate). Verificado.
2. **`min_stay` legacy**: Channex no crea task con el campo `min_stay`; hay que
   usar `min_stay_through`. Soportamos `min_stay_through` y `min_stay_arrival`.
3. Los task ids cambian en cada corrida (cada ejecución crea tasks nuevas).
   Este set es de UNA corrida consistente y verificada — úsalo completo.
4. Tests #11–#14 no generan task id (recibir-reserva/ack, rate limit, delta-only,
   declaraciones) — se cubren en el live screenshare + doc de declaraciones.

## Re-generar + verificar

```bash
cd apps/api && set -a && source .env && set +a
npx ts-node -r tsconfig-paths/register prisma/scripts/run-channex-cert-fullsync.ts
npx ts-node -r tsconfig-paths/register prisma/scripts/run-channex-cert-scenarios.ts
# Verificar un task: GET https://staging.channex.io/api/v1/tasks/<id> con header user-api-key
```

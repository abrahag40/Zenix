---
Audiencia: Abraham — llenado del formulario de certificación Channex
Tipo: Referencia de IDs (sandbox)
Status: ACTIVO
Última actualización: 2026-06-19
---

# Channex Cert — IDs de la propiedad de prueba (sandbox)

> Creados por `apps/api/prisma/scripts/seed-channex-cert-property.ts` contra
> `staging.channex.io` el 2026-06-19. Cumplen la especificación exacta del
> formulario (Test Property - Zenix, USD, 2 room types, 4 rate plans 100/120).
>
> Verificables vía las List APIs que el reviewer referenció:
> - `GET https://staging.channex.io/api/v1/properties`
> - `GET https://staging.channex.io/api/v1/room_types?filter[property_id]=94d70281-07a8-4e6b-9273-724fa3b725dd`
> - `GET https://staging.channex.io/api/v1/rate_plans?filter[property_id]=94d70281-07a8-4e6b-9273-724fa3b725dd`

## Property

| Campo | Valor |
|---|---|
| Property Name | `Test Property - Zenix` |
| Currency | USD |
| **property_id** | `94d70281-07a8-4e6b-9273-724fa3b725dd` |

## Room Types

| Room Type | Occupancy | room_type_id |
|---|---|---|
| Twin Room | 2 | `2e0b297f-b44c-4d60-87c5-1d3e27219628` |
| Double Room | 2 | `cdff8770-40ff-4f2d-b402-2463a2eec9c2` |

## Rate Plans

| Room Type | Rate Plan | Default Rate | rate_plan_id |
|---|---|---|---|
| Twin Room | Best Available Rate | 100 | `88a90aa7-1bcc-41e4-a3dd-3e2a35227028` |
| Twin Room | Bed & Breakfast Rate | 120 | `56319005-c419-43af-b05b-5d3ad1944592` |
| Double Room | Best Available Rate | 100 | `c57ad75e-aeee-434e-9ce1-2170f379912c` |
| Double Room | Bed & Breakfast Rate | 120 | `ca745836-8385-4a9c-bad7-15fede59a755` |

> El mapeo room-type ↔ rate-plan se conoce por el orden de creación (el List API
> de Channex no agrupa por room type en la respuesta plana). Verificación cruzada:
> cada rate_plan trae su `room_type_id` en el detalle individual si el reviewer
> lo pide.

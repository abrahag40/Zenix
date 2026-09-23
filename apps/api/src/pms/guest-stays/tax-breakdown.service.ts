import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import { calculateTaxes } from '../fiscal/tax-calculator'
import { resolveFiscalPolicy } from '../fiscal/fiscal-policies'

/**
 * TaxBreakdownService — adaptador de PERSISTENCIA sobre el cálculo fiscal.
 *
 * 🔴 Este servicio ya NO calcula impuestos. Lee la estadía, la traduce a la
 * entrada de `calculateTaxes()` —función pura, `../fiscal/tax-calculator`— y
 * traduce el resultado de vuelta al contrato que ya consume la UI.
 *
 * POR QUÉ SE PARTIÓ EN DOS (docs/vision/18, C1):
 *
 *   · Publicar un precio en el sitio del hotel necesita el **cálculo**.
 *     Cobrarlo y declararlo necesita la **persistencia**. Mientras el cálculo
 *     vivía atado a Prisma y al contexto de inquilino, el puerto público no
 *     podía reusarlo, y la alternativa era duplicar la aritmética fiscal en
 *     dos lugares. Duplicar el cálculo del dinero es cómo se termina con dos
 *     totales distintos para la misma noche.
 *
 * QUÉ CAMBIÓ DE COMPORTAMIENTO, Y POR QUÉ:
 *
 *   1. **ISH 6% → 5% para hoteles.** Ley del ISH de Quintana Roo art. 8,
 *      reforma POE 16-dic-2025: 5% general; el 6% es SÓLO para los supuestos
 *      de la fracción V del art. 4, que son «departamento, casas y villas
 *      particulares». Un hotel es la fracción I. Se estaba cobrando de más.
 *
 *   2. **El desglose ahora cuadra.** La aritmética anterior operaba en
 *      flotantes y redondeaba cada renglón por separado: medido sobre los
 *      4,990,001 totales entre $100 y $50,000, **1,554,265 (31.1%) no
 *      sumaban** el importe cobrado. Ahora es aritmética entera en centavos
 *      con el residuo asignado explícitamente, y hay un barrido exhaustivo
 *      en `tax-calculator.spec.ts` que lo verifica.
 *
 * ANTIPATRÓN EVITADO: *anemic wrapper* — dejar el cálculo aquí «porque ya
 * estaba» y exponer una copia en el módulo público.
 */

export type { TaxBreakdown, TaxLineItem } from './tax-breakdown.types'
import type { TaxBreakdown } from './tax-breakdown.types'

/**
 * Decimal(10,2) → centavos, EXACTO. Vía cadena y no vía `× 100`, porque
 * `Number('1234.35') * 100 === 123434.99999999999`.
 */
const aCentavos = (d: { toFixed(n: number): string }): number =>
  Number.parseInt(d.toFixed(2).replace('.', ''), 10)

const aPesos = (centavos: number): number => Number((centavos / 100).toFixed(2))

const MS_POR_DIA = 24 * 60 * 60 * 1000

@Injectable()
export class TaxBreakdownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async computeForStay(stayId: string): Promise<TaxBreakdown> {
    const orgId = this.tenant.getOrganizationId()

    const stay = await this.prisma.guestStay.findUnique({
      where: { id: stayId, organizationId: orgId },
      select: {
        id: true,
        totalAmount: true,
        currency: true,
        checkinAt: true,
        scheduledCheckout: true,
        paxCount: true,
        propertyId: true,
      },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    // GuestStay no tiene relación directa a Property — consulta separada.
    const property = await this.prisma.property.findUnique({
      where: { id: stay.propertyId },
      select: { city: true, legalEntity: { select: { countryCode: true } } },
    })

    const policy = resolveFiscalPolicy({
      countryCode: property?.legalEntity?.countryCode ?? 'MX',
      city: property?.city ?? null,
      // Zenix es un PMS: el inventario que administra es de la fracción I del
      // art. 4 (hoteles y similares). El día que se dé de alta una villa
      // particular, esto sale de una columna de Property y no de aquí.
      lodgingKind: 'HOTEL',
    })

    // Noches por fecha de calendario, no por horas: el inventario hotelero se
    // vende por noche. Es la misma razón por la que la restricción contra
    // solapamiento usa `daterange` y no `tsrange` (migración 20260923000000).
    const noches = Math.max(
      1,
      Math.round(
        (Date.parse(stay.scheduledCheckout.toISOString().slice(0, 10)) -
          Date.parse(stay.checkinAt.toISOString().slice(0, 10))) /
          MS_POR_DIA,
      ),
    )

    // `totalAmount` es INCLUSIVO hoy (tarifa con impuestos dentro).
    const r = calculateTaxes({
      lodgingCents: aCentavos(stay.totalAmount),
      mode: 'INCLUSIVE',
      nights: noches,
      occupants: Math.max(1, stay.paxCount),
      currency: stay.currency,
      policy,
    })

    return {
      jurisdiction: r.jurisdiction,
      currency: r.currency,
      base: aPesos(r.lodgingBaseCents + r.ancillaryBaseCents),
      lineItems: r.lines.map((l) => ({
        code: l.code,
        label: l.label,
        calculation: l.kind,
        rate: l.rateBp === null ? 0 : l.rateBp / 10000,
        amount: aPesos(l.amountCents),
        detail: l.detail,
      })),
      totalTaxes: aPesos(r.totalTaxesCents),
      total: aPesos(r.totalCents),
      configured: r.configured,
      note: r.note,
      legalBasis: r.legalBasis,
    }
  }
}

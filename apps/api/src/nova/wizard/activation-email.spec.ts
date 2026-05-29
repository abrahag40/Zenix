/**
 * activation-email.spec.ts
 *
 * Tests del hero box del email de activación.
 * BILLING-DAY1 (Sprint 2026-05-29) — el hero ramifica entre:
 *  - trialDays > 0       → "X días gratis" (Netflix pattern)
 *  - trialDays === 0     → "Primera mensualidad: USD X · Pago inmediato"
 *
 * Probamos los strings clave del HTML + plain-text para garantizar que el
 * cliente recibe el copy correcto según la estrategia comercial del consultor.
 */

import {
  renderActivationHtml,
  renderActivationText,
  type SendActivationEmailInput,
} from './activation-email.service'

const BASE_INPUT: SendActivationEmailInput = {
  to: 'owner@hotel-test.com',
  ownerName: 'Ana García',
  organizationName: 'Hotel Boutique Tulum',
  setupLink: 'https://app.zenix.com/setup/abc123',
  hoursUntilExpiry: 72,
  propertyCount: 1,
}

describe('activation-email — hero box branching (BILLING-DAY1)', () => {
  describe('Netflix path: trialDays > 0', () => {
    const input: SendActivationEmailInput = {
      ...BASE_INPUT,
      subscription: {
        planTier: 'PRO',
        billingCycle: 'monthly',
        trialDays: 14,
        discountApplied: false,
        monthlyAmount: 2400,
        currency: 'MXN',
        propertyCount: 1,
      },
    }

    it('HTML muestra "Versión de prueba activa" + "14 días gratis"', () => {
      const html = renderActivationHtml(input)
      expect(html).toContain('Versión de prueba activa')
      expect(html).toContain('14 días gratis')
      expect(html).toContain('Tu tarjeta NO se carga')
      // NO debe mostrar el hero Day-1
      expect(html).not.toContain('Pago inmediato al activar')
      expect(html).not.toContain('Primera mensualidad')
    })

    it('plain-text muestra VERSIÓN DE PRUEBA ACTIVA con validación $0', () => {
      const text = renderActivationText(input)
      expect(text).toContain('VERSIÓN DE PRUEBA ACTIVA: 14 días gratis')
      expect(text).toContain('Stripe hace una validación de $0')
      expect(text).not.toContain('PAGO INMEDIATO')
    })
  })

  describe('Day-1 path: trialDays === 0', () => {
    const input: SendActivationEmailInput = {
      ...BASE_INPUT,
      subscription: {
        planTier: 'PRO',
        billingCycle: 'monthly',
        trialDays: 0, // Day-1 default
        discountApplied: false,
        monthlyAmount: 2400,
        currency: 'MXN',
        propertyCount: 1,
      },
    }

    it('HTML muestra "Pago inmediato al activar" + monto real formateado MXN', () => {
      const html = renderActivationHtml(input)
      expect(html).toContain('Pago inmediato al activar')
      expect(html).toContain('Primera mensualidad')
      // Intl.NumberFormat es-MX formatea $2,400.00 con espacio non-breaking
      expect(html).toMatch(/\$2,400\.00/)
      // NO debe mostrar el hero Netflix
      expect(html).not.toContain('Versión de prueba activa')
      expect(html).not.toContain('días gratis')
    })

    it('HTML foot copy es Day-1 (cobro inmediato), NO trial', () => {
      const html = renderActivationHtml(input)
      expect(html).toContain('procesa el cobro de la primera mensualidad de forma inmediata')
      expect(html).not.toContain('NO se hace ningún cobro hasta que termine tu período de prueba')
    })

    it('plain-text muestra PAGO INMEDIATO AL ACTIVAR con monto', () => {
      const text = renderActivationText(input)
      expect(text).toContain('PAGO INMEDIATO AL ACTIVAR')
      expect(text).toMatch(/\$2,400\.00/)
      expect(text).not.toContain('VERSIÓN DE PRUEBA ACTIVA')
    })

    it('multiplica monthlyAmount × propertyCount para hoteles multi-property', () => {
      const html = renderActivationHtml({
        ...input,
        subscription: { ...input.subscription!, propertyCount: 3 },
      })
      // 2400 × 3 = 7200 → $7,200.00
      expect(html).toMatch(/\$7,200\.00/)
    })

    it('currency USD → formato USD apropiado', () => {
      const html = renderActivationHtml({
        ...input,
        subscription: { ...input.subscription!, currency: 'USD', monthlyAmount: 99 },
      })
      // Intl es-MX con USD → "USD 99.00" (Node 22 ICU)
      expect(html).toMatch(/USD\s*99\.00/)
    })
  })

  describe('Fallback: sin monthlyAmount + trialDays=0', () => {
    it('no muestra hero box (subscription puede no traer pricing context)', () => {
      const html = renderActivationHtml({
        ...BASE_INPUT,
        subscription: {
          planTier: 'PRO',
          billingCycle: 'monthly',
          trialDays: 0,
          discountApplied: false,
          // monthlyAmount + currency ausentes
        },
      })
      expect(html).not.toContain('Pago inmediato al activar')
      expect(html).not.toContain('Versión de prueba activa')
      // Pero la caja de plan + cycle sigue presente
      expect(html).toContain('Plan PRO')
    })
  })
})

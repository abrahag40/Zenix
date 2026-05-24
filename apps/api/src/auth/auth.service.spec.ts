/**
 * AuthService — Sprint SEC-α, fix MT-3.
 *
 * Valida que switchProperty exija un UserPropertyRole pivot para cualquier
 * propiedad distinta a la del JWT, cerrando el bypass cross-property que
 * existía cuando solo se verificaba `organizationId`.
 *
 * Estándares aplicados:
 *  - OWASP API5:2023 — Broken Function Level Authorization (BFLA)
 *  - OWASP API1:2023 — Broken Object Level Authorization (BOLA)
 *  - NIST SP 800-53 AC-3 — Access Enforcement
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { AuthService } from './auth.service'
import type { JwtPayload } from '@zenix/shared'

describe('AuthService.switchProperty — MT-3 authorization gate', () => {
  function makeService(opts: {
    targetProperty: { id: string; organizationId: string } | null
    staff: { id: string; propertyId: string; userId: string | null } | null
    pivotExists?: boolean
  }) {
    const prismaMock = {
      property: {
        findFirst: jest.fn().mockResolvedValue(
          opts.targetProperty
            ? { id: opts.targetProperty.id, name: 'Property X', type: 'HOTEL' }
            : null,
        ),
      },
      staff: {
        findUnique: jest.fn().mockResolvedValue(
          opts.staff
            ? {
                id: opts.staff.id,
                name: 'Test',
                email: 't@z.co',
                role: 'SUPERVISOR',
                department: 'HOUSEKEEPING',
                level: 'LEAD',
                userId: opts.staff.userId,
                propertyId: opts.staff.propertyId,
              }
            : null,
        ),
      },
      userPropertyRole: {
        findFirst: jest.fn().mockResolvedValue(opts.pivotExists ? { id: 'pivot-1' } : null),
      },
    }
    const jwtMock = { sign: jest.fn().mockReturnValue('signed.jwt.token') }
    // Nova foundation Day 3 — AccessControlService inyectado en AuthService.
    // Mock minimal: resolveLegacyStaff es la única ruta que AuthService.switchProperty
    // o el path legacy de login usa. resolveActor + trimAssignedOrgsForJwt mockeados
    // por defaults para el caso happy (no Nova user).
    const aclMock = {
      resolveLegacyStaff: jest.fn().mockReturnValue({
        tier: 'ORG_STAFF',
        partnerMemberId: null,
        assignedOrgIds: [],
      }),
      resolveActor: jest.fn(),
      trimAssignedOrgsForJwt: jest.fn().mockReturnValue([]),
    }
    return new AuthService(prismaMock as any, jwtMock as any, aclMock as any)
  }

  const actor: JwtPayload = {
    sub: 'staff-A',
    email: 'a@z.co',
    role: 'SUPERVISOR' as any,
    propertyId: 'prop-tulum',
    organizationId: 'org-1',
  }

  it('permite switch al mismo propertyId (no-op idempotente)', async () => {
    const svc = makeService({
      targetProperty: { id: 'prop-tulum', organizationId: 'org-1' },
      staff: { id: 'staff-A', propertyId: 'prop-tulum', userId: 'user-1' },
      pivotExists: false, // no se chequea si target === current
    })
    const r = await svc.switchProperty(actor, 'prop-tulum')
    expect(r.accessToken).toBe('signed.jwt.token')
  })

  it('permite switch cuando UserPropertyRole pivot EXISTE', async () => {
    const svc = makeService({
      targetProperty: { id: 'prop-cancun', organizationId: 'org-1' },
      staff: { id: 'staff-A', propertyId: 'prop-tulum', userId: 'user-1' },
      pivotExists: true,
    })
    const r = await svc.switchProperty(actor, 'prop-cancun')
    expect(r.accessToken).toBe('signed.jwt.token')
    expect(r.user.propertyId).toBe('prop-cancun')
  })

  it('RECHAZA switch cuando UserPropertyRole pivot NO existe (bug MT-3)', async () => {
    const svc = makeService({
      targetProperty: { id: 'prop-cancun', organizationId: 'org-1' },
      staff: { id: 'staff-A', propertyId: 'prop-tulum', userId: 'user-1' },
      pivotExists: false,
    })
    await expect(svc.switchProperty(actor, 'prop-cancun')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('RECHAZA switch cuando Staff es legacy (userId=null) y target ≠ current', async () => {
    const svc = makeService({
      targetProperty: { id: 'prop-cancun', organizationId: 'org-1' },
      staff: { id: 'staff-A', propertyId: 'prop-tulum', userId: null },
    })
    await expect(svc.switchProperty(actor, 'prop-cancun')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rechaza con NotFoundException cuando propertyId no existe / cross-org', async () => {
    const svc = makeService({
      targetProperty: null, // findFirst limited by organizationId returns null
      staff: { id: 'staff-A', propertyId: 'prop-tulum', userId: 'user-1' },
      pivotExists: true,
    })
    await expect(svc.switchProperty(actor, 'prop-otro-org')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rechaza HOUSEKEEPER independiente de pivot', async () => {
    const hkActor: JwtPayload = { ...actor, role: 'HOUSEKEEPER' as any }
    const svc = makeService({
      targetProperty: { id: 'prop-cancun', organizationId: 'org-1' },
      staff: { id: 'staff-A', propertyId: 'prop-tulum', userId: 'user-1' },
      pivotExists: true,
    })
    await expect(svc.switchProperty(hkActor, 'prop-cancun')).rejects.toBeInstanceOf(ForbiddenException)
  })
})

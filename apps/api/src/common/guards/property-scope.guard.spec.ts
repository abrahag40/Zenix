/**
 * PropertyScopeGuard — Sprint SEC-α (bug MT-5).
 *
 * Verifica que el guard:
 *   - permite request sin query.propertyId (no-op)
 *   - permite request donde query.propertyId === actor.propertyId
 *   - rechaza request donde query.propertyId !== actor.propertyId (ForbiddenException)
 *   - permite rutas marcadas @Public() sin tocar TenantContext
 *   - cede pasar (returns true) si TenantContext aún no se inicializó
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PropertyScopeGuard } from './property-scope.guard'
import { TenantContextService } from '../tenant-context.service'

function mockContext(query: Record<string, any>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ query }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext
}

function makeReflector(isPublic: boolean): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector
}

function makeTenant(propertyId: string | null): TenantContextService {
  return {
    getPropertyId: () => {
      if (!propertyId) throw new Error('TenantContext: propertyId not set')
      return propertyId
    },
  } as unknown as TenantContextService
}

describe('PropertyScopeGuard', () => {
  it('permite pasar cuando no hay query.propertyId', () => {
    const guard = new PropertyScopeGuard(makeReflector(false), makeTenant('prop-A'))
    expect(guard.canActivate(mockContext({}))).toBe(true)
  })

  it('permite pasar cuando query.propertyId coincide con el JWT', () => {
    const guard = new PropertyScopeGuard(makeReflector(false), makeTenant('prop-A'))
    expect(guard.canActivate(mockContext({ propertyId: 'prop-A' }))).toBe(true)
  })

  it('lanza ForbiddenException cuando query.propertyId NO coincide (bug MT-5)', () => {
    const guard = new PropertyScopeGuard(makeReflector(false), makeTenant('prop-A'))
    expect(() => guard.canActivate(mockContext({ propertyId: 'prop-B' }))).toThrow(
      ForbiddenException,
    )
  })

  it('permite pasar en rutas @Public() (skip TenantContext)', () => {
    const guard = new PropertyScopeGuard(makeReflector(true), makeTenant(null))
    expect(guard.canActivate(mockContext({ propertyId: 'whatever' }))).toBe(true)
  })

  it('permite pasar (no 500) cuando TenantContext aún no se inicializó', () => {
    const guard = new PropertyScopeGuard(makeReflector(false), makeTenant(null))
    expect(guard.canActivate(mockContext({ propertyId: 'prop-A' }))).toBe(true)
  })

  it('ignora query.propertyId no-string (arrays, números)', () => {
    const guard = new PropertyScopeGuard(makeReflector(false), makeTenant('prop-A'))
    expect(guard.canActivate(mockContext({ propertyId: ['prop-A', 'prop-B'] }))).toBe(true)
    expect(guard.canActivate(mockContext({ propertyId: 123 }))).toBe(true)
  })
})

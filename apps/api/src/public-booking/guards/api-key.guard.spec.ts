import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { ApiKeyGuard } from './api-key.guard'

/**
 * 🔴 EL AGUJERO QUE ESTAS PRUEBAS FIJAN
 *
 * La regla anterior —«si la llave declara orígenes y llega uno que no está,
 * 403»— tiene un hueco que se lee al revés: **lista vacía = cualquier
 * origen**. Y la lista vacía era el valor por omisión.
 *
 * Una llave recién creada y pegada en el JavaScript de una página —que es
 * justo lo que su antiguo prefijo `pk_` invitaba a hacer— funcionaba desde
 * cualquier sitio de internet.
 */
describe('ApiKeyGuard · quién puede usar una llave de reservas', () => {
  const ctx = (headers: Record<string, string>) => {
    const req: Record<string, unknown> = { headers }
    return {
      req,
      ctx: { switchToHttp: () => ({ getRequest: () => req }) } as never,
    }
  }

  const guardCon = (verified: unknown) =>
    new ApiKeyGuard({ verify: jest.fn().mockResolvedValue(verified) } as never)

  const llave = (allowedOrigins: string[]) => ({
    id: 'k1', propertyId: 'prop-1', environment: 'live', allowedOrigins,
  })

  it('🔴 desde un navegador, una llave SIN dominios declarados se rechaza', async () => {
    const guard = guardCon(llave([]))
    const { ctx: c } = ctx({ 'x-api-key': 'sk_live_x', origin: 'https://cualquier-sitio.com' })

    await expect(guard.canActivate(c)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(guard.canActivate(c)).rejects.toThrow(/no declara dominios autorizados/)
  })

  it('servidor a servidor (sin Origin) sigue funcionando sin lista', async () => {
    // Un backend, un curl o un cron no mandan `Origin`. Exigirles una lista de
    // dominios sería pedirles algo que no tienen — y romper integraciones que
    // hoy son legítimas.
    const guard = guardCon(llave([]))
    const { ctx: c, req } = ctx({ 'x-api-key': 'sk_live_x' })

    await expect(guard.canActivate(c)).resolves.toBe(true)
    expect(req.bookingApiKey).toMatchObject({ propertyId: 'prop-1' })
  })

  it('con dominios declarados, sólo pasa el que está en la lista', async () => {
    const guard = guardCon(llave(['https://azucarhotel.com']))

    await expect(
      guard.canActivate(ctx({ 'x-api-key': 'sk_live_x', origin: 'https://azucarhotel.com' }).ctx),
    ).resolves.toBe(true)

    await expect(
      guard.canActivate(ctx({ 'x-api-key': 'sk_live_x', origin: 'https://impostor.com' }).ctx),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('el dominio se compara exacto: un subdominio parecido no cuela', async () => {
    const guard = guardCon(llave(['https://azucarhotel.com']))
    for (const falso of [
      'https://azucarhotel.com.impostor.net',
      'http://azucarhotel.com', // otro esquema es otro origen
      'https://www.azucarhotel.com',
    ]) {
      await expect(
        guard.canActivate(ctx({ 'x-api-key': 'sk_live_x', origin: falso }).ctx),
      ).rejects.toBeInstanceOf(ForbiddenException)
    }
  })

  it('sin llave, o con llave inválida, no se entra', async () => {
    const guard = new ApiKeyGuard({ verify: jest.fn().mockResolvedValue(null) } as never)
    await expect(guard.canActivate(ctx({}).ctx)).rejects.toBeInstanceOf(UnauthorizedException)
  })
})

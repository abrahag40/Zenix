import { promises as fs } from 'fs'
import { join } from 'path'
import { UploadsService } from './uploads.service'

/**
 * M9 — que la foto de un huésped sobreviva a un despliegue.
 *
 * ── EL DEFECTO, DICHO SIN ADORNOS ─────────────────────────────────────────
 * Las fotos vivían SÓLO en `{cwd}/uploads/...`. En un despliegue con
 * contenedor ese disco se va con el contenedor, y la foto del documento de
 * identidad de un huésped desaparece **sin error, sin registro y sin que nadie
 * se entere** hasta que alguien la busca. Pérdida de datos personales,
 * silenciosa y garantizada.
 *
 * ── LA PRUEBA QUE CIERRA M9 ───────────────────────────────────────────────
 * No es «se escribe en la base». Es **borrar el disco y seguir leyendo**, que
 * es exactamente lo que hace un despliegue. Sin ese caso, la base guardaría
 * bytes que nadie lee nunca y el defecto seguiría vivo bajo una capa de código
 * nuevo.
 */
describe('UploadsService — el disco es caché, la base es el almacén', () => {
  const tenant = { getOrganizationId: () => 'org-m9' } as any
  const URL = '/api/uploads/org-m9/precheckin/foto-m9.jpg'
  const CONTENIDO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x11, 0x22])
  const dir = join(UploadsService.rootDir(), 'org-m9', 'precheckin')
  const archivo = join(dir, 'foto-m9.jpg')

  let prisma: any
  let svc: UploadsService

  beforeEach(async () => {
    prisma = {
      uploadedFile: {
        findUnique: jest.fn().mockResolvedValue({ bytes: new Uint8Array(CONTENIDO) }),
        delete: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
    }
    svc = new UploadsService(tenant, prisma)
    await fs.rm(dir, { recursive: true, force: true })
  })

  afterAll(async () => {
    await fs.rm(join(UploadsService.rootDir(), 'org-m9'), { recursive: true, force: true })
  })

  it('🔴 LA PRUEBA QUE CIERRA M9: el disco está vacío —como tras un despliegue— y la foto sigue ahí', async () => {
    const buf = await svc.leerBytes(URL)
    expect(buf).not.toBeNull()
    expect(Buffer.from(buf!)).toEqual(CONTENIDO)
    expect(prisma.uploadedFile.findUnique).toHaveBeenCalled()
  })

  it('🔑 y repone la caché, para que la SIGUIENTE lectura no toque la base', async () => {
    await svc.leerBytes(URL)
    // La reposición es en segundo plano: se espera a que el disco la tenga.
    for (let i = 0; i < 40; i++) {
      try { await fs.access(archivo); break } catch { await new Promise((r) => setTimeout(r, 25)) }
    }
    expect(Buffer.from(await fs.readFile(archivo))).toEqual(CONTENIDO)

    prisma.uploadedFile.findUnique.mockClear()
    const otra = await svc.leerBytes(URL)
    expect(Buffer.from(otra!)).toEqual(CONTENIDO)
    expect(prisma.uploadedFile.findUnique).not.toHaveBeenCalled()
  })

  it('si el archivo SÍ está en disco, no se baja de la base', async () => {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(archivo, CONTENIDO)
    const buf = await svc.leerBytes(URL)
    expect(Buffer.from(buf!)).toEqual(CONTENIDO)
    expect(prisma.uploadedFile.findUnique).not.toHaveBeenCalled()
  })

  it('un archivo que no existe en ningún sitio devuelve null, no revienta', async () => {
    prisma.uploadedFile.findUnique.mockResolvedValue(null)
    expect(await svc.leerBytes(URL)).toBeNull()
  })

  it('readAsDataUri también sobrevive al disco vacío', async () => {
    const uri = await svc.readAsDataUri(URL)
    expect(uri).toBe(`data:image/jpeg;base64,${CONTENIDO.toString('base64')}`)
  })

  // ── Borrado ──────────────────────────────────────────────────────────────

  it('🔴 borrar quita el archivo de la BASE, no sólo del disco', async () => {
    // Una retención que cree haber borrado y no borró es peor que no tener
    // retención, porque nadie vuelve a mirar.
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(archivo, CONTENIDO)
    expect(await svc.deleteByUrl(URL)).toBe(true)
    expect(prisma.uploadedFile.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_scope_filename: { organizationId: 'org-m9', scope: 'precheckin', filename: 'foto-m9.jpg' } },
      }),
    )
    await expect(fs.access(archivo)).rejects.toThrow()
  })

  it('borra de la base aunque el disco ya no lo tuviera', async () => {
    expect(await svc.deleteByUrl(URL)).toBe(true)
    expect(prisma.uploadedFile.delete).toHaveBeenCalled()
  })

  // ── Lo que no cambió: el guardia contra el recorrido de rutas ────────────

  it('sigue rechazando rutas manipuladas, y ni siquiera consulta la base', async () => {
    for (const malo of [
      '/api/uploads/../../etc/passwd',
      '/api/uploads/org/scope/..%2Ffoo.jpg',
      '/api/uploads/org/scope/archivo.png',
      '/otra/cosa',
      '',
    ]) {
      expect(await svc.leerBytes(malo)).toBeNull()
    }
    expect(prisma.uploadedFile.findUnique).not.toHaveBeenCalled()
  })
})

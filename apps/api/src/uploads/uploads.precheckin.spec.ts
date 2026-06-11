import { promises as fs } from 'fs'
import { join } from 'path'
import { UploadsService } from './uploads.service'

/**
 * AUTO-CHECKIN §D-AC4 — helpers de retrieval/borrado de la foto precheckin.
 * No prueba el GET público (eso es supertest); sí la lógica de parseo de path
 * (anti-traversal) + read/delete sobre disco real.
 */
describe('UploadsService precheckin helpers', () => {
  const tenant = { getOrganizationId: () => 'org-test' } as any
  const svc = new UploadsService(tenant)
  const root = UploadsService.rootDir()
  const dir = join(root, 'org-test', 'precheckin')
  const file = join(dir, 'unit-test.jpg')
  const url = '/api/uploads/org-test/precheckin/unit-test.jpg'

  beforeAll(async () => {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(file, Buffer.from([0xff, 0xd8, 0xff, 0xe0])) // JPEG magic
  })
  afterAll(async () => {
    await fs.rm(file, { force: true })
  })

  it('readAsDataUri devuelve data-URI JPEG de un archivo válido', async () => {
    const dataUri = await svc.readAsDataUri(url)
    expect(dataUri).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('readAsDataUri rechaza paths con traversal o formato inválido → null', async () => {
    expect(await svc.readAsDataUri('/api/uploads/org/precheckin/../../etc/passwd')).toBeNull()
    expect(await svc.readAsDataUri('not-an-upload-url')).toBeNull()
    expect(await svc.readAsDataUri('/api/uploads/org/precheckin/x.png')).toBeNull() // solo .jpg
  })

  it('deleteByUrl borra el archivo; segundo intento → false', async () => {
    const tmp = join(dir, 'to-delete.jpg')
    await fs.writeFile(tmp, Buffer.from([0xff, 0xd8]))
    expect(await svc.deleteByUrl('/api/uploads/org-test/precheckin/to-delete.jpg')).toBe(true)
    expect(await svc.deleteByUrl('/api/uploads/org-test/precheckin/to-delete.jpg')).toBe(false)
  })
})

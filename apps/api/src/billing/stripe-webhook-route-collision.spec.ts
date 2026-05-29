/**
 * Canary test — Sprint POST-NETFLIX-TRIAL audit fix.
 *
 * Detección automática del bug que casi se va a producción: 2 controllers
 * declaraban POST /v1/webhooks/stripe (billing + payments legacy). NestJS
 * solo registraba uno (orden del module wins), el otro quedaba en silent
 * fail si el order cambiaba.
 *
 * Este test escanea todos los .controller.ts del repo y verifica que cada
 * (method, path) combo solo aparece UNA vez. Si alguien duplica un controller
 * a futuro, este test falla en CI antes de merge.
 *
 * Pattern de paths que valida:
 *   @Controller('foo/bar') + @Get('baz') → 'GET /foo/bar/baz'
 *   @Controller('webhooks') + @Post('stripe') → 'POST /webhooks/stripe'
 *   @Controller('webhooks/stripe') + @Post() → 'POST /webhooks/stripe' (collision!)
 */
import * as fs from 'fs'
import * as path from 'path'

const SRC_ROOT = path.join(__dirname, '..', '..', 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.controller.ts')) out.push(full)
  }
  return out
}

/**
 * Extrae (method, path) tuples de un archivo controller.
 *
 * NestJS decorators a reconocer:
 *   @Controller('basePath')   →  current base
 *   @Get('subPath') / @Post / @Patch / @Put / @Delete
 *
 * Normaliza paths: trim leading/trailing slashes, removes :param placeholders
 * (porque collide solo si pattern es idéntico).
 */
function extractRoutes(file: string): Array<{ method: string; path: string; file: string }> {
  const src = fs.readFileSync(file, 'utf8')
  const routes: Array<{ method: string; path: string; file: string }> = []

  // Find all @Controller('xxx') declarations + their following class
  const controllerRegex = /@Controller\(\s*['"`]([^'"`]*)['"`]\s*\)/g
  let match: RegExpExecArray | null
  const controllerRanges: Array<{ basePath: string; classStart: number }> = []
  while ((match = controllerRegex.exec(src)) !== null) {
    controllerRanges.push({ basePath: match[1], classStart: match.index })
  }

  if (controllerRanges.length === 0) return routes

  // Find @Get/@Post/etc decorators and associate each with the LATEST
  // controller (the one whose declaration appears before it in the file).
  const methodRegex = /@(Get|Post|Patch|Put|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g
  while ((match = methodRegex.exec(src)) !== null) {
    const method = match[1].toUpperCase()
    const subPath = match[2] ?? ''
    const pos = match.index
    // Find latest controller declared before this position
    const owner = controllerRanges
      .filter((c) => c.classStart < pos)
      .sort((a, b) => b.classStart - a.classStart)[0]
    if (!owner) continue
    const fullPath = [owner.basePath, subPath]
      .filter(Boolean)
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/^\/|\/$/g, '')
    routes.push({ method, path: '/' + fullPath, file: path.relative(SRC_ROOT, file) })
  }

  return routes
}

describe('Stripe webhook route collision canary', () => {
  it('no two controllers declare the same (method, path) combo', () => {
    const files = walk(SRC_ROOT)
    expect(files.length).toBeGreaterThan(10) // sanity

    const allRoutes: ReturnType<typeof extractRoutes> = []
    for (const f of files) allRoutes.push(...extractRoutes(f))

    // Group by (method, path)
    const grouped = new Map<string, typeof allRoutes>()
    for (const r of allRoutes) {
      const key = `${r.method} ${r.path}`
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(r)
    }

    const collisions: Array<{ key: string; files: string[] }> = []
    for (const [key, list] of grouped.entries()) {
      if (list.length > 1) collisions.push({ key, files: list.map((r) => r.file) })
    }

    if (collisions.length > 0) {
      const report = collisions
        .map((c) => `  ${c.key} declarado en:\n    - ${c.files.join('\n    - ')}`)
        .join('\n\n')
      throw new Error(
        `\nROUTE COLLISION detectada — NestJS solo registrará una, la otra queda muerta:\n\n${report}\n\n` +
          'Esto es exactamente el bug que detectamos en /v1/webhooks/stripe entre ' +
          'billing/stripe-webhook.controller.ts y payments/payments.controller.ts ' +
          '(consolidado 2026-05-29). NUNCA dejes 2 controllers para mismo path — usa un ' +
          'dispatcher central como WebhookHandlerService.\n',
      )
    }
  })

  it('POST /v1/webhooks/stripe vive solo en billing/stripe-webhook.controller.ts (sanity)', () => {
    const files = walk(SRC_ROOT)
    const allRoutes: ReturnType<typeof extractRoutes> = []
    for (const f of files) allRoutes.push(...extractRoutes(f))
    const stripeWebhooks = allRoutes.filter(
      (r) => r.method === 'POST' && r.path === '/v1/webhooks/stripe',
    )
    expect(stripeWebhooks).toHaveLength(1)
    expect(stripeWebhooks[0].file).toBe('billing/stripe-webhook.controller.ts')
  })
})

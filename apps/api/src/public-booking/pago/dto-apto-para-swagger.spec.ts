import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SchemaObjectFactory } from '@nestjs/swagger/dist/services/schema-object-factory'
import { ModelPropertiesAccessor } from '@nestjs/swagger/dist/services/model-properties-accessor'
import { SwaggerTypesMapper } from '@nestjs/swagger/dist/services/swagger-types-mapper'
import { PrepararPagoDto } from './pago.dto'

/**
 * Que los DTO se puedan convertir en esquema OpenAPI.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 ESTE ARCHIVO NACE DE UN DESPLIEGUE CAÍDO, no de una buena práctica.
 *
 * El 2026-09-24 `PrepararPagoDto` llevaba un campo decorativo:
 *
 *     @IsOptional() @IsString() nada?: never
 *
 * `never` no es un tipo que Swagger sepa convertir en esquema. Al construir
 * la documentación en el arranque lanzaba
 *
 *     A circular dependency has been detected (property key: "nada")
 *
 * —un mensaje que no menciona ni Swagger ni `never`— y **la API entera no
 * levantaba**. Render lo marcó fallido y siguió sirviendo la versión anterior.
 *
 * Lo que NO lo detectó, y por qué:
 *
 *   · `tsc --noEmit`  → verde. `never` es TypeScript perfectamente válido.
 *   · 240 pruebas     → verdes. Ninguna construye la aplicación; instancian
 *                       servicios con dobles, que es lo correcto para lo suyo.
 *   · el build        → verde. Compilar no es arrancar.
 *
 * El hueco no era «faltaba una prueba de este DTO»: era que **nada en el
 * proyecto ejercitaba el arranque**, y el arranque hace trabajo real —leer
 * metadatos, construir el documento OpenAPI— que puede fallar con todo lo
 * demás en verde. Compilar, pasar pruebas y arrancar son tres cosas distintas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO Y NO UNA PRUEBA DE ARRANQUE COMPLETA
 *
 * Levantar `AppModule` pide base de datos, Redis y las variables de todo el
 * sistema: sería lento, frágil y se acabaría saltando. Esto hace **lo único
 * que falló** —pasar los DTO por la fábrica de esquemas de Swagger— en
 * milisegundos y sin dependencias. Ceremonia proporcional.
 *
 * ⚠️ Y su límite, dicho en voz alta: cubre los DTO que se listan abajo. Un
 * DTO nuevo con el mismo defecto NO se detecta hasta que alguien lo añade a
 * la lista. Por eso va acompañado del escáner de la segunda mitad, que sí
 * mira todos los archivos `dto` y no depende de que nadie se acuerde.
 */

const fabrica = new SchemaObjectFactory(
  new ModelPropertiesAccessor(),
  new SwaggerTypesMapper(),
)

describe('los DTO se convierten en esquema OpenAPI', () => {
  it('🔴 PrepararPagoDto — el que tumbó el despliegue', () => {
    // `any` a propósito: el tipo del acumulador es interno de Swagger y no
    // es lo que esta prueba afirma. Lo que afirma es que NO lance.
    const esquemas: any = {}
    expect(() => fabrica.exploreModelSchema(PrepararPagoDto, esquemas)).not.toThrow()
    expect(esquemas['PrepararPagoDto']).toBeDefined()
  })

  it('la mordida: un DTO con `never` decorado SÍ revienta la fábrica', () => {
    // Se reconstruye el defecto exacto para demostrar que esta prueba mira
    // donde dice mirar. Sin esto, el `not.toThrow()` de arriba podría estar
    // verde porque la fábrica dejó de ejercitarse, no porque el DTO esté bien.
    class DtoRoto {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      nada?: never
    }
    Reflect.defineMetadata(
      'swagger/apiModelProperties',
      { type: undefined, required: false },
      DtoRoto.prototype,
      'nada',
    )
    Reflect.defineMetadata('swagger/apiModelPropertiesArray', [':nada'], DtoRoto.prototype)
    expect(() => fabrica.exploreModelSchema(DtoRoto, {} as any)).toThrow(/circular dependency/i)
  })
})

// ── El escáner, que no depende de que nadie mantenga una lista ──────────────

const recorrer = (dir: string, acc: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) recorrer(p, acc)
    else if (/\.(dto|dto\.[a-z]+)\.ts$/.test(p) || /\/dto\//.test(p)) acc.push(p)
  }
  return acc
}

describe('ningún DTO declara un tipo que Swagger no sepa mapear', () => {
  it('sin `never`, `unknown` ni `symbol` en propiedades de DTO', () => {
    const raiz = join(__dirname, '..', '..')
    const malos: string[] = []
    for (const f of recorrer(raiz).filter((f) => !f.endsWith('.spec.ts'))) {
      const src = readFileSync(f, 'utf8')
      for (const [i, linea] of src.split('\n').entries()) {
        const codigo = linea.trim()
        // Sólo declaraciones de propiedad: `nombre?: tipo`. Un `never` dentro
        // de un comentario o de una firma de función no llega a Swagger.
        if (codigo.startsWith('*') || codigo.startsWith('//')) continue
        if (/^\w+\??\s*:\s*(never|unknown|symbol)\b/.test(codigo)) {
          malos.push(`${f.replace(raiz, '')}:${i + 1}  ${codigo}`)
        }
      }
    }
    expect(malos.join('\n') || 'ninguno').toBe('ninguno')
  })
})

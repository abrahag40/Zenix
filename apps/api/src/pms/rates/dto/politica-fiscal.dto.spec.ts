import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { GuardarPoliticaFiscalDto, VistaPreviaFiscalDto } from './politica-fiscal.dto'

/**
 * 🔴 Esta prueba existe por un defecto real, no por ceremonia.
 *
 * El DTO validaba `propertyId` como `@IsUUID()`. `tsc` compiló, las 12 pruebas
 * del servicio pasaron, y la pantalla devolvía 400 en cuanto se abría: los ids
 * de property en Zenix son legibles (`prop-hotel-tulum-001`), no UUID.
 *
 * Ni el compilador ni las pruebas del servicio ejecutan el `ValidationPipe`,
 * así que ninguno podía verlo. Sólo lo vio abrir el navegador. Esta prueba
 * baja ese hallazgo al nivel más barato en el que se puede detectar.
 */
describe('DTOs de política fiscal', () => {
  const errores = (cls: any, obj: unknown) =>
    validateSync(plainToInstance(cls, obj) as object).flatMap((e) => Object.keys(e.constraints ?? {}))

  it('acepta el id legible de una property de Zenix', () => {
    expect(errores(VistaPreviaFiscalDto, {
      propertyId: 'prop-hotel-tulum-001',
      importesCentavos: [595000],
    })).toEqual([])

    expect(errores(GuardarPoliticaFiscalDto, {
      propertyId: 'prop-hotel-tulum-001',
      tarifaIncluyeImpuestos: false,
    })).toEqual([])
  })

  it('rechaza importes que no son centavos enteros', () => {
    expect(errores(VistaPreviaFiscalDto, { propertyId: 'p', importesCentavos: [5950.5] })).toContain('isInt')
    expect(errores(VistaPreviaFiscalDto, { propertyId: 'p', importesCentavos: [-1] })).toContain('min')
    expect(errores(VistaPreviaFiscalDto, { propertyId: 'p', importesCentavos: [] })).toContain('arrayMinSize')
  })

  it('pone techo al lote: una pantalla no pide mil filas', () => {
    const cien = Array.from({ length: 101 }, () => 100)
    expect(errores(VistaPreviaFiscalDto, { propertyId: 'p', importesCentavos: cien })).toContain('arrayMaxSize')
  })
})

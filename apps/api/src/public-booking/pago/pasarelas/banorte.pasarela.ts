import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import type {
  DatosDelCobro,
  ModoDeConfirmacion,
  PasarelaDePago,
  ResultadoDeCobro,
} from './pasarela'

/**
 * Banorte — Comercio Electrónico (Payworks).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 ESTE ADAPTADOR NO ESTÁ IMPLEMENTADO, Y ESO ES DELIBERADO.
 *
 * Existe para que el día que un hotel diga «cobro por mi banco» el trabajo sea
 * rellenar un archivo, no rediseñar el cobro. Pero **no se inventa el
 * protocolo**: rellenarlo a ojo produciría código que parece listo, pasa las
 * pruebas contra dobles que yo mismo escribí, y falla el día de la
 * certificación con el banco.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE SÍ ESTÁ VERIFICADO (fuentes oficiales, septiembre 2026)
 *
 * · Banorte **no publica una API de pagos autoservicio**. Su portal de
 *   desarrolladores —developers.banorte.com/es/apis— expone una sola API
 *   pública, «API ATM», para localizar cajeros. No hay sandbox público.
 *
 * · Sus productos de cobro, con los nombres del propio banco: «Terminal Punto
 *   de Venta, Terminal Personal Banorte, Interredes, Comercio Electrónico,
 *   Ventana de Comercio Electrónico, Cargos Periódicos, Liga de Pago, MO-TO y
 *   CAT».
 *
 * · **Comercio Electrónico** funciona sobre el motor **Payworks**, y la
 *   integración es un formulario enviado por POST a `https://eps.banorte.com/
 *   recibo`. Es una REDIRECCIÓN, no una API REST.
 *
 * · Requiere **certificación con el banco antes de producción**, y de alta:
 *   contrato de afiliación, ID de afiliación Payworks, usuario y contraseña de
 *   Payworks, ID de terminal, certificado SSL y cuenta de cheques Banorte.
 *
 * · El 3D Secure lo provee Banorte (en Liga de Pago, «operado por Visa Inc.»).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 LO QUE FALTA, Y POR QUÉ NO SE PUEDE ADIVINAR
 *
 * 1. **El manual oficial de integración.** Circulan copias en sitios de
 *    terceros; no se usan. Un manual de pagos sacado de un agregador puede
 *    estar desactualizado en el campo que importa, y el campo que importa aquí
 *    es el del importe.
 *
 * 2. **La variante CIFRADA.** El puerto exige `firmado: true`, y con razón: un
 *    formulario en claro con el importe en un campo oculto es un importe que
 *    el navegador edita con dos clics. Banorte documenta una «Ventana de
 *    Comercio Electrónico Cifrado»; hay que confirmar con el banco qué
 *    algoritmo y qué clave, y ese dato no está publicado.
 *
 * 3. **Si existe aviso servidor-a-servidor.** Lo documentado es el retorno del
 *    navegador, que NO basta —lo controla el navegador—. Mientras no se
 *    confirme un webhook firmado, este adaptador declara
 *    `retorno-del-navegador` y el motor está obligado a consultar el estado
 *    antes de dar nada por pagado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Y UNA ALTERNATIVA QUE PUEDE AHORRAR TODO ESTO
 *
 * **Liga de Pago** no requiere desarrollo: el hotel genera la liga en la
 * consola de Banorte y se la manda al huésped. Encaja con `enlace-externo` y
 * con lo que ADR-0003 ya decidió para Azucar —enlace de pago del hotel, sin
 * tocar datos de tarjeta, fuera del alcance de PCI-DSS—. Es más lento para el
 * huésped y no se concilia solo, pero se puede tener funcionando en días en
 * vez de meses. Conviene ofrecerlo como primer paso y dejar Payworks para
 * cuando el volumen lo justifique.
 */
@Injectable()
export class BanortePasarela implements PasarelaDePago {
  private readonly logger = new Logger(BanortePasarela.name)

  readonly nombre = 'banorte-payworks'

  /**
   * 🔴 Hasta que se confirme un aviso servidor-a-servidor con el banco, lo
   * único documentado es el retorno del navegador. Declararlo como webhook
   * sería mentirle al motor, que entonces se saltaría la consulta de estado.
   */
  readonly confirmacion: ModoDeConfirmacion = 'retorno-del-navegador'

  async disponible(_propertyId?: string): Promise<boolean> {
    // Sin credenciales de afiliación no hay nada que hacer, y aunque las
    // hubiera, falta la certificación del banco. Fail-safe: no disponible.
    return false
  }

  async prepararCobro(datos: DatosDelCobro): Promise<ResultadoDeCobro> {
    // 🔴 Falla RUIDOSO si le piden algo que esta pasarela no puede cumplir.
    // Banorte deposita en la cuenta del comercio y no documenta ninguna forma
    // de retener una comisión de plataforma. Aceptar el parámetro y no
    // aplicarlo sería cobrarle al huésped y no cobrarle a nadie la comisión —
    // un error que sólo se descubre al cuadrar el mes.
    if (datos.cuentaDestino || datos.comisionCentavos) {
      throw new ServiceUnavailableException(
        'Banorte deposita íntegro en la cuenta del comercio: no admite comisión de ' +
          'plataforma. La de ZaharDev tendría que facturarse aparte.',
      )
    }
    throw new ServiceUnavailableException(
      'El cobro por Banorte todavía no está implementado: falta el manual oficial ' +
        'de integración, la variante cifrada del formulario y la certificación del ' +
        'banco. Ver el porqué en banorte.pasarela.ts.',
    )
  }

  async consultarEstado(_referencia: string): Promise<{
    autorizado: boolean
    importeCentavos: number
    moneda: string
  }> {
    throw new ServiceUnavailableException('El cobro por Banorte todavía no está implementado.')
  }
}

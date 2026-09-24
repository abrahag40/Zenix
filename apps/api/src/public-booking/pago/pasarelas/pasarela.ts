/**
 * El puerto de las pasarelas de pago.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ EXISTE, Y POR QUÉ NO BASTABA LO QUE HABÍA
 *
 * La primera versión del cobro devolvía un `clientSecret` y punto. Eso no es
 * una abstracción: **es la forma de Stripe**. Al investigar Banorte quedó claro
 * que sus tres productos de cobro son tres arquitecturas distintas, y sólo una
 * se parece remotamente a Stripe:
 *
 *   · **Liga de Pago** — «no requiere de desarrollos web, ya que se provee de
 *     una plataforma directa». Una persona genera la liga en la consola
 *     Payworks. NO HAY API.
 *   · **Comercio Electrónico (Payworks)** — un formulario que se envía por
 *     POST a `https://eps.banorte.com/recibo`. Redirección, no API REST, y con
 *     certificación previa del banco.
 *   · **Ventana de Comercio Electrónico** — ventana alojada, con variante
 *     cifrada.
 *
 * Un puerto que sólo sepa decir «aquí tienes un secreto de cliente» obliga a
 * reescribirlo el día que entre el primer hotel que cobra por su banco. Se
 * amplía ahora, que cuesta una tarde, en vez de entonces.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE **NINGUNA** IMPLEMENTACIÓN PUEDE SALTARSE
 *
 * Cambia el mecanismo; no cambia la regla. En las tres formas, **el importe y
 * el destino los fija el servidor**:
 *
 *   · Stripe lo cumple porque el `client_secret` ya los lleva dentro y el
 *     navegador no puede modificarlos (una *capacidad*, no un dato).
 *   · Payworks lo cumple **sólo si el formulario va firmado o cifrado**. Un
 *     formulario en claro con el importe en un campo oculto es un importe que
 *     el navegador edita con dos clics. Por eso el adaptador de Banorte
 *     exigirá la variante cifrada, y por eso `Redirigir` lleva `firmado`.
 *   · Una liga generada a mano lo cumple por construcción: el importe lo
 *     tecleó una persona en la consola del banco.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Y LA CONFIRMACIÓN TAMPOCO ES IGUAL
 *
 * Stripe avisa por webhook firmado. Payworks devuelve al huésped a una URL de
 * retorno. **No son lo mismo y no valen lo mismo**: la vuelta del navegador la
 * controla el navegador, así que un adaptador que confíe en ella acepta pagos
 * que nunca ocurrieron. Cuando la pasarela sólo ofrezca retorno, hay que
 * CONSULTAR el estado contra el banco antes de dar nada por pagado. Por eso el
 * puerto declara `confirmacion`: para que esa diferencia esté escrita y no se
 * descubra en producción.
 */

/** Cómo se le cobra al huésped en esta pasarela. */
export type InstruccionDeCobro =
  | {
      /** El navegador monta un formulario de la pasarela con una capacidad. */
      tipo: 'elementos-incrustados'
      /** Lleva dentro importe, moneda y destino. El cliente lo usa, no lo edita. */
      secretoDeCliente: string
      /** Clave publicable, si la pasarela la necesita en el navegador. */
      clavePublica?: string
    }
  | {
      /** El navegador se va a la pasarela con un formulario. */
      tipo: 'redirigir'
      url: string
      /** Campos del formulario. 🔴 Ver `firmado`. */
      campos: Record<string, string>
      /**
       * 🔴 `true` sólo si el importe viaja firmado o cifrado por el servidor.
       * Con `false`, el navegador puede editar el importe: el motor se niega a
       * usar la instrucción y lo dice. No es una bandera informativa.
       */
      firmado: boolean
      metodo: 'POST' | 'GET'
    }
  | {
      /** Una liga que generó una persona. Sin API. */
      tipo: 'enlace-externo'
      url: string
    }

/** Cómo se entera el sistema de que el pago ocurrió. */
export type ModoDeConfirmacion =
  /** Aviso servidor-a-servidor firmado. Es el único que vale por sí solo. */
  | 'webhook-firmado'
  /**
   * El huésped vuelve a una URL. 🔴 NO basta: lo controla el navegador. Hay
   * que consultar el estado contra la pasarela antes de dar nada por pagado.
   */
  | 'retorno-del-navegador'
  /** Nadie avisa: alguien lo comprueba en el portal del banco. */
  | 'manual'

export interface DatosDelCobro {
  propertyId: string
  bookingRef: string
  importeCentavos: number
  moneda: string
  correoDelHuesped?: string
  /** A dónde vuelve el huésped, si la pasarela redirige. */
  urlDeRetorno?: string
}

export interface ResultadoDeCobro {
  instruccion: InstruccionDeCobro
  /** Identificador del intento en la pasarela, para conciliar después. */
  referenciaExterna: string
}

/**
 * Lo que toda pasarela tiene que saber hacer.
 *
 * 🔑 Fíjate en lo que `prepararCobro` **no** recibe: nada que venga del
 * navegador. Recibe `DatosDelCobro`, que el motor arma desde la reserva ya
 * guardada. Si alguna implementación necesitara un dato del cliente, sería
 * señal de que esa pasarela deja decidir al navegador — y eso se discute, no
 * se implementa.
 */
export interface PasarelaDePago {
  /** Nombre corto y estable. Se guarda en la reserva para saber quién cobró. */
  readonly nombre: string

  /** Cómo avisa esta pasarela de que el pago ocurrió. */
  readonly confirmacion: ModoDeConfirmacion

  /** ¿Está configurada en este entorno? Sin credenciales, `false`. */
  disponible(propertyId?: string): Promise<boolean>

  prepararCobro(datos: DatosDelCobro): Promise<ResultadoDeCobro>

  /**
   * Comprueba contra la pasarela si un cobro está autorizado.
   *
   * 🔴 Obligatorio para las de `retorno-del-navegador`: es lo que sustituye a
   * la confianza en la vuelta del huésped. Las de webhook pueden usarlo para
   * conciliar.
   */
  consultarEstado(referenciaExterna: string): Promise<{
    autorizado: boolean
    importeCentavos: number
    moneda: string
  }>
}

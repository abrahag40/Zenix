import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * El límite que impide que un error deje el mostrador en blanco.
 *
 * ── POR QUÉ ESTO NO ES OPCIONAL EN UN PMS ─────────────────────────────────
 * React desmonta TODO el árbol cuando una excepción de render sube sin que
 * nadie la atrape. En una aplicación de contenido eso es una página rota; en
 * el mostrador de un hotel es **la recepción parada** con un huésped delante,
 * sin nada en pantalla y sin manera de saber qué pasó.
 *
 * La auditoría lo midió: **cero límites de error en toda la aplicación**. Un
 * `undefined` en una tarjeta del tablero bastaba para dejar la pantalla vacía.
 *
 * ── DOS NIVELES, A PROPÓSITO ──────────────────────────────────────────────
 * Uno por RUTA y uno en la RAÍZ. El de ruta contiene el daño: si revienta el
 * tablero, el resto de la aplicación sigue viva y el recepcionista puede
 * navegar a otra parte y seguir trabajando. El de raíz es la red por debajo,
 * para lo que ocurra fuera de una ruta.
 *
 * Un solo límite en la raíz habría sido peor que ninguno en un caso: convierte
 * cualquier fallo local en un fallo total.
 *
 * ── LO QUE NO HACE ────────────────────────────────────────────────────────
 * No atrapa errores de eventos ni de promesas: React sólo entrega al límite lo
 * que ocurre durante el render, el ciclo de vida y los constructores. Un fallo
 * dentro de un `onClick` no llega aquí, y por eso el `Toaster` sigue siendo
 * necesario. Se dice para que nadie suponga una cobertura que no existe.
 */
interface Props {
  children: ReactNode
  /** Dónde está el límite. Va en el mensaje y en el registro. */
  zona?: string
}
interface State {
  error: Error | null
}

export class LimiteDeError extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Registrar SIEMPRE, aunque la pantalla ya muestre algo: el recepcionista
    // no va a copiar una traza, y sin esto el incidente se pierde.
    console.error(`[LimiteDeError${this.props.zona ? ` · ${this.props.zona}` : ''}]`, error, info.componentStack)
  }

  private reintentar = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6" role="alert">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
            ⚠️
          </div>
          <h2 className="mt-3 text-lg font-bold text-slate-900">Esta pantalla falló</h2>
          {/* Se dice explícitamente que NO se perdió nada. Es lo primero que
              piensa quien está atendiendo, y callarlo cuesta una llamada. */}
          <p className="mt-2 text-sm text-slate-600">
            El resto del sistema sigue funcionando y <strong>no se perdió ninguna reserva</strong>.
            Puedes reintentar o ir a otra sección.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              onClick={this.reintentar}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Reintentar
            </button>
            <a
              href="/dashboard"
              className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Ir al inicio
            </a>
          </div>
          {/* El detalle técnico, plegado: sirve para el reporte y no asusta a
              quien sólo quiere seguir atendiendo. */}
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-slate-400">Detalle técnico</summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
              {this.state.error.message}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}

import { Link } from 'react-router-dom'

/**
 * DashboardPage — placeholder landing.
 *
 * Contenido (KPIs, widgets, resúmenes) fuera de alcance de este sprint.
 * Es el punto de entrada post-login y el destino de "volver" desde los
 * módulos de Calendario y Housekeeping.
 */
export function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Panel principal de Zenix. El contenido se construirá en un sprint
          posterior.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/pms"
          className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-sm transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <div>
              <p className="font-medium text-gray-900">Calendario</p>
              <p className="text-sm text-gray-500">
                Reservas, huéspedes y OTAs
              </p>
            </div>
          </div>
        </Link>

        <Link
          to="/overrides"
          className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-sm transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧹</span>
            <div>
              <p className="font-medium text-gray-900">Housekeeping</p>
              <p className="text-sm text-gray-500">
                Ajustes del día, tareas y checkouts
              </p>
            </div>
          </div>
        </Link>
      </section>

      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-center">
        <p className="text-sm text-gray-500">
          Widgets, KPIs y resúmenes se añadirán próximamente.
        </p>
      </div>
    </div>
  )
}

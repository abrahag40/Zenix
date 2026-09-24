/**
 * Precios base — lo que el hotel cambia el 95 % de las veces.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ ES LA PRIMERA PESTAÑA, Y NO UNA MÁS
 *
 * `RoomType.baseRate` es **el número que el motor público cotiza** mientras no
 * haya un plan de tarifa publicable. Un hotel recién dado de alta no tiene
 * ninguno —Azucar tenía cero—, así que éste es el precio real desde el primer
 * día. Las otras pestañas —planes, temporadas, restricciones— son afinado que
 * llega después, si llega.
 *
 * Poner lo excepcional delante de lo habitual es el error de interfaz más
 * caro que existe: obliga a todo el mundo a pasar cada día por encima de algo
 * que casi nadie usa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL TOTAL CON IMPUESTOS, AL LADO Y ANTES DE GUARDAR
 *
 * El hotel piensa en «cuánto paga el huésped», no en «cuánto es la base». Si
 * la pantalla sólo enseñara la base, el hotel escribiría ahí el número que
 * quiere cobrar y acabaría cobrando un 21 % de más sin saberlo.
 *
 * Por eso cada fila enseña el total **mientras se escribe**, y viene del
 * servidor —de la misma función que cotiza al huésped—, no de multiplicar por
 * 1.21 en el navegador. Dos aritméticas para el mismo número acaban
 * divergiendo, y la que se ve no sería la que se cobra.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, Save } from 'lucide-react'
import { api } from '@/api/client'
import { usePoliticaFiscal, useVistaPreviaFiscal } from '@/modules/rooms/hooks/usePoliticaFiscal'

interface TipoDeHabitacion {
  id: string
  name: string
  code: string
  baseRate: number | string
  currency: string
  rooms?: unknown[]
}

const aCentavos = (pesos: string): number | null => {
  const n = Number(String(pesos).replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

const dinero = (centavos: number, moneda: string) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(centavos / 100)

export function PreciosBaseTab({
  propertyId,
  isSupervisor,
}: {
  propertyId: string
  isSupervisor: boolean
}) {
  const qc = useQueryClient()
  const { data: politica } = usePoliticaFiscal(propertyId)
  const vistaPrevia = useVistaPreviaFiscal(propertyId)

  const { data: tipos, isLoading } = useQuery<TipoDeHabitacion[]>({
    queryKey: ['room-types', propertyId],
    queryFn: () => api.get<TipoDeHabitacion[]>(`/v1/room-types?propertyId=${propertyId}`),
    enabled: !!propertyId,
  })

  // Lo escrito vive aparte de lo guardado: así se ve qué filas están sucias y
  // se puede descartar sin recargar.
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [totales, setTotales] = useState<Record<string, number>>({})

  const reales = useMemo(
    // El grupo virtual «Habitaciones» que inventa el backend para las que no
    // tienen tipo no se puede editar: no existe en la base.
    () => (tipos ?? []).filter((t) => !t.id.startsWith('fallback-')),
    [tipos],
  )

  const valorDe = (t: TipoDeHabitacion) =>
    borrador[t.id] ?? String(Number(t.baseRate) || '')

  // Una sola petición para toda la tabla, no una por fila.
  useEffect(() => {
    if (!reales.length || !propertyId) return
    const importes = reales.map((t) => aCentavos(valorDe(t)) ?? 0)
    if (importes.some((c) => c <= 0)) return
    let vivo = true
    vistaPrevia.mutate(
      { importesCentavos: importes },
      {
        onSuccess: (previas) => {
          if (!vivo) return
          const m: Record<string, number> = {}
          reales.forEach((t, i) => { m[t.id] = previas[i]?.totalCentavos ?? 0 })
          setTotales(m)
        },
      },
    )
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, reales.length, JSON.stringify(borrador)])

  const guardar = useMutation({
    mutationFn: ({ id, centavos }: { id: string; centavos: number }) =>
      api.patch(`/v1/room-types/${id}/precio`, { tarifaCentavos: centavos }),
    onSuccess: (_d, v) => {
      toast.success('Precio guardado. El sitio se actualiza solo.')
      setBorrador((b) => { const n = { ...b }; delete n[v.id]; return n })
      qc.invalidateQueries({ queryKey: ['room-types', propertyId] })
    },
    onError: () => toast.error('No se pudo guardar el precio.'),
  })

  if (isLoading) {
    return <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></div>
  }

  const moneda = politica?.moneda ?? reales[0]?.currency ?? 'MXN'
  const conImpuestos = politica?.tarifaIncluyeImpuestos === true

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 max-w-2xl">
        Este es el precio por noche que el sitio cotiza.{' '}
        {conImpuestos
          ? 'Tu configuración dice que la tarifa YA incluye impuestos, así que el total es el mismo.'
          : 'Escribe la tarifa sin impuestos; al lado ves lo que pagaría el huésped.'}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4 font-medium">Tipo</th>
              <th className="py-2 pr-4 font-medium">Tarifa por noche{conImpuestos ? '' : ' (sin impuestos)'}</th>
              <th className="py-2 pr-4 font-medium">Paga el huésped</th>
              <th className="py-2 font-medium sr-only">Guardar</th>
            </tr>
          </thead>
          <tbody>
            {reales.map((t) => {
              const valor = valorDe(t)
              const centavos = aCentavos(valor)
              const sucia = borrador[t.id] !== undefined && centavos !== Math.round(Number(t.baseRate) * 100)
              const total = totales[t.id]
              return (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    <span className="font-medium text-slate-800">{t.name}</span>
                    <span className="text-xs text-slate-400 ml-2">{t.code}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <label className="sr-only" htmlFor={`precio-${t.id}`}>
                      Tarifa por noche de {t.name}
                    </label>
                    <input
                      id={`precio-${t.id}`}
                      type="text"
                      inputMode="decimal"
                      value={valor}
                      disabled={!isSupervisor}
                      onChange={(e) => setBorrador((b) => ({ ...b, [t.id]: e.target.value }))}
                      className="w-32 min-h-[36px] rounded-lg border border-slate-300 px-2 text-right disabled:bg-slate-50"
                    />
                    <span className="text-xs text-slate-400 ml-1">{moneda}</span>
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {/* Viene del servidor, de la MISMA función que cotiza al
                        huésped. Multiplicar por 1.21 aquí sería una segunda
                        aritmética, y acabaría divergiendo. */}
                    {total ? (
                      <span className="font-medium text-slate-900">{dinero(total, moneda)}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2">
                    {isSupervisor && sucia && centavos && (
                      <button
                        onClick={() => guardar.mutate({ id: t.id, centavos })}
                        disabled={guardar.isPending}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 min-h-[36px] text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" /> Guardar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!isSupervisor && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Sólo un supervisor puede cambiar precios. Puedes verlos.
        </p>
      )}
      {politica && !politica.verificada && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Los impuestos de esta jurisdicción aún no están verificados, así que el total de arriba
          es orientativo y el sitio no lo publica como firme.
        </p>
      )}
    </div>
  )
}

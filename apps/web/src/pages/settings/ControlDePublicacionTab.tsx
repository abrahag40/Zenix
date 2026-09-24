/**
 * Settings → Tarifas → **Control de publicación**.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 QUÉ PROBLEMA RESUELVE ESTA PANTALLA
 *
 * Para publicar un precio en el sitio del hotel hacía falta saber si la tarifa
 * cargada ya llevaba impuestos dentro. Esa respuesta llegaba —cuando llegaba—
 * por correo, semanas después, y mientras tanto la web decía «Consultar».
 *
 * La pregunta «¿sus tarifas incluyen impuestos?» es abstracta. **Su propio
 * precio final no lo es.** Aquí el hotel marca las casillas y ve, en el mismo
 * renglón, los 7 199.50 que verá el huésped. Nadie se equivoca mirando eso.
 *
 * Es *direct manipulation* (Shneiderman) aplicado a una decisión fiscal:
 * objeto visible, acción reversible, resultado inmediato. El antipatrón
 * evitado es el formulario de configuración con un booleano llamado
 * «ratesIncludeTaxes» y ninguna consecuencia visible al marcarlo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA PANTALLA **NO** ARREGLA
 *
 * Que el hotel elija mal. Si marca «ya incluye» sobre un neto, publicaremos un
 * número menor al que la LFPC art. 7 BIS exige exhibir. La interfaz no vuelve
 * correcta una respuesta equivocada; sólo hace muy difícil equivocarse.
 *
 * La tabla es **sin rejillas** a propósito: separadores horizontales tenues y
 * nada de bordes verticales. Menos tinta que no es dato (Tufte, *data-ink
 * ratio*) deja que el ojo caiga donde importa — en el total.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Info, Loader2, ShieldCheck } from 'lucide-react'
import {
  usePoliticaFiscal, useVistaPreviaFiscal, useGuardarPoliticaFiscal,
  type LineaFiscal, type PoliticaFiscal, type VistaPreviaFiscal,
} from '../../modules/rooms/hooks/usePoliticaFiscal'
import { useRateQuoteGrid } from '../../modules/rooms/hooks/useRates'

const money = (centavos: number, moneda: string) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(centavos / 100)

const pct = (rate: number) =>
  `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(rate * 100)} %`

export function ControlDePublicacionTab({
  propertyId,
  isSupervisor,
}: {
  propertyId: string
  isSupervisor: boolean
}) {
  const { data: politica, isLoading } = usePoliticaFiscal(propertyId)
  const guardar = useGuardarPoliticaFiscal(propertyId)

  // Estado tentativo: lo que el hotel está probando, todavía sin guardar.
  const [incluye, setIncluye] = useState<boolean | null>(null)
  const [regimenes, setRegimenes] = useState<string[] | null>(null)

  const firmaServidor = politica
    ? `${politica.propertyId}|${politica.tarifaIncluyeImpuestos}|${politica.regimenes.join(',')}`
    : ''
  useEffect(() => {
    if (politica) {
      setIncluye(politica.tarifaIncluyeImpuestos)
      setRegimenes(politica.regimenes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaServidor])

  // Una tarifa real de la propiedad como maniquí: enseñarle SU precio pesa
  // mucho más que un ejemplo redondo inventado por nosotros.
  const hoy = useMemo(() => new Date(), [])
  const manana = useMemo(() => new Date(hoy.getTime() + 86_400_000), [hoy])
  const { data: grid } = useRateQuoteGrid(propertyId, hoy, manana)
  const habitaciones = grid?.roomTypes ?? []

  const sucio =
    politica != null &&
    incluye != null &&
    regimenes != null &&
    (incluye !== politica.tarifaIncluyeImpuestos ||
      regimenes.join('|') !== politica.regimenes.join('|'))

  if (isLoading || !politica || incluye === null || regimenes === null) {
    return <p className="text-sm text-slate-400 py-4">Cargando configuración fiscal…</p>
  }

  const alternarRegimen = (clave: string) =>
    setRegimenes((r) => (r!.includes(clave) ? r!.filter((x) => x !== clave) : [...r!, clave]))

  return (
    <div className="space-y-6">
      <Encabezado politica={politica} />

      {/* ── Qué es la tarifa que se escribe ─────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          La tarifa que cargas en el calendario…
        </h3>
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <OpcionModo
            activa={!incluye}
            onClick={() => isSupervisor && setIncluye(false)}
            titulo="…es NETA"
            detalle="Los impuestos se suman encima. Es lo habitual cuando el precio sale de una hoja de tarifario."
          />
          <OpcionModo
            activa={incluye}
            onClick={() => isSupervisor && setIncluye(true)}
            titulo="…ya INCLUYE impuestos"
            detalle="Es el precio final. Zenix desglosa los impuestos hacia dentro, sin cambiar el total."
          />
        </div>
      </section>

      {/* ── Las líneas fiscales ─────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Impuestos de {politica.jurisdiccion.nombreEstado ?? 'tu jurisdicción'}
        </h3>
        <TablaDeImpuestos
          lineas={politica.lineas}
          regimenes={regimenes}
          onAlternar={alternarRegimen}
          editable={isSupervisor}
        />
      </section>

      {/* ── El total en vivo, por tipo de habitación ────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Lo que verá el huésped
        </h3>
        <TablaDeTotales
          propertyId={propertyId}
          habitaciones={habitaciones}
          moneda={politica.moneda}
          tentativa={{ tarifaIncluyeImpuestos: incluye, regimenes }}
        />
      </section>

      {isSupervisor && (
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
          {sucio && <span className="text-xs text-amber-700">Hay cambios sin guardar</span>}
          <button
            disabled={!sucio || guardar.isPending}
            onClick={() => guardar.mutate({ tarifaIncluyeImpuestos: incluye, regimenes })}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-semibold"
          >
            {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Guardar y publicar con esta política
          </button>
        </div>
      )}
      {!isSupervisor && (
        <p className="text-xs text-slate-500">
          Sólo un supervisor puede cambiar la política de publicación: decide el precio que se
          exhibe al público.
        </p>
      )}
    </div>
  )
}

// ── Encabezado: jurisdicción y si está verificada ────────────────────────────
function Encabezado({ politica }: { politica: PoliticaFiscal }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 max-w-2xl">
        Esto decide el número que tu sitio web publica. Marca lo que aplica y mira abajo el total
        que verá el huésped antes de guardar.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-100 rounded px-2 py-1">
          {politica.jurisdiccion.nombreEstado ?? 'Sin estado'}
          {politica.jurisdiccion.municipio ? ` · ${politica.jurisdiccion.municipio}` : ''}
        </span>
        {politica.verificada ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
            <ShieldCheck className="h-3 w-3" /> Ley verificada contra fuente oficial
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <AlertTriangle className="h-3 w-3" /> Ley de este estado sin verificar — no se publica precio firme
          </span>
        )}
      </div>
      {politica.avisos.map((a) => (
        <p key={a} className="text-[11px] text-amber-800 flex items-start gap-1.5">
          <Info className="h-3 w-3 mt-0.5 shrink-0" /> {a}
        </p>
      ))}
    </div>
  )
}

function OpcionModo({
  activa, onClick, titulo, detalle,
}: { activa: boolean; onClick: () => void; titulo: string; detalle: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left rounded-lg border px-3 py-2.5 transition ${
        activa ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-3.5 w-3.5 rounded-full border-[4px] ${activa ? 'border-indigo-600' : 'border-slate-300'}`} />
        <span className="text-xs font-semibold text-slate-800">{titulo}</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-1 ml-[22px]">{detalle}</p>
    </button>
  )
}

// ── Tabla de impuestos: sin rejillas ─────────────────────────────────────────
function TablaDeImpuestos({
  lineas, regimenes, onAlternar, editable,
}: {
  lineas: LineaFiscal[]
  regimenes: string[]
  onAlternar: (clave: string) => void
  editable: boolean
}) {
  if (lineas.length === 0) {
    return (
      <p className="text-xs text-slate-500 mt-2">
        Todavía no hay catálogo fiscal para esta jurisdicción. Sin él no se puede publicar un
        precio firme.
      </p>
    )
  }
  return (
    <table className="w-full mt-2 text-sm">
      <tbody>
        {lineas.map((l) => {
          // Una línea con `requiereAlta` sólo aplica si la propiedad declaró
          // ese régimen; las demás son de aplicación forzosa y no se apagan.
          const opcional = !!l.requiereAlta
          const marcada = opcional ? regimenes.includes(l.requiereAlta!) : l.activa
          return (
            <tr key={l.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2.5 pr-3 w-8 align-top">
                <input
                  type="checkbox"
                  checked={marcada}
                  disabled={!opcional || !editable}
                  onChange={() => { if (opcional) onAlternar(l.requiereAlta!) }}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 disabled:opacity-50"
                  aria-label={`${l.label} ${pct(l.rate)}`}
                />
              </td>
              <td className="py-2.5 pr-3 align-top">
                <div className="font-medium text-slate-800">{l.label}</div>
                {l.fundamento && <div className="text-[11px] text-slate-500 mt-0.5">{l.fundamento}</div>}
                {l.vigenteHasta && (
                  <div className="text-[11px] text-amber-700 mt-0.5">Vigente hasta {l.vigenteHasta}</div>
                )}
                {!opcional && (
                  <div className="text-[11px] text-slate-400 mt-0.5">De aplicación forzosa — no se puede desactivar</div>
                )}
              </td>
              <td className="py-2.5 pr-3 align-top text-right tabular-nums font-medium text-slate-700 whitespace-nowrap">
                {pct(l.rate)}
              </td>
              <td className="py-2.5 align-top text-right text-[11px] text-slate-500 whitespace-nowrap">
                {l.base === 'ROOM' ? 'sobre hospedaje' : 'hospedaje y servicios'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Tabla de totales: una fila por tipo de habitación ────────────────────────
function TablaDeTotales({
  propertyId, habitaciones, moneda, tentativa,
}: {
  propertyId: string
  habitaciones: Array<{ id: string; name: string; baseRate: number }>
  moneda: string
  tentativa: { tarifaIncluyeImpuestos: boolean; regimenes: string[] }
}) {
  const previa = useVistaPreviaFiscal(propertyId)
  const [filas, setFilas] = useState<Record<string, VistaPreviaFiscal>>({})
  const clave = `${tentativa.tarifaIncluyeImpuestos}|${tentativa.regimenes.join(',')}|${habitaciones.map((h) => `${h.id}:${h.baseRate}`).join(',')}`

  useEffect(() => {
    let cancelado = false
    if (habitaciones.length === 0) return
    previa
      .mutateAsync({ importesCentavos: habitaciones.map((h) => Math.round(h.baseRate * 100)), ...tentativa })
      .then((previas) => {
        if (cancelado) return
        setFilas(Object.fromEntries(habitaciones.map((h, i) => [h.id, previas[i]])))
      })
      .catch(() => { if (!cancelado) setFilas({}) })
    return () => { cancelado = true }
    // `clave` resume toda la entrada; el objeto de mutación cambia en cada
    // render y usarlo como dependencia dispararía un bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  if (habitaciones.length === 0) {
    return <p className="text-xs text-slate-500 mt-2">Esta propiedad aún no tiene tipos de habitación con tarifa.</p>
  }

  return (
    <table className="w-full mt-2 text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-slate-400">
          <th className="text-left font-medium pb-1.5">Tipo de habitación</th>
          <th className="text-right font-medium pb-1.5">Tarifa cargada</th>
          <th className="text-right font-medium pb-1.5">Impuestos</th>
          <th className="text-right font-medium pb-1.5">El huésped ve</th>
        </tr>
      </thead>
      <tbody>
        {habitaciones.map((h) => {
          const v = filas[h.id]
          return (
            <tr key={h.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2.5 pr-3 text-slate-800">{h.name}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-slate-500">
                {money(Math.round(h.baseRate * 100), moneda)}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-slate-500">
                {v ? money(v.impuestosCentavos, moneda) : '—'}
              </td>
              <td className="py-2.5 text-right">
                {!v ? (
                  <span className="text-slate-300">…</span>
                ) : v.publicable ? (
                  <div>
                    <div className="tabular-nums font-semibold text-slate-900">
                      {money(v.totalCentavos, moneda)}
                    </div>
                    <div className="text-[11px] text-slate-500">Impuestos incluidos</div>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium text-amber-800">Consultar</div>
                    <div className="text-[11px] text-amber-700 max-w-[22ch] ml-auto">{v.motivo}</div>
                  </div>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4} className="pt-2 text-[11px] text-slate-500">
            Es exactamente el mismo cálculo que usa tu sitio web: si aquí dice «Consultar», tu web
            dirá «Consultar».
            {Object.values(filas).some((f) => f.supuestos?.length) && (
              <> {Object.values(filas).find((f) => f.supuestos?.length)!.supuestos![0]}</>
            )}
          </td>
        </tr>
      </tfoot>
    </table>
  )
}

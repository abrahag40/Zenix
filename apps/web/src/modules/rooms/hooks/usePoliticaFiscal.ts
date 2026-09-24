/**
 * Control de publicación — qué impuestos lleva la tarifa y qué verá el huésped.
 *
 * La vista previa es una MUTACIÓN aunque no escriba nada: es un POST porque la
 * configuración tentativa viaja en el cuerpo, y no se cachea a propósito —
 * cachear una previsualización es enseñarle al hotel un total que ya no
 * corresponde a lo que tiene marcado en pantalla.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/api/client'

export interface LineaFiscal {
  id: string
  code: string
  label: string
  /** Fracción decimal: 0.16. */
  rate: number
  base: 'ROOM' | 'ROOM_AND_SERVICES'
  activa: boolean
  vigenteHasta?: string | null
  requiereAlta?: string
  fundamento?: string
}

export interface PoliticaFiscal {
  propertyId: string
  moneda: string
  tarifaIncluyeImpuestos: boolean
  jurisdiccion: { estado: string | null; nombreEstado: string | null; municipio: string | null }
  tipoDeEstablecimiento: 'HOTEL' | 'PRIVATE_RENTAL'
  regimenes: string[]
  verificada: boolean
  lineas: LineaFiscal[]
  avisos: string[]
}

export interface VistaPreviaFiscal {
  netoCentavos: number
  impuestosCentavos: number
  totalCentavos: number
  desglose: Array<{ code: string; label: string; importeCentavos: number }>
  publicable: boolean
  motivo?: string
  supuestos?: string[]
}

export interface ConfigTentativa {
  tarifaIncluyeImpuestos?: boolean
  regimenes?: string[]
  municipio?: string | null
  ocupantes?: number
}

export function usePoliticaFiscal(propertyId: string) {
  return useQuery<PoliticaFiscal>({
    queryKey: ['politica-fiscal', propertyId],
    queryFn: () => api.get<PoliticaFiscal>(`/v1/rates/politica-fiscal?propertyId=${propertyId}`),
    enabled: !!propertyId,
    staleTime: 60_000,
  })
}

/**
 * Una sola petición para TODA la tabla. Antes era una por fila: cinco tipos de
 * habitación eran cinco lecturas idénticas de la misma propiedad en el
 * servidor, y cinco viajes de red por cada casilla que el hotel marcaba.
 */
export function useVistaPreviaFiscal(propertyId: string) {
  return useMutation<VistaPreviaFiscal[], Error, { importesCentavos: number[] } & ConfigTentativa>({
    mutationFn: (body) =>
      api
        .post<{ previas: VistaPreviaFiscal[] }>('/v1/rates/politica-fiscal/vista-previa', {
          propertyId,
          ...body,
        })
        .then((r) => r.previas),
  })
}

export function useGuardarPoliticaFiscal(propertyId: string) {
  const qc = useQueryClient()
  return useMutation<PoliticaFiscal, Error, ConfigTentativa & { tipoDeEstablecimiento?: 'HOTEL' | 'PRIVATE_RENTAL' }>({
    mutationFn: (body) => api.patch<PoliticaFiscal>('/v1/rates/politica-fiscal', { propertyId, ...body }),
    onSuccess: () => {
      // El sobre que alimenta el sitio se reconstruye desde la tarifa: al
      // cambiar la política, el precio publicado cambia. Se invalida todo lo
      // que lo muestra para que nadie lea en pantalla un total ya caduco.
      qc.invalidateQueries({ queryKey: ['politica-fiscal', propertyId] })
      qc.invalidateQueries({ queryKey: ['rate-quote'] })
      toast.success('Política de publicación guardada')
    },
    onError: (e) => toast.error(e.message || 'No se pudo guardar'),
  })
}

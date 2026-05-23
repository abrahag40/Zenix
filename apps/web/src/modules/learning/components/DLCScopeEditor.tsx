/**
 * DLCScopeEditor.tsx — modal para editar scopedPropertyIds (§147).
 *
 * Caso de uso (preg. del usuario 2026-05-21):
 *   "Si un hotelero con 4 hoteles compra Learning, ¿puedo activarlo solo
 *    en 2 de los 4?"
 *
 * Flow:
 *   1. Usuario en SettingsDLCPage click "Configurar scope" en DLC ACTIVE
 *   2. Modal abre con lista de properties + checkboxes
 *   3. Estado inicial: marca propiedades en `scopedPropertyIds` actual.
 *      Si array vacío → checkbox "Todas las properties" marcado.
 *   4. Submit → POST /v1/dlc/:code/scope con propertyIds[]
 *   5. Toast + invalidate queries
 *
 * Validación cliente:
 *   - "Todas" + alguna específica = "Todas" gana (resetea a [])
 *   - Cero properties seleccionadas + "Todas" off = bloqueado (advertencia)
 *
 * Decisión §147: array vacío = activo en TODAS (default). Array poblado =
 * solo esas properties. Backend valida pertenencia a la org.
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '../../../api/client'
import { useUpdateDLCScope } from '../hooks/useLearning'
import type { DLCCode, TenantDLC } from '../api/learning.api'

interface Property {
  id: string
  name: string
  city?: string | null
  region?: string | null
  type?: string
  isActive: boolean
}

export function DLCScopeEditor(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dlc: TenantDLC
}) {
  const updateMut = useUpdateDLCScope()

  const { data: properties, isLoading } = useQuery({
    queryKey: ['properties-for-scope'],
    queryFn: () => api.get<Property[]>('/api/properties'),
    enabled: props.open,
  })

  // Estado local del scope que se está editando
  const [allMode, setAllMode] = useState(props.dlc.scopedPropertyIds.length === 0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(props.dlc.scopedPropertyIds),
  )

  // Reset al abrir
  useEffect(() => {
    if (props.open) {
      setAllMode(props.dlc.scopedPropertyIds.length === 0)
      setSelectedIds(new Set(props.dlc.scopedPropertyIds))
    }
  }, [props.open, props.dlc.scopedPropertyIds])

  const handleToggle = (propertyId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(propertyId)) next.delete(propertyId)
      else next.add(propertyId)
      return next
    })
    setAllMode(false)
  }

  const handleAllMode = (next: boolean) => {
    setAllMode(next)
    if (next) setSelectedIds(new Set())
  }

  const isDirty =
    allMode !== (props.dlc.scopedPropertyIds.length === 0) ||
    (!allMode &&
      (selectedIds.size !== props.dlc.scopedPropertyIds.length ||
        [...selectedIds].some((id) => !props.dlc.scopedPropertyIds.includes(id))))

  const isValid = allMode || selectedIds.size > 0

  const handleSubmit = () => {
    const propertyIds = allMode ? [] : [...selectedIds]
    updateMut.mutate(
      { dlcCode: props.dlc.dlcCode, propertyIds },
      {
        onSuccess: () => props.onOpenChange(false),
      },
    )
  }

  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <DialogPrimitive.Title className="text-base font-semibold text-slate-900">
              Configurar scope — {props.dlc.dlcCode}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="space-y-4 px-5 py-5">
            <p className="text-sm text-slate-600">
              Selecciona en qué sucursales (properties) este add-on debe estar disponible. Si dejas "Todas las properties", aplica a tu organización completa. Si seleccionas algunas, solo el staff de esas properties tendrá acceso.
            </p>

            {/* Opción "Todas las properties" */}
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                allMode
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-emerald-600"
                checked={allMode}
                onChange={(e) => handleAllMode(e.target.checked)}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">
                  Todas las properties
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Activo en cualquier property que crees en el futuro. Recomendado para single-property o cadenas que quieren uniformidad.
                </p>
              </div>
            </label>

            <div className="border-t border-slate-200 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                O selección manual
              </p>
            </div>

            {isLoading && (
              <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando properties…
              </div>
            )}

            {properties && properties.length > 0 && (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {properties
                  .filter((p) => p.isActive)
                  .map((p) => {
                    const checked = !allMode && selectedIds.has(p.id)
                    return (
                      <li key={p.id}>
                        <label
                          className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                            checked
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-emerald-600"
                            checked={checked}
                            onChange={() => handleToggle(p.id)}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900">
                              {p.name}
                            </p>
                            {(p.city || p.region) && (
                              <p className="text-xs text-slate-500">
                                {[p.city, p.region].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                          {checked && <Check className="h-4 w-4 text-emerald-600" />}
                        </label>
                      </li>
                    )
                  })}
              </ul>
            )}

            {!isValid && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Selecciona al menos una property o marca "Todas las properties".
              </div>
            )}

            {/* Resumen del estado */}
            <div className="rounded-md bg-slate-50 p-3 text-xs">
              <p className="text-slate-600">
                <span className="font-medium">Nuevo scope:</span>{' '}
                {allMode ? (
                  <Badge variant="outline">Todas las properties</Badge>
                ) : selectedIds.size === 0 ? (
                  <span className="text-amber-700">Sin selección</span>
                ) : (
                  <Badge>
                    {selectedIds.size}{' '}
                    {selectedIds.size === 1 ? 'property' : 'properties'}
                  </Badge>
                )}
              </p>
              {!allMode && selectedIds.size > 0 && properties && (
                <p className="mt-1 text-amber-700">
                  Staff de properties no seleccionadas verá 402 al intentar usar este add-on (con CTA para activar/cambiar scope).
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
            <Button
              variant="outline"
              onClick={() => props.onOpenChange(false)}
              disabled={updateMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isDirty || !isValid || updateMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {updateMut.isPending ? 'Guardando…' : 'Guardar scope'}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

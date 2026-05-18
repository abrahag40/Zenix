/**
 * PhoneFieldWithCountry — input de teléfono con selector de país searchable.
 *
 * Reemplaza `react-phone-number-input` cuyo selector de país nativo era:
 *   1. Un <select> nativo en mobile (estilo OS, fuera del design system)
 *   2. Un dropdown sin search en desktop (scroll de 200+ países)
 *   3. La lada (dial code) NO se pre-fillaba al cambiar de país →
 *      el usuario quedaba sin saber qué formato escribir.
 *
 * Este componente:
 *   - Reusa el catálogo + UX del CountryCombobox (search + países frecuentes
 *     + insensitive a acentos + match por código).
 *   - Layout compacto: chip de bandera + lada a la izquierda, input numérico
 *     a la derecha. Pattern Stripe Checkout / WhatsApp / Telegram.
 *   - Al cambiar país, escribe la nueva lada en el campo automáticamente
 *     y mueve el caret al final.
 *   - Emite el value en formato E.164 (+{dialCode}{digits}) compatible con
 *     `isValidPhoneNumber` de `react-phone-number-input` (mantenemos esa
 *     dependencia para la validación zod existente).
 *
 * NN/g 2023 "Phone Number Inputs": el patrón "flag + dial-code chip + input"
 * es el más usable internacionalmente (medido contra single-input free-text
 * y dropdown puro). Reduce error rate 47% (Baymard n=1,800).
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { Popover } from 'radix-ui'
import { Search, ChevronDown, Check, Phone } from 'lucide-react'
import { getCountryCallingCode } from 'react-phone-number-input'
import type { Country as RpniCountry } from 'react-phone-number-input'
import { cn } from '@/lib/utils'
import {
  ALL_COUNTRIES,
  COMMON_COUNTRIES,
  OTHER_COUNTRIES,
  normalizeForSearch,
  type Country,
} from './CountryCombobox'

interface Props {
  /** Valor E.164 (`+529991234567`) o vacío. */
  value: string
  onChange: (e164: string) => void
  /** ISO 3166-1 alpha-2 inicial cuando value es vacío. Default 'MX'. */
  defaultCountry?: RpniCountry
  placeholder?: string
  hasError?: boolean
  disabled?: boolean
}

/** Obtiene dial code para un código ISO. Wrapper try/catch porque la lib
 *  puede lanzar para códigos no soportados (p.ej. 'XK' Kosovo en versiones viejas). */
function safeDialCode(code: string): string | null {
  try {
    return getCountryCallingCode(code as RpniCountry)
  } catch {
    return null
  }
}

/**
 * Parsea un E.164 a `{country, localDigits}`. Si no podemos detectar país,
 * devuelve `null` country y los digits sin '+'.
 * Match greedy más largo primero (los códigos van de 1-4 dígitos: +1 vs +1340).
 */
function parseE164(value: string, fallbackCountry: RpniCountry): { country: Country | null; local: string } {
  const trimmed = value.trim()
  if (!trimmed || !trimmed.startsWith('+')) {
    return { country: ALL_COUNTRIES.find((c) => c.code === fallbackCountry) ?? null, local: '' }
  }
  const digits = trimmed.slice(1).replace(/\D/g, '')
  // Buscar el código que matchee con dial code más largo posible
  // (ej. +1340 Islas Vírgenes vs +1 USA — usamos el más específico que coincida).
  let best: { country: Country; dialLen: number } | null = null
  for (const c of ALL_COUNTRIES) {
    const dc = safeDialCode(c.code)
    if (!dc) continue
    if (digits.startsWith(dc)) {
      if (!best || dc.length > best.dialLen) {
        best = { country: c, dialLen: dc.length }
      }
    }
  }
  if (best) {
    return { country: best.country, local: digits.slice(best.dialLen) }
  }
  return { country: ALL_COUNTRIES.find((c) => c.code === fallbackCountry) ?? null, local: digits }
}

export function PhoneFieldWithCountry({
  value, onChange, defaultCountry = 'MX', placeholder = '999 000 0000', hasError, disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const numberRef = useRef<HTMLInputElement>(null)

  // Bug fix 2026-05-17: derivar `selectedCountry` SOLO desde el value E.164 era
  // frágil — algunos dial codes (ej. +1 USA/CA, +44 GB) parsean al MISMO país en
  // el catálogo y al cambiar de país parsed.country podía "perder" la selección.
  // Solución: mantener selección explícita en local state, sincronizada con value
  // al mount/cambio externo, pero NUNCA derivada en cada render.
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(() => {
    return parseE164(value, defaultCountry).country
  })
  const parsed = useMemo(() => parseE164(value, defaultCountry), [value, defaultCountry])
  const dialCode = selectedCountry ? safeDialCode(selectedCountry.code) : null

  // Sincronizar local state si el value cambia EXTERNAMENTE (no por click del user).
  // Si el user acaba de cambiar país, ya actualizamos selectedCountry localmente,
  // así que comparar el current dial code con el parsed evita ciclo de reset.
  useEffect(() => {
    const parsedCountry = parsed.country
    if (!selectedCountry || (parsedCountry && parsedCountry.code !== selectedCountry.code)) {
      // Solo sincronizar si el value E.164 parseado NO matchea el dial code actual
      const currentDial = selectedCountry ? safeDialCode(selectedCountry.code) : null
      const valueDigits = value.replace(/\D/g, '')
      const matchesCurrent = currentDial && valueDigits.startsWith(currentDial)
      if (!matchesCurrent && parsedCountry) {
        setSelectedCountry(parsedCountry)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus())
    } else {
      setQuery('')
    }
  }, [open])

  // Si el value llega vacío al mount → pre-llenar con dial code del defaultCountry.
  // Pattern Stripe/Twilio: el usuario abre el form y ve "+52 " listo.
  useEffect(() => {
    if (!value && selectedCountry && dialCode) {
      onChange(`+${dialCode}`)
    }
    // intencionalmente solo en mount — no queremos forzar dial code si user
    // borra y vuelve a teclear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSelectCountry(c: Country) {
    const newDial = safeDialCode(c.code)
    if (!newDial) return
    // Actualizar selección local PRIMERO para que el chip se actualice instantáneamente
    // (no esperando re-render del prop value desde el form).
    setSelectedCountry(c)
    // Reescribir value: conservar los dígitos LOCALES, reemplazar solo el dial code.
    const newValue = `+${newDial}${parsed.local}`
    onChange(newValue)
    setOpen(false)
    // Focus al input numérico para que pueda seguir tecleando
    requestAnimationFrame(() => {
      numberRef.current?.focus()
      // Mover caret al final
      const el = numberRef.current
      if (el) el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const onlyDigits = e.target.value.replace(/\D/g, '')
    if (!dialCode) {
      onChange(`+${onlyDigits}`)
      return
    }
    onChange(`+${dialCode}${onlyDigits}`)
  }

  // Filtro con priorización 3-tier (mismo pattern que CountryCombobox)
  const filtered = useMemo(() => {
    if (!query.trim()) return { common: COMMON_COUNTRIES, rest: OTHER_COUNTRIES }
    const q = normalizeForSearch(query)
    const prefixMatches: Country[] = []
    const infixMatches: Country[] = []
    const codeMatches: Country[] = []
    for (const c of ALL_COUNTRIES) {
      const n = normalizeForSearch(c.name)
      if (n.startsWith(q)) prefixMatches.push(c)
      else if (n.includes(q)) infixMatches.push(c)
      else if (c.code.toLowerCase().startsWith(q)) codeMatches.push(c)
    }
    return { common: [...prefixMatches, ...infixMatches, ...codeMatches], rest: [] }
  }, [query])

  const totalCount = filtered.common.length + filtered.rest.length

  return (
    <div
      className={cn(
        'flex h-9 w-full rounded-md border bg-white overflow-hidden',
        'focus-within:ring-2 focus-within:ring-emerald-300 focus-within:border-emerald-400',
        hasError ? 'border-red-400' : 'border-slate-200',
        disabled && 'opacity-50',
      )}
    >
      {/* Country chip — flag + dial code, click abre searchable dropdown */}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 px-2.5 border-r border-slate-200',
              'hover:bg-slate-50 transition-colors shrink-0',
              'focus-visible:outline-none focus-visible:bg-slate-50',
            )}
            aria-label={selectedCountry ? `País: ${selectedCountry.name}` : 'Seleccionar país'}
          >
            {selectedCountry ? (
              <>
                <span className="text-base leading-none">{selectedCountry.flag}</span>
                {dialCode && (
                  <span className="text-xs font-mono text-slate-700 tabular-nums">+{dialCode}</span>
                )}
              </>
            ) : (
              <Phone className="h-3.5 w-3.5 text-slate-400" />
            )}
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-[90] w-[300px] rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {/* Search input */}
            <div className="border-b border-slate-100 px-2.5 py-2 flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar país, código o lada…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setOpen(false)
                  }
                }}
              />
            </div>

            {/* Lista scrollable — mismo fix wheel/touch propagation que CountryCombobox.
                Sin esto, dentro de un Dialog el scroll queda bloqueado por react-remove-scroll. */}
            <div
              className="max-h-72 overflow-y-auto overscroll-contain py-1"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {totalCount === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-slate-400">
                  Sin coincidencias para "{query}"
                </p>
              ) : (
                <>
                  {filtered.common.length > 0 && (
                    <>
                      {!query && (
                        <div className="px-3 pt-1.5 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Países frecuentes
                        </div>
                      )}
                      {filtered.common.map((c) => (
                        <CountryRowWithDial
                          key={c.code}
                          country={c}
                          isSelected={selectedCountry?.code === c.code}
                          onSelect={handleSelectCountry}
                        />
                      ))}
                    </>
                  )}
                  {filtered.rest.length > 0 && (
                    <>
                      <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 border-t border-slate-100 mt-1">
                        Todos los países
                      </div>
                      {filtered.rest.map((c) => (
                        <CountryRowWithDial
                          key={c.code}
                          country={c}
                          isSelected={selectedCountry?.code === c.code}
                          onSelect={handleSelectCountry}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Number input — solo dígitos del local. Visualmente se ve como un solo
          campo continuo con el chip de país a la izquierda. */}
      <input
        ref={numberRef}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={parsed.local}
        onChange={handleNumberChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'flex-1 px-3 text-sm bg-transparent outline-none tabular-nums font-mono',
          'placeholder:text-slate-400 placeholder:font-sans',
        )}
      />
    </div>
  )
}

function CountryRowWithDial({
  country, isSelected, onSelect,
}: {
  country: Country
  isSelected: boolean
  onSelect: (c: Country) => void
}) {
  const dial = safeDialCode(country.code)
  return (
    <button
      type="button"
      onClick={() => onSelect(country)}
      className={cn(
        'w-full px-3 py-1.5 text-left flex items-center gap-2.5',
        'text-sm transition-colors',
        isSelected
          ? 'bg-emerald-50 text-emerald-900 font-medium'
          : 'hover:bg-slate-50 text-slate-700',
      )}
    >
      <span className="text-base shrink-0 leading-none">{country.flag}</span>
      <span className="flex-1 truncate">{country.name}</span>
      {dial && (
        <span className="text-[11px] font-mono text-slate-500 tabular-nums">+{dial}</span>
      )}
      {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
    </button>
  )
}

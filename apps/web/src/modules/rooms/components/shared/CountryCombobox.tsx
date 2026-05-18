/**
 * CountryCombobox — Searchable nationality selector
 *
 * Reemplaza el input texto libre "Ej. México" del create-reservation form
 * con un combobox buscable de países ISO 3166-1.
 *
 * Justificación (real-user pain point — feedback recepcionista ex-Cloudbeds):
 *   "Cuando trabajaba en un hostal usando Cloudbeds, me saltaba ese paso
 *    seleccionando cualquier cosa porque era difícil encontrar el país".
 *
 * Patrones citados:
 *   · NN/g 2022 "Combobox vs Dropdown" — combobox con search es la mejor UX
 *     para listas >7 items que no caben en un dropdown sin scroll.
 *   · Apple HIG Inputs — buscador inline reduce friction vs scrolling 200+
 *     items o teclear el nombre exacto.
 *   · Mews / Cloudbeds / Opera todos usan combobox para nationality. La
 *     diferencia es que el de Cloudbeds tenía search lento que no priorizaba
 *     match exacto al inicio → frustración del recepcionista.
 *
 * Tech:
 *   · Match priority: prefix (Méx → México) > infix (zico → México) > code (MX)
 *   · Lista común al inicio (top 12 países LATAM + EU + US) cuando query vacía
 *   · Lista completa ISO 3166-1 (~250) al teclear
 *   · Mismo pattern que RoomCombobox (Maintenance §736) — coherente
 *   · Stores nombre completo en español (consistente con campo de texto previo
 *     para backward compat con stays existentes sembrados con "México", etc.)
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { Popover } from 'radix-ui'
import { Search, ChevronDown, Check, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Catálogo ISO 3166-1 con nombre en español + alpha-2 + flag emoji ────────
// Curado priorizando LATAM (mercado primary Zenix) + EU/US (huéspedes top).
// Países restantes en orden alfabético.
// Exportado para reuso (PhoneFieldWithCountry usa el mismo catálogo + lookup).
export type Country = {
  /** ISO 3166-1 alpha-2 */
  code: string
  /** Nombre completo en español */
  name: string
  /** Emoji flag — purely cosmetic, mejora scan visual (Treisman 1980) */
  flag: string
}

const COMMON_COUNTRIES: Country[] = [
  { code: 'MX', name: 'México',           flag: '🇲🇽' },
  { code: 'US', name: 'Estados Unidos',   flag: '🇺🇸' },
  { code: 'CA', name: 'Canadá',           flag: '🇨🇦' },
  { code: 'ES', name: 'España',           flag: '🇪🇸' },
  { code: 'FR', name: 'Francia',          flag: '🇫🇷' },
  { code: 'DE', name: 'Alemania',         flag: '🇩🇪' },
  { code: 'IT', name: 'Italia',           flag: '🇮🇹' },
  { code: 'AR', name: 'Argentina',        flag: '🇦🇷' },
  { code: 'BR', name: 'Brasil',           flag: '🇧🇷' },
  { code: 'CO', name: 'Colombia',         flag: '🇨🇴' },
  { code: 'CL', name: 'Chile',            flag: '🇨🇱' },
  { code: 'PE', name: 'Perú',             flag: '🇵🇪' },
]

const OTHER_COUNTRIES: Country[] = [
  { code: 'AF', name: 'Afganistán',                flag: '🇦🇫' },
  { code: 'AL', name: 'Albania',                   flag: '🇦🇱' },
  { code: 'DZ', name: 'Argelia',                   flag: '🇩🇿' },
  { code: 'AD', name: 'Andorra',                   flag: '🇦🇩' },
  { code: 'AO', name: 'Angola',                    flag: '🇦🇴' },
  { code: 'AG', name: 'Antigua y Barbuda',         flag: '🇦🇬' },
  { code: 'AM', name: 'Armenia',                   flag: '🇦🇲' },
  { code: 'AU', name: 'Australia',                 flag: '🇦🇺' },
  { code: 'AT', name: 'Austria',                   flag: '🇦🇹' },
  { code: 'AZ', name: 'Azerbaiyán',                flag: '🇦🇿' },
  { code: 'BS', name: 'Bahamas',                   flag: '🇧🇸' },
  { code: 'BH', name: 'Baréin',                    flag: '🇧🇭' },
  { code: 'BD', name: 'Bangladés',                 flag: '🇧🇩' },
  { code: 'BB', name: 'Barbados',                  flag: '🇧🇧' },
  { code: 'BY', name: 'Bielorrusia',               flag: '🇧🇾' },
  { code: 'BE', name: 'Bélgica',                   flag: '🇧🇪' },
  { code: 'BZ', name: 'Belice',                    flag: '🇧🇿' },
  { code: 'BJ', name: 'Benín',                     flag: '🇧🇯' },
  { code: 'BT', name: 'Bután',                     flag: '🇧🇹' },
  { code: 'BO', name: 'Bolivia',                   flag: '🇧🇴' },
  { code: 'BA', name: 'Bosnia y Herzegovina',      flag: '🇧🇦' },
  { code: 'BW', name: 'Botsuana',                  flag: '🇧🇼' },
  { code: 'BN', name: 'Brunéi',                    flag: '🇧🇳' },
  { code: 'BG', name: 'Bulgaria',                  flag: '🇧🇬' },
  { code: 'BF', name: 'Burkina Faso',              flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi',                   flag: '🇧🇮' },
  { code: 'CV', name: 'Cabo Verde',                flag: '🇨🇻' },
  { code: 'KH', name: 'Camboya',                   flag: '🇰🇭' },
  { code: 'CM', name: 'Camerún',                   flag: '🇨🇲' },
  { code: 'QA', name: 'Catar',                     flag: '🇶🇦' },
  { code: 'TD', name: 'Chad',                      flag: '🇹🇩' },
  { code: 'CN', name: 'China',                     flag: '🇨🇳' },
  { code: 'CY', name: 'Chipre',                    flag: '🇨🇾' },
  { code: 'VA', name: 'Ciudad del Vaticano',       flag: '🇻🇦' },
  { code: 'KM', name: 'Comoras',                   flag: '🇰🇲' },
  { code: 'KP', name: 'Corea del Norte',           flag: '🇰🇵' },
  { code: 'KR', name: 'Corea del Sur',             flag: '🇰🇷' },
  { code: 'CI', name: 'Costa de Marfil',           flag: '🇨🇮' },
  { code: 'CR', name: 'Costa Rica',                flag: '🇨🇷' },
  { code: 'HR', name: 'Croacia',                   flag: '🇭🇷' },
  { code: 'CU', name: 'Cuba',                      flag: '🇨🇺' },
  { code: 'DK', name: 'Dinamarca',                 flag: '🇩🇰' },
  { code: 'DM', name: 'Dominica',                  flag: '🇩🇲' },
  { code: 'EC', name: 'Ecuador',                   flag: '🇪🇨' },
  { code: 'EG', name: 'Egipto',                    flag: '🇪🇬' },
  { code: 'SV', name: 'El Salvador',               flag: '🇸🇻' },
  { code: 'AE', name: 'Emiratos Árabes Unidos',    flag: '🇦🇪' },
  { code: 'ER', name: 'Eritrea',                   flag: '🇪🇷' },
  { code: 'SK', name: 'Eslovaquia',                flag: '🇸🇰' },
  { code: 'SI', name: 'Eslovenia',                 flag: '🇸🇮' },
  { code: 'EE', name: 'Estonia',                   flag: '🇪🇪' },
  { code: 'ET', name: 'Etiopía',                   flag: '🇪🇹' },
  { code: 'PH', name: 'Filipinas',                 flag: '🇵🇭' },
  { code: 'FI', name: 'Finlandia',                 flag: '🇫🇮' },
  { code: 'FJ', name: 'Fiyi',                      flag: '🇫🇯' },
  { code: 'GA', name: 'Gabón',                     flag: '🇬🇦' },
  { code: 'GM', name: 'Gambia',                    flag: '🇬🇲' },
  { code: 'GE', name: 'Georgia',                   flag: '🇬🇪' },
  { code: 'GH', name: 'Ghana',                     flag: '🇬🇭' },
  { code: 'GD', name: 'Granada',                   flag: '🇬🇩' },
  { code: 'GR', name: 'Grecia',                    flag: '🇬🇷' },
  { code: 'GT', name: 'Guatemala',                 flag: '🇬🇹' },
  { code: 'GN', name: 'Guinea',                    flag: '🇬🇳' },
  { code: 'GQ', name: 'Guinea Ecuatorial',         flag: '🇬🇶' },
  { code: 'GW', name: 'Guinea-Bisáu',              flag: '🇬🇼' },
  { code: 'GY', name: 'Guyana',                    flag: '🇬🇾' },
  { code: 'HT', name: 'Haití',                     flag: '🇭🇹' },
  { code: 'HN', name: 'Honduras',                  flag: '🇭🇳' },
  { code: 'HU', name: 'Hungría',                   flag: '🇭🇺' },
  { code: 'IN', name: 'India',                     flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia',                 flag: '🇮🇩' },
  { code: 'IQ', name: 'Irak',                      flag: '🇮🇶' },
  { code: 'IR', name: 'Irán',                      flag: '🇮🇷' },
  { code: 'IE', name: 'Irlanda',                   flag: '🇮🇪' },
  { code: 'IS', name: 'Islandia',                  flag: '🇮🇸' },
  { code: 'MH', name: 'Islas Marshall',            flag: '🇲🇭' },
  { code: 'SB', name: 'Islas Salomón',             flag: '🇸🇧' },
  { code: 'IL', name: 'Israel',                    flag: '🇮🇱' },
  { code: 'JM', name: 'Jamaica',                   flag: '🇯🇲' },
  { code: 'JP', name: 'Japón',                     flag: '🇯🇵' },
  { code: 'JO', name: 'Jordania',                  flag: '🇯🇴' },
  { code: 'KZ', name: 'Kazajistán',                flag: '🇰🇿' },
  { code: 'KE', name: 'Kenia',                     flag: '🇰🇪' },
  { code: 'KG', name: 'Kirguistán',                flag: '🇰🇬' },
  { code: 'KI', name: 'Kiribati',                  flag: '🇰🇮' },
  { code: 'KW', name: 'Kuwait',                    flag: '🇰🇼' },
  { code: 'LA', name: 'Laos',                      flag: '🇱🇦' },
  { code: 'LS', name: 'Lesoto',                    flag: '🇱🇸' },
  { code: 'LV', name: 'Letonia',                   flag: '🇱🇻' },
  { code: 'LB', name: 'Líbano',                    flag: '🇱🇧' },
  { code: 'LR', name: 'Liberia',                   flag: '🇱🇷' },
  { code: 'LY', name: 'Libia',                     flag: '🇱🇾' },
  { code: 'LI', name: 'Liechtenstein',             flag: '🇱🇮' },
  { code: 'LT', name: 'Lituania',                  flag: '🇱🇹' },
  { code: 'LU', name: 'Luxemburgo',                flag: '🇱🇺' },
  { code: 'MK', name: 'Macedonia del Norte',       flag: '🇲🇰' },
  { code: 'MG', name: 'Madagascar',                flag: '🇲🇬' },
  { code: 'MY', name: 'Malasia',                   flag: '🇲🇾' },
  { code: 'MW', name: 'Malaui',                    flag: '🇲🇼' },
  { code: 'MV', name: 'Maldivas',                  flag: '🇲🇻' },
  { code: 'ML', name: 'Malí',                      flag: '🇲🇱' },
  { code: 'MT', name: 'Malta',                     flag: '🇲🇹' },
  { code: 'MA', name: 'Marruecos',                 flag: '🇲🇦' },
  { code: 'MU', name: 'Mauricio',                  flag: '🇲🇺' },
  { code: 'MR', name: 'Mauritania',                flag: '🇲🇷' },
  { code: 'FM', name: 'Micronesia',                flag: '🇫🇲' },
  { code: 'MD', name: 'Moldavia',                  flag: '🇲🇩' },
  { code: 'MC', name: 'Mónaco',                    flag: '🇲🇨' },
  { code: 'MN', name: 'Mongolia',                  flag: '🇲🇳' },
  { code: 'ME', name: 'Montenegro',                flag: '🇲🇪' },
  { code: 'MZ', name: 'Mozambique',                flag: '🇲🇿' },
  { code: 'MM', name: 'Myanmar',                   flag: '🇲🇲' },
  { code: 'NA', name: 'Namibia',                   flag: '🇳🇦' },
  { code: 'NR', name: 'Nauru',                     flag: '🇳🇷' },
  { code: 'NP', name: 'Nepal',                     flag: '🇳🇵' },
  { code: 'NI', name: 'Nicaragua',                 flag: '🇳🇮' },
  { code: 'NE', name: 'Níger',                     flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria',                   flag: '🇳🇬' },
  { code: 'NO', name: 'Noruega',                   flag: '🇳🇴' },
  { code: 'NZ', name: 'Nueva Zelanda',             flag: '🇳🇿' },
  { code: 'OM', name: 'Omán',                      flag: '🇴🇲' },
  { code: 'NL', name: 'Países Bajos',              flag: '🇳🇱' },
  { code: 'PK', name: 'Pakistán',                  flag: '🇵🇰' },
  { code: 'PW', name: 'Palaos',                    flag: '🇵🇼' },
  { code: 'PS', name: 'Palestina',                 flag: '🇵🇸' },
  { code: 'PA', name: 'Panamá',                    flag: '🇵🇦' },
  { code: 'PG', name: 'Papúa Nueva Guinea',        flag: '🇵🇬' },
  { code: 'PY', name: 'Paraguay',                  flag: '🇵🇾' },
  { code: 'PL', name: 'Polonia',                   flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal',                  flag: '🇵🇹' },
  { code: 'GB', name: 'Reino Unido',               flag: '🇬🇧' },
  { code: 'CF', name: 'República Centroafricana',  flag: '🇨🇫' },
  { code: 'CZ', name: 'República Checa',           flag: '🇨🇿' },
  { code: 'CG', name: 'República del Congo',       flag: '🇨🇬' },
  { code: 'CD', name: 'República Democrática del Congo', flag: '🇨🇩' },
  { code: 'DO', name: 'República Dominicana',      flag: '🇩🇴' },
  { code: 'RW', name: 'Ruanda',                    flag: '🇷🇼' },
  { code: 'RO', name: 'Rumanía',                   flag: '🇷🇴' },
  { code: 'RU', name: 'Rusia',                     flag: '🇷🇺' },
  { code: 'WS', name: 'Samoa',                     flag: '🇼🇸' },
  { code: 'KN', name: 'San Cristóbal y Nieves',    flag: '🇰🇳' },
  { code: 'SM', name: 'San Marino',                flag: '🇸🇲' },
  { code: 'VC', name: 'San Vicente y las Granadinas', flag: '🇻🇨' },
  { code: 'LC', name: 'Santa Lucía',               flag: '🇱🇨' },
  { code: 'ST', name: 'Santo Tomé y Príncipe',     flag: '🇸🇹' },
  { code: 'SN', name: 'Senegal',                   flag: '🇸🇳' },
  { code: 'RS', name: 'Serbia',                    flag: '🇷🇸' },
  { code: 'SC', name: 'Seychelles',                flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leona',              flag: '🇸🇱' },
  { code: 'SG', name: 'Singapur',                  flag: '🇸🇬' },
  { code: 'SY', name: 'Siria',                     flag: '🇸🇾' },
  { code: 'SO', name: 'Somalia',                   flag: '🇸🇴' },
  { code: 'LK', name: 'Sri Lanka',                 flag: '🇱🇰' },
  { code: 'SZ', name: 'Suazilandia',               flag: '🇸🇿' },
  { code: 'ZA', name: 'Sudáfrica',                 flag: '🇿🇦' },
  { code: 'SD', name: 'Sudán',                     flag: '🇸🇩' },
  { code: 'SS', name: 'Sudán del Sur',             flag: '🇸🇸' },
  { code: 'SE', name: 'Suecia',                    flag: '🇸🇪' },
  { code: 'CH', name: 'Suiza',                     flag: '🇨🇭' },
  { code: 'SR', name: 'Surinam',                   flag: '🇸🇷' },
  { code: 'TH', name: 'Tailandia',                 flag: '🇹🇭' },
  { code: 'TW', name: 'Taiwán',                    flag: '🇹🇼' },
  { code: 'TZ', name: 'Tanzania',                  flag: '🇹🇿' },
  { code: 'TJ', name: 'Tayikistán',                flag: '🇹🇯' },
  { code: 'TL', name: 'Timor Oriental',            flag: '🇹🇱' },
  { code: 'TG', name: 'Togo',                      flag: '🇹🇬' },
  { code: 'TO', name: 'Tonga',                     flag: '🇹🇴' },
  { code: 'TT', name: 'Trinidad y Tobago',         flag: '🇹🇹' },
  { code: 'TN', name: 'Túnez',                     flag: '🇹🇳' },
  { code: 'TM', name: 'Turkmenistán',              flag: '🇹🇲' },
  { code: 'TR', name: 'Turquía',                   flag: '🇹🇷' },
  { code: 'TV', name: 'Tuvalu',                    flag: '🇹🇻' },
  { code: 'UA', name: 'Ucrania',                   flag: '🇺🇦' },
  { code: 'UG', name: 'Uganda',                    flag: '🇺🇬' },
  { code: 'UY', name: 'Uruguay',                   flag: '🇺🇾' },
  { code: 'UZ', name: 'Uzbekistán',                flag: '🇺🇿' },
  { code: 'VU', name: 'Vanuatu',                   flag: '🇻🇺' },
  { code: 'VE', name: 'Venezuela',                 flag: '🇻🇪' },
  { code: 'VN', name: 'Vietnam',                   flag: '🇻🇳' },
  { code: 'YE', name: 'Yemen',                     flag: '🇾🇪' },
  { code: 'DJ', name: 'Yibuti',                    flag: '🇩🇯' },
  { code: 'ZM', name: 'Zambia',                    flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabue',                  flag: '🇿🇼' },
]

export const ALL_COUNTRIES: Country[] = [...COMMON_COUNTRIES, ...OTHER_COUNTRIES]
export { COMMON_COUNTRIES, OTHER_COUNTRIES }

/** Normaliza string (lowercase + sin acentos) — exportada para reuso. */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Alias interno para back-compat con el código del filter. */
const normalize = normalizeForSearch

interface Props {
  /** Valor actual — nombre del país en español (compat con campo texto previo). */
  value: string
  onChange: (countryName: string) => void
  /** Error visual (border rojo). */
  hasError?: boolean
  /** Placeholder cuando vacío. */
  placeholder?: string
  /** Disabled state. */
  disabled?: boolean
}

export function CountryCombobox({
  value, onChange, hasError, placeholder = 'Selecciona país…', disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Auto-focus search al abrir — patrón Stripe / Linear / Notion command palette.
  useEffect(() => {
    if (open) {
      // requestAnimationFrame para esperar a que el Popover monte el DOM.
      requestAnimationFrame(() => searchRef.current?.focus())
    } else {
      setQuery('')
    }
  }, [open])

  const selected = useMemo(
    () => ALL_COUNTRIES.find((c) => c.name === value) ?? null,
    [value],
  )

  // Filtro con priorización: prefix > infix > code.
  const filtered = useMemo(() => {
    if (!query.trim()) {
      // Sin query: mostrar comunes primero, luego separador, luego resto
      return { common: COMMON_COUNTRIES, rest: OTHER_COUNTRIES }
    }
    const q = normalize(query)
    const prefixMatches: Country[] = []
    const infixMatches: Country[] = []
    const codeMatches: Country[] = []

    for (const c of ALL_COUNTRIES) {
      const n = normalize(c.name)
      if (n.startsWith(q)) prefixMatches.push(c)
      else if (n.includes(q)) infixMatches.push(c)
      else if (c.code.toLowerCase().startsWith(q)) codeMatches.push(c)
    }

    return {
      common: [...prefixMatches, ...infixMatches, ...codeMatches],
      rest: [],
    }
  }, [query])

  const totalCount = filtered.common.length + filtered.rest.length

  function handleSelect(country: Country) {
    onChange(country.name)
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2',
            'rounded-md border bg-white px-3 text-sm text-left',
            'transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
            hasError ? 'border-red-400' : 'border-slate-200 hover:border-slate-300',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0 leading-none">{selected.flag}</span>
              <span className="truncate text-slate-900">{selected.name}</span>
            </span>
          ) : value ? (
            // Valor legacy que no matchea catálogo (stays viejos con texto libre)
            <span className="flex items-center gap-2 min-w-0">
              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="truncate text-slate-700">{value}</span>
            </span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-[80] w-[var(--radix-popover-trigger-width)] min-w-[260px] rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Search input sticky */}
          <div className="border-b border-slate-100 px-2.5 py-2 flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar país, código…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setOpen(false)
                }
              }}
            />
          </div>

          {/*
           * Lista scrollable. `onWheel/onTouchMove stopPropagation` es CRÍTICO:
           * cuando el combobox vive dentro de un Radix Dialog (CheckInDialog),
           * `react-remove-scroll` del Dialog intercepta los wheel events
           * para bloquear scroll del body — sin stopPropagation, los events
           * burbujean al Dialog y el contenedor scrolleable nunca recibe el
           * scroll. Pattern documentado en radix-ui/primitives#1859.
           * `overscroll-contain` previene que el scroll del list haga
           * scroll-chain al body cuando se llega al límite.
           */}
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
                      <CountryRow
                        key={c.code}
                        country={c}
                        isSelected={selected?.code === c.code}
                        onSelect={handleSelect}
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
                      <CountryRow
                        key={c.code}
                        country={c}
                        isSelected={selected?.code === c.code}
                        onSelect={handleSelect}
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
  )
}

function CountryRow({
  country, isSelected, onSelect,
}: {
  country: Country
  isSelected: boolean
  onSelect: (c: Country) => void
}) {
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
      <span className="text-[10px] font-mono text-slate-400">{country.code}</span>
      {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
    </button>
  )
}

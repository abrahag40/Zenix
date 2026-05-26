/**
 * LATAM cities catalog — stub curado para wizard property city picker.
 *
 * Por qué un stub (Day 14 — 2026-05-25):
 *   - Google Places API ya en tooling catalog (vercel:bootstrap pendiente
 *     activar) — Day 15+ wirea autocomplete real con place_id structured.
 *   - Para consistency analítica el ID DEBE ser estructurado (no free text):
 *     analytics events.localCity, demand intelligence per ciudad, compset
 *     auto-radius — todos requieren cityId estable.
 *
 * Schema decidido (Day 14):
 *   id: estable lowercase con underscore. Ej "mx_tulum_qroo"
 *   nombre display + región + país + coords + timezone
 *
 * Migration path Day 15+:
 *   Backend agrega tabla City con FK a Property.cityId. Google Places ID
 *   se incorpora como columna alterna `googlePlaceId`. Stub curado se
 *   carga via seed. Cliente puede agregar cities custom si no está en
 *   el catálogo (escalable).
 */

export interface CityRow {
  id: string // ID estable estructurado — DB key
  name: string // Display
  region: string // Estado / departamento / provincia
  countryCode: string // ISO 3166-1 alpha-2
  lat: number
  lng: number
  timezone: string
  /** Tags útiles para analytics: 'beach' | 'mountain' | 'capital' | 'tourist' */
  tags?: string[]
}

/**
 * Top 60 LATAM tourist cities — curated. No exhaustivo — Day 15+ swap a
 * Google Places para coverage completo. Pero esto es suficiente para
 * piloto + onboarding del primer batch de hoteles boutique.
 */
export const LATAM_CITIES: CityRow[] = [
  // ─── México ──────────────────────────────────────────────────────
  { id: 'mx_tulum', name: 'Tulum', region: 'Quintana Roo', countryCode: 'MX', lat: 20.211, lng: -87.466, timezone: 'America/Cancun', tags: ['beach', 'tourist'] },
  { id: 'mx_playa_del_carmen', name: 'Playa del Carmen', region: 'Quintana Roo', countryCode: 'MX', lat: 20.629, lng: -87.073, timezone: 'America/Cancun', tags: ['beach', 'tourist'] },
  { id: 'mx_cancun', name: 'Cancún', region: 'Quintana Roo', countryCode: 'MX', lat: 21.161, lng: -86.851, timezone: 'America/Cancun', tags: ['beach', 'tourist'] },
  { id: 'mx_cozumel', name: 'Cozumel', region: 'Quintana Roo', countryCode: 'MX', lat: 20.422, lng: -86.922, timezone: 'America/Cancun', tags: ['beach', 'tourist'] },
  { id: 'mx_ciudad_de_mexico', name: 'Ciudad de México', region: 'CDMX', countryCode: 'MX', lat: 19.432, lng: -99.133, timezone: 'America/Mexico_City', tags: ['capital'] },
  { id: 'mx_guadalajara', name: 'Guadalajara', region: 'Jalisco', countryCode: 'MX', lat: 20.659, lng: -103.349, timezone: 'America/Mexico_City' },
  { id: 'mx_monterrey', name: 'Monterrey', region: 'Nuevo León', countryCode: 'MX', lat: 25.686, lng: -100.317, timezone: 'America/Monterrey' },
  { id: 'mx_puebla', name: 'Puebla', region: 'Puebla', countryCode: 'MX', lat: 19.041, lng: -98.206, timezone: 'America/Mexico_City' },
  { id: 'mx_oaxaca', name: 'Oaxaca de Juárez', region: 'Oaxaca', countryCode: 'MX', lat: 17.067, lng: -96.726, timezone: 'America/Mexico_City', tags: ['tourist'] },
  { id: 'mx_puerto_escondido', name: 'Puerto Escondido', region: 'Oaxaca', countryCode: 'MX', lat: 15.873, lng: -97.078, timezone: 'America/Mexico_City', tags: ['beach', 'tourist'] },
  { id: 'mx_san_cristobal', name: 'San Cristóbal de las Casas', region: 'Chiapas', countryCode: 'MX', lat: 16.737, lng: -92.638, timezone: 'America/Mexico_City', tags: ['mountain', 'tourist'] },
  { id: 'mx_merida', name: 'Mérida', region: 'Yucatán', countryCode: 'MX', lat: 20.967, lng: -89.624, timezone: 'America/Merida', tags: ['tourist'] },
  { id: 'mx_valladolid_yucatan', name: 'Valladolid', region: 'Yucatán', countryCode: 'MX', lat: 20.689, lng: -88.202, timezone: 'America/Merida' },
  { id: 'mx_san_miguel_allende', name: 'San Miguel de Allende', region: 'Guanajuato', countryCode: 'MX', lat: 20.914, lng: -100.745, timezone: 'America/Mexico_City', tags: ['tourist'] },
  { id: 'mx_guanajuato', name: 'Guanajuato', region: 'Guanajuato', countryCode: 'MX', lat: 21.018, lng: -101.258, timezone: 'America/Mexico_City', tags: ['tourist'] },
  { id: 'mx_morelia', name: 'Morelia', region: 'Michoacán', countryCode: 'MX', lat: 19.706, lng: -101.194, timezone: 'America/Mexico_City' },
  { id: 'mx_puerto_vallarta', name: 'Puerto Vallarta', region: 'Jalisco', countryCode: 'MX', lat: 20.620, lng: -105.230, timezone: 'America/Bahia_Banderas', tags: ['beach', 'tourist'] },
  { id: 'mx_cabo_san_lucas', name: 'Cabo San Lucas', region: 'Baja California Sur', countryCode: 'MX', lat: 22.890, lng: -109.916, timezone: 'America/Mazatlan', tags: ['beach', 'tourist'] },
  { id: 'mx_la_paz_bcs', name: 'La Paz', region: 'Baja California Sur', countryCode: 'MX', lat: 24.142, lng: -110.310, timezone: 'America/Mazatlan' },
  { id: 'mx_acapulco', name: 'Acapulco', region: 'Guerrero', countryCode: 'MX', lat: 16.864, lng: -99.882, timezone: 'America/Mexico_City', tags: ['beach'] },
  { id: 'mx_huatulco', name: 'Huatulco', region: 'Oaxaca', countryCode: 'MX', lat: 15.760, lng: -96.131, timezone: 'America/Mexico_City', tags: ['beach', 'tourist'] },
  { id: 'mx_ixtapa', name: 'Ixtapa-Zihuatanejo', region: 'Guerrero', countryCode: 'MX', lat: 17.652, lng: -101.557, timezone: 'America/Mexico_City', tags: ['beach'] },
  { id: 'mx_holbox', name: 'Isla Holbox', region: 'Quintana Roo', countryCode: 'MX', lat: 21.527, lng: -87.378, timezone: 'America/Cancun', tags: ['beach', 'tourist'] },
  { id: 'mx_bacalar', name: 'Bacalar', region: 'Quintana Roo', countryCode: 'MX', lat: 18.679, lng: -88.395, timezone: 'America/Cancun', tags: ['tourist'] },
  { id: 'mx_sayulita', name: 'Sayulita', region: 'Nayarit', countryCode: 'MX', lat: 20.870, lng: -105.444, timezone: 'America/Bahia_Banderas', tags: ['beach', 'tourist'] },
  { id: 'mx_mazatlan', name: 'Mazatlán', region: 'Sinaloa', countryCode: 'MX', lat: 23.249, lng: -106.411, timezone: 'America/Mazatlan', tags: ['beach'] },
  // México — capitales de estado + pueblos mágicos top tier
  { id: 'mx_queretaro', name: 'Santiago de Querétaro', region: 'Querétaro', countryCode: 'MX', lat: 20.588, lng: -100.389, timezone: 'America/Mexico_City', tags: ['tourist', 'capital'] },
  { id: 'mx_san_luis_potosi', name: 'San Luis Potosí', region: 'San Luis Potosí', countryCode: 'MX', lat: 22.156, lng: -100.985, timezone: 'America/Mexico_City' },
  { id: 'mx_aguascalientes', name: 'Aguascalientes', region: 'Aguascalientes', countryCode: 'MX', lat: 21.881, lng: -102.291, timezone: 'America/Mexico_City' },
  { id: 'mx_chihuahua', name: 'Chihuahua', region: 'Chihuahua', countryCode: 'MX', lat: 28.633, lng: -106.077, timezone: 'America/Chihuahua' },
  { id: 'mx_durango', name: 'Durango', region: 'Durango', countryCode: 'MX', lat: 24.022, lng: -104.659, timezone: 'America/Monterrey' },
  { id: 'mx_zacatecas', name: 'Zacatecas', region: 'Zacatecas', countryCode: 'MX', lat: 22.770, lng: -102.583, timezone: 'America/Mexico_City', tags: ['tourist'] },
  { id: 'mx_veracruz', name: 'Veracruz', region: 'Veracruz', countryCode: 'MX', lat: 19.173, lng: -96.134, timezone: 'America/Mexico_City', tags: ['beach'] },
  { id: 'mx_xalapa', name: 'Xalapa', region: 'Veracruz', countryCode: 'MX', lat: 19.532, lng: -96.917, timezone: 'America/Mexico_City' },
  { id: 'mx_tuxtla_gutierrez', name: 'Tuxtla Gutiérrez', region: 'Chiapas', countryCode: 'MX', lat: 16.752, lng: -93.115, timezone: 'America/Mexico_City' },
  { id: 'mx_palenque', name: 'Palenque', region: 'Chiapas', countryCode: 'MX', lat: 17.510, lng: -91.985, timezone: 'America/Mexico_City', tags: ['tourist'] },
  { id: 'mx_campeche', name: 'San Francisco de Campeche', region: 'Campeche', countryCode: 'MX', lat: 19.844, lng: -90.524, timezone: 'America/Merida', tags: ['tourist'] },
  { id: 'mx_chetumal', name: 'Chetumal', region: 'Quintana Roo', countryCode: 'MX', lat: 18.500, lng: -88.300, timezone: 'America/Cancun' },
  { id: 'mx_tepoztlan', name: 'Tepoztlán', region: 'Morelos', countryCode: 'MX', lat: 18.984, lng: -99.094, timezone: 'America/Mexico_City', tags: ['mountain', 'tourist'] },
  { id: 'mx_cuernavaca', name: 'Cuernavaca', region: 'Morelos', countryCode: 'MX', lat: 18.921, lng: -99.234, timezone: 'America/Mexico_City' },
  { id: 'mx_taxco', name: 'Taxco', region: 'Guerrero', countryCode: 'MX', lat: 18.555, lng: -99.605, timezone: 'America/Mexico_City', tags: ['tourist'] },
  { id: 'mx_patzcuaro', name: 'Pátzcuaro', region: 'Michoacán', countryCode: 'MX', lat: 19.510, lng: -101.609, timezone: 'America/Mexico_City', tags: ['tourist'] },
  { id: 'mx_tijuana', name: 'Tijuana', region: 'Baja California', countryCode: 'MX', lat: 32.515, lng: -117.038, timezone: 'America/Tijuana' },
  { id: 'mx_ensenada', name: 'Ensenada', region: 'Baja California', countryCode: 'MX', lat: 31.871, lng: -116.605, timezone: 'America/Tijuana', tags: ['beach'] },
  { id: 'mx_loreto', name: 'Loreto', region: 'Baja California Sur', countryCode: 'MX', lat: 26.014, lng: -111.343, timezone: 'America/Mazatlan', tags: ['beach', 'tourist'] },
  { id: 'mx_todos_santos', name: 'Todos Santos', region: 'Baja California Sur', countryCode: 'MX', lat: 23.450, lng: -110.224, timezone: 'America/Mazatlan', tags: ['beach', 'tourist'] },
  { id: 'mx_real_de_catorce', name: 'Real de Catorce', region: 'San Luis Potosí', countryCode: 'MX', lat: 23.685, lng: -100.886, timezone: 'America/Mexico_City', tags: ['mountain', 'tourist'] },
  { id: 'mx_san_pancho', name: 'San Pancho (San Francisco)', region: 'Nayarit', countryCode: 'MX', lat: 20.910, lng: -105.466, timezone: 'America/Bahia_Banderas', tags: ['beach', 'tourist'] },
  { id: 'mx_punta_mita', name: 'Punta de Mita', region: 'Nayarit', countryCode: 'MX', lat: 20.764, lng: -105.524, timezone: 'America/Bahia_Banderas', tags: ['beach', 'tourist'] },
  { id: 'mx_isla_mujeres', name: 'Isla Mujeres', region: 'Quintana Roo', countryCode: 'MX', lat: 21.232, lng: -86.731, timezone: 'America/Cancun', tags: ['beach', 'tourist'] },

  // ─── Colombia ───────────────────────────────────────────────────
  { id: 'co_bogota', name: 'Bogotá', region: 'Cundinamarca', countryCode: 'CO', lat: 4.711, lng: -74.072, timezone: 'America/Bogota', tags: ['capital'] },
  { id: 'co_medellin', name: 'Medellín', region: 'Antioquia', countryCode: 'CO', lat: 6.244, lng: -75.581, timezone: 'America/Bogota', tags: ['tourist'] },
  { id: 'co_cartagena', name: 'Cartagena', region: 'Bolívar', countryCode: 'CO', lat: 10.391, lng: -75.479, timezone: 'America/Bogota', tags: ['beach', 'tourist'] },
  { id: 'co_santa_marta', name: 'Santa Marta', region: 'Magdalena', countryCode: 'CO', lat: 11.241, lng: -74.211, timezone: 'America/Bogota', tags: ['beach'] },
  { id: 'co_cali', name: 'Cali', region: 'Valle del Cauca', countryCode: 'CO', lat: 3.452, lng: -76.532, timezone: 'America/Bogota' },
  { id: 'co_san_andres', name: 'San Andrés', region: 'San Andrés y Providencia', countryCode: 'CO', lat: 12.583, lng: -81.700, timezone: 'America/Bogota', tags: ['beach', 'tourist'] },
  { id: 'co_villa_de_leyva', name: 'Villa de Leyva', region: 'Boyacá', countryCode: 'CO', lat: 5.633, lng: -73.523, timezone: 'America/Bogota', tags: ['tourist'] },

  // ─── Costa Rica ─────────────────────────────────────────────────
  { id: 'cr_san_jose', name: 'San José', region: 'San José', countryCode: 'CR', lat: 9.928, lng: -84.090, timezone: 'America/Costa_Rica', tags: ['capital'] },
  { id: 'cr_tamarindo', name: 'Tamarindo', region: 'Guanacaste', countryCode: 'CR', lat: 10.299, lng: -85.838, timezone: 'America/Costa_Rica', tags: ['beach', 'tourist'] },
  { id: 'cr_manuel_antonio', name: 'Manuel Antonio', region: 'Puntarenas', countryCode: 'CR', lat: 9.391, lng: -84.137, timezone: 'America/Costa_Rica', tags: ['beach', 'tourist'] },
  { id: 'cr_la_fortuna', name: 'La Fortuna', region: 'Alajuela', countryCode: 'CR', lat: 10.470, lng: -84.643, timezone: 'America/Costa_Rica', tags: ['mountain', 'tourist'] },
  { id: 'cr_monteverde', name: 'Monteverde', region: 'Puntarenas', countryCode: 'CR', lat: 10.300, lng: -84.806, timezone: 'America/Costa_Rica', tags: ['mountain', 'tourist'] },
  { id: 'cr_jaco', name: 'Jacó', region: 'Puntarenas', countryCode: 'CR', lat: 9.617, lng: -84.629, timezone: 'America/Costa_Rica', tags: ['beach'] },

  // ─── Perú ────────────────────────────────────────────────────────
  { id: 'pe_lima', name: 'Lima', region: 'Lima', countryCode: 'PE', lat: -12.046, lng: -77.043, timezone: 'America/Lima', tags: ['capital'] },
  { id: 'pe_cusco', name: 'Cusco', region: 'Cusco', countryCode: 'PE', lat: -13.531, lng: -71.967, timezone: 'America/Lima', tags: ['mountain', 'tourist'] },
  { id: 'pe_aguas_calientes', name: 'Aguas Calientes (Machu Picchu)', region: 'Cusco', countryCode: 'PE', lat: -13.155, lng: -72.524, timezone: 'America/Lima', tags: ['mountain', 'tourist'] },
  { id: 'pe_arequipa', name: 'Arequipa', region: 'Arequipa', countryCode: 'PE', lat: -16.409, lng: -71.537, timezone: 'America/Lima', tags: ['tourist'] },
  { id: 'pe_puno', name: 'Puno', region: 'Puno', countryCode: 'PE', lat: -15.840, lng: -70.024, timezone: 'America/Lima', tags: ['mountain', 'tourist'] },
  { id: 'pe_mancora', name: 'Máncora', region: 'Piura', countryCode: 'PE', lat: -4.107, lng: -81.046, timezone: 'America/Lima', tags: ['beach', 'tourist'] },

  // ─── Argentina ───────────────────────────────────────────────────
  { id: 'ar_buenos_aires', name: 'Buenos Aires', region: 'CABA', countryCode: 'AR', lat: -34.604, lng: -58.382, timezone: 'America/Argentina/Buenos_Aires', tags: ['capital'] },
  { id: 'ar_bariloche', name: 'Bariloche', region: 'Río Negro', countryCode: 'AR', lat: -41.135, lng: -71.310, timezone: 'America/Argentina/Salta', tags: ['mountain', 'tourist'] },
  { id: 'ar_mendoza', name: 'Mendoza', region: 'Mendoza', countryCode: 'AR', lat: -32.890, lng: -68.844, timezone: 'America/Argentina/Mendoza', tags: ['tourist'] },
  { id: 'ar_el_calafate', name: 'El Calafate', region: 'Santa Cruz', countryCode: 'AR', lat: -50.339, lng: -72.265, timezone: 'America/Argentina/Rio_Gallegos', tags: ['mountain', 'tourist'] },
  { id: 'ar_ushuaia', name: 'Ushuaia', region: 'Tierra del Fuego', countryCode: 'AR', lat: -54.807, lng: -68.303, timezone: 'America/Argentina/Ushuaia', tags: ['tourist'] },
  { id: 'ar_salta', name: 'Salta', region: 'Salta', countryCode: 'AR', lat: -24.782, lng: -65.423, timezone: 'America/Argentina/Salta', tags: ['mountain'] },

  // ─── Guatemala, Panamá, etc (top tourist) ───────────────────────
  { id: 'gt_antigua', name: 'Antigua Guatemala', region: 'Sacatepéquez', countryCode: 'GT', lat: 14.557, lng: -90.733, timezone: 'America/Guatemala', tags: ['tourist'] },
  { id: 'gt_lake_atitlan', name: 'Lago Atitlán (Panajachel)', region: 'Sololá', countryCode: 'GT', lat: 14.741, lng: -91.157, timezone: 'America/Guatemala', tags: ['tourist'] },
  { id: 'gt_flores', name: 'Flores (Tikal)', region: 'Petén', countryCode: 'GT', lat: 16.928, lng: -89.892, timezone: 'America/Guatemala', tags: ['tourist'] },
  { id: 'pa_panama_city', name: 'Ciudad de Panamá', region: 'Panamá', countryCode: 'PA', lat: 8.984, lng: -79.518, timezone: 'America/Panama', tags: ['capital'] },
  { id: 'pa_bocas_del_toro', name: 'Bocas del Toro', region: 'Bocas del Toro', countryCode: 'PA', lat: 9.339, lng: -82.243, timezone: 'America/Panama', tags: ['beach', 'tourist'] },
  { id: 'sv_san_salvador', name: 'San Salvador', region: 'San Salvador', countryCode: 'SV', lat: 13.692, lng: -89.218, timezone: 'America/El_Salvador', tags: ['capital'] },
  { id: 'sv_el_tunco', name: 'El Tunco', region: 'La Libertad', countryCode: 'SV', lat: 13.493, lng: -89.387, timezone: 'America/El_Salvador', tags: ['beach', 'tourist'] },
  { id: 'hn_roatan', name: 'Roatán', region: 'Islas de la Bahía', countryCode: 'HN', lat: 16.319, lng: -86.531, timezone: 'America/Tegucigalpa', tags: ['beach', 'tourist'] },
  { id: 'hn_tegucigalpa', name: 'Tegucigalpa', region: 'Francisco Morazán', countryCode: 'HN', lat: 14.072, lng: -87.192, timezone: 'America/Tegucigalpa', tags: ['capital'] },
]

/** Filtra cities por país + búsqueda parcial nombre/región. */
export function searchCities(query: string, countryCode?: string): CityRow[] {
  const q = query.trim().toLowerCase()
  let candidates = LATAM_CITIES
  if (countryCode) {
    candidates = candidates.filter((c) => c.countryCode === countryCode)
  }
  if (!q) return candidates.slice(0, 20)
  return candidates
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q),
    )
    .slice(0, 20)
}

export function findCityById(id: string): CityRow | undefined {
  return LATAM_CITIES.find((c) => c.id === id)
}

/**
 * humanizeOtaName — convierte el código de OTA que Channex devuelve
 * (PascalCase o snake_case) en un display name human-friendly.
 *
 * Channex devuelve `ota_name` con valores como:
 *   "BookingCom" | "ExpediaCom" | "AirbnbCom" | "AgodaCom" | "VRBOCom"
 *   "GoogleHotelAds" | "OpenChannel" | "booking_com" | "expedia_com" | ...
 *
 * Convertimos a:
 *   "Booking.com" | "Expedia" | "Airbnb" | "Agoda" | "VRBO"
 *   "Google Hotel Ads" | "OTA directa" | ...
 *
 * Uso:
 *   import { humanizeOtaName } from '@zenix/shared'
 *   const display = humanizeOtaName(stay.channexOtaName) // "Booking.com"
 *   const title = `Cancela en ${humanizeOtaName(otaName)} manualmente`
 *
 * Tabla curada — extender cuando se conecte un nuevo canal Channex.
 * Caso default: retorna el input tal cual (mejor mostrar el código que
 * un genérico "OTA" si encontramos un canal nuevo no mapeado).
 */
export function humanizeOtaName(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    return 'OTA'
  }
  const key = raw.trim().toLowerCase().replace(/[_-]/g, '')
  const map: Record<string, string> = {
    bookingcom: 'Booking.com',
    expediacom: 'Expedia',
    airbnbcom: 'Airbnb',
    agodacom: 'Agoda',
    vrbocom: 'VRBO',
    hotelbedscom: 'Hotelbeds',
    despegarcom: 'Despegar',
    googlehotelads: 'Google Hotel Ads',
    googlehotel: 'Google Hotel Ads',
    openchannel: 'OTA directa',
    direct: 'Reserva directa',
    // Algunos canales devuelven el código sin sufijo "Com"
    booking: 'Booking.com',
    expedia: 'Expedia',
    airbnb: 'Airbnb',
    agoda: 'Agoda',
    vrbo: 'VRBO',
  }
  return map[key] ?? raw
}

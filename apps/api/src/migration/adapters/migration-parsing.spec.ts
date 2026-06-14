/**
 * Tests del núcleo PURO de parsing/mapeo (DoD del Sprint 1). Sin BD ni NestJS.
 */
import { parseCsv } from './csv-parser'
import { mapRows, parseSourceDate } from './reservation-mapper'
import { CloudbedsAdapter } from './cloudbeds.adapter'

describe('csv-parser', () => {
  it('parsea CSV simple con headers y filas', () => {
    const { headers, rows } = parseCsv('a,b,c\n1,2,3\n4,5,6\n')
    expect(headers).toEqual(['a', 'b', 'c'])
    expect(rows).toEqual([
      { a: '1', b: '2', c: '3' },
      { a: '4', b: '5', c: '6' },
    ])
  })

  it('respeta comas y saltos de línea dentro de comillas', () => {
    const { rows } = parseCsv('name,note\n"Smith, John","línea1\nlínea2"\n')
    expect(rows[0].name).toBe('Smith, John')
    expect(rows[0].note).toBe('línea1\nlínea2')
  })

  it('maneja comillas escapadas ("") y BOM UTF-8', () => {
    const { rows } = parseCsv('﻿q\n"dijo ""hola"""\n')
    expect(rows[0].q).toBe('dijo "hola"')
  })

  it('ignora filas totalmente vacías', () => {
    const { rows } = parseCsv('a\n1\n\n2\n')
    expect(rows.map((r) => r.a)).toEqual(['1', '2'])
  })

  it('CSV sin headers → vacío', () => {
    expect(parseCsv('').headers).toEqual([])
  })
})

describe('parseSourceDate', () => {
  it('DD/MM/YYYY (default LATAM) → ISO', () => {
    expect(parseSourceDate('01/02/2026', 'DD/MM/YYYY')).toBe('2026-02-01')
  })
  it('MM/DD/YYYY → ISO', () => {
    expect(parseSourceDate('02/01/2026', 'MM/DD/YYYY')).toBe('2026-02-01')
  })
  it('ISO directo se respeta', () => {
    expect(parseSourceDate('2026-06-20', 'DD/MM/YYYY')).toBe('2026-06-20')
  })
  it('fecha imposible (31/02) → null', () => {
    expect(parseSourceDate('31/02/2026', 'DD/MM/YYYY')).toBeNull()
  })
  it('vacío o basura → null', () => {
    expect(parseSourceDate('', 'DD/MM/YYYY')).toBeNull()
    expect(parseSourceDate('not-a-date')).toBeNull()
  })
})

describe('mapRows (mapeo a DTO canónico)', () => {
  const mapping = {
    reservation: {
      sourceId: 'ID', guestFirstName: 'First', guestLastName: 'Last',
      guestEmail: 'Email', checkIn: 'In', checkOut: 'Out',
      roomLabel: 'Room', totalAmount: 'Total', balance: 'Balance', currency: 'Cur',
    },
    dateFormat: 'DD/MM/YYYY',
  }

  it('deriva guestName, fechas ISO y amountPaid = total - balance', () => {
    const rows = [{
      ID: 'R1', First: 'María', Last: 'Hernández', Email: 'm@x.com',
      In: '01/02/2026', Out: '04/02/2026', Room: '101', Total: '3600.00', Balance: '1200.00', Cur: 'MXN',
    }]
    const { reservations } = mapRows(rows, mapping)
    expect(reservations[0]).toMatchObject({
      sourceId: 'R1', guestName: 'María Hernández', guestEmail: 'm@x.com',
      checkIn: '2026-02-01', checkOut: '2026-02-04', roomLabel: '101',
      totalAmount: 3600, amountPaid: 2400, currency: 'MXN',
    })
  })

  it('fila sin sourceId recibe id sintético ROW-n', () => {
    const { reservations } = mapRows([{ First: 'A', Last: 'B' }], { reservation: { guestFirstName: 'First', guestLastName: 'Last' } })
    expect(reservations[0].sourceId).toBe('ROW-1')
  })

  it('dedup ligero de huéspedes por email', () => {
    const rows = [
      { ID: 'R1', Email: 'dup@x.com', First: 'A', Last: 'B', In: '', Out: '', Room: '', Total: '', Balance: '', Cur: '' },
      { ID: 'R2', Email: 'dup@x.com', First: 'A', Last: 'B', In: '', Out: '', Room: '', Total: '', Balance: '', Cur: '' },
    ]
    const { reservations, guests } = mapRows(rows, mapping)
    expect(reservations).toHaveLength(2)
    expect(guests).toHaveLength(1)
  })

  it('monto negativo se preserva (Sprint 2 lo marca conflicto)', () => {
    const { reservations } = mapRows([{ ID: 'R1', Total: '-500' }], { reservation: { sourceId: 'ID', totalAmount: 'Total' } })
    expect(reservations[0].totalAmount).toBe(-500)
  })
})

describe('CloudbedsAdapter pre-mapeo + pipeline sobre la muestra', () => {
  const csv = [
    'Reservation ID,Status,Guest First Name,Guest Last Name,Email,Phone,Country,Check-in,Check-out,Room Name,Room Type,Rate Plan,Source,Adults,Children,Total,Balance,Currency,OTA Reference',
    'CB-100001,Checked Out,María,Hernández,maria.h@example.com,+52 998 123 4567,MX,01/02/2026,04/02/2026,101,Standard Queen,BAR,Booking.com,2,0,3600.00,0.00,MXN,BDC-44821',
    'CB-100003,Confirmed,Sofía,Ramírez,sofia.r@example.com,5512345678,MX,20/06/2026,22/06/2026,103,Standard Queen,BAR,Direct,1,0,2400.00,1200.00,MXN,',
  ].join('\n')

  it('mapea el export Cloudbeds a DTO canónico con su pre-mapeo', () => {
    const adapter = new CloudbedsAdapter()
    const mapping = adapter.defaultMapping()
    const { headers, rows } = parseCsv(csv)
    expect(headers).toContain('Reservation ID')
    const { reservations } = mapRows(rows, mapping)
    expect(reservations).toHaveLength(2)
    expect(reservations[0]).toMatchObject({
      sourceId: 'CB-100001',
      guestName: 'María Hernández',
      checkIn: '2026-02-01',
      checkOut: '2026-02-04',
      roomLabel: '101',
      roomTypeLabel: 'Standard Queen',
      sourceChannel: 'Booking.com',
      otaReservationCode: 'BDC-44821',
      currency: 'MXN',
    })
    // amountPaid derivado: 2400 total - 1200 balance = 1200
    expect(reservations[1].amountPaid).toBe(1200)
  })
})

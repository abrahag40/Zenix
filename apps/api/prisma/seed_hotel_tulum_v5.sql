-- =============================================================================
-- Hotel Tulum — Seed comprehensivo v5
-- Cubre TODOS los casos de uso de la operación diaria real de un hotel:
--
--  ESTADO / ESCENARIO                           HABITACIÓN
--  ─────────────────────────────────────────────────────────
--  CHECKED_OUT (departed, PAID)                  101, 102, 305, A1 (primer seg)
--  UNCONFIRMED (llega hoy, sin actual_checkin)   101-bis, 105, 202
--  IN_HOUSE confirmado (doc + key_type + notes)  103, 104, 201, 203, 204, 205, 301, A1-bis, A2, B2
--  NO_SHOW (night audit + charge PENDING)        106
--  FUTURO (reservas próximas)                    102-next, 302, 303, C1, C2
--  EXTENSIÓN MISMA HAB (journey multi-seg)       A1 (nómada digital, 3 segmentos)
--  EXTENSIÓN OTRA HAB  (journey EXTENSION_NEW_ROOM) 204→205
--  TRASLADO MID-STAY (journey ROOM_MOVE)         305→301 (AC defectuoso)
--  GRUPO CORPORATIVO                             B1 (Wei Chen, 4 pax)
--  PAGO SPLIT (CASH + CARD)                      203
--  PAGO OTA_PREPAID                              104, 202
--  PAGO COMP + aprobación manager                B2 (upgrade suite)
--  VARIAS FUENTES OTA (6 canales)                booking.com, expedia, airbnb,
--                                                 direct, walk-in, hostelworld
--  LUNA DE MIEL (nota especial)                  A2, C1
--  PAYMENT LOGS (audit trail de pagos)           todos IN_HOUSE confirmados
--
-- Fechas: relativas a CURRENT_DATE (D).
--   Check-in estándar:  D + INTERVAL 'N days 15 hours'
--   Check-out estándar: D + INTERVAL 'N days 12 hours'
-- =============================================================================

DO $$
DECLARE
  v_org_id   TEXT;
  v_prop_id  TEXT := 'prop-hotel-tulum-001';
  v_sup_id   TEXT;
  v_rec_id   TEXT;

  v_room_id  TEXT;
  v_stay_id  TEXT;
  v_jrn_id   TEXT;
  v_seg1_id  TEXT;
  v_seg2_id  TEXT;
  v_seg3_id     TEXT;
  v_room_305_id TEXT;
  v_today    DATE := CURRENT_DATE;

BEGIN
  -- ── 1. Lookup IDs dinámicos ────────────────────────────────────────────────
  SELECT organization_id INTO v_org_id FROM properties WHERE id = v_prop_id LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Propiedad % no encontrada. Ejecuta seed.ts primero.', v_prop_id;
  END IF;
  SELECT id INTO v_sup_id FROM housekeeping_staff WHERE email = 'supervisor@demo.com' LIMIT 1;
  SELECT id INTO v_rec_id FROM housekeeping_staff WHERE email = 'reception@demo.com'  LIMIT 1;

  -- ── 2. Limpieza FK-safe ────────────────────────────────────────────────────
  DELETE FROM payment_logs
    WHERE stay_id IN (SELECT id FROM guest_stays WHERE property_id = v_prop_id);
  DELETE FROM stay_journey_events
    WHERE journey_id IN (SELECT id FROM stay_journeys WHERE property_id = v_prop_id);
  DELETE FROM segment_nights
    WHERE segment_id IN (
      SELECT id FROM stay_segments
      WHERE journey_id IN (SELECT id FROM stay_journeys WHERE property_id = v_prop_id)
    );
  DELETE FROM stay_segments
    WHERE journey_id IN (SELECT id FROM stay_journeys WHERE property_id = v_prop_id);
  DELETE FROM stay_journeys WHERE property_id = v_prop_id;
  DELETE FROM guest_stays   WHERE property_id = v_prop_id;

  -- ============================================================================
  -- PISO 1 — Habitaciones Standard ($70/noche, cap 2)
  -- ============================================================================

  -- ── Hab 101: Carlos Mendoza (D-12→D-7, CHECKED_OUT PAID) ──────────────────
  -- Caso: estadía completada — aparece en historial/reportes
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '101' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-101-carlos', v_org_id, v_prop_id, v_room_id,
    'Carlos Mendoza', 'carlos.m@gmail.com', '+52 984 111 0001', 'MX', 'INE', 'MX12345678',
    1,
    v_today - 12 + INTERVAL '15 hours',
    v_today - 7  + INTERVAL '12 hours',
    v_today - 7  + INTERVAL '11 hours 20 minutes',
    70, 'USD', 350, 350, 'PAID',
    v_today - 12 + INTERVAL '15 hours 30 minutes',
    v_rec_id, 'PHYSICAL',
    'Llega directo del aeropuerto. Tercera visita al hotel.',
    'direct',
    'Viajero frecuente. Prefiere habitación en piso bajo.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  -- Payment log — CASH al check-in
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, 'stay-tul-101-carlos',
    'CASH', 350, 'USD', v_today - 12, v_rec_id, v_today - 12 + INTERVAL '15 hours 35 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Hab 101: Liam O'Brien (D→D+3, UNCONFIRMED — llega HOY sin confirmar) ──
  -- Caso #1: back-to-back (Carlos salió -7, cuarto disponible, Liam llega hoy)
  -- Caso #16: walk-in, aún sin actual_checkin → UNCONFIRMED en calendario
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-101-liam', v_org_id, v_prop_id, v_room_id,
    'Liam O''Brien', 'liam.obrien@outlook.com', '+353 87 555 1234', 'IE',
    1,
    v_today + INTERVAL '15 hours',
    v_today + 3 + INTERVAL '12 hours',
    70, 'USD', 210, 0, 'PENDING',
    'walk-in',
    'Walk-in sin reserva previa. Pago pendiente al confirmar llegada.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 102: Isabella Romano (D-5→D, CHECKED_OUT PAID esta mañana) ────────
  -- Caso: salida del día — housekeeping la verá en planificación
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '102' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-102-isabella', v_org_id, v_prop_id, v_room_id,
    'Isabella Romano', 'i.romano@gmail.com', '+39 338 456 7890', 'IT', 'PASSPORT', 'YB4567890',
    2,
    v_today - 5 + INTERVAL '15 hours',
    v_today    + INTERVAL '12 hours',
    v_today    + INTERVAL '10 hours 45 minutes',
    70, 'USD', 350, 350, 'PAID',
    v_today - 5 + INTERVAL '15 hours 20 minutes',
    v_rec_id, 'CARD',
    NULL,
    'booking.com',
    'Pareja italiana. Pidieron despertador a las 6am para vuelo.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, 'stay-tul-102-isabella',
    'CARD_TERMINAL', 350, 'USD', 'AUTH-445821', v_today - 5, v_rec_id,
    v_today - 5 + INTERVAL '15 hours 25 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Hab 102: Sofía Herrera (D+1→D+4, FUTURO) ─────────────────────────────
  -- Caso: llegada mañana — back-to-back correcto (Isabella sale hoy)
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-102-sofia', v_org_id, v_prop_id, v_room_id,
    'Sofía Herrera', 'sofiaherrera88@hotmail.com', '+52 984 222 3344', 'MX',
    1,
    v_today + 1 + INTERVAL '15 hours',
    v_today + 4 + INTERVAL '12 hours',
    70, 'USD', 210, 0, 'PENDING',
    'direct',
    'Reconfirmó por WhatsApp. Llega en autobús desde el aeropuerto.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 103: Diego Mora (D-3→D+2, IN_HOUSE confirmado) ───────────────────
  -- Caso: estadía activa con check-in confirmado, doc capturado, llave física
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '103' LIMIT 1;
  v_stay_id := 'stay-tul-103-diego';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Diego Mora', 'diegomora@protonmail.com', '+52 55 8765 4321', 'MX', 'INE', 'MX99887766',
    2,
    v_today - 3 + INTERVAL '15 hours',
    v_today + 2 + INTERVAL '12 hours',
    70, 'USD', 350, 350, 'PAID',
    v_today - 3 + INTERVAL '15 hours 45 minutes',
    v_rec_id, 'PHYSICAL',
    'Llegó en taxi del ADO. Acompañado por su pareja.',
    'direct',
    NULL,
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CASH', 350, 'USD', v_today - 3, v_rec_id, v_today - 3 + INTERVAL '15 hours 50 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Hab 104: Pedro & Carmen Vega (D-2→D+3, IN_HOUSE OTA Hostelworld) ──────
  -- Caso: OTA hostelworld, tarjeta magnética, pareja
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '104' LIMIT 1;
  v_stay_id := 'stay-tul-104-vega';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Pedro & Carmen Vega', 'pedro.vega@yahoo.com.mx', '+52 81 9000 1234', 'MX', 'PASSPORT', 'G23456789',
    2,
    v_today - 2 + INTERVAL '15 hours',
    v_today + 3 + INTERVAL '12 hours',
    70, 'USD', 350, 350, 'PAID',
    v_today - 2 + INTERVAL '16 hours 10 minutes',
    v_rec_id, 'CARD',
    'Llegaron tarde — vuelo retrasado. Se les dio bienvenida con toallas.',
    'hostelworld',
    'Aniversario de bodas. Solicitan almohada extra.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'OTA_PREPAID', 350, 'USD', 'HW-TUL-78234', v_today - 2, v_rec_id,
    v_today - 2 + INTERVAL '16 hours 15 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Hab 105: Noah Bennett (UNCONFIRMED — llega HOY, sin confirmar) ─────────
  -- Caso: llegada tardía (reservó desde Airbnb, aún no llega a recepción)
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '105' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-105-noah', v_org_id, v_prop_id, v_room_id,
    'Noah Bennett', 'noah.b@me.com', '+1 415 555 0199', 'US',
    1,
    v_today + INTERVAL '15 hours',
    v_today + 4 + INTERVAL '12 hours',
    70, 'USD', 280, 0, 'PENDING',
    'airbnb',
    'Aviso: check-in tardío, llegaría después de las 21h.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 106: Emma Watson (NO_SHOW, cargo PENDING) ─────────────────────────
  -- Caso: night audit marcó no-show, cargo pendiente de procesar
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '106' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    no_show_at, no_show_by_id, no_show_reason, no_show_fee_amount, no_show_fee_currency,
    no_show_charge_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-106-emma', v_org_id, v_prop_id, v_room_id,
    'Emma Watson', 'emma.w@hotmail.co.uk', '+44 7700 900 123', 'GB',
    1,
    v_today - 1 + INTERVAL '15 hours',
    v_today + 2 + INTERVAL '12 hours',
    70, 'USD', 210, 0, 'PENDING',
    v_today + INTERVAL '3 hours',
    NULL,
    'Night audit automático — no se presentó ni contactó al hotel.',
    70, 'USD', 'PENDING',
    'booking.com',
    'Primera noche con cargo de no-show según política.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ============================================================================
  -- PISO 2 — Habitaciones Superior ($110/noche, cap 2)
  -- ============================================================================

  -- ── Hab 201: James Wilson (D-1→D+4, IN_HOUSE saldo pendiente) ─────────────
  -- Caso: pagó solo la mitad, saldo pendiente — recepcionista debe cobrar resto
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '201' LIMIT 1;
  v_stay_id := 'stay-tul-201-james';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'James Wilson', 'james.w@corporate.com', '+1 212 555 0100', 'US', 'PASSPORT', 'US556677AB',
    1,
    v_today - 1 + INTERVAL '15 hours',
    v_today + 4 + INTERVAL '12 hours',
    110, 'USD', 550, 275, 'PARTIAL',
    v_today - 1 + INTERVAL '15 hours 30 minutes',
    v_rec_id, 'CODE',
    'Ejecutivo en viaje de negocios. Llegó cansado del aeropuerto.',
    'expedia',
    'Viajero corporativo. Necesita factura. Pagó mitad al llegar.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  -- Payment log — primera mitad
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CARD_TERMINAL', 275, 'USD', 'AUTH-887744', v_today - 1, v_rec_id,
    v_today - 1 + INTERVAL '15 hours 35 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Hab 202: Familia Nakamura (D→D+5, UNCONFIRMED OTA prepagado) ──────────
  -- Caso: OTA prepagado (Booking.com) — llega HOY, sin confirmar aún
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '202' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-202-nakamura', v_org_id, v_prop_id, v_room_id,
    'Yuki Nakamura', 'nakamura.family@gmail.com', '+81 90 1234 5678', 'JP',
    2,
    v_today + INTERVAL '15 hours',
    v_today + 5 + INTERVAL '12 hours',
    110, 'USD', 550, 550, 'PAID',
    'booking.com',
    'OTA prepagado. Confirmar llegada y registrar llave.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 203: Fatima Ouali (D-4→D+1, IN_HOUSE split payment) ──────────────
  -- Caso: pago split CASH + CARD, familia 3 pax, Expedia
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '203' LIMIT 1;
  v_stay_id := 'stay-tul-203-fatima';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Fatima Ouali', 'fatima.ouali@orange.fr', '+33 6 12 34 56 78', 'DZ', 'PASSPORT', 'DZ09876543',
    3,
    v_today - 4 + INTERVAL '15 hours',
    v_today + 1 + INTERVAL '12 hours',
    110, 'USD', 550, 550, 'PAID',
    v_today - 4 + INTERVAL '15 hours 55 minutes',
    v_rec_id, 'PHYSICAL',
    'Familia con niña de 4 años. Trajeron mucho equipaje, se ofreció carrito.',
    'expedia',
    'Familia argelina residente en Francia. 2 adultos + 1 niño.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  -- Split: 200 CASH + 350 CARD
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CASH', 200, 'USD', v_today - 4, v_rec_id, v_today - 4 + INTERVAL '16 hours'
  ) ON CONFLICT DO NOTHING;
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CARD_TERMINAL', 350, 'USD', 'AUTH-662211', v_today - 4, v_rec_id,
    v_today - 4 + INTERVAL '16 hours 2 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Hab 204: Tour Mayan Adventures (D-3→D+2, IN_HOUSE grupo código PIN) ───
  -- Caso: grupo tour con código de acceso (para agilizar check-in grupal)
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '204' LIMIT 1;
  v_stay_id := 'stay-tul-204-mayan';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Mayan Adventures Group', 'reservas@mayanadventures.mx', '+52 984 800 5500', 'MX',
    'OTHER', 'MX-CORP-0042',
    2,
    v_today - 3 + INTERVAL '14 hours',
    v_today + 2 + INTERVAL '12 hours',
    110, 'USD', 550, 550, 'PAID',
    v_today - 3 + INTERVAL '14 hours 30 minutes',
    v_rec_id, 'CODE',
    'Grupo de 14 personas — se asignó código único para las 7 habitaciones del tour.',
    'direct',
    'Operadora turística. Contratos corporativo. Incluye desayuno.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'BANK_TRANSFER', 550, 'USD', 'TRF-20260422-MAYAN', v_today - 3, v_rec_id,
    v_today - 3 + INTERVAL '14 hours 35 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Hab 205: Amelia Robinson — Extensión misma habitación ─────────────────
  -- Caso: extensión misma hab. (D-3 original → D+2, luego extendió hasta D+5)
  -- Journey con 2 segmentos: ORIGINAL + EXTENSION_SAME_ROOM
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '205' LIMIT 1;
  v_stay_id := 'stay-tul-205-amelia';
  v_jrn_id  := 'jrn-tul-205-amelia';
  v_seg1_id := 'seg-tul-205-amelia-1';
  v_seg2_id := 'seg-tul-205-amelia-2';

  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Amelia Robinson', 'amelia.robinson@gmail.com', '+44 7911 123456', 'GB', 'PASSPORT', 'GB678901234',
    1,
    v_today - 3 + INTERVAL '15 hours',
    v_today + 5 + INTERVAL '12 hours',
    110, 'USD', 880, 770, 'PARTIAL',
    v_today - 3 + INTERVAL '15 hours 40 minutes',
    v_rec_id, 'CARD',
    'Viajera sola. Muy tranquila, pidió extra de toallas.',
    'airbnb',
    'Digital nomad. Extendió una semana adicional para terminar proyecto.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  -- Journey multi-segmento
  INSERT INTO stay_journeys(id, organization_id, property_id, guest_stay_id,
    guest_name, journey_check_in, journey_check_out, status, created_at, updated_at)
    VALUES (v_jrn_id, v_org_id, v_prop_id, v_stay_id,
      'Amelia Robinson',
      v_today - 3 + INTERVAL '15 hours', v_today + 5 + INTERVAL '12 hours',
      'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO stay_segments(
    id, journey_id, room_id, reason, check_in, check_out, rate_snapshot,
    status, locked, created_at, updated_at
  ) VALUES
    (v_seg1_id, v_jrn_id, v_room_id, 'ORIGINAL',
     v_today - 3 + INTERVAL '15 hours', v_today + 2 + INTERVAL '12 hours',
     110, 'ACTIVE', false, NOW(), NOW()),
    (v_seg2_id, v_jrn_id, v_room_id, 'EXTENSION_SAME_ROOM',
     v_today + 2 + INTERVAL '12 hours', v_today + 5 + INTERVAL '12 hours',
     110, 'ACTIVE', false, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  -- Journey event
  INSERT INTO stay_journey_events(id, journey_id, event_type, actor_id, payload, occurred_at)
    VALUES (
      gen_random_uuid()::text, v_jrn_id, 'EXTENSION_APPROVED', v_rec_id,
      '{"extendedTo":"D+5","nights":3,"deltaAmount":330,"reason":"Trabajo remoto"}'::jsonb,
      NOW()
    ) ON CONFLICT DO NOTHING;
  -- Payments
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CARD_TERMINAL', 770, 'USD', 'AUTH-553311', v_today - 3, v_rec_id,
    v_today - 3 + INTERVAL '15 hours 45 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ============================================================================
  -- PISO 3 — Junior Suites ($180/noche, cap 3)
  -- ============================================================================

  -- ── Hab 301: Marco Rossi — llegó aquí tras room move desde 305 ───────────
  -- Caso: traslado mid-stay por queja (AC defectuoso en 305)
  -- Journey con 2 segmentos: ORIGINAL(305) + ROOM_MOVE(301)
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '301' LIMIT 1;
  v_stay_id := 'stay-tul-301-marco';
  v_jrn_id  := 'jrn-tul-301-marco';
  v_seg1_id := 'seg-tul-301-marco-1';
  v_seg2_id := 'seg-tul-301-marco-2';
  SELECT id INTO v_room_305_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '305' LIMIT 1;

  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Marco Rossi', 'marco.rossi@libero.it', '+39 335 678 9012', 'IT', 'PASSPORT', 'IT56789012',
    2,
    v_today - 2 + INTERVAL '15 hours',
    v_today + 3 + INTERVAL '12 hours',
    180, 'USD', 900, 900, 'PAID',
    v_today - 2 + INTERVAL '15 hours 20 minutes',
    v_rec_id, 'CARD',
    'Llegó con su esposa. Al mediodía reportó falla de A/C en 305, se hizo traslado.',
    'direct',
    'Traslado por queja de A/C. Cortesía: bebidas de bienvenida en nueva habitación.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO stay_journeys(id, organization_id, property_id, guest_stay_id,
    guest_name, journey_check_in, journey_check_out, status, created_at, updated_at)
    VALUES (v_jrn_id, v_org_id, v_prop_id, v_stay_id,
      'Marco Rossi',
      v_today - 2 + INTERVAL '15 hours', v_today + 3 + INTERVAL '12 hours',
      'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO stay_segments(
    id, journey_id, room_id, reason, check_in, check_out, rate_snapshot,
    status, locked, created_at, updated_at
  ) VALUES
    (v_seg1_id, v_jrn_id, v_room_305_id, 'ORIGINAL',
     v_today - 2 + INTERVAL '15 hours', v_today - 1 + INTERVAL '14 hours',
     180, 'COMPLETED', true, NOW(), NOW()),
    (v_seg2_id, v_jrn_id, v_room_id, 'ROOM_MOVE',
     v_today - 1 + INTERVAL '14 hours', v_today + 3 + INTERVAL '12 hours',
     180, 'ACTIVE', false, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO stay_journey_events(id, journey_id, event_type, actor_id, payload, occurred_at)
    VALUES (
      gen_random_uuid()::text, v_jrn_id, 'ROOM_MOVE_EXECUTED', v_sup_id,
      '{"fromRoom":"305","toRoom":"301","reason":"A/C defectuoso — queja confirmada","moveDate":"D-1"}'::jsonb,
      NOW()
    ) ON CONFLICT DO NOTHING;
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CARD_TERMINAL', 900, 'USD', 'AUTH-998822', v_today - 2, v_rec_id,
    v_today - 2 + INTERVAL '15 hours 25 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Hab 302: Petrov Family (D-1→D+5, IN_HOUSE, corporativo, sin balance) ──
  -- Caso: crédito corporativo (COMP marcado como cortesía ejecutiva)
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '302' LIMIT 1;
  v_stay_id := 'stay-tul-302-petrov';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Dmitri Petrov', 'dmitri.petrov@rosatom.ru', '+7 916 555 7890', 'RU', 'PASSPORT', 'RU12345678',
    3,
    v_today - 1 + INTERVAL '15 hours',
    v_today + 5 + INTERVAL '12 hours',
    180, 'USD', 1080, 1080, 'PAID',
    v_today - 1 + INTERVAL '15 hours 50 minutes',
    v_rec_id, 'CARD',
    NULL,
    'direct',
    'Familia rusa. Padre ingeniero, convenio corporativo ROSATOM-UNAM. Tarifa negociada.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CARD_TERMINAL', 1080, 'USD', 'AUTH-775544', v_today - 1, v_rec_id,
    v_today - 1 + INTERVAL '15 hours 55 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Hab 303: Kevin & Amy Park (D+5→D+8, FUTURO) ───────────────────────────
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '303' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-303-park', v_org_id, v_prop_id, v_room_id,
    'Kevin Park', 'kevin.amy.park@gmail.com', '+82 10 9876 5432', 'KR',
    2,
    v_today + 5 + INTERVAL '15 hours',
    v_today + 8 + INTERVAL '12 hours',
    180, 'USD', 540, 0, 'PENDING',
    'airbnb',
    'Pareja coreana. Primera visita a México.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 304: VACÍA hoy (extensión de Amelia sale D+5) — no insertar ───────
  -- (Amelia está en 205; al extenderse a otra hab. el seg2 de 304 haría el split)
  -- Simplificación: dejar vacía para demo visual

  -- ── Hab 305: David Martínez (D-8→D-3, CHECKED_OUT departed) ─────────────
  -- La hab. de la que Marco Rossi fue trasladado
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '305' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-305-david', v_org_id, v_prop_id, v_room_id,
    'David Martínez', 'david.mtz@protonmail.com', '+52 33 1234 5678', 'MX', 'PASSPORT', 'MX44556677',
    2,
    v_today - 8 + INTERVAL '15 hours',
    v_today - 3 + INTERVAL '12 hours',
    v_today - 3 + INTERVAL '11 hours 30 minutes',
    180, 'USD', 900, 900, 'PAID',
    v_today - 8 + INTERVAL '15 hours 10 minutes',
    v_rec_id, 'PHYSICAL',
    'direct',
    'Parejas guadalajara. Estadía relajada en la zona maya.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, 'stay-tul-305-david',
    'CASH', 900, 'USD', v_today - 8, v_rec_id, v_today - 8 + INTERVAL '15 hours 15 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ============================================================================
  -- CABAÑAS — A1/A2 ($130/noche)
  -- ============================================================================

  -- ── Cabaña A1: Elena Vasquez (nómada digital, extensión x3) ───────────────
  -- Caso: nómada digital en estancia larga (3 segmentos de extensión)
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'A1' LIMIT 1;
  v_stay_id := 'stay-tul-a1-elena';
  v_jrn_id  := 'jrn-tul-a1-elena';
  v_seg1_id := 'seg-tul-a1-elena-1';
  v_seg2_id := 'seg-tul-a1-elena-2';
  v_seg3_id := 'seg-tul-a1-elena-3';

  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Elena Vasquez', 'elena.v.nomad@gmail.com', '+34 611 222 333', 'ES', 'PASSPORT', 'ES78901234',
    1,
    v_today - 21 + INTERVAL '15 hours',
    v_today + 7  + INTERVAL '12 hours',
    130, 'USD', 3640, 2730, 'PARTIAL',
    v_today - 21 + INTERVAL '15 hours 30 minutes',
    v_rec_id, 'PHYSICAL',
    'Trae equipo de trabajo pesado (laptop, monitores). Ayuda con carrito al llegar.',
    'direct',
    'Nómada digital. Extiende cada semana. Paga por quincenas.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO stay_journeys(id, organization_id, property_id, guest_stay_id,
    guest_name, journey_check_in, journey_check_out, status, created_at, updated_at)
    VALUES (v_jrn_id, v_org_id, v_prop_id, v_stay_id,
      'Elena Vasquez',
      v_today - 21 + INTERVAL '15 hours', v_today + 7 + INTERVAL '12 hours',
      'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO stay_segments(
    id, journey_id, room_id, reason, check_in, check_out, rate_snapshot,
    status, locked, created_at, updated_at
  ) VALUES
    (v_seg1_id, v_jrn_id, v_room_id, 'ORIGINAL',
     v_today - 21 + INTERVAL '15 hours', v_today - 14 + INTERVAL '12 hours',
     130, 'COMPLETED', true, NOW(), NOW()),
    (v_seg2_id, v_jrn_id, v_room_id, 'EXTENSION_SAME_ROOM',
     v_today - 14 + INTERVAL '12 hours', v_today - 7 + INTERVAL '12 hours',
     130, 'COMPLETED', true, NOW(), NOW()),
    (v_seg3_id, v_jrn_id, v_room_id, 'EXTENSION_SAME_ROOM',
     v_today - 7 + INTERVAL '12 hours', v_today + 7 + INTERVAL '12 hours',
     130, 'ACTIVE', false, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  -- Pagos parciales en fechas distintas
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES
    (gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
     'BANK_TRANSFER', 910, 'USD', 'TRF-20260404-ELENA', v_today - 21, v_rec_id,
     v_today - 21 + INTERVAL '16 hours'),
    (gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
     'BANK_TRANSFER', 910, 'USD', 'TRF-20260411-ELENA', v_today - 14, v_rec_id,
     v_today - 14 + INTERVAL '12 hours 30 minutes'),
    (gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
     'CASH', 910, 'USD', NULL, v_today - 7, v_rec_id,
     v_today - 7 + INTERVAL '13 hours')
  ON CONFLICT DO NOTHING;

  -- ── Cabaña A2: Sarah & Tom Mitchell (D+3→D+7, FUTURO luna de miel) ────────
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'A2' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-a2-mitchell', v_org_id, v_prop_id, v_room_id,
    'Sarah Mitchell', 's.t.mitchell@icloud.com', '+61 412 345 678', 'AU',
    2,
    v_today + 3 + INTERVAL '15 hours',
    v_today + 7 + INTERVAL '12 hours',
    130, 'USD', 520, 260, 'PARTIAL',
    'direct',
    '🌸 Luna de miel. Petición: decoración especial en cuarto (flores + champagne). Confirmado con housekeeping.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ============================================================================
  -- VILLAS — B1/B2 ($280/noche, cap 4)
  -- ============================================================================

  -- ── Villa B1: Wei Chen (D-2→D+4, IN_HOUSE grupo corporativo 4 pax) ────────
  -- Caso: grupo corporativo, transferencia bancaria, factura requerida
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'B1' LIMIT 1;
  v_stay_id := 'stay-tul-b1-wei';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Wei Chen', 'w.chen@baidugroup.com', '+86 138 0013 8000', 'CN', 'PASSPORT', 'CN99887766',
    4,
    v_today - 2 + INTERVAL '14 hours',
    v_today + 4 + INTERVAL '12 hours',
    280, 'USD', 1680, 1680, 'PAID',
    v_today - 2 + INTERVAL '14 hours 20 minutes',
    v_rec_id, 'CODE',
    'Delegación ejecutiva de 4 personas. Se instalaron rápidamente.',
    'direct',
    'Grupo corporativo chino. Requiere factura fiscal. Convenio empresa-hotel.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'BANK_TRANSFER', 1680, 'USD', 'TRF-BAIDU-2026042', v_today - 2, v_rec_id,
    v_today - 2 + INTERVAL '14 hours 25 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Villa B2: Yuki & Kenji Tanaka (D-6→D+1, IN_HOUSE mobile access) ───────
  -- Caso: acceso móvil (app), japón, COMP para upgrade de suite
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'B2' LIMIT 1;
  v_stay_id := 'stay-tul-b2-tanaka';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Yuki Tanaka', 'yuki.tanaka@softbank.jp', '+81 80 4321 9876', 'JP', 'PASSPORT', 'JP44332211',
    2,
    v_today - 6 + INTERVAL '15 hours',
    v_today + 1 + INTERVAL '12 hours',
    280, 'USD', 1960, 1960, 'PAID',
    v_today - 6 + INTERVAL '15 hours 35 minutes',
    v_rec_id, 'MOBILE',
    'Pareja japonesa tech-savvy. Prefirieron acceso por app.',
    'booking.com',
    'Honeymoon II — celebran 5 años de matrimonio. App de acceso configurada.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  -- COMP upgrade + pago principal
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    approved_by_id, approval_reason, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'COMP', 280, 'USD', v_sup_id,
    'Upgrade de cortesía por fidelidad Booking Gold',
    v_today - 6, v_sup_id,
    v_today - 6 + INTERVAL '15 hours 40 minutes'
  ) ON CONFLICT DO NOTHING;
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CARD_TERMINAL', 1680, 'USD', 'AUTH-112233', v_today - 6, v_rec_id,
    v_today - 6 + INTERVAL '15 hours 42 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ============================================================================
  -- SUITES PREMIUM — C1/C2 ($280/noche, cap 4)
  -- ============================================================================

  -- ── Suite C1: Carlos & Ana Ruiz (D+8→D+14, FUTURO luna de miel) ──────────
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'C1' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-c1-ruiz', v_org_id, v_prop_id, v_room_id,
    'Carlos Ruiz', 'carlos.ruiz.boda@gmail.com', '+52 55 7890 1234', 'MX',
    2,
    v_today + 8 + INTERVAL '15 hours',
    v_today + 14 + INTERVAL '12 hours',
    280, 'USD', 1680, 840, 'PARTIAL',
    'direct',
    '💍 Luna de miel. Reserva suite superior. Decoración coordinada con eventos.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Suite C2: Reserva futura (D+10→D+14) ─────────────────────────────────
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'C2' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-tul-c2-johnson', v_org_id, v_prop_id, v_room_id,
    'Michael Johnson', 'mjohnson@marriott-rewards.com', '+1 305 555 7890', 'US',
    3,
    v_today + 10 + INTERVAL '15 hours',
    v_today + 14 + INTERVAL '12 hours',
    280, 'USD', 1120, 0, 'PENDING',
    'expedia',
    'Director de marketing. Visitó el hotel el año pasado. Solicita habitación piso alto.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

END $$;

-- =============================================================================
-- Hotel Tulum — Seed comprehensivo v4
-- Casos de uso cubiertos (20 escenarios reales del día a día):
--   1  Back-to-back mismo cuarto          101: Carlos → Liam (llega hoy)
--   2  Turno ajustado checkout/arrival+1d 102: Isabella sale hoy → Sofía llega mañana
--   3  Llegada tardía / casi no-show      105: Diego, checkin 23:15h
--   4  No-show procesado night audit      106: Noah, marcado a las 02:00
--   5  Saldo $0 en día de salida          202: James Wilson (debe el total)
--   6  Extensión misma habitación x2      A1:  Elena Vasquez (nómada digital)
--   7  Extensión misma habitación x1      B2:  Yuki & Kenji Tanaka
--   8  Extensión diferente habitación     303→304: Amelia Robinson
--   9  Move mid-stay por queja            305→301: Marco Rossi (AC defectuoso)
--  10  Grupo corporativo / factura        B1:  Wei Chen (4 pax, CREDIT)
--  11  Grupo multi-habitación             204+205: Tour Mayan Adventures
--  12  Luna de miel (nota especial)       A2:  Sarah & Tom Mitchell
--  13  Luna de miel mexicana              C1:  Carlos & Ana Ruiz
--  14  Canal diverso (6 fuentes)          booking.com, expedia, airbnb, direct, walk-in, hostelworld
--  15  Pago a crédito corporativo         304: Petrov Family, B1: Wei Chen
--  16  Walk-in sin reserva                101: Liam O'Brien (llega hoy)
--  17  Reserva futura grupo               204+205 (D+5), C2 (D+10)
--  18  Familia numerosa                   203: Fatima (3 pax), B1: Wei Chen (4 pax)
--  19  Extensión + back-to-back posterior 304: Amelia→D+4, Petrov→D+4 mismo día
--  20  OTA hostelworld                    104: Pedro & Carmen Vega
--
-- Fechas: todas relativas a CURRENT_DATE (D).
--   Check-in estándar:  D + INTERVAL 'N days 15 hours'
--   Check-out estándar: D + INTERVAL 'N days 12 hours'
-- =============================================================================

DO $$
DECLARE
  v_org_id   TEXT;
  v_prop_id  TEXT := 'prop-hotel-tulum-001';
  v_sup_id   TEXT;   -- supervisor@demo.com
  v_rec_id   TEXT;   -- reception@demo.com

  v_room_id  TEXT;
  v_stay_id  TEXT;
  v_jrn_id   TEXT;
  v_seg1_id  TEXT;
  v_seg2_id  TEXT;
  v_seg3_id  TEXT;

BEGIN
  -- ── 1. Lookup IDs dinámicos ─────────────────────────────────────────────────
  SELECT organization_id INTO v_org_id FROM properties WHERE id = v_prop_id LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Propiedad % no encontrada. Ejecuta seed.ts primero.', v_prop_id;
  END IF;

  SELECT id INTO v_sup_id FROM housekeeping_staff WHERE email = 'supervisor@demo.com' LIMIT 1;
  SELECT id INTO v_rec_id FROM housekeeping_staff WHERE email = 'reception@demo.com'  LIMIT 1;

  -- ── 2. Limpieza FK-safe ─────────────────────────────────────────────────────
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
  -- PISO 1 — Habitaciones Standard ($70/noche, cap. 2)
  -- ============================================================================

  -- ── Hab 101: Carlos Mendoza (D-12→D-7, departed PAID) ─────────────────────
  -- Caso de uso: estadía completada, forma el "antes" del back-to-back con Liam
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '101' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-101-carlos', v_org_id, v_prop_id, v_room_id,
    'Carlos Mendoza', 'carlos.m@gmail.com', 1,
    CURRENT_DATE - INTERVAL '12 days' + INTERVAL '15 hours',
    CURRENT_DATE - INTERVAL '7 days'  + INTERVAL '12 hours',
    CURRENT_DATE - INTERVAL '7 days'  + INTERVAL '11 hours',
    70, 'USD', 350, 350, 'PAID',
    'direct', v_rec_id,
    'Estadía completada. Viajero frecuente, tercera visita. Pagó al check-in.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 101: Liam O'Brien (D→D+3, walk-in PENDING) ───────────────────────
  -- Caso de uso #1 BACK-TO-BACK: mismo cuarto, Carlos salió -7, Liam llega HOY
  -- Caso de uso #16: walk-in sin reserva previa
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-101-liam', v_org_id, v_prop_id, v_room_id,
    'Liam O''Brien', 'liam.obrien@outlook.com', 1,
    CURRENT_DATE + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '3 days 12 hours',
    NULL,
    70, 'USD', 210, 0, 'PENDING',
    'walk-in', v_rec_id,
    'Walk-in. Llegó preguntando disponibilidad. Pago pendiente al check-in presencial.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 102: Isabella Romano (D-5→D, departing TODAY, PAID) ───────────────
  -- Caso de uso: checkout del día (el recepcionista la verá en "Salidas de hoy")
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '102' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-102-isabella', v_org_id, v_prop_id, v_room_id,
    'Isabella Romano', 'i.romano@mail.it', 1,
    CURRENT_DATE - INTERVAL '5 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '12 hours',
    NULL,
    70, 'USD', 350, 350, 'PAID',
    'booking.com', v_rec_id,
    'Sale hoy. Reserva directa en Booking. Pidió taxi al aeropuerto para las 13:00.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 102: Sofía Herrera (D+1→D+5, PAID, airbnb) ──────────────────────
  -- Caso de uso #3: TURNOVER AJUSTADO — Isabella sale HOY, Sofía llega MAÑANA
  -- La camarera tiene <24h para dejar la habitación lista
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-102-sofia', v_org_id, v_prop_id, v_room_id,
    'Sofía Herrera', 'sofia.h@gmail.com', 1,
    CURRENT_DATE + INTERVAL '1 day 15 hours',
    CURRENT_DATE + INTERVAL '5 days 12 hours',
    NULL,
    70, 'USD', 280, 280, 'PAID',
    'airbnb', v_rec_id,
    'Reserva Airbnb prepagada. Llega mañana. Importante: limpieza prioritaria hoy antes de las 15:00.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 103: Priya & Ravi Sharma (D-2→D+2, pareja PAID) ──────────────────
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '103' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-103-priya', v_org_id, v_prop_id, v_room_id,
    'Priya & Ravi Sharma', 'priya.sharma@gmail.com', 2,
    CURRENT_DATE - INTERVAL '2 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '2 days 12 hours',
    NULL,
    70, 'USD', 280, 280, 'PAID',
    'direct', v_rec_id,
    'Pareja india de viaje de aniversario. Reserva directa por WhatsApp. Todo prepagado.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 104: Pedro & Carmen Vega (D+7→D+10, hostelworld PENDING) ─────────
  -- Caso de uso #20: OTA hostelworld (canal menos frecuente, importante para hostales)
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '104' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-104-pedro', v_org_id, v_prop_id, v_room_id,
    'Pedro & Carmen Vega', 'pedro.vega@hostelworld.com', 2,
    CURRENT_DATE + INTERVAL '7 days 15 hours',
    CURRENT_DATE + INTERVAL '10 days 12 hours',
    NULL,
    70, 'USD', 210, 0, 'PENDING',
    'hostelworld', v_rec_id,
    'Reserva Hostelworld. Pareja mochilera. Pago al llegar. Confirmar disponibilidad de cama extra si necesitan.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 105: Diego Morales (D-1 23:15→D+1, LLEGADA TARDÍA) ──────────────
  -- Caso de uso #4: CASI NO-SHOW — llegó a las 23:15h, 45 min antes del corte
  -- El recepcionista nocturno lo registró como walk-in de emergencia
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '105' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-105-diego', v_org_id, v_prop_id, v_room_id,
    'Diego Morales', 'diego.morales@hotmail.com', 1,
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '23 hours 15 minutes',
    CURRENT_DATE + INTERVAL '1 day 12 hours',
    NULL,
    70, 'USD', 140, 0, 'PENDING',
    'walk-in', v_rec_id,
    'LLEGADA TARDÍA 23:15h. Casi no-show. Llegó por problemas con vuelo desde CDMX. Pago pendiente mañana en recepción.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 106: Noah Thompson (D-1, NO-SHOW) ─────────────────────────────────
  -- Caso de uso #5: NO-SHOW procesado por night audit a las 02:00
  -- La habitación fue liberada automáticamente. Cargo pendiente de cobrar.
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '106' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes,
    no_show_at, no_show_by_id, no_show_reason, no_show_charge_status,
    no_show_fee_amount, no_show_fee_currency,
    created_at, updated_at
  ) VALUES (
    'stay-tul-106-noah', v_org_id, v_prop_id, v_room_id,
    'Noah Thompson', 'noah.t@gmail.com', 1,
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '12 hours',
    NULL,
    70, 'USD', 70, 0, 'PENDING',
    'booking.com', v_rec_id,
    'No-show procesado automáticamente por night audit. Booking.com notificado. Intentar cobrar tarjeta registrada.',
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '2 hours',
    NULL,
    'No se presentó. Sin contacto. Night audit procesó no-show a las 02:00. Cargo de primera noche pendiente.',
    'PENDING',
    70, 'USD',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ============================================================================
  -- PISO 2 — Habitaciones Superior ($110/noche, cap. 2)
  -- ============================================================================

  -- ── Hab 201: Sophie Laurent (D-10→D-5, departed PAID, booking.com) ────────
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '201' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-201-sophie', v_org_id, v_prop_id, v_room_id,
    'Sophie Laurent', 'sophie.l@laposte.net', 1,
    CURRENT_DATE - INTERVAL '10 days' + INTERVAL '15 hours',
    CURRENT_DATE - INTERVAL '5 days'  + INTERVAL '12 hours',
    CURRENT_DATE - INTERVAL '5 days'  + INTERVAL '10 hours',
    110, 'USD', 550, 550, 'PAID',
    'booking.com', v_rec_id,
    'Turista francesa. Checkout temprano a las 10:00. Dejó reseña positiva en Booking.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 202: James Wilson (D-3→D, SALDO $0 PAGADO, departing TODAY) ───────
  -- Caso de uso #6: SALDO PENDIENTE EL DÍA DE SALIDA — debe $330 completos
  -- El recepcionista debe cobrar ANTES de que el huésped entregue las llaves
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '202' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-202-james', v_org_id, v_prop_id, v_room_id,
    'James Wilson', 'james.w@hotmail.com', 1,
    CURRENT_DATE - INTERVAL '3 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '12 hours',
    NULL,
    110, 'USD', 330, 0, 'PENDING',
    'expedia', v_rec_id,
    'ATENCIÓN: Sale hoy. Saldo completo $330 sin pagar. Expedia no cobró al reservar. COBRAR ANTES DEL CHECKOUT.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 203: Fatima Al-Rashid (D-1→D+4, familia 3 pax, PARTIAL) ──────────
  -- Caso de uso #18: FAMILIA NUMEROSA + PAGO PARCIAL
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '203' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-203-fatima', v_org_id, v_prop_id, v_room_id,
    'Fatima Al-Rashid', 'fatima.ar@gmail.com', 3,
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '4 days 12 hours',
    NULL,
    110, 'USD', 550, 275, 'PARTIAL',
    'booking.com', v_rec_id,
    'Familia: mamá + 2 hijos. Abonó $275 (50%). Saldo $275 al checkout. Reservó cama extra (costo incluido).',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 204: Tour Grupal Hab A (D+5→D+9, corporate PAID) ─────────────────
  -- Caso de uso #11: GRUPO MULTI-HABITACIÓN pre-pagado (204+205 mismo grupo)
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '204' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-204-tour', v_org_id, v_prop_id, v_room_id,
    'Mayan Adventures Tour — Hab A', 'reservas@mayanadventures.com', 2,
    CURRENT_DATE + INTERVAL '5 days 15 hours',
    CURRENT_DATE + INTERVAL '9 days 12 hours',
    NULL,
    110, 'USD', 440, 440, 'PAID',
    'corporate', v_rec_id,
    'Grupo tour operador. Hab A de 2. Pago total por transferencia. Contacto: Luis Torres / +52-998-000-0000.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 205: Tour Grupal Hab B (D+5→D+9, corporate PAID) ─────────────────
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '205' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-205-tour', v_org_id, v_prop_id, v_room_id,
    'Mayan Adventures Tour — Hab B', 'reservas@mayanadventures.com', 2,
    CURRENT_DATE + INTERVAL '5 days 15 hours',
    CURRENT_DATE + INTERVAL '9 days 12 hours',
    NULL,
    110, 'USD', 440, 440, 'PAID',
    'corporate', v_rec_id,
    'Grupo tour operador. Hab B de 2. Mismas condiciones que Hab A (204). Mismo grupo.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ============================================================================
  -- PISO 3 — Junior Suites ($180/noche, cap. 3)
  -- ============================================================================

  -- ── Hab 301: Marco Rossi (segmento ROOM_MOVE — ver journey más abajo) ─────
  -- El GuestStay apunta a 305 (cuarto original). Este segmento es ROOM_MOVE.
  -- Ver journey-tul-marco para la estructura completa.

  -- ── Hab 302: Valentina Cruz (D+1→D+5, arriving tomorrow, airbnb PAID) ─────
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '302' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-302-valentina', v_org_id, v_prop_id, v_room_id,
    'Valentina Cruz', 'vale.cruz@outlook.com', 1,
    CURRENT_DATE + INTERVAL '1 day 15 hours',
    CURRENT_DATE + INTERVAL '5 days 12 hours',
    NULL,
    180, 'USD', 720, 720, 'PAID',
    'airbnb', v_rec_id,
    'Airbnb prepagado. Llega mañana a las 15h. Solicitó early check-in si hay disponibilidad.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 303: Amelia Robinson (D-5→D, PAID, GuestStay para journey de extensión) ─
  -- Caso de uso #8: EXTENSIÓN A DIFERENTE HABITACIÓN
  -- 303 ya está vendida para mañana → se ofrece 304 misma tarifa para los 4 días extra
  -- GuestStay.scheduledCheckout = D (checkout original = HOY)
  -- El journey añade EXT_NEW_ROOM en 304 (D→D+4)
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '303' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-303-amelia', v_org_id, v_prop_id, v_room_id,
    'Amelia Robinson', 'amelia.r@gmail.com', 1,
    CURRENT_DATE - INTERVAL '5 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '12 hours',
    NULL,
    180, 'USD', 900, 900, 'PAID',
    'direct', v_rec_id,
    'Checkout hoy. Quiso extender 4 noches más pero 303 ya tiene entrada mañana. Se ofreció 304 misma tarifa. Ver StayJourney.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 304: Petrov Family (D+4→D+11, corporate CREDIT) ──────────────────
  -- Caso de uso #19: BACK-TO-BACK con extensión de Amelia — ambas usan 304
  -- Amelia libera 304 en D+4 12:00, Petrov llega D+4 15:00 (3h de margen)
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '304' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-304-petrov', v_org_id, v_prop_id, v_room_id,
    'Familia Petrov', 'andrei.petrov@corp.ru', 4,
    CURRENT_DATE + INTERVAL '4 days 15 hours',
    CURRENT_DATE + INTERVAL '11 days 12 hours',
    NULL,
    180, 'USD', 1260, 0, 'CREDIT',
    'corporate', v_rec_id,
    'Familia rusa. Pago corporativo a crédito — factura a Petrov Consulting LLC. 4 pax (2 adultos + 2 niños). Late checkout solicitado.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 305: Marco Rossi — GuestStay apunta a cuarto ORIGINAL 305 ─────────
  -- El guest se movió a 301 por AC defectuoso. GuestStay.roomId = 305 (original).
  -- El segmento ROOM_MOVE (301) aparece en journeyBlocks.
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '305' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-305-marco', v_org_id, v_prop_id, v_room_id,
    'Marco Rossi', 'marco.r@design.io', 1,
    CURRENT_DATE - INTERVAL '6 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '4 days 12 hours',
    NULL,
    180, 'USD', 1800, 900, 'PARTIAL',
    'direct', v_rec_id,
    'Movido de 305 → 301 (D-2) por AC defectuoso. Abonó 50%. Saldo al checkout. Ver StayJourney journey-tul-marco.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ============================================================================
  -- CABAÑAS ($130/noche, cap. 2)
  -- ============================================================================

  -- ── Cabaña A1: Elena Vasquez — GuestStay original (D-12→D-5) ─────────────
  -- Caso de uso #6: NÓMADA DIGITAL, 2 extensiones encadenadas (3 segmentos total)
  -- GuestStay.scheduledCheckout = D-5 (primer punto de extensión visible en calendario)
  -- Journey extiende hasta D+7 con 2 segmentos EXT_SAME_ROOM adicionales
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'A1' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-a1-elena', v_org_id, v_prop_id, v_room_id,
    'Elena Vasquez', 'elena.v@remote.io', 1,
    CURRENT_DATE - INTERVAL '12 days' + INTERVAL '15 hours',
    CURRENT_DATE - INTERVAL '5 days'  + INTERVAL '12 hours',
    NULL,
    130, 'USD', 910, 520, 'PARTIAL',
    'direct', v_rec_id,
    'Nómada digital. Trabaja remoto desde A1. Extendió 2 veces. Paga por semanas. Ver StayJourney para historial completo.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Cabaña A2: Sarah & Tom Mitchell (D-3→D+2, LUNA DE MIEL) ─────────────
  -- Caso de uso #12: LUNA DE MIEL con nota especial y decoración preparada
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'A2' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-a2-mitchell', v_org_id, v_prop_id, v_room_id,
    'Sarah & Tom Mitchell', 'sarah.mitchell@gmail.com', 2,
    CURRENT_DATE - INTERVAL '3 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '2 days 12 hours',
    NULL,
    130, 'USD', 650, 650, 'PAID',
    'direct', v_rec_id,
    '🌹 LUNA DE MIEL. Decoración floral preparada al check-in. Champagne de cortesía en habitación. Solicitud: late checkout D+2 hasta 15:00 si es posible.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ============================================================================
  -- VILLAS/SUITES ($280/noche, cap. 4)
  -- ============================================================================

  -- ── Villa B1: Wei Chen — Grupo corporativo (D-1→D+4, CREDIT, 4 pax) ──────
  -- Caso de uso #10: GRUPO CORPORATIVO + #18: FAMILIA NUMEROSA
  -- Pago a crédito, requiere factura a nombre de empresa
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'B1' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-b1-wei', v_org_id, v_prop_id, v_room_id,
    'Wei Chen (TechGroup Retreat)', 'wei.chen@techgroup.cn', 4,
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '4 days 12 hours',
    NULL,
    280, 'USD', 1400, 0, 'CREDIT',
    'corporate', v_rec_id,
    'Retiro corporativo tech: 4 desarrolladores. Pago crédito — factura a TechGroup Asia Ltd. RFC: TGAL2024MX. Necesitan WiFi 100Mbps garantizado.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Villa B2: Yuki & Kenji Tanaka (D-8→D, GuestStay para journey extensión) ─
  -- Caso de uso #7: EXTENSIÓN MISMA HABITACIÓN (+4 noches extra en B2)
  -- GuestStay.scheduledCheckout = D-2 (checkout original antes de extender)
  -- Journey extiende hasta D+2
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'B2' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-b2-yuki', v_org_id, v_prop_id, v_room_id,
    'Yuki & Kenji Tanaka', 'yuki.tanaka@gmail.jp', 2,
    CURRENT_DATE - INTERVAL '8 days' + INTERVAL '15 hours',
    CURRENT_DATE - INTERVAL '2 days' + INTERVAL '12 hours',
    NULL,
    280, 'USD', 1680, 1680, 'PAID',
    'direct', v_rec_id,
    'Pareja japonesa en aniversario. Extendieron 4 noches más desde D-2. Pagaron extensión completa al confirmar. Ver StayJourney.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Suite C1: Carlos & Ana Ruiz (D-1→D+5, LUNA DE MIEL MEXICANA) ─────────
  -- Caso de uso #13: Segunda luna de miel, llegaron ayer
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'C1' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-c1-ruiz', v_org_id, v_prop_id, v_room_id,
    'Carlos & Ana Ruiz', 'carlosana.ruiz@gmail.com', 2,
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '5 days 12 hours',
    NULL,
    280, 'USD', 1680, 1680, 'PAID',
    'direct', v_rec_id,
    'Luna de miel. Reserva directa desde Instagram. Llegaron ayer. Pidieron cena romántica en terraza para D+1. Coordinado con restaurante.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Suite C2: Grand Riviera Beach Tours (D+10→D+14, far future PAID) ──────
  -- Caso de uso #17: RESERVA FUTURA GRUPO PRE-PAGADO
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'C2' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-tul-c2-riviera', v_org_id, v_prop_id, v_room_id,
    'Grand Riviera Beach Tours', 'ops@grandriviera.com', 4,
    CURRENT_DATE + INTERVAL '10 days 15 hours',
    CURRENT_DATE + INTERVAL '14 days 12 hours',
    NULL,
    280, 'USD', 1120, 1120, 'PAID',
    'corporate', v_rec_id,
    'Tour operador mayorista. 4 noches, 4 pax. Pre-pagado por transferencia bancaria. Requiere factura mensual.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;


  -- ============================================================================
  -- STAY JOURNEYS
  -- ============================================================================

  -- ── Journey 1: Elena Vasquez (A1) — Nómada digital, 2 extensiones ─────────
  -- Estructura:
  --   Seg 1 ORIGINAL    A1  D-12 → D-5   COMPLETED locked (visible en semana pasada)
  --   Seg 2 EXT_SAME    A1  D-5  → D     COMPLETED locked (visible esta semana)
  --   Seg 3 EXT_SAME    A1  D    → D+7   ACTIVE    (bloque +ext visible hoy)
  --
  -- SVG: click en cualquier bloque → línea conecta los 3 en A1

  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'A1' LIMIT 1;
  v_jrn_id  := 'journey-tul-elena';
  v_seg1_id := 'seg-tul-elena-1';
  v_seg2_id := 'seg-tul-elena-2';
  v_seg3_id := 'seg-tul-elena-3';

  INSERT INTO stay_journeys(
    id, organization_id, property_id, guest_stay_id,
    guest_name, guest_email, status,
    journey_check_in, journey_check_out, created_at, updated_at
  ) VALUES (
    v_jrn_id, v_org_id, v_prop_id, 'stay-tul-a1-elena',
    'Elena Vasquez', 'elena.v@remote.io', 'ACTIVE',
    CURRENT_DATE - INTERVAL '12 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '7 days 12 hours',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- Seg 1: ORIGINAL (D-12 → D-5, COMPLETED)
  INSERT INTO stay_segments(
    id, journey_id, room_id, guest_stay_id,
    check_in, check_out, status, locked, reason, rate_snapshot, created_at, updated_at
  ) VALUES (
    v_seg1_id, v_jrn_id, v_room_id, 'stay-tul-a1-elena',
    CURRENT_DATE - INTERVAL '12 days' + INTERVAL '15 hours',
    CURRENT_DATE - INTERVAL '5 days'  + INTERVAL '12 hours',
    'COMPLETED'::segment_status, true, 'ORIGINAL'::segment_reason, 130, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg1_id, gs.d::date, 130,
    'LOCKED'::night_status, true
  FROM generate_series(
    CURRENT_DATE - INTERVAL '12 days',
    CURRENT_DATE - INTERVAL '6 days',
    INTERVAL '1 day'
  ) AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  -- Seg 2: EXT_SAME_ROOM (D-5 → D, COMPLETED)
  INSERT INTO stay_segments(
    id, journey_id, room_id,
    check_in, check_out, status, locked, reason, rate_snapshot,
    notes, created_at, updated_at
  ) VALUES (
    v_seg2_id, v_jrn_id, v_room_id,
    CURRENT_DATE - INTERVAL '5 days' + INTERVAL '12 hours',
    CURRENT_DATE + INTERVAL '12 hours',
    'COMPLETED'::segment_status, true, 'EXTENSION_SAME_ROOM'::segment_reason, 130,
    'Primera extensión (+7 noches). Cliente pagó por semana. Misma cabaña disponible.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg2_id, gs.d::date, 130,
    'LOCKED'::night_status, true
  FROM generate_series(
    CURRENT_DATE - INTERVAL '5 days',
    CURRENT_DATE - INTERVAL '1 day',
    INTERVAL '1 day'
  ) AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  -- Seg 3: EXT_SAME_ROOM (D → D+7, ACTIVE) ← bloque +ext visible en calendario HOY
  INSERT INTO stay_segments(
    id, journey_id, room_id,
    check_in, check_out, status, locked, reason, rate_snapshot,
    notes, created_at, updated_at
  ) VALUES (
    v_seg3_id, v_jrn_id, v_room_id,
    CURRENT_DATE + INTERVAL '12 hours',
    CURRENT_DATE + INTERVAL '7 days 12 hours',
    'ACTIVE'::segment_status, false, 'EXTENSION_SAME_ROOM'::segment_reason, 130,
    'Segunda extensión (+7 noches). "Tulum me tiene atrapada" — cita de la huésped. Aprobada por supervisor.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg3_id, gs.d::date, 130,
    CASE WHEN gs.d < CURRENT_DATE THEN 'LOCKED'::night_status ELSE 'PENDING'::night_status END,
    gs.d < CURRENT_DATE
  FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '6 days', INTERVAL '1 day') AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  INSERT INTO stay_journey_events(id, journey_id, event_type, actor_id, payload, occurred_at)
  VALUES
    (gen_random_uuid(), v_jrn_id, 'JOURNEY_CREATED', v_rec_id,
     '{"channel":"direct","note":"Nómada digital, pago semanal acordado"}'::jsonb, NOW() - INTERVAL '12 days'),
    (gen_random_uuid(), v_jrn_id, 'EXTENSION_APPROVED', v_sup_id,
     '{"extraNights":7,"reason":"A1 disponible, misma tarifa $130/noche","approvedBy":"supervisor"}'::jsonb, NOW() - INTERVAL '5 days'),
    (gen_random_uuid(), v_jrn_id, 'EXTENSION_APPROVED', v_sup_id,
     '{"extraNights":7,"reason":"Solicitud reiterada, cliente satisfecha, cabaña disponible"}'::jsonb, NOW());


  -- ── Journey 2: Amelia Robinson (303→304) — Extensión diferente habitación ─
  -- Estructura:
  --   Seg 1 ORIGINAL       303  D-5 → D    ACTIVE  (bloque sale hoy en 303)
  --   Seg 2 EXT_NEW_ROOM   304  D   → D+4  PENDING (bloque +ext en 304)
  --
  -- Caso de uso CLAVE Sprint 7B: el +ext aparece en ROW DIFERENTE (304)
  -- SVG Bézier conecta diagonal: 303 → 304

  v_jrn_id  := 'journey-tul-amelia';
  v_seg1_id := 'seg-tul-amelia-1';
  v_seg2_id := 'seg-tul-amelia-2';

  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '303' LIMIT 1;
  v_stay_id := 'stay-tul-303-amelia';

  INSERT INTO stay_journeys(
    id, organization_id, property_id, guest_stay_id,
    guest_name, guest_email, status,
    journey_check_in, journey_check_out, created_at, updated_at
  ) VALUES (
    v_jrn_id, v_org_id, v_prop_id, v_stay_id,
    'Amelia Robinson', 'amelia.r@gmail.com', 'ACTIVE',
    CURRENT_DATE - INTERVAL '5 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '4 days 12 hours',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- Seg 1: ORIGINAL (303, D-5 → D, ACTIVE)
  INSERT INTO stay_segments(
    id, journey_id, room_id, guest_stay_id,
    check_in, check_out, status, locked, reason, rate_snapshot, created_at, updated_at
  ) VALUES (
    v_seg1_id, v_jrn_id, v_room_id, v_stay_id,
    CURRENT_DATE - INTERVAL '5 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '12 hours',
    'ACTIVE'::segment_status, false, 'ORIGINAL'::segment_reason, 180, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg1_id, gs.d::date, 180,
    CASE WHEN gs.d < CURRENT_DATE THEN 'LOCKED'::night_status ELSE 'PENDING'::night_status END,
    gs.d < CURRENT_DATE
  FROM generate_series(
    CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE - INTERVAL '1 day', INTERVAL '1 day'
  ) AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  -- Seg 2: EXT_NEW_ROOM (304, D → D+4, PENDING) ← +ext block en row 304
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '304' LIMIT 1;

  INSERT INTO stay_segments(
    id, journey_id, room_id,
    check_in, check_out, status, locked, reason, rate_snapshot,
    notes, created_at, updated_at
  ) VALUES (
    v_seg2_id, v_jrn_id, v_room_id,
    CURRENT_DATE + INTERVAL '12 hours',
    CURRENT_DATE + INTERVAL '4 days 12 hours',
    'PENDING'::segment_status, false, 'EXTENSION_NEW_ROOM'::segment_reason, 180,
    '303 tiene entrada mañana. Se ofreció 304 misma tarifa $180/noche. Amelia aceptó. 3h margen de limpieza antes de que lleguen Petrov D+4.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg2_id, gs.d::date, 180, 'PENDING'::night_status, false
  FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '3 days', INTERVAL '1 day') AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  INSERT INTO stay_journey_events(id, journey_id, event_type, actor_id, payload, occurred_at)
  VALUES
    (gen_random_uuid(), v_jrn_id, 'JOURNEY_CREATED', v_rec_id,
     '{"channel":"direct","room":"303"}'::jsonb, NOW() - INTERVAL '5 days'),
    (gen_random_uuid(), v_jrn_id, 'EXTENSION_APPROVED', v_sup_id,
     '{"extraNights":4,"reason":"303 vendida desde mañana. Se reubica en 304 misma tarifa. Amelia conforme.","newRoom":"304"}'::jsonb, NOW());


  -- ── Journey 3: Marco Rossi (305→301) — Move mid-stay por AC defectuoso ────
  -- Estructura:
  --   Seg 1 ORIGINAL   305  D-6 → D-2  COMPLETED locked (305 vacío ahora)
  --   Seg 2 ROOM_MOVE  301  D-2 → D+4  ACTIVE    (bloque de move visible en 301)
  --
  -- Caso de uso #9: MID-STAY ROOM MOVE por queja operativa

  v_jrn_id  := 'journey-tul-marco';
  v_seg1_id := 'seg-tul-marco-1';
  v_seg2_id := 'seg-tul-marco-2';

  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '305' LIMIT 1;

  INSERT INTO stay_journeys(
    id, organization_id, property_id, guest_stay_id,
    guest_name, guest_email, status,
    journey_check_in, journey_check_out, created_at, updated_at
  ) VALUES (
    v_jrn_id, v_org_id, v_prop_id, 'stay-tul-305-marco',
    'Marco Rossi', 'marco.r@design.io', 'ACTIVE',
    CURRENT_DATE - INTERVAL '6 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '4 days 12 hours',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- Seg 1: ORIGINAL (305, D-6 → D-2, COMPLETED locked)
  INSERT INTO stay_segments(
    id, journey_id, room_id, guest_stay_id,
    check_in, check_out, status, locked, reason, rate_snapshot,
    notes, created_at, updated_at
  ) VALUES (
    v_seg1_id, v_jrn_id, v_room_id, 'stay-tul-305-marco',
    CURRENT_DATE - INTERVAL '6 days' + INTERVAL '15 hours',
    CURRENT_DATE - INTERVAL '2 days' + INTERVAL '12 hours',
    'COMPLETED'::segment_status, true, 'ORIGINAL'::segment_reason, 180,
    'Segmento original — AC de la unidad dejó de funcionar en la noche D-3. Solicitud urgente de cambio.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg1_id, gs.d::date, 180, 'LOCKED'::night_status, true
  FROM generate_series(
    CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE - INTERVAL '3 days', INTERVAL '1 day'
  ) AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  -- Seg 2: ROOM_MOVE (301, D-2 → D+4, ACTIVE) ← bloque visible en row 301
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '301' LIMIT 1;

  INSERT INTO stay_segments(
    id, journey_id, room_id,
    check_in, check_out, status, locked, reason, rate_snapshot,
    notes, created_at, updated_at
  ) VALUES (
    v_seg2_id, v_jrn_id, v_room_id,
    CURRENT_DATE - INTERVAL '2 days' + INTERVAL '12 hours',
    CURRENT_DATE + INTERVAL '4 days 12 hours',
    'ACTIVE'::segment_status, false, 'ROOM_MOVE'::segment_reason, 180,
    'Movido a 301 (misma categoría, AC funcionando). Sin cargo extra. Ofrecido desayuno de cortesía como disculpa.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg2_id, gs.d::date, 180,
    CASE WHEN gs.d < CURRENT_DATE THEN 'LOCKED'::night_status ELSE 'PENDING'::night_status END,
    gs.d < CURRENT_DATE
  FROM generate_series(
    CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '3 days', INTERVAL '1 day'
  ) AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  INSERT INTO stay_journey_events(id, journey_id, event_type, actor_id, payload, occurred_at)
  VALUES
    (gen_random_uuid(), v_jrn_id, 'JOURNEY_CREATED', v_rec_id,
     '{"channel":"direct","room":"305"}'::jsonb, NOW() - INTERVAL '6 days'),
    (gen_random_uuid(), v_jrn_id, 'ROOM_MOVE_EXECUTED', v_sup_id,
     '{"fromRoom":"305","toRoom":"301","reason":"AC unidad defectuoso, solicitud urgente del huésped","effectiveDate":"D-2","compensation":"Desayuno cortesía x2 mañanas"}',
     NOW() - INTERVAL '2 days');


  -- ── Journey 4: Yuki & Kenji Tanaka (B2) — Extensión misma habitación ──────
  -- Estructura:
  --   Seg 1 ORIGINAL      B2  D-8 → D-2  COMPLETED locked
  --   Seg 2 EXT_SAME_ROOM B2  D-2 → D+2  ACTIVE    (bloque +ext visible)

  v_jrn_id  := 'journey-tul-yuki';
  v_seg1_id := 'seg-tul-yuki-1';
  v_seg2_id := 'seg-tul-yuki-2';

  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = 'B2' LIMIT 1;

  INSERT INTO stay_journeys(
    id, organization_id, property_id, guest_stay_id,
    guest_name, guest_email, status,
    journey_check_in, journey_check_out, created_at, updated_at
  ) VALUES (
    v_jrn_id, v_org_id, v_prop_id, 'stay-tul-b2-yuki',
    'Yuki & Kenji Tanaka', 'yuki.tanaka@gmail.jp', 'ACTIVE',
    CURRENT_DATE - INTERVAL '8 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '2 days 12 hours',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- Seg 1: ORIGINAL (B2, D-8 → D-2, COMPLETED)
  INSERT INTO stay_segments(
    id, journey_id, room_id, guest_stay_id,
    check_in, check_out, status, locked, reason, rate_snapshot, created_at, updated_at
  ) VALUES (
    v_seg1_id, v_jrn_id, v_room_id, 'stay-tul-b2-yuki',
    CURRENT_DATE - INTERVAL '8 days' + INTERVAL '15 hours',
    CURRENT_DATE - INTERVAL '2 days' + INTERVAL '12 hours',
    'COMPLETED'::segment_status, true, 'ORIGINAL'::segment_reason, 280, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg1_id, gs.d::date, 280, 'LOCKED'::night_status, true
  FROM generate_series(
    CURRENT_DATE - INTERVAL '8 days', CURRENT_DATE - INTERVAL '3 days', INTERVAL '1 day'
  ) AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  -- Seg 2: EXT_SAME_ROOM (B2, D-2 → D+2, ACTIVE)
  INSERT INTO stay_segments(
    id, journey_id, room_id,
    check_in, check_out, status, locked, reason, rate_snapshot,
    notes, created_at, updated_at
  ) VALUES (
    v_seg2_id, v_jrn_id, v_room_id,
    CURRENT_DATE - INTERVAL '2 days' + INTERVAL '12 hours',
    CURRENT_DATE + INTERVAL '2 days 12 hours',
    'ACTIVE'::segment_status, false, 'EXTENSION_SAME_ROOM'::segment_reason, 280,
    'Extensión +4 noches. B2 disponible. Pagaron la extensión completa ($1,120) al confirmar. "Queremos ver el amanecer más".',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg2_id, gs.d::date, 280,
    CASE WHEN gs.d < CURRENT_DATE THEN 'LOCKED'::night_status ELSE 'PENDING'::night_status END,
    gs.d < CURRENT_DATE
  FROM generate_series(
    CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '1 day', INTERVAL '1 day'
  ) AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  INSERT INTO stay_journey_events(id, journey_id, event_type, actor_id, payload, occurred_at)
  VALUES
    (gen_random_uuid(), v_jrn_id, 'JOURNEY_CREATED', v_rec_id,
     '{"channel":"direct","room":"B2","occasion":"anniversary"}'::jsonb, NOW() - INTERVAL '8 days'),
    (gen_random_uuid(), v_jrn_id, 'EXTENSION_APPROVED', v_rec_id,
     '{"extraNights":4,"reason":"B2 available, guests paid in full immediately","rate":280}'::jsonb, NOW() - INTERVAL '2 days');

  RAISE NOTICE 'Hotel Tulum v4: estadías + 4 journeys insertados correctamente.';
END $$;

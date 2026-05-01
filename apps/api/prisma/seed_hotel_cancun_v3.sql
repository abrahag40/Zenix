-- =============================================================================
-- Hotel Cancún — Seed comprehensivo v3
-- Cubre TODOS los casos de uso de la operación diaria real de un hotel:
--
--  ESTADO / ESCENARIO                           HABITACIÓN
--  ─────────────────────────────────────────────────────────
--  CHECKED_OUT back-to-back (PAID)              201-roberto (D-9→D-4)
--  CHECKED_OUT (PAID, hostelworld)              203-prev (D-6→D-1)
--  UNCONFIRMED (walk-in hoy, sin actual_checkin) 203-thomas
--  IN_HOUSE confirmado con journey ROOM_MOVE    201→204 marco (queja de ruido)
--  IN_HOUSE confirmado, saldo PARTIAL           202-isabel
--  IN_HOUSE confirmado con journey EXT_NEW_ROOM 301→302 julia
--  IN_HOUSE confirmado, 3 pax, airbnb           402-goldstein
--  NO_SHOW (night audit, CARD_HOLD pendiente)   401-prev (D-2→D+2)
--  FUTURO corporativo pre-pagado                401-chen (D+6→D+13)
--  FUTURO back-to-back después de extensión     302-kim (D+6→D+9)
--  PAYMENT LOGS (audit trail)                   todos IN_HOUSE confirmados
--  PAGO SPLIT CASH+CARD                         202-isabel
--  PAGO OTA_PREPAID                             402-goldstein
--  COMP con aprobación manager                  301-julia upgrade suite cortesía
--  VARIAS FUENTES (5 canales)                   booking.com, direct, walk-in,
--                                               airbnb, corporate, hostelworld
--
-- Fechas: relativas a CURRENT_DATE (D).
--   Check-in estándar:  D + INTERVAL 'N days 15 hours'
--   Check-out estándar: D + INTERVAL 'N days 12 hours'
-- =============================================================================

DO $$
DECLARE
  v_org_id      TEXT;
  v_prop_id     TEXT := 'prop-hotel-cancun-001';
  v_rec_id      TEXT;   -- reception.cun@demo.com (Laura Mendez)
  v_sup_id      TEXT;   -- supervisor@demo.com

  v_room_id     TEXT;
  v_room_201_id TEXT;
  v_stay_id     TEXT;
  v_jrn_id      TEXT;
  v_seg1_id     TEXT;
  v_seg2_id     TEXT;
  v_today       DATE := CURRENT_DATE;

BEGIN
  -- ── 1. Lookup IDs dinámicos ─────────────────────────────────────────────────
  SELECT organization_id INTO v_org_id FROM properties WHERE id = v_prop_id LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Propiedad % no encontrada. Ejecuta seed.ts primero.', v_prop_id;
  END IF;
  SELECT id INTO v_rec_id FROM housekeeping_staff WHERE email = 'reception.cun@demo.com' LIMIT 1;
  SELECT id INTO v_sup_id  FROM housekeeping_staff WHERE email = 'supervisor@demo.com'    LIMIT 1;

  -- ── 2. Limpieza FK-safe ─────────────────────────────────────────────────────
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
  -- PISO 2 — Habitaciones Estándar ($100/noche, cap 2)
  -- ============================================================================

  -- ── Hab 201: Roberto Sánchez (D-9→D-4, CHECKED_OUT PAID) ───────────────────
  -- Caso: "antes" del back-to-back — Roberto sale el mismo día que Marco llega.
  -- Sin actual_checkin (sprint 8 llegó después de este huésped).
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '201' LIMIT 1;
  v_room_201_id := v_room_id;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-cun-201-roberto', v_org_id, v_prop_id, v_room_id,
    'Roberto Sánchez', 'rsanchez@mail.com', '+52 998 200 0001', 'MX', 'INE', 'MX-RS-201',
    1,
    v_today - 9 + INTERVAL '15 hours',
    v_today - 4 + INTERVAL '12 hours',
    v_today - 4 + INTERVAL '11 hours 10 minutes',
    100, 'USD', 500, 500, 'PAID',
    'booking.com',
    'Estadía completada. Back-to-back con Marco Rossi: salió mismo día que Marco llegó.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 201→204: Marco Rossi (D-4→D+4, IN_HOUSE PARTIAL, journey ROOM_MOVE) ─
  -- Caso: MOVE MID-STAY POR RUIDO — llegó en el back-to-back con Roberto, dos noches
  -- después se quejó del ruido del pasillo → movido a 204 hace 2 días.
  -- GuestStay.room_id = 201 (original). Los segmentos son el detalle real.
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '204' LIMIT 1;
  v_stay_id := 'stay-cun-201-marco';
  v_jrn_id  := 'jrn-cun-201-marco';
  v_seg1_id := 'seg-cun-201-marco-1';
  v_seg2_id := 'seg-cun-201-marco-2';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_201_id,
    'Marco Rossi', 'marco.r@design.io', '+39 335 678 9012', 'IT', 'PASSPORT', 'IT98765432',
    1,
    v_today - 4 + INTERVAL '15 hours',
    v_today + 4 + INTERVAL '12 hours',
    100, 'USD', 800, 400, 'PARTIAL',
    v_today - 4 + INTERVAL '15 hours 25 minutes',
    v_rec_id, 'PHYSICAL',
    'Diseñador freelance. Llegó directo del aeropuerto sin equipaje de mano. Pidió cuarto tranquilo.',
    'direct',
    'Movido de 201 a 204 por queja de ruido del pasillo (solicitud formal). Saldo $400 pendiente al salir.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO stay_journeys(id, organization_id, property_id, guest_stay_id,
    guest_name, journey_check_in, journey_check_out, status, created_at, updated_at)
    VALUES (v_jrn_id, v_org_id, v_prop_id, v_stay_id,
      'Marco Rossi',
      v_today - 4 + INTERVAL '15 hours', v_today + 4 + INTERVAL '12 hours',
      'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO stay_segments(
    id, journey_id, room_id, reason, check_in, check_out, rate_snapshot,
    status, locked, created_at, updated_at
  ) VALUES
    (v_seg1_id, v_jrn_id, v_room_201_id, 'ORIGINAL',
     v_today - 4 + INTERVAL '15 hours', v_today - 2 + INTERVAL '14 hours',
     100, 'COMPLETED', true, NOW(), NOW()),
    (v_seg2_id, v_jrn_id, v_room_id, 'ROOM_MOVE',
     v_today - 2 + INTERVAL '14 hours', v_today + 4 + INTERVAL '12 hours',
     100, 'ACTIVE', false, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO stay_journey_events(id, journey_id, event_type, actor_id, payload, occurred_at)
    VALUES (
      gen_random_uuid()::text, v_jrn_id, 'ROOM_MOVE_EXECUTED', v_sup_id,
      '{"fromRoom":"201","toRoom":"204","reason":"Queja de ruido del pasillo — solicitud firmada","moveDate":"D-2"}'::jsonb,
      v_today - 2 + INTERVAL '14 hours'
    ) ON CONFLICT DO NOTHING;
  -- Abono 50% al check-in
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CASH', 400, 'USD', v_today - 4, v_rec_id,
    v_today - 4 + INTERVAL '15 hours 30 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Hab 202: Isabel Fernández (D-5→D+2, IN_HOUSE PARTIAL, saldo pendiente) ──
  -- Caso: pago split CASH+CARD al check-in, debe $300 al salir.
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '202' LIMIT 1;
  v_stay_id := 'stay-cun-202-isabel';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Isabel Fernández', 'isabel.f@mail.com', '+52 55 200 0202', 'MX', 'INE', 'MX-IF-202',
    2,
    v_today - 5 + INTERVAL '15 hours',
    v_today + 2 + INTERVAL '12 hours',
    100, 'USD', 700, 400, 'PARTIAL',
    v_today - 5 + INTERVAL '15 hours 15 minutes',
    v_rec_id, 'PHYSICAL',
    'Llegó con su hermana. Pidió almohadas extra y toallas adicionales.',
    'direct',
    'Abonó $400 al check-in (split $200 cash + $200 tarjeta). Saldo $300 pendiente al salir.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  -- Split payment: CASH $200
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CASH', 200, 'USD', v_today - 5, v_rec_id,
    v_today - 5 + INTERVAL '15 hours 20 minutes'
  ) ON CONFLICT DO NOTHING;
  -- Split payment: CARD $200
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CARD_TERMINAL', 200, 'USD', 'AUTH-CUN-2201', v_today - 5, v_rec_id,
    v_today - 5 + INTERVAL '15 hours 22 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ── Hab 203: Victor Okonkwo (D-6→D-1, CHECKED_OUT PAID) ───────────────────
  -- Caso: estadía previa completada — aparece en historial antes del walk-in de hoy
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '203' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-cun-203-victor', v_org_id, v_prop_id, v_room_id,
    'Victor Okonkwo', 'v.okonkwo@company.ng', '+234 808 300 0001', 'NG', 'PASSPORT', 'NG-VO-8821',
    1,
    v_today - 6 + INTERVAL '15 hours',
    v_today - 1 + INTERVAL '12 hours',
    v_today - 1 + INTERVAL '10 hours 45 minutes',
    100, 'USD', 500, 500, 'PAID',
    'hostelworld',
    'Estadía completada. Delegado en conferencia empresarial local.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 203: Thomas Weber (D→D+5, UNCONFIRMED walk-in) ─────────────────────
  -- Caso: walk-in sin reserva, llegó hoy — aún no se ha hecho check-in formal.
  -- Sin actual_checkin → status UNCONFIRMED. Recepcionista debe confirmar.
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-cun-203-thomas', v_org_id, v_prop_id, v_room_id,
    'Thomas Weber', 'thomas.w@backpacker.de', '+49 170 300 0203', 'DE', 'PASSPORT', 'DE-TW-5521',
    1,
    v_today + INTERVAL '10 hours',
    v_today + 5 + INTERVAL '12 hours',
    100, 'USD', 500, 500, 'PAID',
    'walk-in',
    'Walk-in sin reserva previa. Pagó 5 noches en efectivo al presentarse. Pendiente confirmación de check-in.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  -- Walk-in pagó efectivo en recepción (sin actual_checkin aún)
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, 'stay-cun-203-thomas',
    'CASH', 500, 'USD', v_today, v_rec_id,
    v_today + INTERVAL '10 hours 5 minutes'
  ) ON CONFLICT DO NOTHING;

  -- ============================================================================
  -- PISO 3 — Habitaciones Superior ($150/noche, cap 3)
  -- ============================================================================

  -- ── Hab 301→302: Julia Novak (D-3→D+5, journey EXTENSION_NEW_ROOM) ─────────
  -- Caso: extensión en otra habitación — 301 llena hasta D+2 original, extendió
  -- en 302 hasta D+5 (COMP de cortesía en noches de extensión por cliente frecuente).
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '301' LIMIT 1;
  v_stay_id := 'stay-cun-301-julia';
  v_jrn_id  := 'jrn-cun-301-julia';
  v_seg1_id := 'seg-cun-301-julia-1';
  v_seg2_id := 'seg-cun-301-julia-2';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Julia Novak', 'julia.novak@startup.cz', '+420 602 301 001', 'CZ', 'PASSPORT', 'CZ-JN-7744',
    2,
    v_today - 3 + INTERVAL '15 hours',
    v_today + 5 + INTERVAL '12 hours',
    150, 'USD', 1200, 1200, 'PAID',
    v_today - 3 + INTERVAL '15 hours 40 minutes',
    v_rec_id, 'CARD',
    'Llegó con su pareja. Clientes frecuentes — cuarta visita. Extensión en 302 como cortesía.',
    'direct',
    'Extensión en 302 a partir de D+2 (COMP 3 noches como agradecimiento a clientes frecuentes). Manager: supervisor@demo.com autorizó.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  -- Pago original (5 noches * $150 = $750, pero en realidad 8 noches con extensión COMP)
  -- Pagó D-3→D+2 al check-in = 5 noches * $150 = $750
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'CARD_TERMINAL', 750, 'USD', 'AUTH-CUN-3301', v_today - 3, v_rec_id,
    v_today - 3 + INTERVAL '15 hours 45 minutes'
  ) ON CONFLICT DO NOTHING;
  -- COMP 3 noches extensión (aprobado por supervisor)
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    approved_by_id, approval_reason, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'COMP', 450, 'USD',
    v_sup_id, 'Cliente frecuente — 4ta visita — cortesía 3 noches extensión', v_today, v_rec_id,
    v_today + INTERVAL '9 hours'
  ) ON CONFLICT DO NOTHING;
  -- Journey y segmentos
  INSERT INTO stay_journeys(id, organization_id, property_id, guest_stay_id,
    guest_name, journey_check_in, journey_check_out, status, created_at, updated_at)
    VALUES (v_jrn_id, v_org_id, v_prop_id, v_stay_id,
      'Julia Novak',
      v_today - 3 + INTERVAL '15 hours', v_today + 5 + INTERVAL '12 hours',
      'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  -- Segmento 1: hab 301, original
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '302' LIMIT 1;
  INSERT INTO stay_segments(
    id, journey_id, room_id, reason, check_in, check_out, rate_snapshot,
    status, locked, created_at, updated_at
  ) VALUES
    (v_seg1_id, v_jrn_id,
     (SELECT id FROM rooms WHERE "propertyId" = v_prop_id AND number = '301' LIMIT 1),
     'ORIGINAL',
     v_today - 3 + INTERVAL '15 hours', v_today + 2 + INTERVAL '12 hours',
     150, 'ACTIVE', false, NOW(), NOW()),
    (v_seg2_id, v_jrn_id, v_room_id, 'EXTENSION_NEW_ROOM',
     v_today + 2 + INTERVAL '12 hours', v_today + 5 + INTERVAL '12 hours',
     0, 'PENDING', false, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO stay_journey_events(id, journey_id, event_type, actor_id, payload, occurred_at)
    VALUES (
      gen_random_uuid()::text, v_jrn_id, 'EXTENSION_APPROVED', v_sup_id,
      '{"newRoom":"302","newCheckout":"D+5","reason":"COMP cortesía cliente frecuente","approvedBy":"supervisor"}'::jsonb,
      v_today + INTERVAL '9 hours 10 minutes'
    ) ON CONFLICT DO NOTHING;

  -- ── Hab 302 (futuro): Rachel & David Kim (D+6→D+9) ─────────────────────────
  -- Caso: back-to-back después de extensión de Julia — llegan 1 día después que
  -- Julia sale de 302. Reserva futura, pre-pagada vía airbnb.
  -- (302 está ocupada por Julia hasta D+5, Kim llega D+6 — una noche entre ambos)
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-cun-302-kim', v_org_id, v_prop_id, v_room_id,
    'Rachel Kim', 'rachel.kim@email.com', '+1 213 302 0001', 'US', 'PASSPORT', 'US-RK-3388',
    2,
    v_today + 6 + INTERVAL '15 hours',
    v_today + 9 + INTERVAL '12 hours',
    150, 'USD', 450, 450, 'PAID',
    'airbnb',
    'Reserva confirmada por Airbnb. Llegan el día después que sale Julia Novak.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ============================================================================
  -- PISO 4 — Suites ($250/noche, cap 4)
  -- ============================================================================

  -- ── Hab 401: Andrei Volkov (D-2→D+2, NO_SHOW — night audit) ─────────────────
  -- Caso: NO_SHOW procesado por night audit. Nunca llegó. Cargo PENDING.
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '401' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    no_show_at, no_show_by_id, no_show_reason, no_show_charge_status,
    no_show_fee_amount, no_show_fee_currency,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-cun-401-volkov', v_org_id, v_prop_id, v_room_id,
    'Andrei Volkov', 'a.volkov@corp.ru', '+7 495 401 0001', 'RU', 'PASSPORT', 'RU-AV-6611',
    2,
    v_today - 2 + INTERVAL '15 hours',
    v_today + 2 + INTERVAL '12 hours',
    250, 'USD', 1000, 0, 'PENDING',
    v_today - 1 + INTERVAL '03 hours',
    NULL,
    'No se presentó. Night audit automático 3 AM. No hubo contacto previo.',
    'PENDING',
    250, 'USD',
    'booking.com',
    'No-show procesado en night audit. Primera noche = cargo de no-show policy.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 401: Chen Wei (D+6→D+13, FUTURO corporativo PAID) ──────────────────
  -- Caso: reserva futura corporativa pre-pagada — ya habilitado el cobro anticipado.
  -- Hab libre D+2 (no-show salió) hasta D+6.
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    'stay-cun-401-chen', v_org_id, v_prop_id, v_room_id,
    'Chen Wei', 'chen.wei@globalcorp.cn', '+86 139 401 0001', 'CN', 'PASSPORT', 'CN-CW-9922',
    4,
    v_today + 6 + INTERVAL '15 hours',
    v_today + 13 + INTERVAL '12 hours',
    250, 'USD', 1750, 1750, 'PAID',
    'corporate',
    'Delegación corporativa. Pre-pagado vía wire transfer. Director regional Asia-Pacífico.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 402: The Goldstein Family (D-1→D+4, IN_HOUSE PAID, airbnb) ───────────
  -- Caso: familia numerosa (3 pax), pago OTA_PREPAID, actualCheckin confirmado.
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '402' LIMIT 1;
  v_stay_id := 'stay-cun-402-goldstein';
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, guest_phone, nationality, document_type, document_number,
    pax_count, checkin_at, scheduled_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    actual_checkin, checkin_confirmed_by_id, key_type, arrival_notes,
    source, notes, checked_in_by_id, created_at, updated_at
  ) VALUES (
    v_stay_id, v_org_id, v_prop_id, v_room_id,
    'Sarah Goldstein', 'sgoldstein@gmail.com', '+1 646 402 0001', 'US', 'PASSPORT', 'US-SG-4422',
    3,
    v_today - 1 + INTERVAL '15 hours',
    v_today + 4 + INTERVAL '12 hours',
    250, 'USD', 1250, 1250, 'PAID',
    v_today - 1 + INTERVAL '16 hours 10 minutes',
    v_rec_id, 'CODE',
    'Familia con 2 niños. Solicitaron cunas extra y menú infantil. Llegaron 1h tarde.',
    'airbnb',
    'Familia de 3 adultos + 2 niños (menores no cuentan en pax). Airbnb prepagado. Suite con vista al mar.',
    v_rec_id, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  -- OTA_PREPAID — registrado como reconocimiento de cobro previo por OTA
  INSERT INTO payment_logs(
    id, organization_id, property_id, stay_id, method, amount, currency,
    reference, shift_date, collected_by_id, created_at
  ) VALUES (
    gen_random_uuid()::text, v_org_id, v_prop_id, v_stay_id,
    'OTA_PREPAID', 1250, 'USD', 'AIRBNB-GLD-20260424', v_today - 1, v_rec_id,
    v_today - 1 + INTERVAL '16 hours 15 minutes'
  ) ON CONFLICT DO NOTHING;

END $$;

-- =============================================================================
-- Hotel Cancún — Seed comprehensivo v2
-- Casos de uso cubiertos (10 escenarios complementarios):
--   1  Back-to-back cross-check         201: Roberto sale D-4, Marco llega D-4 15h
--   2  Llegada mismo día que vecino sale 203: Thomas llega HOY (walk-in)
--   3  Saldo pendiente al checkout       202: Isabel Fernández (PARTIAL, $0 extra pagado)
--   4  Move mid-stay por ruido           201→204: Marco Rossi (journey-cun-marco)
--   5  Extensión diferente habitación    301→302: Julia Novak (EXT_NEW_ROOM)
--   6  Back-to-back después de extensión 302: Rachel & David Kim llegan D+6 (un día después que termina ext de Julia D+5)
--   7  Reserva futura corporativa        401: Chen Wei (D+6→D+13, pago anticipado)
--   8  Familia numerosa (Airbnb)         402: The Goldstein Family (3 pax)
--   9  Canal walk-in sin reserva         203: Thomas Weber (D, sin reserva previa)
--  10  Canal diverso (5 fuentes)         booking.com, direct, walk-in, airbnb, corporate
--
-- Fechas: todas relativas a CURRENT_DATE (D).
--   Check-in estándar:  D + INTERVAL 'N days 15 hours'
--   Check-out estándar: D + INTERVAL 'N days 12 hours'
-- =============================================================================

DO $$
DECLARE
  v_org_id   TEXT;
  v_prop_id  TEXT := 'prop-hotel-cancun-001';
  v_rec_id   TEXT;   -- reception.cun@demo.com
  v_sup_id   TEXT;   -- supervisor@demo.com (used as approver in events)

  v_room_id  TEXT;
  v_jrn_id   TEXT;
  v_seg1_id  TEXT;
  v_seg2_id  TEXT;

BEGIN
  -- ── 1. Lookup IDs dinámicos ─────────────────────────────────────────────────
  SELECT organization_id INTO v_org_id FROM properties WHERE id = v_prop_id LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Propiedad % no encontrada. Ejecuta seed.ts primero.', v_prop_id;
  END IF;

  SELECT id INTO v_rec_id FROM housekeeping_staff WHERE email = 'reception.cun@demo.com' LIMIT 1;
  SELECT id INTO v_sup_id  FROM housekeeping_staff WHERE email = 'supervisor@demo.com'   LIMIT 1;

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
  -- PISO 2 — Estándar Superior ($100/noche, cap. 2)
  -- ============================================================================

  -- ── Hab 201: Roberto Sánchez (D-9→D-4, departed PAID, booking.com) ─────────
  -- Caso de uso #1: "antes" del back-to-back — Roberto sale el mismo día que Marco llega
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '201' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-cun-201-roberto', v_org_id, v_prop_id, v_room_id,
    'Roberto Sánchez', 'rsanchez@mail.com', 1,
    CURRENT_DATE - INTERVAL '9 days' + INTERVAL '15 hours',
    CURRENT_DATE - INTERVAL '4 days' + INTERVAL '12 hours',
    CURRENT_DATE - INTERVAL '4 days' + INTERVAL '11 hours',
    100, 'USD', 500, 500, 'PAID',
    'booking.com', v_rec_id,
    'Estadía completada. Pagó al check-in. Back-to-back: Marco Rossi llegó la misma tarde. Sin tiempo de mantenimiento.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 201/204: Marco Rossi — GuestStay del journey ROOM_MOVE ────────────
  -- Caso de uso #4: MOVE MID-STAY POR RUIDO
  -- Marco llegó el mismo día que Roberto salió (back-to-back, caso #1).
  -- Dos noches después se quejó del ruido del pasillo → movido a 204 ayer.
  -- GuestStay.room_id = 201 (cuarto original). Los segmentos son el detalle real.
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-cun-move-marco', v_org_id, v_prop_id, v_room_id,
    'Marco Rossi', 'marco.r@design.io', 1,
    CURRENT_DATE - INTERVAL '4 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '4 days 12 hours',
    NULL,
    100, 'USD', 800, 400, 'PARTIAL',
    'direct', v_rec_id,
    'Movido de 201 a 204 ayer por ruido del pasillo (queja formal). Abono 50% al check-in. Saldo pendiente al salir.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 202: Isabel Fernández (D-5→D+2, in-house PARTIAL, direct) ──────────
  -- Caso de uso #3: SALDO PENDIENTE AL CHECKOUT
  -- Solo pagó la primera noche al llegar. Deberá pagar el resto al salir D+2.
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '202' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-cun-202-isabel', v_org_id, v_prop_id, v_room_id,
    'Isabel Fernández', 'isabel.f@mail.com', 1,
    CURRENT_DATE - INTERVAL '5 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '2 days 12 hours',
    NULL,
    100, 'USD', 700, 100, 'PARTIAL',
    'direct', v_rec_id,
    'Solo pagó primera noche ($100) al check-in. Saldo $600 pendiente al checkout D+2. Necesita recordatorio.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 203: Thomas Weber (D→D+5, arriving TODAY, walk-in PENDING) ─────────
  -- Caso de uso #2, #9: WALK-IN SIN RESERVA PREVIA — llegó hoy sin reserva
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '203' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-cun-203-thomas', v_org_id, v_prop_id, v_room_id,
    'Thomas Weber', 'thomas.w@gmail.com', 1,
    CURRENT_DATE + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '5 days 12 hours',
    NULL,
    100, 'USD', 500, 0, 'PENDING',
    'walk-in', v_rec_id,
    'Walk-in sin reserva. Llegó buscando cuarto disponible. Pago al check-in presencial (efectivo o tarjeta). Sin historial previo.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 204: Marco Rossi — segmento ROOM_MOVE (creado vía journey abajo) ──
  -- La habitación 204 estará ocupada por Marco en el segmento ROOM_MOVE.
  -- No hay GuestStay separado para 204 — el journey usa el mismo GuestStay de 201.

  -- ============================================================================
  -- PISO 3 — Superior ($150/noche, cap. 2)
  -- ============================================================================

  -- ── Hab 301: Julia Novak (D-3→D+2, PAID, direct) — GuestStay del journey ──
  -- Caso de uso #5: EXTENSIÓN DIFERENTE HABITACIÓN (301→302)
  -- 301 estará ocupada para Semana Santa; Julia acepta 302 misma tarifa
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '301' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-cun-301-julia', v_org_id, v_prop_id, v_room_id,
    'Julia Novak', 'julia.n@remote.io', 1,
    CURRENT_DATE - INTERVAL '3 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '2 days 12 hours',
    NULL,
    150, 'USD', 750, 750, 'PAID',
    'direct', v_rec_id,
    'Nómada digital. Prepagado completo. Quiere extender 3 noches pero 301 ya está comprometida para Semana Santa. Se ofreció 302 misma tarifa. Ver StayJourney.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 302: Rachel & David Kim (D+6→D+9, future PAID, airbnb) ─────────────
  -- Caso de uso #6: Back-to-back DESPUÉS de extensión — llegan 1 día después que
  -- termina la extensión de Julia (D+5). Margen de 1 día para limpieza.
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '302' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-cun-302-kim', v_org_id, v_prop_id, v_room_id,
    'Rachel & David Kim', 'rachel.kim@gmail.com', 2,
    CURRENT_DATE + INTERVAL '6 days 15 hours',
    CURRENT_DATE + INTERVAL '9 days 12 hours',
    NULL,
    150, 'USD', 450, 450, 'PAID',
    'airbnb', v_rec_id,
    'Pareja. Reserva desde Airbnb prepagada. Llegan D+6 (día siguiente al fin de extensión de Julia D+5). 1 día de margen para limpieza.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ============================================================================
  -- PISO 4 — Suite ($250/noche, cap. 4)
  -- ============================================================================

  -- ── Hab 401: Chen Wei (D+6→D+13, future corporate PAID) ────────────────────
  -- Caso de uso #7: RESERVA FUTURA CORPORATIVA PRE-PAGADA
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '401' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-cun-401-chen', v_org_id, v_prop_id, v_room_id,
    'Chen Wei', 'chen.wei@corp.com', 1,
    CURRENT_DATE + INTERVAL '6 days 15 hours',
    CURRENT_DATE + INTERVAL '13 days 12 hours',
    NULL,
    250, 'USD', 1750, 1750, 'PAID',
    'corporate', v_rec_id,
    'Viaje de negocios. Pago corporativo anticipado. Requiere factura electrónica a nombre de CorpTech Shanghai. Solicita habitación silenciosa.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Hab 402: The Goldstein Family (D-1→D+4, in-house PAID, airbnb) ─────────
  -- Caso de uso #8: FAMILIA NUMEROSA (3 pax), Airbnb
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '402' LIMIT 1;
  INSERT INTO guest_stays(
    id, organization_id, property_id, room_id,
    guest_name, guest_email, pax_count,
    checkin_at, scheduled_checkout, actual_checkout,
    rate_per_night, currency, total_amount, amount_paid, payment_status,
    source, checked_in_by_id, notes, created_at, updated_at
  ) VALUES (
    'stay-cun-402-goldstein', v_org_id, v_prop_id, v_room_id,
    'The Goldstein Family', 'ben.goldstein@yahoo.com', 3,
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '4 days 12 hours',
    NULL,
    250, 'USD', 1250, 1250, 'PAID',
    'airbnb', v_rec_id,
    'Familia 3 pax (matrimonio + 1 hijo). Airbnb prepagado. Llegaron ayer. Solicitaron cuna extra — coordinado. Alergias: sin mariscos en amenities.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;


  -- ============================================================================
  -- STAY JOURNEYS
  -- ============================================================================

  -- ── Journey 5: Julia Novak (301→302) — Extensión diferente habitación ──────
  -- Estructura:
  --   Seg 1 ORIGINAL       301  D-3 → D+2  ACTIVE  (bloque original visible)
  --   Seg 2 EXT_NEW_ROOM   302  D+2 → D+5  PENDING (bloque +ext en row 302)
  --
  -- SVG Bézier conecta diagonal: 301 row → 302 row
  -- Rachel & David Kim llegan a 302 en D+6 → 1 día margen después de la extensión

  v_jrn_id  := 'journey-cun-julia';
  v_seg1_id := 'seg-cun-julia-1';
  v_seg2_id := 'seg-cun-julia-2';

  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '301' LIMIT 1;

  INSERT INTO stay_journeys(
    id, organization_id, property_id, guest_stay_id,
    guest_name, guest_email, status,
    journey_check_in, journey_check_out, created_at, updated_at
  ) VALUES (
    v_jrn_id, v_org_id, v_prop_id, 'stay-cun-301-julia',
    'Julia Novak', 'julia.n@remote.io', 'ACTIVE',
    CURRENT_DATE - INTERVAL '3 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '5 days 12 hours',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- Seg 1: ORIGINAL (301, D-3 → D+2, ACTIVE)
  INSERT INTO stay_segments(
    id, journey_id, room_id, guest_stay_id,
    check_in, check_out, status, locked, reason, rate_snapshot, created_at, updated_at
  ) VALUES (
    v_seg1_id, v_jrn_id, v_room_id, 'stay-cun-301-julia',
    CURRENT_DATE - INTERVAL '3 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '2 days 12 hours',
    'ACTIVE'::segment_status, false, 'ORIGINAL'::segment_reason, 150, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg1_id, gs.d::date, 150,
    CASE WHEN gs.d < CURRENT_DATE THEN 'LOCKED'::night_status ELSE 'PENDING'::night_status END,
    gs.d < CURRENT_DATE
  FROM generate_series(
    CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE + INTERVAL '1 day', INTERVAL '1 day'
  ) AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  -- Seg 2: EXT_NEW_ROOM (302, D+2 → D+5, PENDING) ← +ext block en row 302
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '302' LIMIT 1;

  INSERT INTO stay_segments(
    id, journey_id, room_id,
    check_in, check_out, status, locked, reason, rate_snapshot,
    notes, created_at, updated_at
  ) VALUES (
    v_seg2_id, v_jrn_id, v_room_id,
    CURRENT_DATE + INTERVAL '2 days 12 hours',
    CURRENT_DATE + INTERVAL '5 days 12 hours',
    'PENDING'::segment_status, false, 'EXTENSION_NEW_ROOM'::segment_reason, 150,
    '301 comprometida para Semana Santa. Julia acepta 302 misma tarifa $150. Rachel & David Kim llegan a 302 en D+6 — hay 1 día de margen.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg2_id, gs.d::date, 150, 'PENDING'::night_status, false
  FROM generate_series(
    CURRENT_DATE + INTERVAL '2 days', CURRENT_DATE + INTERVAL '4 days', INTERVAL '1 day'
  ) AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  INSERT INTO stay_journey_events(id, journey_id, event_type, actor_id, payload, occurred_at)
  VALUES
    (gen_random_uuid(), v_jrn_id, 'JOURNEY_CREATED', v_rec_id,
     '{"channel":"direct","room":"301","note":"Nómada digital, pago prepagado"}'::jsonb, NOW() - INTERVAL '3 days'),
    (gen_random_uuid(), v_jrn_id, 'EXTENSION_APPROVED', v_sup_id,
     '{"extraNights":3,"newRoom":"302","reason":"301 bloqueada Semana Santa. Cliente acepta 302 misma tarifa $150/noche","approvedBy":"supervisor"}'::jsonb, NOW());


  -- ── Journey 6: Marco Rossi (201→204) — Move mid-stay por ruido ─────────────
  -- Estructura:
  --   Seg 1 ORIGINAL   201  D-4 → D-1  COMPLETED locked (back-to-back con Roberto, caso #1)
  --   Seg 2 ROOM_MOVE  204  D-1 → D+4  ACTIVE    (bloque de move visible en row 204)
  --
  -- SVG Bézier conecta diagonal: 201 row → 204 row
  -- Marco llegó el mismo día que Roberto salió (D-4) → back-to-back cross-check

  v_jrn_id  := 'journey-cun-marco';
  v_seg1_id := 'seg-cun-marco-1';
  v_seg2_id := 'seg-cun-marco-2';

  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '201' LIMIT 1;

  INSERT INTO stay_journeys(
    id, organization_id, property_id, guest_stay_id,
    guest_name, guest_email, status,
    journey_check_in, journey_check_out, created_at, updated_at
  ) VALUES (
    v_jrn_id, v_org_id, v_prop_id, 'stay-cun-move-marco',
    'Marco Rossi', 'marco.r@design.io', 'ACTIVE',
    CURRENT_DATE - INTERVAL '4 days' + INTERVAL '15 hours',
    CURRENT_DATE + INTERVAL '4 days 12 hours',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- Seg 1: ORIGINAL (201, D-4 → D-1, COMPLETED, locked)
  INSERT INTO stay_segments(
    id, journey_id, room_id, guest_stay_id,
    check_in, check_out, status, locked, reason, rate_snapshot,
    notes, created_at, updated_at
  ) VALUES (
    v_seg1_id, v_jrn_id, v_room_id, 'stay-cun-move-marco',
    CURRENT_DATE - INTERVAL '4 days' + INTERVAL '15 hours',
    CURRENT_DATE - INTERVAL '1 day'  + INTERVAL '12 hours',
    'COMPLETED'::segment_status, true, 'ORIGINAL'::segment_reason, 100,
    'Back-to-back con Roberto Sánchez — mismo cuarto, llegó la tarde que Roberto salió. Dos noches sin problemas, luego queja de ruido.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg1_id, gs.d::date, 100, 'LOCKED'::night_status, true
  FROM generate_series(
    CURRENT_DATE - INTERVAL '4 days', CURRENT_DATE - INTERVAL '2 days', INTERVAL '1 day'
  ) AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  -- Seg 2: ROOM_MOVE (204, D-1 → D+4, ACTIVE)
  SELECT id INTO v_room_id FROM rooms WHERE "propertyId" = v_prop_id AND number = '204' LIMIT 1;

  INSERT INTO stay_segments(
    id, journey_id, room_id,
    check_in, check_out, status, locked, reason, rate_snapshot,
    notes, created_at, updated_at
  ) VALUES (
    v_seg2_id, v_jrn_id, v_room_id,
    CURRENT_DATE - INTERVAL '1 day' + INTERVAL '12 hours',
    CURRENT_DATE + INTERVAL '4 days 12 hours',
    'ACTIVE'::segment_status, false, 'ROOM_MOVE'::segment_reason, 100,
    'Movido ayer a las 12:00 por queja urgente de ruido del pasillo (solicitud formal firmada). Misma tarifa $100/noche. Habitación 204 más silenciosa.',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO segment_nights(id, segment_id, date, rate, status, locked)
  SELECT gen_random_uuid(), v_seg2_id, gs.d::date, 100,
    CASE WHEN gs.d < CURRENT_DATE THEN 'LOCKED'::night_status ELSE 'PENDING'::night_status END,
    gs.d < CURRENT_DATE
  FROM generate_series(
    CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '3 days', INTERVAL '1 day'
  ) AS gs(d)
  ON CONFLICT (segment_id, date) DO NOTHING;

  INSERT INTO stay_journey_events(id, journey_id, event_type, actor_id, payload, occurred_at)
  VALUES
    (gen_random_uuid(), v_jrn_id, 'JOURNEY_CREATED', v_rec_id,
     '{"channel":"direct","room":"201","note":"Back-to-back con Roberto Sánchez"}'::jsonb, NOW() - INTERVAL '4 days'),
    (gen_random_uuid(), v_jrn_id, 'ROOM_MOVE_EXECUTED', v_rec_id,
     ('{"fromRoom":"201","toRoom":"204","effectiveDate":"' ||
       to_char(CURRENT_DATE - INTERVAL '1 day', 'YYYY-MM-DD') ||
       'T12:00:00.000Z","reason":"Ruido desde pasillo — queja formal del huésped"}')::jsonb,
     NOW() - INTERVAL '1 day');

END $$;

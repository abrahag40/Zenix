---
Audiencia: Owner Zenix (no-técnico friendly) · futuras sesiones · prospectos comerciales
Tipo: Explainer ejecutivo
Fecha: 2026-05-22
---

# ¿Qué es PredictHQ y por qué importa para Zenix?

> **Explicación en español plano, sin tecnicismo. Cuando vuelvas a la sesión y te preguntes "qué era esto?", esta es la referencia.**

---

## 1. Qué hace PredictHQ en una frase

> *"Un Google de eventos para hoteleros — te dice qué va a pasar cerca de tu hotel en los próximos meses y cuánto va a afectar tu demanda."*

PredictHQ es una empresa neozelandesa fundada en 2014 que se dedica a **recolectar, clasificar y predecir el impacto de eventos en demanda de viajes**. No vende los tickets ni promociona los eventos — vende **datos sobre los eventos** a empresas que necesitan tomar decisiones basadas en ese conocimiento.

---

## 2. Quién la usa hoy

Clientes documentados públicamente:

- **Booking.com** — para sus algoritmos de pricing y demand forecasting
- **Marriott International** — para revenue management en todas sus marcas
- **Hyatt Hotels** — para sugerencias de tarifa
- **Hilton** — para forecast de ocupación
- **Accor Hotels** (Sofitel, Mercure, etc.) — mismo uso
- **Uber** — para sugerir surge pricing en zonas con eventos masivos
- **DoorDash** — para predecir picos de demanda de delivery
- **Domino's Pizza** — para staffing y inventory

Es un producto **enterprise-grade** que las cadenas hoteleras grandes ya consideran infraestructura básica. Zenix sería el primer PMS LATAM en ofrecerlo a hoteles boutique vía DLC.

---

## 3. Qué tipo de datos te da

PredictHQ agrega información de **19 categorías de eventos** desde miles de fuentes. Para cada evento te da:

### Información básica
- Nombre del evento
- Fecha de inicio y fin
- Ubicación exacta (lat/lng + ciudad + país)
- Categoría (concierto, festival, conferencia, holiday, etc.)
- URL fuente (puedes verificar manualmente)

### Información clave para hospitality
- **`local_rank`** (0-100) — qué tan grande es el impacto del evento *localmente*. Un festival de 50,000 personas en Tulum (donde la población es 50,000) tiene local_rank ~95. El mismo festival en Ciudad de México (9 millones) tendría local_rank ~30 porque se diluye en la población.
- **`aviation_rank`** (0-100) — qué tanto va a aumentar el tráfico aéreo al área. Festival con asistentes internacionales → aviation_rank alto. Holiday local sin turistas → aviation_rank bajo.
- **`predicted_attendance`** — número estimado de asistentes (basado en histórico + venue capacity + booking patterns observados en otras plataformas).

### Categorías cubiertas
1. Conciertos (toda música live)
2. Festivales (música, comida, cultura)
3. Conferencias y conventions
4. Sports (fútbol, MLB, NBA, eventos olímpicos)
5. Performing arts (teatro, ópera, ballet)
6. Holidays públicos (Día de la Independencia, Navidad, etc.)
7. School holidays (vacaciones escolares por estado/país)
8. Observances (Día de Muertos, fiestas religiosas)
9. Severe weather (huracanes, tormentas) — para alertas anticipadas
10. Airport delays patterns
11. Daylight savings transitions
12. Terror / disaster events (sensible, opt-in)
13. Construction projects (cierres de calles, road work)
14. Industry-specific events (vaccination drives, tax deadlines)
15-19. Otros nichos

---

## 4. Cómo se compara con alternativas

### Vs Ticketmaster (lo que vamos a usar en el sprint MARKET-INTEL-PRO MVP)

| | Ticketmaster Discovery API | PredictHQ |
|---|---|---|
| Costo | $0 gratis (5,000 calls/día) | $200-1,000+/mes/property |
| Eventos no-ticketables (Día de Muertos, eventos religiosos, festivales no-vendibles) | ❌ No los detecta | ✅ Sí |
| Demand impact scoring | ❌ Solo "existe el evento" | ✅ local_rank + aviation_rank |
| Holidays públicos | ❌ Por separado | ✅ Incluido |
| Severe weather alerts | ❌ | ✅ |
| Cobertura LATAM | ✅ MX/AR fuerte, CO/CL moderado, otros parcial | ✅ Excelente global |

**Conclusión:** Ticketmaster es el "tier base" gratis. PredictHQ es el "tier premium" que cobramos +$40-80/mes pass-through al cliente.

### Vs Eventbrite

Eventbrite **descontinuó su Search API en 2020**. Hoy solo permite acceso a eventos que TÚ eres el organizador. Inútil para discovery. Por eso lo descartamos permanente.

### Vs Songkick

Songkick es solo conciertos + tours de artists. Cobertura LATAM débil (mejor USA/UK). Partner-only (negociación comercial requerida). PredictHQ cubre todo lo de Songkick + más.

### Vs construir scraping propio

PredictHQ vs scraping Booking/Expedia/Airbnb manualmente:
- Scraping = trabajo de mantenimiento continuo + riesgo legal grey area
- PredictHQ = datos curados profesionalmente + zero mantenimiento

---

## 5. Cómo encaja en los sprints de Zenix

### En el sprint actual (RATES-METRICS-COMPSET-CORE — MVP)

**NO usamos PredictHQ.** El MVP solo tiene:
- `LocalEvent` curado manualmente por nosotros (Bahidorá, Día de Muertos, etc.)
- Scraping DIY de competidores con Playwright

Razón: el MVP debe ser bundled gratis con v1.0.x base, sin costos recurrentes operativos.

### En el sprint futuro MARKET-INTEL-PRO (v1.1.1 DLC, ~$50-80/mes)

PredictHQ aparece como **adapter opcional Premium**. El cliente paga +$40-80/mes pass-through y obtiene:
- Event ingest automático con scoring de impacto
- Cobertura mejor que Ticketmaster gratis
- Eventos no-ticketables incluidos

### En el sprint futuro DEMAND-INTELLIGENCE (v1.1.1+ DLC, ~$80-150/mes)

PredictHQ se vuelve **alternativa principal** porque su `aviation_rank` reemplaza la integración con Amadeus Travel API. Te ahorras construir el módulo de flight data + obtienes impact scoring hospitality-grade en un solo proveedor.

Decisión arquitectural: `IFlightDataAdapter` tiene 3 implementaciones — `AmadeusFlightDataAdapter` (default), `PredictHQFlightProxyAdapter` (si cliente ya activó MIP Premium con PHQ), `CompositeFlightDataAdapter` (combina ambos para Enterprise tier).

---

## 6. Por qué activar el trial AHORA aunque no usemos PredictHQ aún

**Razones para activar el trial de 14 días hoy (gratis):**

1. **Familiarizarnos con el API antes del sprint** — cuando llegue MARKET-INTEL-PRO en Q3-Q4 2026, ya tendremos contexto previo del producto.
2. **Validar cobertura LATAM** — probar consultas a `?within=50km@20.21,-87.46` y verificar qué tan bien cubre Tulum + Cartagena + Cusco. Sin sorpresas en el sprint.
3. **Probar `local_rank` en eventos conocidos** — buscar Festival Bahidorá 2026 manual y ver qué rank le asigna PHQ. Calibra nuestras expectativas.
4. **Identificar gaps** — si PHQ no cubre un festival LATAM relevante, lo aprendemos AHORA y planificamos la curación manual.
5. **Material para sales pitch futuro** — screenshots del dashboard PHQ son útiles para mostrar al primer cliente cuando vendamos Market Intel Pro DLC.

**Costo del trial:** $0 USD. Solo email empresarial + 5 minutos signup.

---

## 7. Cómo activar el trial (paso a paso)

1. **Ir a:** https://www.predicthq.com
2. **Click:** botón "Start Free Trial" o "Get Started" (top-right)
3. **Llenar form:**
   - Email: tu email empresarial ZaharDev (NO @gmail.com — PredictHQ filtra y a veces rechaza emails personales)
   - Company: "ZaharDev / Zenix PMS"
   - Use case: "Hospitality PMS — building event-aware demand intelligence for boutique hotels in LATAM"
   - Phone: opcional
4. **Confirmar email** desde tu inbox
5. **Login dashboard** → ir a "API Keys" → copy access token
6. **Guardar el access token en password manager** (NO en el repo Zenix por ahora — solo sandbox testing manual)
7. **Documentar fecha de activación** — el trial dura 14 días desde el signup
8. **Programar recordatorio** 3 días antes del cierre del trial para decidir si continuar o pausar

**Después del trial (día 14):**
- Si quieres seguir probando: contactar a sales@predicthq.com para extensión gratuita (negociable para early-stage SaaS)
- Si paramos: el access token deja de funcionar automáticamente, nada que hacer
- Si quieres activar production: $200-400/mes Pro tier per property/city

---

## 8. Qué API endpoint probar primero

Una vez tengas el access token, **prueba esto para validar cobertura Tulum:**

```bash
curl -G https://api.predicthq.com/v1/events/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d "within=50km@20.2114,-87.4654" \
  -d "active.gte=2026-01-01" \
  -d "active.lte=2026-12-31" \
  -d "category=concerts,festivals,public-holidays,school-holidays,sports,conferences,observances" \
  -d "limit=50"
```

**Lo que esperas ver:**
- Festival Bahidorá Tulum (febrero) con `local_rank` ≥ 80
- Art With Me (noviembre) con `local_rank` ≥ 70
- Día de Muertos (1-2 nov) con `local_rank` moderado
- Año Nuevo (31 dic) con `local_rank` extreme
- Spring Break peaks (marzo) con `aviation_rank` alto desde USA

**Si NO ves estos eventos cubiertos:**
- Reportar gaps al sales rep PHQ — pueden agregar manualmente para tu trial
- Documentar en `docs/ops/predicthq-coverage-gaps.md` (crear si necesario)
- Decisión: PHQ no será suficiente, necesitamos curador manual + Ticketmaster combinados (que es lo que ya tenemos planificado en MARKET-INTEL-PRO)

---

## 9. Riesgos y consideraciones

### Riesgo: dependencia de un solo proveedor
Si Zenix se vuelve dependiente de PredictHQ y cambian pricing o deprecan API, podemos quedar atrapados. **Mitigación**: el adapter pattern `IEventDataAdapter` permite swap a otros providers (Ticketmaster + curado manual) en 1 cambio de config.

### Riesgo: costo escala mal
$200-400/property/mes × 50 properties = $10k-20k/mes en API costs. **Mitigación**: cache agresivo (24h por property/region/window) + facturarlo al cliente como add-on opt-in.

### Riesgo: PHQ no cubre eventos hyperlocales LATAM
Festivales pequeños comunitarios que generan demand boost no aparecen en PHQ. **Mitigación**: Events Curator interno mantiene catálogo LocalEvent en paralelo. Best of both worlds.

---

## 10. Resumen ejecutivo

**Qué es:** PredictHQ = Google de eventos para hoteleros.

**Cuándo lo usamos:** sprint MARKET-INTEL-PRO (v1.1.1 DLC, Q3-Q4 2026) como opción premium opcional.

**Costo:** $0 sandbox/trial, $200-400/property/mes producción Pro tier.

**Por qué activar trial hoy:** validar cobertura LATAM + familiarizarnos con API + screenshots para sales pitch + 0 costo.

**Decisión tomada 2026-05-22:** Activar trial 14 días ahora. Mifiel sandbox también.

**Próxima acción del owner:** signup en https://www.predicthq.com con email empresarial.

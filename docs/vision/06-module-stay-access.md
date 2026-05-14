# 06 · Zenix Stay + Zenix Access — Identidad y Hardware

> Versión activación: **Stay v1.5 (Q4 2027)**, **Access v1.6 (Q1 2028)**
> Streams: R4 (Stay free), R5 (NFC consumibles), R6 (Access one-time), R7 (Access maintenance)
> App nueva: `apps/guest`

---

## 1. Lectura estratégica conjunta

Stay y Access son dos productos pero **un solo viaje del huésped**:

```
Pre-arrival                     Estadía                          Post-stay
─────────────              ──────────────────              ──────────────
Reserva confirmada    →    Tap NFC en POS                  Feedback in-app
Welcome push          →    Tap NFC en spa                  Reviews antes que TripAdvisor
Check-in online       →    Tap NFC para entrar al cuarto   Loyalty cross-stay
                           (Zenix Access)
                           Charge-to-room sin cash
                           Concierge chat in-app
```

Stay es la **interfaz del huésped**. Access es el **hardware físico de control de acceso**. Sin Stay no hay valor en Access (sería solo una cerradura más). Sin Access, Stay funciona pero le falta la dimensión física del control de acceso.

---

## 2. Zenix Stay — Guest App + NFC

### Estudio de mercado: PouchNation y competidores

**PouchNation** (Singapur, fundada 2014):
- Foco: festivales y resorts asiáticos
- Wristbands NFC para pagos cashless + identificación + acceso
- Modelo: hardware + software + transaction fees (3-5% sobre cashless)
- Clientes hotelería: Club Med, varios resorts en Bali, Tailandia
- **Debilidad:** wristband físico es CAPEX para el hotel ($2-5 USD c/u reusable) + logística (limpieza, pérdida, distribución)

**Competidores adyacentes:**
- **Intelity** (USA): hotel guest app + room controls (no NFC nativo)
- **Mews Guest Journey**: app integrada al PMS
- **OpenKey**: smartphone-as-key white-label
- **Hilton Honors / Marriott Bonvoy**: smartphone-as-key vía BLE (estándar industria 2024+)

### Decisión estratégica: smartphone-first, wristband secundario

| Razón | Smartphone | Wristband |
|-------|-----------|-----------|
| **CAPEX para el hotel** | $0 | $2-5/banda + $300 setup |
| **Logística** | Cero | Limpieza, recolección, reposición |
| **Datos capturados** | Geo dentro hotel, time, push engagement | Solo taps |
| **UX premium** | Wallet pass nativo | Sensación festival, no boutique |
| **Caso de uso especial** | — | Resorts all-inclusive, dorms, eventos |

**Conclusión:** ambos disponibles, smartphone como default. Wristband como SKU adicional para nichos.

### Funcionalidad para el huésped (visible)

| Feature | Función | Valor |
|---------|---------|-------|
| **Pre-arrival flow** | Welcome message, mapa hotel, check-in online | Reduce front-desk time |
| **Smart key** | Door unlock vía BLE + NFC en wallet | Reemplaza key card |
| **Charge to room** | Tap-to-pay en POS, pool bar, spa | Cero fricción cashless |
| **Itinerario** | Reservas spa, restaurant, tours | Engagement durante estadía |
| **Concierge chat** | Mensajería directa con front-desk | NPS+ |
| **Reviews internas** | Feedback durante estadía | Recovery antes de TripAdvisor |
| **Folio en vivo** | Cargos en tiempo real | Transparencia = confianza |
| **Wallet pass** | Apple Wallet / Google Wallet integration | Estándar 2026+ |
| **Loyalty cross-stay** | Puntos entre estadías y propiedades | Retention |

### Datos para ZaharDev (consentidos)

- **País de origen** (capturado en pairing — el dato más valioso para ABI)
- **Movimiento físico dentro del hotel** (mapa de calor por nacionalidad)
- **Consumption pattern** (POS data linkeado a perfil)
- **Time-of-day patterns** ("brasileños cenan tarde vs alemanes temprano")
- **App engagement** (qué features usan más)
- **Push response rates** (cuándo abren notificaciones)

### Apps técnicas

| App | Tech | Función |
|-----|------|---------|
| `apps/guest` | Expo + React Native | App del huésped, branding distinto del staff |
| `apps/api` | NestJS módulo `guest-experience/` | NFC pairing, push management, wallet pass generation |
| **Hardware** | Lectores NFC | En POS, recepción, puerta principal, spa, pool bar |

### Esfuerzo estimado

| Fase | Semanas |
|------|---------|
| UX research + branding | 2 |
| Pre-arrival + check-in online | 2 |
| NFC pairing flow | 2 |
| Tap-to-pay integration con POS | 3 |
| Wallet pass (Apple + Google) | 2 |
| Concierge chat | 2 |
| Reviews + folio en vivo | 1 |
| Testing + UAT | 2 |

**Total: 14-18 semanas** (~4 meses).

---

## 3. Zenix Access — Hardware de Acceso

### Decisión build vs partner

Tres caminos posibles:

| Camino | Costo desarrollo | Margen | Riesgo | Tiempo al mercado |
|--------|------------------|--------|--------|-------------------|
| **A — Build proprietary** | $200K-$500K USD | 50-70% | Alto | 18-24 meses |
| **B — White-label OEM (TTLock/Sciener)** | $30K-$80K USD | 30-50% | Medio | 6-9 meses |
| **C — Partnership Salto/dormakaba/Assa Abloy** | $20K-$50K USD | 15-30% | Bajo | 4-6 meses |

### Recomendación: B en v1.6, migración a A en v2.0+

**Razones:**
- B te lleva al mercado en 6-9 meses con margen razonable
- A se justifica solo con volumen ≥500 cerraduras/año (~$300K revenue mínimo)
- C tiene calidad premium pero margen muy bajo — no escalable
- B permite probar el modelo con riesgo controlado. Si funciona, migrás a A.

### Modelo de negocio del hardware

| Componente | Precio venta | Costo Zenix | Margen |
|------------|-------------|-------------|--------|
| Cerradura mortise NFC + BLE | $180-250 USD c/u | $80-120 USD | 50-60% |
| Gateway por piso (concentrador) | $300-450 USD c/u | $150-200 USD | 45-55% |
| Instalación (incluye electricista) | $80-150 USD por puerta | $40-70 USD (subcontratado) | 40-50% |
| Mantenimiento anual (firmware + RMA) | $30-60 USD/cerradura/año | $10-15 USD | 70-80% |

### Caso real: hotel boutique 30 habitaciones

- **Setup:** 30 × $200 + 3 gateways × $350 + 30 instalaciones × $100 = **$10,050 USD revenue**
- **Maintenance recurring:** 30 × $45 = **$1,350 USD/año**
- **Margen ZaharDev sobre setup:** ~$4,500 (45%)
- **Margen recurring:** ~$1,000/año (75%)

### Funcionalidad

- **Encoding cloud-based** — no encoder en recepción
- **NFC + BLE dual** — funciona con wristband Y smartphone
- **Audit trail per access** — forensic para incidentes (huésped reclama "entraron a mi cuarto")
- **Battery monitoring** — alertas proactivas cuando batería <20%
- **Master key emergency** — staff de emergencia con key física + override audit
- **Time-bound access** — code expira al checkout automático

### Riesgo crítico: capital de trabajo

Hardware requiere inventario. Para vender 100 cerraduras necesitas comprar 100 antes ($8K-12K USD CAPEX).

**Mitigación inicial (v1.6):**
- Modelo pre-orden con anticipo 50%
- Tiempo de entrega 6-8 semanas factory → hotel
- Aceptable para boutique LATAM (no all-inclusive resort que necesita instant deployment)

**Cuando v1.7+ y volumen ≥100 cerraduras/mes:**
- Línea de crédito comercial
- Inventario buffer en bodega regional (México DF, Bogotá)
- Programa de financiamiento al hotel (pago en 12-24 meses)

### Apps técnicas

| App | Tech | Función |
|-----|------|---------|
| `apps/api` | NestJS módulo `access/` | Lock provisioning, audit trail, TTLock SDK integration |
| `apps/guest` (existing from Stay) | Expo + BLE library | App del huésped abre puerta |
| `apps/web` | React | Configuración locks + reports forensic |
| `apps/mobile` (existing staff) | Expo | Master key flow para staff |

### Integraciones cruzadas

- **Con Stay:** smartphone NFC pairing = key del cuarto. Sin Stay, Access no tiene valor para huésped.
- **Con PMS:** check-out automático invalida key. Cancelación de estadía invalida key inmediato.
- **Con People:** staff con role `MAINTENANCE` o `HOUSEKEEPING` tiene master key time-bound.
- **Con Books:** mantenimiento anual genera invoice recurrente automático.

---

## 4. Integración Stay ↔ Access (el caso de uso completo)

```
1. Huésped reserva via Booking.com
2. Booking → Channex → Zenix PMS crea GuestStay
3. Email confirmación incluye link a Zenix Stay app
4. Huésped descarga app, ingresa booking ref
5. Pre-arrival: completa check-in online, sube documento, acepta T&C (consent legal)
6. App captura nacionalidad, idioma preferido, preferencias
7. Al llegar: el hotel ya sabe quién es. Front-desk solo entrega NFC wallet pass (smartphone).
8. Huésped tap en cerradura → entra al cuarto
9. Tap en bar → cocktail charged to room
10. Tap en spa → masaje charged to room
11. Folio se va llenando, huésped lo ve en vivo en app
12. Checkout: huésped paga en app o front-desk procesa
13. Key NFC expira automático
14. Reviews internas se piden al cierre de estadía
15. Datos anonimizados van a ZaharDev BI para insights
```

**Este flujo NO es posible hoy en Mews, Cloudbeds, ni Opera entry-level.** Mews tiene partes (Guest Journey + locks vía partners). Cloudbeds tiene parts (Apaleo integration). Ninguno tiene el stack vertical con cerradura propia.

---

## 5. Bitácora de revisiones

- **2026-05-13** — Documento creado. Stay y Access consolidados como flujo unificado del huésped. Decisión white-label OEM en v1.6, build propio en v2.0+.

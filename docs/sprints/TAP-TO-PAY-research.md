# Tap to Pay — Estudio de mercado profesional para Zenix

> **Tipo:** Research / Market study (no implementación)
> **Fecha:** 2026-05-18
> **Objetivo:** Determinar si Zenix debe sustituir/complementar terminales POS físicas con NFC del smartphone como método de cobro
> **Conclusión preview:** **Sí, con timing excepcional.** México habilitó Tap to Pay on iPhone el **24 marzo 2026** (hace 2 meses). Stripe Terminal SDK soporta React Native — compatible directamente con Zenix mobile app Expo.

---

## 1. Resumen ejecutivo

**Tap to Pay** = convertir un smartphone (iPhone/Android) en una terminal de pago contactless usando solo NFC del propio teléfono. **Cero hardware adicional.** El cliente acerca su tarjeta/Apple Pay/Google Pay al teléfono del cobrador y el pago se procesa.

### El timing es estratégicamente perfecto para Zenix

- **Marzo 2024:** Brasil habilitó Tap to Pay on iPhone (1er país LATAM)
- **2025:** Chile habilitó
- **24 marzo 2026:** México habilitó (Apple Pay + iPhone XS+) — **Mexico es el target primary de Zenix**
- **Enero 2026:** Clip habilitó Tap to Pay on **Android** en México (más penetración que iPhone)

México pasó de **"no se puede"** a **"tres soluciones competitivas"** en 60 días: Stripe, Clip, Mercado Pago + Adyen + Visa Acceptance Platform.

### Para Zenix esto significa

Hoy el sub-módulo **E (Card payments)** de PAY-CORE asume terminal físico via Stripe Terminal con hardware Bluetooth (~$200-400 USD/unidad + comisión). Con Tap to Pay, ese requisito desaparece:

| Hoy (sin Tap to Pay) | Con Tap to Pay |
|----------------------|----------------|
| Hotel compra terminal Stripe/Conekta físico ($300-900 USD) | $0 hardware — usa el smartphone que ya tienen |
| Hotel necesita 1 terminal en recepción | Cualquier staff con app Zenix mobile cobra desde cualquier punto |
| Si terminal se rompe, recepción no cobra | Si un teléfono falla, agarra otro |
| Check-in en recepción solamente | Check-in en lobby / cuarto / piscina / restaurante |
| 1 cobro a la vez (1 terminal) | Concurrencia ilimitada (cada staff su teléfono) |

**Ahorro CAPEX por hotel:** $300-900 USD. **Velocidad operativa:** check-in roaming desde cualquier punto del hotel.

---

## 2. Disponibilidad por geografía (target Zenix LATAM)

### México (target primary) — **DISPONIBLE marzo 2026**

| Provider | iPhone | Android | Comisión típica |
|----------|--------|---------|----------------|
| **Stripe** | ✅ Live | ✅ Live | 3.6% + $3 MXN |
| **Clip** | ✅ Live | ✅ Live (jan 2026) | 3.6% + IVA |
| **Mercado Pago** | ✅ Live | ✅ Live | 3.49% sin IVA |
| **Adyen** | ✅ Live | ✅ Live | Negociable enterprise |
| **Visa Acceptance Platform** | ✅ Live | ⚠️ | Custom |

### Otros países LATAM target

| País | Estado Tap to Pay iPhone | Notas |
|------|--------------------------|-------|
| 🇧🇷 Brasil | ✅ Marzo 2024 | Primer país LATAM. Stripe + Cielo + Stone |
| 🇨🇱 Chile | ✅ 2025 | Stripe + Transbank |
| 🇲🇽 México | ✅ Marzo 2026 | Recién — perfect timing |
| 🇨🇴 Colombia | ⏳ 2026-2027 esperado | Apple no ha confirmado |
| 🇵🇪 Perú | ⏳ 2027+ | Aún no |
| 🇦🇷 Argentina | ⏳ 2027+ | Mercado Pago lo empuja |
| 🇨🇷 Costa Rica | ❌ No | Mercado pequeño |
| 🇸🇻 El Salvador | ❌ No | Pero adoptaron Bitcoin (caso aparte) |

**Implicación:** v1.0.1 PAY-CORE puede arrancar Tap to Pay para **3 países primary** (MX/BR/CL) = ~80% del mercado target Zenix. Para CO/PE/AR/CR/SV mantener terminal física tradicional como fallback hasta que Apple/Google habiliten.

---

## 3. Stack técnico — Compatible 100% con Zenix

### Stripe Terminal SDK (recomendado)

| Plataforma | SDK soporte | Compatibilidad Zenix |
|------------|-------------|----------------------|
| iOS native (Swift) | ✅ Terminal iOS SDK | N/A — Zenix mobile es React Native |
| Android native (Kotlin) | ✅ Terminal Android SDK | N/A |
| **React Native** | ✅ `@stripe/stripe-terminal-react-native` | ✅ **DIRECTO — apps/mobile usa Expo + RN** |

### Requirements técnicos

**iPhone:**
- Modelo: iPhone XS o posterior (lanzado 2018+) — incluye toda la base actual instalada
- iOS: 16.4 o superior para PIN entry, 15.4+ para básico
- NFC integrado (todos los iPhones lo tienen desde iPhone 6)
- No requiere accesorios

**Android:**
- Versión: Android 10 o superior
- Google Mobile Services certified
- NFC chip integrado
- Lista compatible Google publicada (la mayoría de phones >$200 USD)

### Métodos de pago aceptados via Tap to Pay

| Método | Soporte |
|--------|---------|
| Visa contactless | ✅ |
| Mastercard contactless | ✅ |
| American Express contactless | ✅ |
| Discover contactless | ✅ |
| Apple Pay (wallet) | ✅ |
| Google Pay (wallet) | ✅ |
| Samsung Pay | ✅ |
| QR-based payments (algunas variantes) | ✅ |

**NO soporta** (limitación técnica):
- Tarjetas con chip que NO tienen contactless (cada vez menos en MX, mayoría >2019 sí tienen)
- Magstripe (banda magnética) — pero estas YA están deprecating globalmente

### Para Zenix mobile (Expo + RN)

```
apps/mobile/
├── package.json
│   └── @stripe/stripe-terminal-react-native
├── src/
│   ├── payments/
│   │   ├── TapToPayService.ts       ← wrapper del SDK
│   │   ├── ChargeButton.tsx         ← componente UI
│   │   └── PaymentFlow.tsx          ← flow completo
```

**No requiere eject de Expo** (verificar — Stripe published un Expo config plugin desde 2025).

---

## 4. Comparativa vs terminal física tradicional

### Para un hotel boutique 30 cuartos

| Dimensión | Terminal Stripe físico BBPOS | Tap to Pay iPhone Zenix mobile |
|-----------|------------------------------|-------------------------------|
| **CAPEX** | $349 USD/terminal × 2 terminales = $698 | $0 (smartphone ya tiene staff) |
| **Comisión por transacción** | 2.9% + $0.30 USD | **Misma** 2.9-3.6% — no hay penalty |
| **Tiempo de setup** | 1-2 días (pedido + envío + config) | 10 min (descargar SDK + activar en dashboard Stripe) |
| **Conectividad** | Bluetooth con phone/tablet + WiFi | Solo necesita internet del phone (4G OK) |
| **Cobro fuera de recepción** | ❌ Si la terminal queda en recepción | ✅ Cualquier staff cobra desde cualquier punto |
| **Múltiples cobros simultáneos** | ❌ 1 terminal = 1 cobro | ✅ N teléfonos = N cobros simultáneos |
| **Si se rompe el hardware** | Hotel sin cobrar mientras llega reemplazo (3-5 días envío) | Otro staff con su teléfono asume |
| **PIN entry** | ✅ Hardware nativo | ✅ Pantalla del iPhone (iOS 16.4+) |
| **Recibo impreso** | ✅ Algunos modelos | ❌ Solo digital (email/WhatsApp) |
| **EMV certification** | ✅ Stripe certifica el hardware | ✅ Apple/Google certifican los teléfonos directamente |
| **Risk profile** | Hardware se puede tampering | Lower — Secure Enclave del iPhone es más seguro |

### TCO 3 años (mismo hotel)

| Concepto | Terminal física | Tap to Pay |
|----------|-----------------|------------|
| Hardware año 1 | $700 | $0 |
| Hardware reposición año 2-3 (5% failure rate) | $35 | $0 |
| Comisión transacciones (asume $300k revenue/año, 70% tarjeta) | $18,000 | $18,000 |
| Cobros perdidos por terminal rota (2-3 días/año) | $1,500 | $0 |
| **TOTAL 3 años** | **$55,235** | **$54,000** |
| **Diferencia** | — | **-$1,235** + flexibilidad operativa |

El ahorro monetario es **modesto** ($1,235 / 3 años). Lo verdaderamente importante es la **flexibilidad operativa** y la **velocidad de check-in**.

---

## 5. Casos de uso específicos hotel con Tap to Pay

### Caso 1 — Check-in roaming en lobby/piscina/bar

**Hoy:** guest llega a recepción cargando maletas, espera fila, recepcionista busca terminal, cobra, da llave.

**Con Tap to Pay:** staff con tablet abre Zenix mobile → busca al guest → escanea documento → cobra acercando su tarjeta al iPad → da llave digital. **Ubicación:** donde sea (lobby con sofás, piscina, restaurante de bienvenida).

**Ganancia:** check-in baja de 8-12 min a 3-4 min. NN/g research: tiempo de check-in es predictor #2 de satisfacción del huésped (después de cleanliness).

### Caso 2 — Restaurante / bar tableside (futuro POS module v1.3)

**Hoy:** mesero apunta orden → va a caja → imprime cuenta → la lleva → guest paga con tarjeta → mesero camina otra vez a la caja.

**Con Tap to Pay:** mesero con celular → presenta cuenta digital → guest acerca tarjeta → DONE. Ahorra ~5 min por mesa, mejora propinas 8-15% (US restaurant data 2024).

### Caso 3 — Cobro de incidentales al checkout en el cuarto

**Hoy:** guest se va, recepcionista revisa minibar, manda staff a cobrar, guest ya no está → call center cobra después → chargebacks frecuentes.

**Con Tap to Pay:** housekeeping con tablet hace inspección en el cuarto → confirma cargos → guest presenta tarjeta antes de bajar maletas → cobrado inmediato.

### Caso 4 — Pre-authorization (deposit hold)

**Hoy:** guest llega → recepcionista lee número de tarjeta a mano → hace authorization en terminal POS → guarda copia escrita del número (security risk).

**Con Tap to Pay:** guest acerca tarjeta → Zenix mobile envía a Stripe → `payment_intent` con `capture_method='manual'` → hold de $500 USD por 7 días → al checkout captura solo lo necesario o libera.

### Caso 5 — Cobro pago dividido entre huéspedes

**Hoy:** cuenta $3,000 MXN, 3 amigos quieren dividir. Recepcionista debe pasar la terminal 3 veces.

**Con Tap to Pay:** Zenix mobile divide automático en 3 cargos → presenta al guest A → tap → guest B → tap → guest C → tap. Tiempo total <2 min vs ~6 min con terminal física.

### Caso 6 — Cobro en lobby de eventos (bodas, grupos)

**Hoy:** evento de 50 personas, recepción no se da abasto.

**Con Tap to Pay:** 5 staff con tablets distribuidos → 10 huéspedes en cola por staff → check-in paralelo. Throughput 5x.

### Caso 7 — Refund inmediato si guest reclama

**Hoy:** error de cobro → recepcionista pide a contabilidad → contabilidad procesa Stripe dashboard → guest espera 3-5 días para ver el refund en su statement.

**Con Tap to Pay + Zenix:** error detectado → `voidPayment` o `refund` directo desde la app → guest recibe email confirmación inmediato → 1-2 días para reflejar en statement.

---

## 6. Limitaciones + riesgos técnicos

### Limitaciones específicas

| Limitación | Impacto | Workaround |
|------------|---------|-----------|
| Solo tarjetas con contactless | ~5% tarjetas en MX aún sin chip NFC | Mantener terminal física como fallback OR pedir wallet (Apple/Google Pay) |
| Sin recibo impreso | Algunos guests insisten en papel | Email + WhatsApp + opcional printer Bluetooth (~$80 USD) |
| Requiere iPhone XS+ o Android 10+ | Staff con teléfonos viejos | Dotación corporativa de tablets ~$300 USD c/u (amortiza vs terminal en 1 año) |
| Internet dependiente | Si cae 4G/WiFi, no se puede cobrar | Modo offline → cache → sync cuando vuelva (Stripe Terminal SDK lo soporta) |
| PIN entry solo iOS 16.4+ | Algunas tarjetas en LATAM piden PIN | Verificar % real (en MX la mayoría tap-only ahora) |
| Por país solo (Stripe geo-restriction) | Si hotel cliente está en CO antes de Apple habilitar | Terminal física hasta que Apple LATAM expand |

### Riesgos de seguridad (todos mitigados)

| Riesgo | Mitigación nativa Apple/Google |
|--------|-------------------------------|
| Skimming del NFC | Apple Secure Enclave aísla datos. Tarjeta NUNCA está unencrypted en software |
| Compromiso del phone del staff | Si phone se pierde, dashboard Stripe permite revocar acceso instant |
| Doble cobro accidental | SDK valida con haptic feedback + sound + idempotency keys |
| Phishing (fake Zenix app) | Apple/Google solo permiten apps firmadas con MerchantID validado por Apple/Google |

### PCI Compliance

**Buenas noticias:** con Tap to Pay **el hotel NO maneja PCI scope** porque los datos sensibles de la tarjeta nunca tocan la app Zenix. Pasan directo del NFC del iPhone al Secure Enclave → Stripe (que es PCI DSS Level 1).

Hotel queda en **PCI SAQ-A** (más fácil de mantener) en lugar de SAQ-D (terminal física integrada).

### Limitaciones operativas

- **Necesita un teléfono prestado al guest** si el guest quiere ver el monto. UX: tablet con pantalla amplia funciona mejor que iPhone (ver montos con calma)
- **Cobertura legal LATAM:** algunos países (CR, BO) tienen regulación local que aún no contempla "phone as terminal" — verificar con abogado local antes de activar
- **Capacitación del staff:** debe ser intuitiva pero requiere 30 min entrenamiento + práctica supervisada primer turno

---

## 7. Comparativa de proveedores (México target)

| Proveedor | Pros | Cons | Recomendación Zenix |
|-----------|------|------|---------------------|
| **Stripe** | ✅ React Native SDK oficial + Expo plugin + ya integrado al plan PAY-CORE + global • Excellent docs + sandbox | 3.6% comisión MX (alto) • Settlement en MXN puede tardar 2 días | **⭐ Primary recomendado** — Compatible Zenix mobile sin refactor |
| **Clip** | ✅ Local MX expertise • Soporte en español • Comisiones competitivas (2.9-3.6%) | Sin SDK React Native oficial — solo iOS/Android native | Plan B / fallback nacional |
| **Mercado Pago** | ✅ Penetración masiva LATAM • Comisión 3.49% sin IVA | SDK orientado a marketplace, no terminal específico | Solo si cliente lo pide |
| **Adyen** | ✅ Enterprise grade • Multi-país LATAM | Comisión negociable solo enterprise $$$ • Setup complejo | Cuando Zenix tenga clientes cadena 10+ properties |
| **Visa Acceptance Platform** | ✅ Direct Visa | Beta — features missing | Esperar madurez 2027 |

### Decisión técnica recomendada

**Primary:** Stripe Terminal RN SDK (mismo gateway que ya está en PAY-CORE plan)
**Fallback:** Conekta para clientes MX que prefieran procesador local
**Multi-country:** Stripe para todo LATAM donde Tap to Pay esté disponible

Razón: **Stripe Terminal SDK soporta nativamente React Native** y Zenix mobile es Expo + React Native. **Zero refactor del stack actual.**

---

## 8. Impacto en arquitectura PAY-CORE

### Cambios al plan v1.0.1 PAY-CORE

El sub-módulo **E (Card payments — Stripe + Conekta)** debe expandirse para incluir:

```diff
+ Tap to Pay como método primary
+ Terminal físico como fallback opcional
+ Detección automática de capacidad del device del staff
+ Cobros desde mobile app (no solo desktop)
```

### Nuevo campo en `Staff` model

```prisma
model Staff {
  // ... existing fields ...
  // Sprint PAY-CORE: capacidad de cobrar desde su device
  canAcceptTapToPay   Boolean  @default(false)
  /// Device ID asociado para sesión Tap to Pay activa
  tapToPayLocationId  String?  // Stripe Location ID donde el device está autorizado
}
```

### Nuevo flujo

```
Mobile app Zenix:
1. Staff abre payment flow
2. App detecta: ¿este device soporta Tap to Pay? (Stripe SDK call)
3. SI: muestra "Acerca la tarjeta" + animación NFC
4. NO: pide terminal Bluetooth físico O confirma desktop POS
5. Customer tap → SDK procesa → response inmediato
6. Resultado → PaymentLog + audit + receipt email/WhatsApp
```

### No requiere agregar al schema de PaymentLog

El `PaymentMethod` enum ya tiene `CARD_TERMINAL` que cubre ambos casos. El cambio es solo en la implementación cliente. Backend ve "card payment via Stripe" indistintamente.

### Impacto en costo PAY-CORE estimate

| Sub-módulo | Estimado original | Con Tap to Pay |
|------------|-------------------|----------------|
| E - Card payments | 1.5 semanas | **2 semanas** (+0.5 sem para integrar SDK RN + UX mobile) |
| Total PAY-CORE | 9.5 sem | **10 sem** (impacto mínimo) |

---

## 8.5. Conexión con modelo de comisión Zenix Marketplace

Cuando el cobro proviene del **Booking Engine** (`book.zenix.com/{slug}`), no de cobro en recepción:

- Si attribution es **Tier 1 (referral del hotel)** → Stripe estándar deposita 100% al hotel
- Si attribution es **Tier 2 (Zenix Marketplace)** → **Stripe Connect** divide automáticamente:
  - 97% al merchant account del hotel
  - 3% al merchant account de Zenix
  - Cero reconciliación manual; mismo pattern Uber/Airbnb/Shopify

El sub-módulo E (Card payments) expande para soportar Stripe Connect además de Stripe estándar:

```
PAY-CORE E ahora incluye:
  • Stripe estándar (cobro recepción Tap to Pay) ← Pattern A del docs
  • Stripe Connect (booking engine marketplace) ← Pattern B + commission
  • Conekta (fallback MX)
```

Ver detalle en [`COMMISSION-MODEL-plan.md`](COMMISSION-MODEL-plan.md).

---

## 9. Recomendación final para Zenix

### Adoptar — alta confianza

✅ **Integrar Tap to Pay como método primary en PAY-CORE v1.0.1** para MX/BR/CL (target primary). Terminal física queda como **fallback opcional**.

### Razones

1. **Timing único:** México habilitó hace 2 meses. Ser de los primeros PMS LATAM en ofrecerlo = diferencial competitivo de 12-18 meses antes que Mews/Cloudbeds lo prioricen (su market primary es US/EU).
2. **Stack compatible 100%:** Stripe Terminal SDK soporta React Native (Zenix mobile usa Expo + RN). Zero refactor.
3. **Ahorro CAPEX para hoteles:** $300-900 USD/property no comprar terminales.
4. **Flexibilidad operativa:** check-in en lobby/piscina/cuarto vs solo en recepción.
5. **Lower PCI scope:** SAQ-A vs SAQ-D — menos compliance burden para customers.
6. **Mismo nivel de seguridad** (Secure Enclave Apple) o más alto que terminales físicas.

### NO adoptar como ÚNICO método

❌ Mantener terminal física Stripe BBPOS como **opcional** para customers que:
- Tengan tarjetas sin contactless (5% mercado MX, mayor en países sin habilitación aún)
- Prefieran recibo impreso siempre (algunos huéspedes mayores)
- Operen en países donde Apple/Google aún no habilitan (CO, PE, AR, CR, SV)

### Posicionamiento comercial sugerido

> **"Zenix Pay — cobra desde el teléfono, sin terminales."**
>
> Mientras Cloudbeds y Mews todavía requieren terminales BBPOS de $300-900 por punto de venta, Zenix activa cobros NFC desde cualquier iPhone o Android Google-certified. Check-in en el lobby, en la piscina, o en el cuarto. Zero hardware. Same security. **Disponible en MX/BR/CL hoy, expandiendo a más LATAM en 2026-2027.**

### Plan de adopción concreto

**Fase A (durante v1.0.1 PAY-CORE):** Implementar Tap to Pay como **primary** para MX/BR/CL. Terminal física como fallback opcional. +0.5 sem al estimate de PAY-CORE.

**Fase B (v1.0.2 / v1.0.3):** Capacitación operativa + onboarding kit para hoteles (videos cómo cobrar con iPhone, troubleshooting Wi-Fi, etc).

**Fase C (v1.1.x):** Cuando Apple habilite en CO/PE/AR, activar automáticamente — el SDK ya estará integrado.

---

## 10. Próximos pasos accionables (sin código aún)

### Antes de empezar PAY-CORE v1.0.1

1. **Crear cuenta Stripe Atlas** para Zenix (no Hotel cliente) y aplicar a **Stripe Terminal Connect** — proceso de approval para usar el SDK en producción
2. **Comprar 1 iPhone XS+ usado** (~$200 USD) o iPad de prueba para development
3. **Sandbox test:** instalar SDK React Native en `apps/mobile/`, hacer 1 transacción de $1 USD test card → ver flow end-to-end
4. **Verificar compatibilidad Expo:** confirmar que el plugin oficial de Stripe Terminal RN no requiere eject de Expo
5. **Consultar abogado Cuauhtemoc Tulum:** confirma que en Quintana Roo no hay regulación local que limite "phone as terminal" (debería estar OK porque Clip y Mercado Pago ya operan)

### Durante PAY-CORE

6. Activar Tap to Pay en cuenta Stripe Zenix → asociar Stripe Location ID por property
7. Implementar UX mobile (botón "Cobrar con tap", animation NFC, success state, receipt flow)
8. Capacitación interna del equipo Zenix sobre el flow para soporte
9. Beta cerrada con Hotel Monica Tulum como property piloto

### Post-launch

10. Métricas dashboard: % cobros via Tap to Pay vs terminal vs efectivo, throughput check-in pre/post, NPS guest
11. Caso de estudio + video testimonial del piloto para marketing

---

## Sources (research consultado)

- [Stripe Tap to Pay documentation oficial](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay)
- [Stripe Tap to Pay on iPhone hospitality](https://stripe.com/terminal/tap-to-pay-on-iphone)
- [Stripe launches Tap to Pay on Android — newsroom](https://stripe.com/newsroom/news/tap-to-pay-android)
- [Mexico News Daily — iPhone Tap to Pay lanzamiento](https://mexiconewsdaily.com/news/iphone-tap-to-pay-mexico-digital-payment/)
- [Cronista — Mercado Pago Tap to Pay México](https://www.cronista.com/mexico/finanzas-economia/mercado-pago-va-por-el-tap-to-pay-la-nueva-funcion-que-sacude-la-competencia-con-clip-y-bbva/)
- [Clip Tap to Pay solution announcement](https://www.payclip.com/press-releases-list/clip-unveils-its-new-tap-to-pay-solution)
- [WebProNews — Apple's Latin America payments strategy](https://www.webpronews.com/apples-quiet-conquest-how-tap-to-pay-on-iphone-is-reshaping-small-business-payments-across-latin-america/)
- [PCI EMV Compliance Chip Card Requirements](https://www.pcicompliance.com/pci-emv/)
- [PCI DSS compliance — Stripe guide](https://stripe.com/guides/pci-compliance)
- [Hotel Payment Processing PMS Integration — CoastalPay](https://www.coastalpay.com/hotel/)
- [Mews Payment Terminals — comparativa](https://www.mews.com/en/products/terminals)
- [Cloudbeds Payments custom-built hotel system](https://www.cloudbeds.com/payments/)
- [10 Best Hotel Payment Processing 2026 — RoomMaster](https://www.roommaster.com/blog/hotel-payment-processing-software)

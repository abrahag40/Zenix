# Módulo 5 — Folio, cargos y pagos (PCI-DSS)

> 3 lessons · ~3 horas estimadas · Bloom: APLICAR + EVALUAR · objetivo: el aprendiz **gestiona** el folio del huésped, **aplica** los principios PCI-DSS de seguridad de tarjetas, y **maneja** correctamente OTA-collect, arqueo de caja y efectivo multi-divisa.
> **Última actualización:** 2026-05-22 (Día 9 producción Fase 1.3)
>
> *Disclaimer: Curso ALINEADO al estándar AHLEI CFDR. NO emite certificación AHLEI oficial. Comprobante Zenix Learning interno alineado al estándar citado.*

---

## Lesson 5.1 — El error común: leer en voz alta el número de tarjeta (violación PCI)

```yaml
id: lesson-5-1-leer-tarjeta-voz-alta-pci
module: module-5-folio-cargos-pagos
order: 1
estimatedMinutes: 30
bloomLevel: COMPRENDER
tags: [pci-dss, seguridad-tarjeta, fraude, datos-pago]
sources: [4.2.6, 4.2.7]
```

### Hook — El error común

Escena cotidiana en recepción:

> *Recepcionista (en voz alta, frente a otros huéspedes en fila): "A ver, su tarjeta es 4521 8834 ... espéreme ... 2290 1145, vencimiento 08/27, código de seguridad 332. ¿Verdad?"*

Este momento — leer en voz alta el número completo de tarjeta + fecha + CVV frente a otras personas + posiblemente anotarlo en un papel — es una **violación directa de PCI-DSS** y una de las causas principales de fraude de tarjetas en hotelería. Cualquier persona en la fila (o una cámara, o un cómplice) acaba de capturar todos los datos necesarios para clonar esa tarjeta.

El error común es no entender que los **datos de tarjetas son información altamente regulada**. PCI-DSS (Payment Card Industry Data Security Standard) establece reglas estrictas sobre cómo se manejan. Violarlas expone al hotel a multas, pérdida de la capacidad de procesar tarjetas, y responsabilidad legal por fraude.

### Evidencia — qué dice el estándar

**PCI-DSS (Payment Card Industry Data Security Standard) — principios clave para recepción:**

| Regla | Qué significa para recepción |
|-------|------------------------------|
| **NO leer datos en voz alta** | Nunca verbalizar número completo, fecha o CVV donde otros puedan oír |
| **NO almacenar el CVV** | El código de seguridad (3-4 dígitos) NUNCA se guarda, ni en papel ni en sistema |
| **NO escribir el PAN completo en papel** | El número completo de tarjeta (PAN) no se anota en notas, post-its, libretas |
| **Enmascaramiento** | En sistemas + recibos, mostrar solo últimos 4 dígitos (****1145) |
| **Acceso restringido** | Solo personal autorizado maneja datos de tarjetas |
| **Transmisión segura** | Datos de tarjeta solo por canales encriptados, nunca por email/WhatsApp |

**Qué es el PAN, CVV y por qué importan:**

- **PAN (Primary Account Number):** el número completo de 15-16 dígitos. Enmascarar siempre (mostrar solo ****1145).
- **CVV/CVC (Card Verification Value):** el código de 3-4 dígitos. **NUNCA se almacena** — solo se usa en el momento de la transacción y se descarta.
- **Fecha de vencimiento:** sensible, manejar con cuidado.

**Por qué hotelería es blanco frecuente de fraude de tarjetas:**

1. Alta rotación de transacciones con tarjeta
2. Personal con acceso a datos de pago
3. Reservas remotas (teléfono, email) donde se transmiten datos
4. Pre-autorizaciones por incidentales
5. Histórico de brechas documentadas (cadenas hoteleras grandes han sufrido brechas masivas)

**Consecuencias de violar PCI-DSS:**

- Multas de las marcas de tarjetas (Visa, Mastercard) al hotel
- Pérdida de la capacidad de procesar tarjetas (catastrófico para el negocio)
- Responsabilidad legal por fraude derivado de la negligencia
- Daño reputacional si hay brecha pública

### Aplicación práctica — Hoy mismo en tu turno

1. **NUNCA leas en voz alta** el número completo, fecha o CVV. Si necesitas confirmar, pide al huésped que lo verifique él, o usa el terminal directamente.
2. **NUNCA anotes el número completo de tarjeta en papel.** Ni en post-its, ni en libretas, ni "temporal". El CVV NUNCA se escribe ni guarda.
3. **Usa el terminal de pago directamente** — inserta/tap la tarjeta, no transcribas el número manualmente cuando sea evitable.
4. **En recibos + sistema, verifica el enmascaramiento:** solo deben mostrarse los últimos 4 dígitos (****1145).
5. **NUNCA recibas ni envíes datos de tarjeta por WhatsApp, email o SMS.** Si un huésped quiere dar su tarjeta remotamente, usa un canal seguro (link de pago, terminal telefónico autorizado).

### Consecuencia verificable

**Caso documentado (brecha PCI en hotelería):** un hotel boutique tenía la práctica de anotar los datos completos de tarjeta en una libreta "para procesar después" las reservas telefónicas. Un empleado deshonesto copió los datos de ~40 tarjetas durante 2 meses y los vendió.

**Consecuencias:**
- 40 huéspedes con cargos fraudulentos en sus tarjetas
- Investigación de las marcas de tarjetas → multa al hotel
- **Pérdida temporal de la capacidad de procesar tarjetas** (3 semanas) → solo efectivo → caída drástica de revenue
- Demandas civiles de huéspedes afectados
- Daño reputacional (el caso se hizo público)
- Costo total estimado: >$800,000 MXN entre multas, demandas, pérdida de revenue

**La causa raíz:** la violación PCI-DSS de anotar PAN + CVV completos en papel. Si el hotel hubiera seguido PCI-DSS (nunca anotar, usar terminal o link de pago seguro), el empleado deshonesto NO habría tenido acceso a los datos.

**Lección operativa:** PCI-DSS no es burocracia — es protección contra fraude que puede costar la capacidad de operar. Nunca leer en voz alta, nunca anotar, nunca almacenar el CVV.

### Knowledge check

**1. Un huésped da su tarjeta para garantizar la reserva. ¿Cómo confirmas el número correctamente?**

- a) Lo lees en voz alta y le preguntas si es correcto
- b) Lo anotas en una libreta para procesarlo después
- c) ✅ Usas el terminal directamente o pides al huésped que verifique él mismo — NUNCA verbalizas el número completo ni el CVV
- d) Lo guardas en una nota del sistema

> *Explicación:* PCI-DSS prohíbe leer datos de tarjeta en voz alta (otros pueden oír/grabar) + anotar el PAN completo + almacenar el CVV. Lo correcto es usar el terminal directamente o que el huésped verifique. Fuente: PCI-DSS v4.0.

**2. ¿Cuál dato de la tarjeta NUNCA debe almacenarse (ni en papel ni en sistema)?**

- a) Los últimos 4 dígitos
- b) El nombre del titular
- c) ✅ El CVV/CVC (código de seguridad de 3-4 dígitos)
- d) La fecha de vencimiento

> *Explicación:* PCI-DSS prohíbe absolutamente almacenar el CVV/CVC después de la transacción. Se usa solo en el momento del cobro y se descarta. El PAN completo se enmascara (solo últimos 4 dígitos visibles). El CVV NUNCA se guarda. Fuente: PCI-DSS v4.0.

**3. Un huésped quiere dar su número de tarjeta por WhatsApp para una reserva. ¿Acción correcta?**

- a) Aceptarlo, es práctico
- b) Pedirle que lo mande por email mejor
- c) ✅ Rechazar el canal inseguro + ofrecer un canal seguro (link de pago, terminal telefónico autorizado) — datos de tarjeta NUNCA por WhatsApp/email/SMS
- d) Aceptarlo y borrar el mensaje después

> *Explicación:* WhatsApp, email y SMS NO son canales seguros para datos de tarjeta (PCI-DSS exige transmisión encriptada). Borrar el mensaje no resuelve (ya viajó sin encriptar + queda en servidores). Lo correcto es ofrecer un canal seguro: link de pago o terminal telefónico autorizado. Fuente: PCI-DSS v4.0.

---

## Lesson 5.2 — El folio + posting de cargos + métodos de pago + PCI-DSS básicos

```yaml
id: lesson-5-2-folio-posting-cargos-metodos-pago
module: module-5-folio-cargos-pagos
order: 2
estimatedMinutes: 75
bloomLevel: APLICAR
tags: [folio, posting, metodos-pago, balance, pre-autorizacion]
sources: [4.1.1, 4.2.6, 4.3.8]
```

### Hook — El error común

> *"El huésped consumió del minibar pero se me olvidó cargarlo, total son $80, ni modo."*

Los cargos no posteados — "se me olvidó", "es poco", "lo cargo luego" — son revenue que se evapora. Un cargo de minibar de $80 no posteado, multiplicado por decenas de huéspedes al mes, son miles de pesos de revenue perdido. Y peor: cuando el cargo se "recuerda" después del check-out, ya no se puede cobrar fácilmente + genera disputas.

El error común es no entender el **folio como registro financiero riguroso**. Cada consumo del huésped debe postearse al folio en tiempo real. El folio es la cuenta del huésped — su precisión determina si el hotel cobra todo lo que vendió y si el huésped confía en su cuenta final.

### Evidencia — qué dice el estándar

**El folio (guest account):**

> *"El folio es el registro de todos los cargos y pagos asociados a la estadía de un huésped. Cada transacción (habitación, consumos, servicios, pagos) se registra (postea) al folio en tiempo real. El balance del folio refleja lo que el huésped debe (positivo) o tiene a favor (negativo)."* (AHLEI)

**Componentes del folio:**

| Tipo de línea | Ejemplo | Efecto en balance |
|---------------|---------|-------------------|
| **Cargo de habitación** | $1,500/noche × 3 noches = $4,500 | Aumenta lo que debe |
| **Cargos adicionales** | Minibar $80, restaurante $350, spa $600 | Aumenta lo que debe |
| **Impuestos** | IVA + ISH sobre los cargos | Aumenta lo que debe |
| **Pagos** | Tarjeta $3,000, efectivo $2,000 | Reduce lo que debe |
| **Ajustes/cortesías** | Descuento, compensación, COMP | Reduce lo que debe |
| **Balance** | Diferencia entre cargos y pagos | Lo que falta cobrar (o crédito a favor) |

**El "posting" (registro de cargos):**

- Cada consumo se postea al folio **en tiempo real** (no "luego")
- El posting debe ser preciso (monto correcto, huésped correcto, fecha correcta)
- Los cargos sin postear = revenue perdido + disputas posteriores

**Métodos de pago (naturaleza del pago):**

| Método | Características |
|--------|----------------|
| **Efectivo (cash)** | Requiere arqueo de caja, manejo de cambio, multi-divisa |
| **Tarjeta (terminal)** | Pre-autorización + cobro, requiere PCI-DSS, comprobante con auth code |
| **Transferencia bancaria** | Requiere referencia + comprobante |
| **Tarjeta virtual OTA** | Para reservas OTA-collect, se cobra a la tarjeta de la OTA |
| **Cortesía/COMP** | Cargo $0 que requiere aprobación + razón documentada |

**Pre-autorización (hold) para incidentales:**

En el check-in, se suele hacer una **pre-autorización** de la tarjeta del huésped para cubrir posibles incidentales (minibar, daños). Esto NO es un cobro — es un "hold" temporal de fondos. Se libera o se convierte en cobro al check-out. El huésped debe entender que verá un "hold" en su tarjeta.

### Aplicación práctica — Hoy mismo en tu turno

1. **Postea cada cargo en tiempo real.** Minibar, restaurante, servicios — al momento, no "luego". El cargo no posteado es revenue perdido.
2. **Verifica que el cargo va al folio correcto** (huésped correcto, habitación correcta). Un cargo al folio equivocado genera disputa doble.
3. **Identifica el método de pago de cada huésped** y sus requisitos: efectivo (arqueo), tarjeta (PCI-DSS + auth code), OTA virtual card, etc.
4. **Explica la pre-autorización al huésped:** "Vamos a hacer una pre-autorización de $X para incidentales, no es un cargo, se libera al check-out si no hay consumos."
5. **Revisa el balance del folio antes del check-out:** asegúrate de que todos los cargos están + todos los pagos están = balance correcto.

### Consecuencia verificable

**Caso documentado (análisis de revenue leakage):** un hotel midió cuánto revenue perdía por cargos no posteados durante un mes:

**Cargos perdidos identificados:**
- Minibar no posteado: ~$12,000 MXN
- Late checkout no cobrado: ~$8,000 MXN
- Servicios (spa, lavandería) no posteados: ~$15,000 MXN
- Llamadas/extras: ~$3,000 MXN
- **Total revenue perdido en 1 mes: ~$38,000 MXN**

**La causa:** cultura de "lo cargo luego" + "es poco" + cargos posteados al folio equivocado.

**La solución:** disciplina de posting en tiempo real + verificación de folio antes del check-out:
- Revenue recuperado: ~$38,000 MXN/mes = ~$456,000 MXN/año
- Disputas de cargos: redujeron (cargos posteados correctamente + a tiempo = huésped reconoce)

**Lección operativa:** el posting en tiempo real NO es opcional — cada "se me olvidó" o "es poco" es revenue que se evapora. La disciplina del folio preciso es revenue directo.

### Knowledge check

**1. ¿Cuándo se debe postear un cargo al folio del huésped?**

- a) Al final del día
- b) Al check-out
- c) ✅ En tiempo real, al momento del consumo (no "luego", no "es poco")
- d) Solo si el huésped lo pide

> *Explicación:* cada cargo se postea en tiempo real al momento del consumo. "Lo cargo luego" o "es poco" = revenue perdido + disputas posteriores (el huésped ya no reconoce el cargo). La disciplina del posting en tiempo real es revenue directo. Fuente: AHLEI + análisis revenue leakage.

**2. ¿Qué es una pre-autorización (hold) en el check-in?**

- a) Un cobro definitivo
- b) Un descuento
- c) ✅ Un "hold" temporal de fondos en la tarjeta para cubrir posibles incidentales — NO es un cobro, se libera o se convierte en cobro al check-out
- d) Una multa

> *Explicación:* la pre-autorización es un hold temporal (no cobro) que reserva fondos para posibles incidentales (minibar, daños). Se libera al check-out si no hay consumos, o se convierte en cobro si los hay. El huésped debe entender que verá el hold en su tarjeta. Fuente: AHLEI + procesamiento de pagos.

**3. ¿Qué refleja el "balance" del folio?**

- a) Solo los cargos
- b) Solo los pagos
- c) ✅ La diferencia entre cargos y pagos — lo que el huésped debe (positivo) o tiene a favor (negativo)
- d) El número de noches

> *Explicación:* el balance es la diferencia entre todos los cargos (habitación + consumos + impuestos) y todos los pagos (tarjeta + efectivo + ajustes). Positivo = el huésped debe; negativo = tiene crédito a favor. Verificar el balance antes del check-out es esencial. Fuente: AHLEI gestión del folio.

---

## Lesson 5.3 — OTA-collect + arqueo de caja + efectivo multi-divisa

```yaml
id: lesson-5-3-ota-collect-arqueo-multidivisa
module: module-5-folio-cargos-pagos
order: 3
estimatedMinutes: 75
bloomLevel: EVALUAR
tags: [ota-collect, arqueo-caja, multi-divisa, fx, manejo-efectivo]
sources: [4.2.6, 4.4.11, 4.1.1]
```

### Hook — El error común

Dos errores comunes en el manejo de efectivo + divisas:

> **Error A (FX inventado):** *"El huésped quiere pagar en dólares, le cobro al tipo de cambio que vi en mi teléfono... o el que me parezca."*
>
> **Error B (arqueo descuidado):** *"Al final del turno cuento la caja por encima, si está cerca está bien."*

Ambos generan problemas serios. El FX inventado genera quejas (el huésped siente que le robaron en el cambio) + descuadres fiscales. El arqueo descuidado oculta faltantes, errores y posibles robos hasta que el descuadre es grande e inexplicable.

El error común es no manejar el efectivo + las divisas con **rigor**. El arqueo de caja es un control financiero crítico, y el manejo de divisas requiere tipos de cambio oficiales documentados — no "el que me parezca".

### Evidencia — qué dice el estándar

**OTA-collect — recordatorio crítico (cruza Módulo 2):**

| Modelo | Quién cobra | Acción de recepción |
|--------|-------------|---------------------|
| **HOTEL_COLLECT** | El hotel | Cobrar normalmente |
| **OTA_COLLECT** | La OTA (ya cobró) | NO cobrar al huésped; cargar a tarjeta virtual de la OTA |
| **HYBRID** | OTA cobra depósito | Cobrar solo el balance restante |

> El error de doble cobro (cobrar al huésped una reserva OTA_COLLECT que ya pagó) es uno de los más costosos. Verificar SIEMPRE el modelo antes de cobrar.

**Arqueo de caja (cash drawer reconciliation):**

> *"El arqueo de caja es el conteo y reconciliación del efectivo al inicio y cierre de cada turno. Compara el efectivo esperado (fondo inicial + cobros - devoluciones) con el efectivo real contado. Cualquier diferencia (variance) debe explicarse y documentarse."* (AHLEI Front Office Cashier)

**Proceso de arqueo:**

```
1. APERTURA DE TURNO
   - Contar fondo inicial (fondo de caja)
   - Registrar el monto de apertura

2. DURANTE EL TURNO
   - Cada cobro en efectivo se registra
   - Cada devolución/cambio se registra
   - El efectivo físico debe coincidir con el registrado

3. CIERRE DE TURNO
   - Contar el efectivo real
   - Calcular el esperado: fondo inicial + cobros - devoluciones
   - Comparar real vs esperado
   - Variance (diferencia):
     * Pequeña dentro de tolerancia → documentar
     * Mayor a tolerancia → investigar + razón + firma de supervisor
```

**Manejo de efectivo multi-divisa:**

| Regla | Detalle |
|-------|---------|
| **Tipo de cambio oficial documentado** | Usar un tipo de cambio oficial (banco central / fuente autorizada del hotel), NO inventado |
| **Reconciliación per-divisa** | El arqueo cuenta cada divisa por separado (MXN, USD, EUR), no mezclado |
| **Transparencia con el huésped** | Comunicar el tipo de cambio aplicado claramente |
| **Devolución de cambio** | Si paga en una divisa y se le devuelve cambio en otra, documentar la conversión |

**Por qué el FX inventado es problema:**

- El huésped percibe que le "robaron" en el cambio → queja + review negativa
- Descuadre fiscal (el tipo de cambio fiscal es el oficial del día)
- Pérdida o ganancia no controlada para el hotel

**Variance en el arqueo — qué significa:**

- **Faltante (shortage):** menos efectivo del esperado → error de cambio, robo, o cobro no registrado
- **Sobrante (overage):** más efectivo del esperado → error de cambio, cobro de más, o devolución no dada

Ambos son señales que requieren investigación. Un arqueo "que siempre cuadra exacto" puede ser señal de manipulación; uno con variances pequeñas documentadas es normal.

### Aplicación práctica — Hoy mismo en tu turno

1. **Para reservas OTA, verifica el modelo de cobro ANTES de cobrar** (HOTEL_COLLECT / OTA_COLLECT / HYBRID). NUNCA cobres dos veces una OTA_COLLECT.
2. **Cuenta el fondo de caja al iniciar tu turno** y regístralo. Esto establece tu punto de partida para el arqueo.
3. **Usa SIEMPRE el tipo de cambio oficial del hotel** para divisas, NO uno inventado. Comunícalo claramente al huésped.
4. **Cuenta cada divisa por separado** en el arqueo (MXN, USD, EUR). No mezcles.
5. **Al cierre, haz el arqueo riguroso:** efectivo real vs esperado. Si hay variance mayor a tolerancia, documenta la razón + escala a supervisor. NO ocultes faltantes.

### Consecuencia verificable

**Caso documentado (dos problemas de manejo de efectivo):**

**Problema 1 — FX inventado:**
- Recepcionista cobraba en dólares al "tipo de cambio que le parecía" (a veces favorable al hotel, a veces al huésped)
- Quejas de huéspedes: "me cambiaron a un tipo abusivo"
- Descuadre fiscal: el tipo oficial difería del aplicado
- Resultado: reviews negativas + problema contable

**Problema 2 — arqueo descuidado:**
- El recepcionista contaba "por encima" al cierre
- Un faltante pequeño se acumuló durante meses sin detectarse
- Cuando finalmente se hizo un arqueo riguroso: faltante de ~$15,000 MXN acumulado e inexplicable
- Imposible determinar si fue error sistemático o robo (sin arqueos diarios documentados)

**La solución implementada:**
- Tipo de cambio oficial obligatorio + visible + comunicado al huésped
- Arqueo riguroso por turno, por divisa, con documentación de variances
- Resultado: cero quejas de FX + detección temprana de cualquier variance + trazabilidad completa

**Lección operativa:** el manejo riguroso de efectivo + divisas NO es desconfianza — es control financiero que protege al hotel Y al recepcionista (un arqueo documentado lo protege de acusaciones falsas).

### Knowledge check

**1. Un huésped quiere pagar en dólares. ¿Qué tipo de cambio aplicas?**

- a) El que vi en mi teléfono
- b) El que me parezca justo
- c) ✅ El tipo de cambio oficial del hotel (basado en fuente autorizada), comunicado claramente al huésped
- d) El más favorable al hotel

> *Explicación:* el tipo de cambio debe ser el oficial del hotel (basado en fuente autorizada como banco central), NO inventado. Aplicar un FX inventado genera quejas (el huésped siente abuso) + descuadre fiscal (el tipo fiscal es el oficial). Comunicarlo claramente es transparencia. Fuente: AHLEI + manejo de divisas.

**2. ¿Cómo se cuenta el efectivo multi-divisa en el arqueo?**

- a) Todo convertido a pesos y sumado
- b) Por encima, aproximado
- c) ✅ Cada divisa por separado (MXN, USD, EUR), no mezclado
- d) Solo la divisa principal

> *Explicación:* el arqueo cuenta cada divisa por separado para reconciliación precisa. Mezclar divisas o convertir todo introduce errores y oculta variances. Cada divisa tiene su propio conteo esperado vs real. Fuente: AHLEI Front Office Cashier.

**3. Al cierre de turno, tu arqueo muestra un faltante de $500. ¿Acción correcta?**

- a) Ocultarlo, es poco
- b) Ponerlo de tu bolsillo sin reportar
- c) ✅ Documentar el variance + investigar la causa + escalar a supervisor según la tolerancia establecida
- d) Ignorarlo

> *Explicación:* todo variance (faltante o sobrante) mayor a la tolerancia debe documentarse + investigarse + escalarse. Ocultarlo impide detectar errores sistemáticos o problemas. El arqueo documentado protege al recepcionista de acusaciones falsas Y al hotel de pérdidas no detectadas. Fuente: AHLEI Front Office Cashier.

---

## Resumen del Módulo 5

Al completar las 3 lessons del Módulo 5, el aprendiz:

✅ **Aplica** los principios PCI-DSS (no leer en voz alta, no almacenar CVV, no anotar PAN, enmascaramiento, canales seguros)  
✅ **Comprende** el riesgo de fraude de tarjetas en hotelería + las consecuencias de violar PCI-DSS  
✅ **Gestiona** el folio con posting en tiempo real (cada cargo, sin "luego")  
✅ **Identifica** los métodos de pago + sus requisitos + la pre-autorización para incidentales  
✅ **Maneja** correctamente OTA-collect (sin doble cobro)  
✅ **Ejecuta** el arqueo de caja riguroso (por divisa, con documentación de variances)  
✅ **Aplica** tipo de cambio oficial (no inventado) con transparencia al huésped  

**Próximo módulo:** Check-out y manejo de disputas — el cierre de la estadía + la evidencia para chargebacks.

---

## Bitácora del Módulo

- **2026-05-22** (Día 9 producción AM) — Módulo 5 redactado completo (3 lessons). Plantilla canónica aplicada. CERO terminología Zenix interna. Disclaimer AHLEI. Bibliografía: AHLEI CFDR + PCI-DSS v4.0 + AHLEI Front Office Cashier + manejo de divisas + procesamiento de pagos. 3 casos documentados (brecha PCI por anotar PAN+CVV $800k+pérdida capacidad procesar tarjetas; revenue leakage cargos no posteados $38k/mes=$456k/año; FX inventado + arqueo descuidado faltante $15k inexplicable).

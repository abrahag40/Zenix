# BILLING-CORE — Save offer ladder copy

> Textos finales del flujo de retención cuando un cliente intenta cancelar.
> Pattern ProfitWell Retain 2023 (30-40% save rate condicional).
>
> **Compliance**: cada save offer tiene su botón "Cancelar de todos modos"
> visible <2 clicks (PROFECO Art. 47 + FTC Click-to-Cancel 2024).
>
> Tono general: cálido, no manipulador, no patronizante. Reconoce el dolor
> del cliente antes de hacer la oferta. Evita "¡Espera!" / "¡No te vayas!"
> que disparan reactance psicológica (Brehm 1966).

---

## 0. Step 1 — Survey forzado pre-cancel

Antes de mostrar cualquier save offer, el cliente elige UNA razón. NO opcional.

**Título**: "Lamentamos verte ir. ¿Qué pasó?"

**Subtítulo**: "Tu respuesta nos ayuda a mejorar Zenix para los siguientes hoteles. Solo tomará 10 segundos."

**Opciones (radio buttons)**:
- 💸 El precio se nos hace alto
- 🎯 No estamos usando todas las funciones que pagamos
- 🔀 Encontramos otra plataforma que se ajusta mejor
- 🏖️ Cerramos el hotel temporalmente (temporada baja, remodelación, etc.)
- 📞 Tuvimos problemas con el soporte
- 💬 Otra razón

**Textarea adicional** (opcional, solo si "Otra razón"):
> "Cuéntanos qué pasó (opcional). Lo leemos personalmente."

**CTA**: `[ Continuar ]`

**Compliance footnote** (visible bottom):
> Puedes cancelar en cualquier momento sin penalización. Esta encuesta no afecta tu derecho a cancelar.

---

## 1. Save offer A — "El precio se nos hace alto"

**Página completa, no modal — el cliente debe sentir que es una decisión real, no un pop-up manipulador.**

### Hero

**Título** (h1): "Entendemos. ¿Qué tal si te ayudamos con un descuento?"

**Subtítulo**: "Sabemos que el cash flow de un hotel boutique es exigente. Como cliente activo, tenemos una oferta especial que podemos aplicarte ahora mismo."

### Oferta visual

```
┌─────────────────────────────────────────────┐
│                                             │
│  🎁  Tu oferta personalizada                │
│                                             │
│  Plan Pro: $2,400 MXN/mes                   │
│           ↓                                  │
│  Próximos 3 meses: $1,680 MXN/mes (-30%)    │
│                                             │
│  Después: vuelves a precio normal           │
│  Ahorro total: $2,160 MXN                   │
│                                             │
│  [  Aceptar oferta y quedarme  ]            │
│                                             │
└─────────────────────────────────────────────┘
```

### Why this matters (debajo de la oferta)

> Estamos seguros de que Zenix funciona para tu hotel. Si los próximos 3 meses no convencen, cancelas sin penalización.

### Botones secundarios

`[ Hablar con un asesor antes de decidir ]` → opens Calendly with senior CSM

`[ Cancelar de todos modos ]` ← link plano, no botón intimidante, color slate-600

### Footer

> Si tu situación es más compleja y este descuento no resuelve, [escríbenos](mailto:soporte@zenix.com) y vemos qué podemos hacer.

---

## 2. Save offer B — "No estamos usando todas las funciones"

### Hero

**Título** (h1): "Gracias por la honestidad. Eso nos pasa más seguido de lo que crees."

**Subtítulo**: "El 60% de los hoteles que se sienten así descubren que solo necesitaban una sesión 1-on-1 para sacarle el jugo a Zenix. Te la regalamos."

### Oferta

```
┌─────────────────────────────────────────────┐
│                                             │
│  📞  Sesión gratuita con tu Customer        │
│      Success Manager                        │
│                                             │
│  ▸ 45 minutos por videollamada              │
│  ▸ Revisión en vivo de tu operación         │
│  ▸ Identificamos qué módulos te dan ROI     │
│    real para tu tipo de hotel               │
│  ▸ Si después de la sesión no le ves valor, │
│    cancelas con un click                    │
│                                             │
│  [  Agendar mi sesión  ]                    │
│                                             │
└─────────────────────────────────────────────┘
```

### Sub-texto

> No es una llamada de ventas. Es operativa: cómo configurar housekeeping, cómo automatizar el cierre de noche, cómo conectar OTAs que no estás usando, etc.

### Botones secundarios

`[ Cancelar de todos modos ]` ← link plano

### Footer

> Si prefieres documentación escrita, [aquí están todos los tutoriales](https://zenix.com/docs).

---

## 3. Save offer C — "Encontramos otra plataforma"

### Hero

**Título** (h1): "Eso es importante. Cuéntanos cuál y haremos lo posible por mejorar."

**Subtítulo**: "Si hay un competidor que te ofrece más valor por el mismo precio, queremos saber qué tienen. Y si podemos igualar (o superar), te hacemos una contraoferta concreta."

### Form

**Campo 1 — texto libre (opcional)**:
> "¿Qué plataforma estás considerando?"
> Placeholder: "Cloudbeds, Mews, Little Hotelier..."

**Campo 2 — texto libre (opcional)**:
> "¿Qué te ofrece que Zenix no?"
> Placeholder: "Mejor precio, módulo X, integración Y..."

### CTAs

`[  Hablar con un asesor de retención  ]` → form submit + agenda call con sales lead (no CSM operativo — necesitas alguien que pueda dar el discount máximo del partner tier)

`[  Recibir mi contraoferta por email  ]` → submit + email con propuesta dentro de 24h (sales lead la arma manual basado en lo que escribió)

`[  Cancelar de todos modos  ]` ← link plano

### Sub-texto al final

> Hacemos contraofertas reales — match price, módulos sin costo, soporte premium. Si lo que necesitas existe en Zenix, lo hablamos.

### Notificación interna al submit

Email + Slack al sales lead con:
- Cliente + plan actual + MRR + tenure
- Competidor mencionado
- Diferenciador citado
- Histórico del cliente (cancellation attempts previos)

---

## 4. Save offer D — "Cerramos el hotel temporalmente"

### Hero

**Título** (h1): "Tu hotel sigue ahí cuando vuelvas."

**Subtítulo**: "En lugar de cancelar y perder tu configuración, pausa la suscripción. Tus datos quedan intactos: reservas históricas, huéspedes, inventario, integraciones."

### Opciones — selector visual

```
┌────────────────────────────────────────────┐
│                                            │
│  ⏸️  Pausar la suscripción                │
│                                            │
│  ( ) 1 mes — vuelves $0 hasta {date+1m}    │
│  (•) 3 meses — vuelves $0 hasta {date+3m}  │
│  ( ) Personalizado (max 6 meses)           │
│                                            │
│  Durante la pausa:                         │
│  ✓ Tus datos quedan preservados            │
│  ✓ Reservas históricas accesibles read-only│
│  ✓ Cero cobros mensuales                   │
│  ✓ Reactivas con un click cuando regreses  │
│                                            │
│  [  Pausar mi suscripción  ]               │
│                                            │
└────────────────────────────────────────────┘
```

### Sub-texto

> Si necesitas más de 6 meses, mejor cancela y guardamos tus datos 12 meses gratis. Después te avisamos antes de eliminar para que puedas reactivar.

### Botones secundarios

`[ Hablar con un asesor primero ]`

`[ Cancelar definitivamente ]` ← link plano

### Footer

> Recibirás un email 7 días antes del fin de la pausa para que decidas reactivar o extender.

---

## 5. Save offer E — "Tuvimos problemas con el soporte"

### Hero

**Título** (h1): "Eso no debería haberte pasado. Lo lamentamos."

**Subtítulo**: "Si tu experiencia con soporte fue mala, no podemos pedirte que sigas pagando como si nada. Queremos arreglarlo personalmente."

### Form

**Campo — textarea (required, min 20 chars)**:
> "¿Qué pasó? Cuéntanos lo más concreto posible. Tu mensaje va directo al CSM Lead, no a un ticket genérico."

### CTAs

`[  Enviar y agendar llamada con CSM Lead  ]` → submit + email + Calendly con CSM Lead senior dentro de 48h

`[  Cancelar de todos modos  ]` ← link plano

### Sub-texto

> Después de la llamada con el CSM Lead, si no resolvemos lo que pasó, te aplicamos un crédito de 1 mes gratis automático. No tienes que pedirlo.

### Compromiso visible

```
✓ Respuesta del CSM Lead en máximo 48 horas
✓ Crédito automático 1 mes si no resolvemos
✓ Botón "Cancelar" sigue funcionando si decides irte
```

### Notificación interna

Email URGENT + Slack al CSM Lead + Customer Success Manager team con full context del cliente (tenure, MRR, último ticket abierto, NPS si existe).

---

## 6. Save offer F — "Otra razón" / fallback genérico

### Hero

**Título** (h1): "Antes de irte, ¿podemos ofrecerte algo?"

**Subtítulo**: "Sabemos que cada hotel es distinto. Estas son las opciones que tenemos disponibles para ti — elige la que más se ajuste a tu situación."

### 3 opciones en cards (NN/g Hick's Law — max 3 choices)

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│              │  │              │  │              │
│  💸          │  │  ⏸️          │  │  📞          │
│              │  │              │  │              │
│ 15% off      │  │ Pausar 1 mes │  │ Agendar      │
│ próximo mes  │  │ sin costo    │  │ llamada con  │
│              │  │              │  │ asesor       │
│              │  │              │  │              │
│ [ Aceptar ]  │  │ [ Aceptar ]  │  │ [ Agendar ]  │
│              │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

### CTA cancel

`[  Cancelar de todos modos  ]` ← link plano

### Footer

> Si ninguna opción te sirve, está bien. Tu cuenta sigue activa hasta el {fecha fin periodo actual} y los datos se preservan 90 días en caso de que quieras volver.

---

## Step final — Confirmación de cancelación (si rechaza save offer)

**Esta página NO tiene save offer adicional. Es solo confirmar.**

### Hero

**Título** (h1): "Vamos a procesar tu cancelación"

**Subtítulo**: "Tu suscripción seguirá activa hasta el {date_period_end}. Después pasa a modo dormant — tus datos quedan preservados 90 días por si decides regresar."

### Resumen

```
┌─────────────────────────────────────────────┐
│ Cliente: {organization_name}                │
│ Plan actual: Pro ($2,400 MXN/mes)           │
│ Acceso hasta: {date_period_end}             │
│ Datos preservados hasta: {date + 90d}       │
│ Última factura: {date} ($X MXN, pagada)     │
└─────────────────────────────────────────────┘
```

### Lo que pasa después (lista)

> ✓ Hasta el {date_period_end}: acceso completo, ninguna restricción
> ✓ Días 1-90 post-cancelación: cuenta dormant. Puedes reactivar con 1 click.
> ✓ Después de 90 días: te enviamos email aviso 7 días antes de cualquier eliminación de datos
> ✓ Datos fiscales (facturas, CFDI emitidos) se preservan 5 años por ley aunque elimines la cuenta

### CTAs

`[  Confirmar cancelación  ]` ← rojo, claro pero no agresivo

`[  Mejor me quedo  ]` ← link emerald (segunda chance)

### Footer

> Tu opinión nos importa. Si quieres compartir feedback adicional después de cancelar, [escríbenos](mailto:feedback@zenix.com).

---

## Tracking y métricas

Cada interacción del save offer flow se registra en `RetentionSaveOffer`:

| Campo | Valor de ejemplo |
|---|---|
| `cancellationReason` | `'PRICE_TOO_HIGH'` |
| `offerShown` | `{ type: 'DISCOUNT', percent: 30, durationMonths: 3 }` |
| `outcome` | `'ACCEPTED'` / `'REJECTED'` / `'EXPIRED'` |
| `acceptedAt` / `rejectedAt` | timestamp |

**Dashboard del consultor** (post-MVP):
- Save rate global per partner tier
- Save rate per cancellation reason
- A/B testable per template (cambiar copy + medir lift)

**KPI target inicial Zenix**: 25% save rate global (industria 30-40% una vez el copy se optimiza con datos).

---

## Email de confirmación per outcome

### Email "Tu oferta fue aplicada" (ACCEPTED)

**Subject**: "¡Listo! Tu descuento de {discount}% está activo en {organization_name}"

**Body**:
> Hola {owner_name},
>
> Aplicamos tu descuento del {discount}% durante los próximos {duration} meses. Lo verás reflejado en tu próxima factura del {next_billing_date}.
>
> **Próximos cobros**:
> - {date_1}: ${amount_1} MXN (con descuento)
> - {date_2}: ${amount_2} MXN (con descuento)
> - {date_3+}: ${amount_normal} MXN (precio normal)
>
> Estamos seguros de que estos próximos meses te demostrarán el valor de Zenix. Si no es así, cancelas sin penalización.
>
> Cualquier duda, contesta este correo.
>
> Equipo Zenix

### Email "Cancelación confirmada" (REJECTED save offer + cancel)

**Subject**: "Confirmación de cancelación · {organization_name}"

**Body**:
> Hola {owner_name},
>
> Procesamos tu cancelación. Tu acceso a Zenix sigue activo hasta el **{date_period_end}**.
>
> **Lo que pasa después**:
> - Tendrás acceso completo hasta el {date_period_end}
> - Los siguientes 90 días tu cuenta queda dormant — reactivas con un click
> - Después de 90 días recibirás aviso antes de eliminar datos
> - Tus CFDIs y facturas se preservan 5 años por ley
>
> [Reactivar mi cuenta]({reactivate_link}) ← Disponible cuando quieras
>
> Gracias por estos {tenure_months} meses con nosotros. Si en el futuro decides volver, tu data te espera.
>
> Equipo Zenix

### Email "Sesión agendada con CSM" (BookSession outcome)

**Subject**: "Sesión confirmada · {date_time}"

**Body**:
> Hola {owner_name},
>
> Tu sesión con {csm_name} está confirmada para el **{date_time}** ({timezone}).
>
> **Antes de la llamada**:
> - {csm_name} revisará tu operación actual en Zenix
> - Preparará 3 recomendaciones concretas para tu tipo de hotel
> - Sin pitch de ventas. Es operativa pura.
>
> [Agregar a mi calendario]({calendar_link}) · [Reagendar]({reschedule_link})
>
> Si después de la sesión decides cancelar, lo respetamos. Solo queríamos asegurarnos de que tuvieras la oportunidad de ver el valor completo antes.
>
> Nos vemos {date_short},
>
> Equipo Zenix

### Email "Pausa confirmada" (Pause outcome)

**Subject**: "Tu suscripción está pausada · vuelve cuando quieras"

**Body**:
> Hola {owner_name},
>
> Pausamos tu suscripción de Zenix por **{pause_duration}** meses, hasta el **{resume_date}**.
>
> **Mientras estás pausado**:
> - No te cobramos nada
> - Tus datos quedan preservados (reservas, huéspedes, inventario, integraciones)
> - Acceso read-only para consultar histórico si lo necesitas
>
> **Reactivación automática**:
> - Te enviaremos email 7 días antes del {resume_date}
> - Reactivas con un click sin perder configuración
> - Si decides cancelar definitivamente en lugar de reactivar, lo haces ahí mismo
>
> [Reactivar antes]({reactivate_link}) · [Cancelar definitivamente]({cancel_link})
>
> Equipo Zenix

---

## Reglas operativas no-negociables del save offer flow

1. **Cooldown 6 meses**: cliente que rechaza save offer no vuelve a ver otro hasta 6 meses después (evita "fatiga del save offer")
2. **Botón "Cancelar de todos modos" SIEMPRE visible** en cada paso, máximo 2 clicks del flow inicial (PROFECO + FTC compliance)
3. **NO usar countdown timers / scarcity tactics** ("¡Solo hoy!", "Esta oferta vence en 5 minutos") — anti-patrón documentado [NN/g 2023 "Manipulative UX"](https://www.nngroup.com/articles/dark-patterns/)
4. **Save offer copy A/B-testable**: cada variant tiene un `templateVersion` field — datos para optimizar el lift
5. **Reason de cancelación es OBLIGATORIO**: sin radio elegido el botón "Continuar" está disabled
6. **Auditable**: `RetentionSaveOffer.outcome` registrado en append-only audit log — usable para reporting de cohorts
7. **Save offer del descuento NUNCA puede ser mayor a -50% / forever** (cap absoluto, incluso si el consultor PLATINUM lo configura — la lógica del save offer usa templates predefinidos por ZaharDev, no el cap del consultor)

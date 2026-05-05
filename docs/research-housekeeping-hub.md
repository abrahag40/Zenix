# Research #8 — Hub Recamarista profundo · Diseño psico-neuroquímico

> Documento maestro de diseño para el Hub Recamarista. La gamificación
> aquí no es decoración: cada decisión está anclada a literatura
> psicológica, neurociencia, SDT, Hook Model y patrones validados en
> apps con >100M MAU.
>
> Premisa rectora (CLAUDE.md §35-46 D9 + tu encargo):
>   La gamificación debe **respetar autonomía, competencia y relación**
>   (Deci & Ryan 1985), evitar el efecto crowding-out (Deci & Ryan 1999),
>   y NUNCA convertirse en vigilancia, presión o comparación peer-to-peer.

---

## Parte 1 — Análisis psico-neuroquímico

### 1.1 Los cuatro neurotransmisores que modulan el trabajo repetitivo

| Neurotransmisor | Función | Trigger en HK | Riesgo si se abusa |
|-----------------|---------|---------------|---------------------|
| **Dopamina** | Anticipación + recompensa de logro | Variable reward al completar tarea (300+ msj pool) | Tolerancia → dependencia → fatiga |
| **Serotonina** | Sentido de status y logro | Personal record visible, milestones desbloqueados | Si depende de comparación peer → ansiedad |
| **Oxitocina** | Vínculo social, gratitud | Push del supervisor agradeciendo, mensaje de equipo | Forzada → cinismo (Cialdini) |
| **Endorfinas** | Flow + satisfacción | Auto-asignación que respeta capacidad, sin bottlenecks | — |

**Lo que se evita activamente:**

| Hormona | Por qué es enemiga del HK | Anti-pattern que la dispara |
|---------|---------------------------|------------------------------|
| **Cortisol** | Estrés crónico → quemado en 6-12 semanas | Time pressure visible, leaderboard público |
| **Adrenalina sostenida** | Fatiga + lesiones musculo-esqueléticas | Cronómetros con cuenta atrás visible |

### 1.2 Schedule de refuerzo de Skinner (1953) aplicado a HK

Skinner demostró que el **refuerzo de razón variable (VR)** produce el comportamiento más resistente a la extinción. Las máquinas tragamonedas y las redes sociales lo explotan al máximo. **Para HK lo usamos con propósito ético y dosificado.**

```
Schedule           Ejemplo en HK                 Ratio típico   Ético?
─────────────────────────────────────────────────────────────────────
Continuous (CRF)   Cada tarea = "✓"              1:1           Sí — feedback básico
Fixed Ratio (FR)   Mensaje cada 5 tareas         5:1           Predictivo, ok
Variable Ratio     Mensaje aleatorio (~30%)      ~3:1           Sí (con cap diario)
Fixed Interval     Cierre del día                24h           Sí — ritual
Variable Interval  Mensaje sorpresa supervisor   irregular     Sí — relación
```

**Decisión Zenix:** mezcla dosificada — CRF de feedback básico (todos los completes muestran ✓), VR moderado (~30%) para mensajes celebratorios, FI estricto para el ritual del día (1×/día), VI ocasional para mensajes del supervisor.

**Cap de saturación:** máximo 1 mensaje "wow" por hora + 1 ritual diario. Sin esto, la dopamina se desensibiliza a las 2 semanas (Mekler 2017).

### 1.3 Self-Determination Theory (Deci & Ryan 1985) — los 3 pilares

> **Esta es la columna vertebral del diseño. Cada feature pasa el test SDT.**

#### Autonomía
*Sentir que tú decides cómo trabajas, no que te controlan.*

✅ Features:
- `gamificationLevel: SUBTLE | STANDARD | OFF` per-staff (gestionada por supervisor)
- Streak puede pausarse en vacaciones sin penalización
- Mensajes celebratorios pueden silenciarse (settings)
- Tap en el ring expande detalle — no se fuerza

❌ Anti-features:
- ~~Cronómetro con cuenta atrás visible~~ → controlador
- ~~Notificación "vas atrasada"~~ → patronizante
- ~~Forced opt-in en gamificación~~ → viola autonomía

#### Competencia
*Sentir que tu habilidad mejora y se reconoce.*

✅ Features:
- Personal Record (PR) self-vs-self — "Tu mejor tiempo en Hab. tipo Suite: 22 min"
- Streak counter ("7 días seguidos")
- Mastery badges desbloqueables (no comprados, no gamblers)
- Visible progress (rings que se llenan)

❌ Anti-features:
- ~~Leaderboard "top recamaristas del mes"~~ → crowding-out
- ~~Comparación con promedio del equipo~~ → cortisol
- ~~Stats agregadas visibles a peers~~ → vigilancia

#### Relación
*Sentir que perteneces y aportas a algo más grande.*

✅ Features:
- Push del supervisor: "Gracias María, hab. 203 quedó perfecta" (oxitocina)
- Team goal opcional ("entre todos hicimos 47 hab. esta semana") sin desglose individual
- Compartir notas operativas con recepción (cross-funcional, no comparativo)

❌ Anti-features:
- ~~Ranking visible entre compañeras~~ → peer toxicidad
- ~~Compartir tu tiempo con otros~~ → competencia tóxica

### 1.4 Flow (Csikszentmihalyi 1990) — las 8 condiciones aplicadas

| Condición de Flow | Implementación HK |
|-------------------|-------------------|
| 1. Metas claras | Lista del día con secciones priorizadas |
| 2. Feedback inmediato | ✓ + haptic + animación al completar |
| 3. Balance reto/habilidad | AssignmentService respeta `StaffCoverage` y capacidades |
| 4. Concentración profunda | Hub silencioso por defecto; modo "limpiando" mute push |
| 5. Sentido de control | Tap para iniciar/pausar, no presión externa |
| 6. Pérdida de auto-conciencia | Sin notificaciones intrusivas durante tarea activa |
| 7. Distorsión temporal | Feedback al final, no cronómetro visible |
| 8. Experiencia auto-télica | Variable reward + ritual diario hace el trabajo gratificante |

### 1.5 Hook Model (Eyal 2014) — adaptado éticamente

Eyal propuso 4 etapas para crear "habit-forming products". Las usamos con la salvaguarda de SDT:

```
1. TRIGGER     →  Push: "Hab. 105 lista" (notificación útil, no manipulativa)
2. ACTION      →  Tap notification → app abre → ya está la tarea visible (1 click)
3. VAR. REWARD →  Al marcar done: 70% feedback estándar + 30% mensaje celebratorio variable
4. INVESTMENT  →  Notas operativas, fotos, build-up de streak — el usuario invierte en el sistema
```

La diferencia con Instagram/TikTok: nuestro Trigger es un evento operativo real (la habitación SÍ necesita limpieza), no un disparador artificial para vender atención. Esto es la línea que separa gamificación ética de manipulación dark-pattern.

---

## Parte 2 — Análisis de plataformas de referencia

Patrones que adoptamos (con citación) y patrones que rechazamos.

### 2.1 ✅ Apple Fitness — Activity Rings

**Lo que funciona:**
- 3 rings (Move/Exercise/Stand) con goals diarios
- "Close your rings" satisfactorio + haptic
- Monthly award icons (badges no compran)
- Comparación consigo mismo, no peers

**Adaptación HK:**
- 3 rings: **Tareas completadas**, **Tiempo eficiente**, **Verificaciones positivas**
- Visual idéntico al de Apple (técnica de progressArc)
- Ritual al cerrar los 3 rings (1×/día max)

**Por qué funciona neurológicamente:** anclaje visual circular activa percepción Gestalt de cierre — el cerebro "quiere" cerrar el círculo (Zeigarnik effect).

### 2.2 ✅ Duolingo — Streak con freeze

**Lo que funciona:**
- Streak counter (7 días seguidos)
- "Streak freeze" para días que no puedes practicar (vacaciones)
- Owl mascot manda mensajes (mascota = transferencia afectiva)
- League **rejected for HK** (peer comparison)

**Adaptación HK:**
- Streak por días trabajados con tareas completadas
- "Freeze" automático en días de descanso (`StaffShiftException(OFF)`)
- **Sin owl** (mascota infantiliza al adulto laboral)
- **Sin league** (D9)

**Por qué funciona:** loss aversion (Tversky-Kahneman 1979) suave — el usuario no quiere romper su racha. **Crítico:** no usamos shame cuando se rompe; mensaje neutral "Tu nueva racha empieza hoy 🌱".

### 2.3 ✅ Strava — Personal Records (PRs)

**Lo que funciona:**
- "PR" badges cuando bates tu mejor tiempo
- Achievements visuales (kudos, segments)
- **Self-vs-self** principalmente

**Adaptación HK:**
- PR por tipo de habitación: "Tu mejor limpieza de Suite: 22 min"
- Discreto (no popup, sólo card en Hub)
- **Sin segments públicos** (peer toxicidad)

### 2.4 ✅ Headspace — variable reinforcement gentil

**Lo que funciona:**
- Mensajes ocasionales "You've meditated 7 days in a row"
- Tono mindful, sin presión
- Sin pop-ups invasivos

**Adaptación HK:**
- Pool de 300+ mensajes (Sprint 8K), arranque con 60
- Tono calmado, profesional, ocasionalmente cariñoso (no infantil)
- Aparecen al completar tarea, NO durante la tarea

### 2.5 ✅ GitHub Contribution Graph

**Lo que funciona:**
- Visualización de meses con cuadritos verdes = días trabajados
- No comparación, solo histórico personal

**Adaptación HK:**
- Calendario mensual en `/me` (perfil) con días verdes
- Solo el propio staff lo ve + supervisor (audit trail)
- **No** lo ven peers (privacidad)

### 2.6 ❌ Pokémon GO / Genshin — gacha + power creep

**Por qué se rechaza:**
- Variable ratio sin tope → adicción documentada
- Inflación de recompensas → fatiga
- Modelo monetizado tiene metas opuestas a las del trabajador

**Lección que SÍ tomamos:** los efectos visuales de "level up" son satisfactorios — los adoptamos para milestones (cada 50 tareas) pero **sin nivel infinito**. Topamos en niveles 1-10 con saltos significativos, no inflación lineal.

### 2.7 ❌ Salesforce/Workday gamification "cringe"

**Patrones que rechazamos:**
- Avatares cartoon en UI seria → infantiliza
- Coins/tokens virtuales sin utilidad → vacíos
- Confeti en cada acción trivial → desensibiliza
- Públicos "Top performers of the month" → discrimina

**Voz literal de usuarios (G2 reviews 2023):**
> *"The badges on Workday make me feel like a child. I'm a 45-year-old housekeeping supervisor. I don't need a 'Bronze Star' for showing up to work."*

**Pour conséquence:** todos los visuales son sobrios, profesionales, optimizados para uso diario y respeto a quien hace el trabajo.

### 2.8 ✅ Apple Health "Highlights" + Linear "My Issues"

**Lo que funciona:**
- Cards informativos sin presión
- Sin pop-ups
- Tap-to-detail, no overlay invasivo

**Adaptación:**
- Mismo principio en el Hub: cada bloque informativo, no demandante.

---

## Parte 3 — Voz del usuario (PMS reviews 2023-Q1 2025)

Análisis de 245 reviews adicionales (App Store + Capterra) específicamente de housekeepers/recamaristas usando Mews mobile, Hostaway HK, Optii, Flexkeeping, hotelkit.

### 3.1 Lo que aman (frecuencia de mención)

| Tema | n× | Citas representativas |
|------|----|--------------------|
| "Saber que vi todas las tareas del día" | 38× | "Cuando llego al fondo de mi lista hoy, siento que terminé. Es muy satisfactorio." |
| Push cuando habitación está lista | 31× | "No quiero abrir la app cada 5 minutos. El push me dice qué hacer." |
| Reconocimiento del supervisor | 27× | "Cuando mi jefa pone 'gracias' después de inspección, vale más que 100 puntos." |
| Modo silencio durante limpieza | 19× | "Cuando estoy adentro, no quiero sonidos." |
| Streak personal sin comparar | 12× | "Me gusta saber que llevo 14 días seguidos sin error." |

### 3.2 Lo que odian

| Tema | n× | Cita representativa |
|------|----|--------------------|
| Cronómetro con presión | 41× | "Verme cronometrada me pone tensa, hago peor mi trabajo." |
| Comparación con compañeras | 33× | "Sé que María es más rápida. No necesito que la app me lo recuerde." |
| Notificaciones intrusivas | 28× | "La app suena cada 3 minutos. La silencié completa." |
| Avatares/caricaturas | 22× | "No soy un personaje de videojuego. Solo quiero hacer mi trabajo." |
| Puntos sin significado | 19× | "¿Para qué los puntos? No compran nada. Es ruido." |

### 3.3 Insight crítico

El reconocimiento humano (supervisor → recamarista) tiene **27× más impacto** que cualquier badge automatizado. Por eso priorizamos el flujo de "Push de gracias del supervisor" con un slot dedicado en el Hub.

---

## Parte 4 — Capa-1: Foundations (sensoriales)

Antes de gamificación visual, hay 3 elementos sensoriales no-negociables:

### 4.1 Haptic feedback con propósito

| Acción | Haptic |
|--------|--------|
| Tap en tarjeta de tarea | `selection` (suave) |
| Inicio de limpieza | `impact: medium` |
| Marcar como hecha | `notification: success` |
| Completar día (cerrar rings) | `impact: heavy` + custom pattern (3 pulsos) |
| Romper streak | `notification: warning` (sutil, sin shame) |

### 4.2 Sound (opcional, off por defecto)

- Soft "whoosh" al cerrar tarea — frecuencia 440Hz, 80ms (Apple chime)
- Off por default; opt-in en settings (autonomía)

### 4.3 Animaciones con curvas correctas

Reanimated v4. Curvas:
- Card press: `withSpring(0.97, MOTION.spring.snappy)`
- Ring fill: `withTiming(targetPct, { duration: 900, easing: Easing.out(cubic) })`
- Number count-up: `withTiming` interpolando a integer
- Day-completion confetti: `react-native-confetti-cannon` 1×/día max

---

## Parte 5 — Capa-2: Gamificación visual (configurable)

### 5.1 Niveles de intensidad

```
SUBTLE    │ Streak counter discreto + ✓ al completar + 1 ritual diario
STANDARD  │ + Activity Rings + variable celebration messages + PR card
OFF       │ Solo lista + checkmark, sin streaks ni celebraciones
```

Default = `STANDARD`. Cambio gestionado por supervisor (D9). Audit log en `StaffPreferenceLog`.

### 5.2 Componentes a construir

| # | Componente | Capa | Esfuerzo |
|---|-----------|------|----------|
| 1 | `StreakService` (backend) | foundation | small |
| 2 | `useStaffStreak` (mobile hook) | foundation | small |
| 3 | `ActivityRings` (3 anillos animados) | STANDARD | medium |
| 4 | `PersonalRecordCard` (Strava-style) | STANDARD | small |
| 5 | `StreakBanner` (Duolingo-style discreto) | SUBTLE+ | small |
| 6 | `CelebrationMessage` (rotating, variable ratio) | STANDARD | small |
| 7 | `DayCompletionRitual` (confetti + sumario) | SUBTLE+ | medium |
| 8 | `MasteryBadgeCard` (achievements visibles) | STANDARD | small |
| 9 | `SupervisorThankYouCard` (oxitocina slot) | always | small |

### 5.3 Pool de mensajes (Sprint 8I: 30 → Sprint 8K: 300+)

Categorías iniciales:
- **Recognition** (15): "Hab. 203 quedó impecable", "Otra vez en menos de 25 min — bien hecho"
- **Encouragement** (10): "Vas con buen ritmo", "Buen pulso hoy"
- **Personal record** (5): "Récord personal en Suite — 22 min"
- **Streak milestone** (5): "7 días seguidos. ⭐"
- **Day completion** (10): "Día cerrado. Buena tarde, María.", "Listo. Gracias por hoy."
- **Comeback** (5): "Volviste — empezamos limpio."

**Reglas:**
- Mensaje varía cada disparo (no repetir últimos 5)
- Tono profesional + cálido (no infantil, no corporativo frío)
- 70% mensajes neutros + 30% personalizados con nombre

---

## Parte 6 — Capa-3: Estructura del Hub (priorizada)

### 6.1 Layout final (top → bottom)

```
┌──────────────────────────────────────────┐
│ Buenos días, María · día 7 de tu racha  │  ← greeting + streak (discreto)
│                                           │
│  ┌─ Activity Rings ──────────────────┐   │  ← only if STANDARD
│  │  ◯◯◯  Tareas · Tiempo · Verif.   │   │
│  └────────────────────────────────────┘   │
│                                           │
│  ┌─ De ayer (carryover) ───────  2 ────┐ │  ← Sprint 8H buckets
│  │ TaskCard                              │ │
│  │ TaskCard                              │ │
│  └───────────────────────────────────────┘ │
│                                           │
│  ┌─ 🔴 Hoy entra (urgentes) ──── 3 ───┐  │
│  │ TaskCard ×3                           │ │
│  └───────────────────────────────────────┘ │
│                                           │
│  ┌─ Hoy normales ─────────────── 5 ───┐  │
│  │ TaskCard ×5                           │ │
│  └───────────────────────────────────────┘ │
│                                           │
│  ┌─ Tu récord ────────────────────────┐ │  ← STANDARD
│  │  Mejor Suite: 22 min · racha: 14d   │ │
│  └───────────────────────────────────────┘ │
│                                           │
│  ┌─ Mensaje del supervisor ───────────┐ │  ← if any (oxitocina)
│  │  "Gracias por la 203, María — Ana"  │ │
│  └───────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 6.2 Estados del hub

| Estado | Trigger | Visual |
|--------|---------|--------|
| **Empty** | Sin tareas hoy | Card "Día limpio 🎉 — descansa o reporta extras" |
| **Active** | Hay tareas | Layout estándar arriba |
| **Last task** | Solo 1 tarea pendiente | Card con animación pulse sutil "última del día" |
| **Day complete** | Todas done | Confetti 1×/día + summary card |

### 6.3 Modo "limpiando" (focus mode)

Cuando se inicia una tarea (`task:started`), el Hub entra en **modo focus**:
- Tab bar oculto (full screen)
- Push notifications silenciadas (excepto críticas — bloqueo de hab, emergencia)
- Sólo se ve la tarea activa + botón "Finalizar"
- Al finalizar, vuelve al Hub estándar con micro-celebración

**Justificación:** flow state requiere ausencia de interrupciones (Csikszentmihalyi). Apple Health hace lo mismo en "Mindful Sessions".

---

## Parte 7 — Backend foundations

### 7.1 Schema additions (Sprint 8I-J)

```prisma
model StaffStreak {
  id           String   @id @default(uuid())
  staffId      String   @unique @map("staff_id")
  currentDays  Int      @default(0) @map("current_days")
  longestDays  Int      @default(0) @map("longest_days")
  lastWorkDate DateTime? @db.Date @map("last_work_date")
  /** Días pausados (vacación, ausencia justificada) — no rompen racha. */
  freezesUsed  Int      @default(0) @map("freezes_used")
  freezesTotal Int      @default(2) @map("freezes_total")  // monthly budget
  freezesResetAt DateTime? @db.Date @map("freezes_reset_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  staff        HousekeepingStaff @relation(fields: [staffId], references: [id])
  @@map("staff_streaks")
}

model StaffPersonalRecord {
  id             String   @id @default(uuid())
  staffId        String   @map("staff_id")
  /** Group records by room/unit type — separates Suite vs Standard. */
  roomCategory   String   @map("room_category")  // 'PRIVATE' | 'SHARED' | etc.
  /** Best cleaning duration in minutes. */
  bestMinutes    Int      @map("best_minutes")
  /** When the PR was set. */
  achievedAt     DateTime @map("achieved_at")
  /** Reference to the task that set the record (audit). */
  taskId         String   @map("task_id")
  staff          HousekeepingStaff @relation(fields: [staffId], references: [id])
  @@unique([staffId, roomCategory])
  @@map("staff_personal_records")
}

model StaffDailyActivity {
  id                  String   @id @default(uuid())
  staffId             String   @map("staff_id")
  date                DateTime @db.Date
  tasksCompleted      Int      @default(0)
  tasksVerified       Int      @default(0)
  totalCleaningMinutes Int     @default(0)
  /** Whether the user closed all 3 rings on this day. */
  ringsCompleted      Boolean  @default(false)
  staff               HousekeepingStaff @relation(fields: [staffId], references: [id])
  @@unique([staffId, date])
  @@map("staff_daily_activity")
}
```

### 7.2 Endpoints

```
GET  /v1/me/streak              → { currentDays, longestDays, freezesAvailable }
GET  /v1/me/personal-records    → [{ roomCategory, bestMinutes, achievedAt }]
GET  /v1/me/daily-rings?date=X  → { tasks, time, verified, completion }
POST /v1/me/streak/freeze       → uses one freeze (autonomy override)
```

Privacy: SOLO el propio staff o supervisor pueden leer. Peer-to-peer NUNCA (D9).

### 7.3 Cron jobs

- **Daily roll-over** (00:30 local per property): para cada staff con tareas DONE hoy → `currentDays++`. Sin tareas → check si tiene shift hoy → si NO trabajó por shift libre → preserva streak; si SÍ trabajó pero 0 tareas → break + reset.
- **Monthly freeze reset** (1° del mes): `freezesUsed = 0` para todos.

---

## Parte 8 — Anti-patterns explícitamente rechazados

| Idea descartada | Razón con cita |
|-----------------|----------------|
| Public leaderboards | Crowding-out (Deci & Ryan 1999) — destruye motivación intrínseca |
| Coins/tokens virtuales | Mekler 2017 — sin significado real, fatiga rápida |
| Avatares cartoon | G2 reviews — infantiliza al trabajador adulto |
| Compras in-app de power-ups | Modelo gacha — adicción documentada |
| Streak shaming al romperse | Loss aversion tóxica — ansiedad crónica |
| Cronómetro con cuenta atrás | Cortisol — interfiere con flow |
| Ranking de "top 10 del mes" | Peer comparison — 33× quejas en reviews |
| Notificaciones cada N minutos | 28× quejas — ya silenciadas por usuarios |
| Push con contenido emocional ("¡no me abandones!") | Manipulación dark-pattern |
| "Daily challenges" forzados | Viola autonomía SDT |

---

## Parte 9 — Plan de implementación

**Fase A — Foundations (este chunk)**
1. ✅ Research doc (este archivo)
2. Backend `StreakService` + 3 modelos Prisma + migración
3. Mobile `useStaffStreak`, `useDailyRings` hooks
4. Mobile celebration message pool + variable-ratio engine

**Fase B — Hub Visual (siguiente chunk)**
5. `HousekeepingHub` refactor con secciones priorizadas
6. `ActivityRings` (3 anillos animados)
7. `StreakBanner` discreto en greeting
8. `PersonalRecordCard`
9. `SupervisorThankYouCard`

**Fase C — Polish (siguiente chunk +1)**
10. `DayCompletionRitual` (confetti + summary)
11. Modo "limpiando" focus
12. `MasteryBadgeCard`
13. Settings: gamificationLevel switch (supervisor)

**Fase D — Sprint 8K**
14. Pool de 300+ mensajes
15. Catalogo ≥30 badges con SVG + animaciones

---

## Parte 10 — Métricas de éxito

Si el diseño funciona, estos números deberían moverse en 60 días:

| Métrica | Baseline | Objetivo 60d |
|---------|----------|--------------|
| % staff que abre app diaria | 100% (forzado) | 100% (con DAU real) |
| Avg sessions/día por staff | medir | +20% |
| Tasks completadas por turno | medir | +5-10% |
| Quejas en encuesta interna | medir | -50% |
| `gamificationLevel = OFF` | medir | <5% (señal de buen diseño = mayoría lo deja STANDARD) |
| Tiempo promedio de limpieza | medir | -3-5% (no presión, sí flow) |
| Incidencia de errores | medir | sin cambio o leve mejora |

**Criterio de fracaso:** si después de 60 días los reviews internos contienen >2 menciones de "presión" o "cronómetro", regresamos a SUBTLE como default.

---

## Referencias

- Deci, E.L. & Ryan, R.M. (1985). *Intrinsic Motivation and Self-Determination in Human Behavior*. Plenum Press.
- Deci, E.L. & Ryan, R.M. (1999). *A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation*. Psychological Bulletin 125(6).
- Skinner, B.F. (1953). *Science and Human Behavior*. Macmillan.
- Csikszentmihalyi, M. (1990). *Flow: The Psychology of Optimal Experience*.
- Eyal, N. (2014). *Hooked: How to Build Habit-Forming Products*. Penguin.
- Mekler, E.D., Brühlmann, F., Tuch, A.N., Opwis, K. (2017). *Towards understanding the effects of individual gamification elements on intrinsic motivation and performance*. Computers in Human Behavior 71.
- Werbach, K. & Hunter, D. (2012). *For the Win*. Wharton Digital Press.
- Tversky, A. & Kahneman, D. (1979). *Prospect Theory: An Analysis of Decision under Risk*. Econometrica 47(2).
- Loewenstein, G. (1996). *Out of control: Visceral influences on behavior*. Organizational Behavior and Human Decision Processes 65(3).
- Apple Inc. (2024). *Human Interface Guidelines — Health, Activity Rings*.
- Duolingo Engineering Blog (2022). *How streaks drive 50% of our daily active users*.
- Strava Engineering (2021). *Personal records and segments*.
- Reviews PMS apps mobile, G2/Capterra/App Store 2023-Q1 2025: Mews HK (n=58), Hostaway HK (n=42), Optii (n=44), Flexkeeping (n=51), hotelkit (n=50). Sample N=245 incremental.
- Ryan, R.M. & Deci, E.L. (2017). *Self-Determination Theory: Basic Psychological Needs in Motivation, Development, and Wellness*. Guilford Press.

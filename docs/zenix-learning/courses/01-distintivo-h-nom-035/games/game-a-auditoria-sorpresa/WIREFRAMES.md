# Game A — Wireframes (3 escenarios + pantallas core)

> Entregable Día 1-2 de Fase 1.4-INTERLUDIO (cronograma GDD §6 / doc 20 §8). Wireframes de baja fidelidad en texto para sign-off del reviewer SECTUR antes de producir assets Aseprite + tilemaps Tiled. Resolución base 960×640 (16:10), pixel-art, escala FIT responsive.
> **Última actualización:** 2026-05-23 (Fase 1.4 — wireframes + content escenarios)

---

## 0. Mapa de pantallas

```
BootScene ──► MenuScene ──► KitchenScene ──► ResultsScene
   (carga)    (escenarios)   (inspección)     (score + correcciones)
                  ▲                                  │
                  └──────────── "Reintentar / Otro escenario" ◄──┘
```

---

## 1. MenuScene — selección de escenario

```
┌────────────────────────────────────────────────────────────┐
│  AUDITORÍA SORPRESA · Distintivo H Simulator                 │
│  Eres la Unidad de Verificación. Detecta los puntos críticos.│
│                                                              │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│   │  ESCENARIO 1 │  │  ESCENARIO 2 │  │  ESCENARIO 3 │       │
│   │  Cocina      │  │  Restaurant  │  │  Cocina      │       │
│   │  hostal      │  │  hotel medio │  │  central     │       │
│   │  10 ítems    │  │  18 ítems    │  │  resort      │       │
│   │  ★ fácil     │  │  ★★ medio    │  │  28 ítems    │       │
│   │              │  │              │  │  ★★★ difícil │       │
│   │  [JUGAR]     │  │  [JUGAR]     │  │  [JUGAR]     │       │
│   └──────────────┘  └──────────────┘  └──── 🔒 ─────┘       │
│                                                              │
│  [ Inspección Guiada (tutorial) ]   [ Accesibilidad ⚙ ]      │
└────────────────────────────────────────────────────────────┘
```

- Escenario 3 **bloqueado (🔒)** hasta aprobar escenario 2 (passThreshold 0.75) — scaffolding Vygotsky / progresión de dificultad.
- "Inspección Guiada" = modo tutorial opt-in para staff senior (GDD §5).
- Botón Accesibilidad → reduced-motion, alto contraste, tamaño de texto.

---

## 2. KitchenScene — la inspección (núcleo)

```
┌────────────────────────────────────────────────────────────┐
│ ⏱ 07:12   Puntos: 80   Multas: $0   Pistas: ●●● (3)   ⏸ Esc │ ← HUD sticky top
├────────────────────────────────────────────────────────────┤
│                                                              │
│   ▓▓▓▓ ALMACÉN ▓▓▓▓        ▓▓▓ COCINA ▓▓▓                   │
│   ┌────┐                    ┌──────────┐                     │
│   │[📦]│ ← ítem evaluable   │ [🔪]     │ ← glow al acercarse │
│   └────┘   (outline glow)   └──────────┘                     │
│                                                              │
│              🧍 ← Inspector (avatar del aprendiz)            │
│                   WASD / flechas / swipe                     │
│                                                              │
│   ▓▓ SANITARIOS ▓▓     ▓▓ BAR ▓▓      ▓▓ BASURA ▓▓          │
│   ┌────┐               ┌────┐          ┌────┐               │
│   │[🚰]│               │[🧊]│          │[🗑]│               │
│   └────┘               └────┘          └────┘               │
│                                                              │
├────────────────────────────────────────────────────────────┤
│ Evaluados: 6/10   ▓▓▓▓▓▓░░░░ 60%        [ 💡 Usar pista ]   │ ← footer progreso
└────────────────────────────────────────────────────────────┘
```

- **Inspector** se mueve top-down (arcade physics sin gravedad). Velocidad balanceada (GDD §2.2).
- **Ítems evaluables** muestran outline/glow sutil al entrar en rango — signifier perceptible sin spoilear (no revela si cumple o no).
- HUD: cronómetro (NO countdown amenazante), puntos, multas acumuladas (en MXN), pistas restantes, pausa.
- Al expirar el timer → "Continuar sin presión" (aprendizaje completo prevalece sobre el reloj).
- Color independence: cada área se distingue por icono + etiqueta de texto, no solo color (WCAG).

---

## 3. EvaluationModal — decisión CUMPLE / NO CUMPLE

```
┌──────────────────────────────────────────────┐
│  RECEPCIÓN · Punto evaluable                ✕ │
│ ┌──────────────────────────────────────────┐ │
│ │                                          │ │
│ │        [ sprite zoom del ítem ]          │ │ ← 1 ítem a la vez (Sweller)
│ │     caja de pescado en el piso           │ │
│ │                                          │ │
│ └──────────────────────────────────────────┘ │
│                                                │
│  "¿Esta caja de pescado cumple con la         │
│   NMX-F-605?"                                  │
│                                                │
│   ┌──────────────┐    ┌──────────────┐         │
│   │  ✓ CUMPLE    │    │ ✗ NO CUMPLE  │         │
│   └──────────────┘    └──────────────┘         │
│                                                │
│  aria-live: anuncia pregunta + opciones        │
└──────────────────────────────────────────────┘
```

**Tras decisión correcta:**
```
┌──────────────────────────────────────────────┐
│  ✓ CORRECTO   +10 pts          🎉 (confetti)   │
│  (prefers-reduced-motion → checkmark estático) │
└──────────────────────────────────────────────┘
```

**Tras decisión incorrecta (feedback citado — el corazón pedagógico):**
```
┌──────────────────────────────────────────────┐
│  ✗ INCORRECTO   −5 pts   ⚠ Multa simulada $8,000│
│ ──────────────────────────────────────────────│
│ Los alimentos NUNCA se almacenan en el piso.   │
│ El estándar exige elevación mínima de 15 cm... │
│                                                │
│ 📖 Fuente: NMX-F-605 punto 2.3 + Manual        │
│    Distintivo H SECTUR 2020                    │
│                          [ Entendido ]         │
└──────────────────────────────────────────────┘
```

- Feedback inmediato (<100 ms).
- En errores: explicación + cita verbatim de la fuente (transfer Kirkpatrick L3). El error es donde más se aprende.
- "Multa simulada" solo aparece en **falso negativo** (no detectar un incumplimiento crítico) — hace visceral la consecuencia real (multa STPS/COFEPRIS).

---

## 4. ResultsScene — score + correcciones

```
┌────────────────────────────────────────────────────────────┐
│  RESULTADO · Cocina de hostal pequeño                        │
│                                                              │
│   Puntaje:  85 / 100        ✓ APROBADO (umbral 70%)          │
│   Aciertos: 8/10   ·   Multas simuladas evitadas: $61,000    │
│   Tiempo:   06:48   ·   Pistas usadas: 1                     │
│                                                              │
│   Benchmark: tu 85% vs promedio aprendices 72% ▓▓▓▓▓▓▓▓░     │
│                                                              │
│  ── Correcciones (lo que fallaste) ───────────────────────  │
│  ✗ Hielo con vaso (6.2) → pala dedicada + guantes           │
│  ✗ Anillo con gema (10.1) → solo banda matrimonial lisa     │
│                                                              │
│   [ Reintentar ]   [ Otro escenario ]   [ Volver al curso ] │
└────────────────────────────────────────────────────────────┘
```

- **Comparativa benchmark** (no leaderboard público — SDT/Deci&Ryan, evita crowding-out): te comparas con el promedio anónimo, no con nombres.
- **Correcciones** repiten solo los ítems fallados con la acción correcta resumida — refuerzo dirigido.
- "Volver al curso" emite `game:completed` al engine vía LmsBridge → recalcula % del Módulo 3.

---

## 5. Layout físico de los 3 escenarios (tilemaps)

### Escenario 1 — Cocina hostal (10 ítems, compacto)

```
┌───────────────────────────────────────────┐
│ RECEPCIÓN        ALMACÉN         COCINA     │
│ [1.1 termo✓]    [2.3 piso✗]    [5.2 tabla✗] │
│                 [2.1 pollo✗]                │
│ AGUA/HIELO       QUÍMICOS        PERSONAL   │
│ [6.2 hielo✗]    [3.2 botella✗]  [10.1 anillo✗]│
│                 [3.1 msds✓]                 │
│ SANITARIOS       BASURA                     │
│ [7.2 papel✗]    [8.1 pedal✓]                │
└───────────────────────────────────────────┘
   7 NO CUMPLE · 3 CUMPLE · áreas: 6 de 11
```

### Escenario 2 — Restaurant hotel medio (18 ítems)

```
┌───────────────────────────────────────────────────┐
│ RECEPCIÓN          ALMACÉN          REFRIGERACIÓN   │
│ [1.1 8°C✗]        [2.2 fifo✓]      [4.1 termo✓]     │
│ [1.3 bitácora✗]                    [4.2 lleno✗]     │
│ COCINA                              AGUA/HIELO       │
│ [5.1 65°C✗] [5.2 tablas✓]          [6.1 cloro✓]     │
│ [5.3 mise✗] [5.4 sin tira✗]                         │
│ SANITARIOS         BASURA           PLAGAS          │
│ [7.1 directa✗]    [8.2 1×día✗]     [9.1 malla✗]     │
│                                    [9.2 firmas✗]    │
│ PERSONAL                            BAR             │
│ [10.1 uniforme✗] [10.2 diarrea✗]   [11.1 huevo✗]    │
│ [10.3 capacit✓]                                     │
└───────────────────────────────────────────────────┘
   13 NO CUMPLE · 5 CUMPLE · áreas: 9 de 11
```

### Escenario 3 — Cocina central resort (28 ítems = los 28 críticos completos)

```
┌──────────────────────────────────────────────────────────────┐
│ RECEPCIÓN(3)       ALMACÉN(4)         REFRIGERACIÓN(3)         │
│ 1.1✓ 1.2✗ 1.3✓    2.1✗ 2.2✓ 2.3✗ 2.4✗  4.1✗ 4.2✓ 4.3✗         │
│ QUÍMICOS(2)        COCINA(4)           AGUA/HIELO(2)           │
│ 3.1✓ 3.2✗          5.1✓ 5.2✗ 5.3✗ 5.4✓  6.1✗ 6.2✗             │
│ SANITARIOS(2)      BASURA(2)           PLAGAS(2)               │
│ 7.1✓ 7.2✗          8.1✗ 8.2✓           9.1✓ 9.2✗               │
│ PERSONAL(3)        BAR(1)                                      │
│ 10.1✗ 10.2✗ 10.3✓  11.1✗                                       │
└──────────────────────────────────────────────────────────────┘
   17 NO CUMPLE · 11 CUMPLE · áreas: 11 de 11 (auditoría completa)
   Regla EMA-SECTUR: 1 crítico incumplido = falla la certificación.
```

> En escenario 3, el ResultsScene comunica explícitamente la regla eliminatoria: aunque el aprendiz acierte el 90%, se le muestra "En una auditoría real, los N puntos críticos que marcaste mal habrían reprobado al establecimiento" — transfer pedagógico del criterio EMA-SECTUR.

---

## 6. Estados de accesibilidad (overlay opcional)

```
┌────────────────── Accesibilidad ⚙ ──────────────────┐
│ ☐ Reducir movimiento (confetti → checkmark)          │
│ ☐ Alto contraste (UI 7:1)                            │
│ ☐ Texto grande                                       │
│ ☐ Modo Inspección Guiada (tutorial paso a paso)      │
│ Navegación: WASD/flechas · Enter interactuar · Esc   │
└──────────────────────────────────────────────────────┘
```

WCAG 2.1 A → AA (GDD §5): keyboard nav, aria-live en modales, color independence (forma+icono), contraste 4.5:1, pausa sin penalización.

---

## Bitácora

- **2026-05-23** (Fase 1.4) — Wireframes de las 4 pantallas core (Menu / Kitchen / EvaluationModal / Results) + layout físico de los 3 escenarios + overlay accesibilidad. Acompañan al content versionado de los 3 escenarios (`content/scenario-0{1,2,3}.json`) con los 28 puntos críticos sembrados fieles a la Lesson 3.5 del Módulo 3. Pendiente sign-off reviewer SECTUR + producción assets Aseprite/Tiled + materialización del proyecto Phaser ejecutable (depende de la decisión de repo).

# Zenix Learning — Patrones UI/UX

> Flujos clave (Learner / Manager / Admin) + wireframes textuales + accesibilidad. Síntesis de lo mejor del mercado (doc 03) aplicado al stack Zenix existente.
> **Última actualización:** 2026-05-21

---

## 0. Principios rectores

Aplican los §Principio Rector de Diseño Zenix (CLAUDE.md), más estos específicos del LMS:

1. **Max 3 clicks** desde Dashboard del learner hasta "estoy estudiando una lección". Lo opuesto a SF (típicamente 6-9 clicks).
2. **Hero strip "Continue learning"** siempre arriba del fold — un botón gigante para retomar (Fitts 1954 + NN/g H5 error prevention).
3. **Búsqueda fuzzy sticky en topbar** — accesible en cualquier vista del LMS (resuelve top complaint #1 doc 03).
4. **Mobile y desktop comparten lógica** pero NO layouts. Mobile usa Hub Recamarista tab; desktop usa sidebar lateral.
5. **Color system Zenix existente** — emerald (positivo/disponible), amber (advertencia), red (crítico/expirado). Cero colores nuevos.
6. **Confetti / animation NUNCA bloquea acción siguiente** — `motion-reduce:duration-0` siempre.
7. **DialogActions canónico §123** para todo modal (no inventar pares Cancelar/Confirmar).

---

## 1. Flujo Learner — Mobile (recamarera/recepcionista)

### Tab nuevo en Hub Recamarista: "Aprendizaje"

```
┌─────────────────────────────────────────────────────────┐
│  📚 Aprendizaje                          [🔍 Buscar]    │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │  CONTINUAR APRENDIENDO                          │   │
│  │  📖 Distintivo H · Módulo 3 (limpieza áreas)    │   │
│  │  Progress ████████░░░░ 67%                       │   │
│  │  ▶ [Continuar ahora]              ~5 min        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  🔴 PRÓXIMO A VENCER                                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │  ⚠ NOM-035 · Vence en 7 días                   │   │
│  │  Módulo 5 de 7 · 28 min restantes              │   │
│  │  [Estudiar] [Ver detalle]                       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  📋 ASIGNADOS POR TU SUPERVISOR                         │
│  • Limpieza profunda (3h) — Sin abrir                  │
│  • Manejo de quejas (2h) — En progreso 12%             │
│                                                          │
│  💡 RECOMENDADOS PARA TI                                │
│  • Comunicación con huéspedes internacionales          │
│  • Eficiencia en check-out express                     │
│                                                          │
│  [Ver catálogo completo →]                              │
└─────────────────────────────────────────────────────────┘
```

### Player de lección (mobile)

```
┌─────────────────────────────────────────────────────────┐
│  ← Distintivo H            Módulo 3 / Lección 2 of 5    │
├─────────────────────────────────────────────────────────┤
│  Progress de la lección ████████████░░░░░░░ 65%         │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │                                                  │    │
│  │   [Imagen: tabla cortar amarilla limpia]         │    │
│  │                                                  │    │
│  │   El código de colores en tablas de corte       │    │
│  │   evita contaminación cruzada:                   │    │
│  │                                                  │    │
│  │   • Amarillo = aves crudas                       │    │
│  │   • Rojo = carnes rojas crudas                   │    │
│  │   • Verde = vegetales                            │    │
│  │   • Azul = pescados                              │    │
│  │   • Blanco = lácteos / panadería                 │    │
│  │                                                  │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  🔊 Escuchar (audio)        📄 Transcripción            │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Pregunta rápida:                                │    │
│  │  ¿Qué color de tabla usarías para limpiar       │    │
│  │  res cruda?                                      │    │
│  │  ○ Amarillo                                      │    │
│  │  ○ Verde                                         │    │
│  │  ● Rojo  ←                                       │    │
│  │  ○ Blanco                                        │    │
│  │  [Verificar respuesta]                           │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  [← Anterior]                    [Siguiente →]          │
└─────────────────────────────────────────────────────────┘
```

**Notas críticas:**
- Botón 🔊 **Escuchar** prominente para hands-busy housekeepers (doc 07 §9).
- Quiz inline NO bloquea avance si está incorrecto — feedback informativo (§39) "Casi. Recuerda: rojo = carnes rojas crudas". El usuario continúa, pero el algoritmo SRS marca esta tarjeta para repetición.
- Anterior/Siguiente sticky bottom — Fitts 1954.
- Sin distracciones secundarias (no sidebar de chat, no upsell, no badges blinking).

---

## 2. Flujo Learner — Web (recepcionista en desktop)

### Dashboard learner web

```
┌──────────────────────────────────────────────────────────────────────┐
│  Zenix [Tulum]  · Calendario · Reportes · Aprendizaje  · ⚙ · 👤    │
├──────────────────────────────────────────────────────────────────────┤
│  📚 Mi aprendizaje                                                    │
│  [🔍 Buscar cursos...] [Categoría ▾] [Idioma ▾] [Filtros] [Catálogo]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│  CONTINUAR APRENDIENDO                                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  📖 Front Office Excellence                                  │   │
│  │  Módulo 4 — Check-in (las 16 tareas START)                  │   │
│  │                                                              │   │
│  │  ████████████████░░░░░░░░░░ 53% completo · ~8 min siguiente │   │
│  │                                                              │   │
│  │  [▶ Continuar] [Ver detalle del curso]                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│  🔴 PRÓXIMO A VENCER (1)                                              │
│  ┌─────────────────────────┐                                         │
│  │ ⚠ NOM-035-STPS          │                                         │
│  │ Vence en 7 días          │                                         │
│  │ ████████░░░░░░░ 50%      │                                         │
│  │ [Estudiar ahora]         │                                         │
│  └─────────────────────────┘                                         │
│                                                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│  📋 ASIGNADOS POR TU SUPERVISOR (3)                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                              │
│  │ Distintivo│ │ Limpieza  │ │ Manejo   │                              │
│  │ H + NOM   │ │ profunda  │ │ de quejas │                              │
│  │ ▓▓▓░ 67%  │ │ ░░░░  0%  │ │ ▓░░░ 12% │                              │
│  └──────────┘ └──────────┘ └──────────┘                              │
│                                                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│  💡 RECOMENDADOS PARA TI (basado en tu rol)                         │
│  [grid de 4 cards]                                                   │
│                                                                       │
│  🏆 MIS LOGROS                                                        │
│  [Distintivo H ✓] [10 lecciones ✓] [Trimestre activo ✓] [+5 más]   │
│  Streak: 12 días · 340 puntos                                        │
└──────────────────────────────────────────────────────────────────────┘
```

### Player de lección (web)

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Front Office Excellence              👤 Tu progreso 53%            │
├────────┬─────────────────────────────────────────────────────────────┤
│ ▼ Mod 1 │                                                              │
│  ✓ L1   │   Módulo 4 — Las 16 tareas START                            │
│  ✓ L2   │   Lección 4.3 — Saludo + ID verification                    │
│ ▼ Mod 2 │                                                              │
│  ✓ L1   │   ┌──────────────────────────────────────────────────┐    │
│  ✓ L2   │   │                                                    │    │
│  ✓ L3   │   │  [Video 4:32] Demostración saludo profesional     │    │
│ ▼ Mod 3 │   │                                                    │    │
│  ✓ L1   │   │  ▶ ━━━━○━━━━━━━━━━━━ 1:42 / 4:32  ⏩ 1.5x  🔊 ⚙  │    │
│  ✓ L2   │   │                                                    │    │
│ ▼ Mod 4 │   └──────────────────────────────────────────────────┘    │
│  ✓ L1   │                                                              │
│  ✓ L2   │   📝 Transcripción ▾                                         │
│ ●  L3 ← │   "Buenos días, bienvenido a [hotel]. Soy [nombre]..."     │
│    L4   │                                                              │
│    L5   │                                                              │
│ ▷ Mod 5 │                                                              │
│ ▷ Mod 6 │                                                              │
│ ▷ Mod 7 │                                                              │
│ ▷ Mod 8 │                                                              │
│ ▷ Mod 9 │                                                              │
│         │                                                              │
│         │   [← Anterior]                  [Marcar visto → Siguiente]  │
└────────┴─────────────────────────────────────────────────────────────┘
```

**Notas:**
- Sidebar colapsable, lección actual highlighted con ● y → indicador.
- Video con velocidad 1.5x default opcional (research learner UX: 1.25-1.5x es el promedio).
- Transcripción colapsable accesibilidad WCAG 2.1 AA.
- Sin menú secundario flotante — distraction-free mode.

---

## 3. Flujo Manager — Web

### Manager dashboard

```
┌──────────────────────────────────────────────────────────────────────┐
│  Aprendizaje · Manager view · Tulum Hostal Centro                     │
├──────────────────────────────────────────────────────────────────────┤
│  ⚠ COMPLIANCE RIESGO INMEDIATO                                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  📛 5 staff con cursos compliance vencidos o por vencer        │ │
│  │  Multa potencial STPS: hasta MXN $586,550 por trabajador        │ │
│  │  [Ver lista detallada]                                           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  📊 ESTADO POR CURSO                                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Curso                  │ Asignados │ Completados │ % │ Avg  │   │
│  │ Distintivo H + NOM-035 │ 12        │ 9           │75%│ 87  │   │
│  │ Front Office Excellence│ 4         │ 2           │50%│ 91  │   │
│  │ Housekeeping Standards │ 8         │ 5           │63%│ 84  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  👥 QUIÉN SE ESTÁ ATRASANDO  (sorted by días overdue)                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Staff           │ Curso              │ Days  │ Acción       │   │
│  │ María García    │ NOM-035            │ 12    │ [📨 Nudge]  │   │
│  │ Carlos Ruíz     │ Distintivo H       │ 8     │ [📨 Nudge]  │   │
│  │ Ana Martínez    │ Front Office       │ 5     │ [📨 Nudge]  │   │
│  │ ...                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  📅 ROADMAP DE COMPLIANCE (próximos 90 días)                          │
│  [heatmap calendar — cuáles staff vencen cuándo]                     │
│                                                                       │
│  [Crear regla de asignación automática]                              │
└──────────────────────────────────────────────────────────────────────┘
```

**Notas críticas:**
- "Quién se está atrasando" es **lista priorizada por días overdue**, NO leaderboard público.
- Nudge button = 1-click envía push notification al staff individual (no broadcast, evita alert fatigue del equipo).
- Sin métricas individuales públicas tipo "Top performer del mes" (§50 D7 paridad).

### Compliance report (STPS-grade)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Reporte de cumplimiento STPS                                         │
│  Razón social: Hotel Monica Tulum S.A. de C.V.                       │
│  Periodo: 2026-01-01 a 2026-05-21                                     │
├──────────────────────────────────────────────────────────────────────┤
│  [Filtros: Curso ▾] [Estatus ▾] [Departamento ▾]                    │
│                                                                       │
│  ✅ Cumplimiento global: 78%                                          │
│  ⚠ 3 hallazgos para subsanar antes de auditoría                       │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Staff │ Curso │ Estatus │ DC-3 Serial │ Vence │ Documentos │   │
│  │ ────────────────────────────────────────────────────────── │   │
│  │ M.G.  │ NOM-035│ Vigente │ ZNX-LRN-... │ 2027 │ [PDF] [QR] │   │
│  │ C.R.  │ Dist H │ Vencido │ ZNX-LRN-... │ 2026 │ [PDF] [QR] │   │
│  │ ...                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  [Exportar a Excel] [Exportar paquete ZIP para SIRCE]                │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Flujo Admin (ZenixAdmin / TAX_CURATOR-style content role)

### Course editor (Fase 1 — solo CORE/PRO content team de Zenix)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Editor de curso: Distintivo H + NOM-035                              │
│  Versión: 1.0.0 → 1.1.0 (draft)  · Estado: DRAFT                     │
├──────────────────────────────────────────────────────────────────────┤
│  Metadata | Módulos | Examen | Settings | Preview                     │
│ ─────────┴─────────┴────────┴──────────┴────────                     │
│                                                                       │
│  📋 MÓDULOS                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 1. Marco normativo Distintivo H        2 hrs   2 lessons  ⋯ │   │
│  │ 2. Zona de peligro + ETAs              3 hrs   4 lessons  ⋯ │   │
│  │ 3. 11 áreas evaluadas                  5 hrs   8 lessons  ⋯ │   │
│  │ 4. Higiene del manipulador             2 hrs   3 lessons  ⋯ │   │
│  │ ...                                                              │   │
│  │ [+ Agregar módulo]                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  [Save draft]  [Validate]  [Publish v1.1.0]                          │
└──────────────────────────────────────────────────────────────────────┘
```

Validation pre-publish:
- Toda lección tiene objetivo Bloom escrito como verbo
- Quiz pool size > preguntas mostradas (anti-cheat)
- Total estimatedHours = suma de modules
- Bibliografía con URLs accesibles
- Reviewer asignado y aprobado

---

## 5. Wireframe: Activación Zenix Learning desde Activate wizard

```
Etapa 6 — Staff (existente)
┌──────────────────────────────────────────────────────────────────────┐
│  Configurar tu equipo                                                 │
│                                                                       │
│  [staff existente con sus roles configurados]                        │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  🎓 Zenix Learning (DLC)                                      │   │
│  │                                                                │   │
│  │  Cumple con la Ley Federal del Trabajo (LFT Art. 153-A)      │   │
│  │  evita multas STPS hasta MXN $586,550 por trabajador,        │   │
│  │  certifica a tu equipo en Distintivo H sin sacarlos del piso.│   │
│  │                                                                │   │
│  │  ☐ Activar Zenix Learning para esta razón social             │   │
│  │     ☑ Regalo de bienvenida: curso "Distintivo H + NOM-035"  │   │
│  │       enrollado a todo el equipo (12 staff)                  │   │
│  │                                                                │   │
│  │  $7 USD / staff / mes (Learning Core)                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  [← Anterior]                                       [Siguiente →]    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Accesibilidad WCAG 2.1 AA — checklist específico LMS

- Contraste texto ≥ 4.5:1 (validado con Stark / axe)
- Targets tap ≥ 44pt (Apple HIG)
- Todo video con transcripción + closed captions opt-in
- Todo audio con transcripción
- Quiz radio buttons + labels asociados correctamente
- Navegación 100% por teclado (Tab/Shift+Tab + Enter para advance)
- `prefers-reduced-motion` respetado: 0 confetti, 0 animation
- Screen reader (VoiceOver / TalkBack) friendly — semantic HTML, aria-labels en iconos
- Idioma del contenido declarado en `<html lang="es-mx">`
- Sin reliance solo en color (icono + texto para estados pasado/fallado)

---

## 7. Estados de error con feedback informativo (§39)

| Caso | Mensaje | Acción sugerida |
|------|---------|----------------|
| Conexión offline al cargar lección | "Esta lección no está descargada. Conéctate a wifi para verla." | [Reintentar] |
| Quiz submitted sin todas las preguntas | "Te faltan 2 preguntas por responder antes de enviar." | Resalta preguntas vacías |
| Re-take antes de wait period | "Podrás intentar de nuevo en 12 horas (espera obligatoria)." | Muestra countdown |
| Sin más intentos disponibles | "Has usado tus 3 intentos. Tu supervisor puede asignarte un refresher de 4 horas." | [Solicitar refresher] |
| Course expirado | "Tu certificación de Distintivo H venció el 12 mar 2026. Re-inscríbete para mantener cumplimiento STPS." | [Re-inscribirme] |
| Curso PRO sin DLC L2 activo | "Este curso requiere el plan Learning Pro. Habla con tu supervisor para upgrade." | Sin botón Upgrade (manager decide) |

---

## 8. Bitácora

- **2026-05-21** — Doc creado. Flujos Learner mobile + web + Manager + Admin + Activate wizard + WCAG + estados error.

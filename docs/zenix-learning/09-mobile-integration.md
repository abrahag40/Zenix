# Zenix Learning — Integración con apps/mobile

> Cómo Zenix Learning aprovecha la app móvil Expo existente sin reinventar plumbing. Offline-first, audio-first, push contextual, queue sync.
> **Última actualización:** 2026-05-21

---

## 0. Por qué reutilizar `apps/mobile` y NO crear app nueva

1. **45% del uso LMS es mobile** (doc 03 §6) y creciendo a +45%/año.
2. **El staff ya tiene la app instalada** para Housekeeping (Hub Recamarista §60) o Maintenance (Sprint Mx-1B-M).
3. **Mismo login = mismo Staff** — sin re-onboarding, sin pin nuevo, sin OTP repetido.
4. **SyncManager queue offline ya existe** — el LMS hereda la infraestructura.
5. **Expo Push notifications ya configurado** — solo agregar category nueva.

Conclusión: NO nueva app. Tab adicional en navegación principal de `apps/mobile`.

---

## 1. Arquitectura mobile del LMS

```
apps/mobile/
├── app/(app)/
│   ├── (housekeeping)/        [existente]
│   ├── (maintenance)/         [existente]
│   └── (learning)/            [NUEVO — Fase 1]
│       ├── _layout.tsx        Tabs: Dashboard | Catálogo | Mi progreso
│       ├── dashboard.tsx      Continue + Due + Assigned + Recommended
│       ├── catalog.tsx        Grid de cursos con fuzzy search
│       ├── courses/
│       │   └── [slug].tsx     Detalle de curso + módulos + start
│       ├── lessons/
│       │   └── [id].tsx       Player de lección (HTML5/audio/video/PDF)
│       ├── attempts/
│       │   └── [id].tsx       Quiz/examen — adaptativo
│       └── certificates/
│           └── [serialNumber].tsx  Mi certificado
└── src/features/learning/    [NUEVO]
    ├── api/
    │   ├── courses.ts         GET /v1/learning/courses
    │   ├── enrollments.ts     POST /v1/learning/enrollments
    │   └── attempts.ts        POST /v1/learning/attempts/:id/submit
    ├── store/
    │   └── learning.store.ts  Zustand — caché offline de cursos enrollados
    ├── sync/
    │   ├── learning-sync-queue.ts  hereda de SyncManager existente
    │   └── conflict-resolver.ts    progress local vs server al re-conectar
    ├── offline/
    │   ├── lesson-prefetch.ts      descarga próximas 3 lecciones al wifi
    │   └── media-cache.ts          audio/video cached via expo-file-system
    └── components/
        ├── LessonPlayer/      switch por LessonType
        ├── QuizCard/
        └── BadgeAward/        animación on award (motion-reduce respetado)
```

---

## 2. Offline-first — flujo de descarga + sync

### Cuando el staff abre la app con buen wifi

```
1. SyncManager pulls courses asignados a este staffId
2. Para cada course IN_PROGRESS o NOT_STARTED:
   → descarga metadata (title, modules, lessons)
   → descarga MEDIA de las próximas 3 lecciones no completadas
      • audio.mp3 (priority 1, 1-3 MB típico)
      • video.mp4 LOW resolution (priority 2, opt-in user setting)
      • PDFs (priority 1, <1 MB)
      • imágenes inline del JSON contentBlocks
3. SRS cards descargadas (todas las due en próximos 7 días)
4. Quiz pools descargados (banco completo del curso enrollado)
```

### Cuando el staff trabaja sin conexión

```
1. Abre lección → render desde cache local
2. Marca progreso (timeSpent, bookmarkPosition) → guarda local
3. Completa lección → enqueue evento "lesson_completed"
4. Toma quiz → respuestas guardadas local + scoring local
   (con respuestas correctas que vinieron pre-fetched en el quiz pool)
5. Cuando recupera wifi → SyncQueue replay todos los events en orden
   POST /v1/learning/lessons/:id/progress (idempotency-key)
   POST /v1/learning/attempts (con timestamp original)
```

### Conflict resolution

| Conflicto | Estrategia |
|-----------|-----------|
| Local progress > Server progress | Local gana (más reciente) |
| Local IN_PROGRESS vs Server COMPLETED | Server gana (probablemente otro device) |
| Local attempt submitted offline vs Server attempt submitted simultáneamente | Ambos se conservan en `LearningAttempt`. UI muestra el mejor score |
| Lección retirada en server pero ya descargada local | Permite completar para no perder progreso; mark como `viewedAfterRetirement: true` |

---

## 3. Audio-first para hands-busy housekeepers (doc 07 §9)

### Patrón "Spotify para training"

```
┌──────────────────────────────────┐
│  📚 Distintivo H · Módulo 3       │
│                                   │
│  ┌──────────────────────────┐    │
│  │  ▶ Lección 3.2           │    │
│  │  "Sustancias químicas"   │    │
│  │  ━━━━○━━━━━━━ 2:14/4:32  │    │
│  │  ⏪ ⏯ ⏩  🔁  📋 quiz     │    │
│  └──────────────────────────┘    │
│                                   │
│  Próximo: 3.3 "Refrigeración"    │
│  [⬇ Descargar próximos 5]        │
└──────────────────────────────────┘
```

- Mini-player **persistent** en footer del Hub (estilo Spotify mini-player).
- **Background audio** sigue cuando bloquea pantalla — `expo-av` con `staysActiveInBackground: true`.
- **AirPods/audífonos Bluetooth** controles físicos (next/previous track) → next lesson / previous lesson.
- **Auto-pausa al recibir llamada** (estándar iOS/Android).
- **Lock screen controls** muestran portada del curso + título de lección.

### UX nota crítica

El quiz que sigue al audio NO se reproduce auto al terminar la audio. Spawnea un push notification local: "📝 Lección 3.2 terminada — 2 preguntas rápidas (1 min)". El staff abre cuando puede.

---

## 4. Push notifications — patrón anti-fatigue

### Tipos de notif y reglas

| Tipo | Cuándo | Frecuencia máx | Silenciable |
|------|--------|----------------|-------------|
| **Reminder de curso pendiente** | 10 min antes del inicio del turno | 1/día | ✅ via `LearningPreferences.pushReminders` |
| **Curso por vencer** (Distintivo H, NOM-035) | 7d, 3d, 1d antes de `expiresAt` | 3 totales por enrollment | ❌ compliance fiscal |
| **Nuevo curso asignado por supervisor** | Inmediato al assign | 1 por evento | ✅ |
| **Badge desbloqueado** | Inmediato | 1 por evento, max 1/día consolidated | ✅ |
| **Reminder de quiz post-audio** | 5 min tras completar audio | 1 por audio | ✅ |
| **Weekly digest** | Lunes 9am local | 1/semana | ✅ |

**Regla canónica:** max **2 push notifications de Learning por día** por staff, sin importar cuántos cursos tenga. Si excede → consolida en una sola "Tienes 3 pendientes de Learning hoy".

### Timing inteligente

El scheduler `reminder.scheduler.ts` (apps/api) **NO envía a las 11 PM**. Lee `Shift.startTime` del staff:
- Si tiene turno mañana 7 AM → envía a las 6:50 AM
- Si no tiene turno hoy → no envía (es día libre)
- Si está en turno actual → envía 10 min antes de break más cercano (lee `BreakSchedule`)

---

## 5. Componentes UI mobile clave

### Hub Recamarista — nuevo tab "Aprendizaje"

Agrega icono en navegación principal junto a Housekeeping y Maintenance:

```typescript
// app/(app)/_layout.tsx
<Tabs.Screen
  name="(learning)"
  options={{
    title: 'Aprendizaje',
    tabBarIcon: ({ color }) => <BookOpen color={color} />,
    tabBarBadge: dueSoonCount > 0 ? dueSoonCount : undefined,
    tabBarBadgeStyle: { backgroundColor: '#dc2626' },  // red cuando hay due soon
  }}
/>
```

Badge red en el icono cuando hay >0 cursos due soon — micro-interaction validada (Apple HIG).

### LessonPlayer (switch por type)

```typescript
const LessonPlayer = ({ lesson }: { lesson: Lesson }) => {
  switch (lesson.type) {
    case 'HTML5_NATIVE': return <Html5Player blocks={lesson.contentJson} />
    case 'VIDEO_MP4':    return <VideoPlayer source={lesson.videoUrl} />
    case 'AUDIO_MP3':    return <AudioPlayer source={lesson.audioUrl} title={lesson.title} />
    case 'PDF_DOCUMENT': return <PdfReader source={lesson.pdfUrl} />
    case 'SCORM_12':     return <ScormPlayer pkgUrl={lesson.externalPackageUrl} />  // Fase 2
    case 'SCORM_2004':   return <ScormPlayer pkgUrl={lesson.externalPackageUrl} />  // Fase 2
    case 'XAPI_PACKAGE': return <XApiPlayer pkgUrl={lesson.externalPackageUrl} />   // Fase 2
  }
}
```

---

## 6. Performance + battery

- **Imágenes**: `expo-image` con `contentFit="cover"` y `cachePolicy="memory-disk"`.
- **Video**: `expo-av` con `shouldPlay={false}` por default. User-initiated play.
- **Background sync**: `expo-background-fetch` con interval ≥15 min (no más frecuente — battery).
- **SSE foreground only** (§51 D8 paridad): cuando la app está en foreground, SSE actualiza notif center. En background, solo push.
- **Lazy load** de cursos: catálogo paginado (20 por vista), lecciones se cargan al abrir el curso.

---

## 7. Testing en mobile

QA-α (CLAUDE.md Pending) cubre Hub Recamarista 0 specs actuales. Sprint LEARNING-CORE debe agregar:

- **Smoke tests** Detox (E2E): login → tab Learning → start course → complete lesson → take quiz → see certificate.
- **Unit tests** Jest-Expo:
  - `learning-sync-queue.test.ts` — offline events sincronizan en orden correcto
  - `srs-algorithm.test.ts` — SM-2 calcula intervalos esperados
  - `conflict-resolver.test.ts` — happy + conflicting scenarios
  - `media-cache.test.ts` — descarga + eviction LRU

---

## 8. Integración con Hub Maintenance + Hub Housekeeping

### Cross-link contextual

- Cuando una `MaintenanceTicket` con `category=SAFETY` se crea → mostrar tarjeta "Curso relacionado: Seguridad y emergencias" en el detalle del ticket.
- Cuando un `CleaningTask` con `priority=CRITICAL` se asigna → si el staff no tiene "Limpieza profunda" completado, sugerir tomarlo (no bloquear).
- Cuando un staff completa "Distintivo H" → badge visible en su perfil Hub Housekeeping (positive reinforcement sin leaderboard).

---

## 9. Roadmap mobile específico

| Sprint | Mobile work | Días |
|--------|-------------|------|
| **LEARNING-CORE Fase 1.1** | Tab Learning + Dashboard + Catalog + Player HTML5/audio | 8 |
| **LEARNING-CORE Fase 1.2** | Quiz + SRS + sync queue + certificate viewer | 6 |
| **LEARNING-CORE Fase 1.3** | Push notif inteligente + weekly digest + reminders | 3 |
| **LEARNING-PRO** (Fase 2 v1.1.x) | SCORM/xAPI player + course authoring upload | 12 |

---

## 10. Bitácora

- **2026-05-21** — Doc creado. Estructura Expo + offline-first + audio-first + push anti-fatigue + components + testing.

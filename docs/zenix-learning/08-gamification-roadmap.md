# Zenix Learning — Gamificación: Roadmap Ligera → Media → Profunda

> Plan de evolución de gamificación en 3 fases con justificación pedagógica + métricas de salto + límites éticos.
> Fase 1 (ligera) es lo que se entrega en v1.0.0/v1.1.0. Fases 2-3 son roadmap documentado para no perder dirección.
> **Última actualización:** 2026-05-21

---

## 0. Por qué este doc existe (la pregunta del usuario)

Decisión del 2026-05-21: **Fase 1 gamificación ligera, pero con el plan documentado para llegar al punto 3 (profunda) como producto final.**

El riesgo de "ligera para siempre" es plateau de engagement a los 3 meses (Hamari, Koivisto, Sarsa 2014 — efecto novelty wears off). El riesgo de "profunda desde día 1" es over-engineering + ECL excesivo (Sweller 1988) + costo alto.

La solución es **roadmap explícito con gates cuantitativos** entre fases. Cada fase tiene métrica de salto medible — sin gut feeling.

---

## 1. Marco ético no-negociable (aplica a TODAS las fases)

Derivado de doc 07 §6 (Deci & Ryan SDT) y §8 (Octalysis White vs Black Hat):

| Regla | Por qué |
|-------|---------|
| **OFF por default** la gamificación para staff nuevo. Opt-in explícito vía `LearningPreferences.gamificationOptIn` | Crowding-out effect — no imponer recompensa extrínseca a quien aún no sabemos su motivación intrínseca |
| **Métricas individuales privadas** (§50 D7 paridad) | LFPDPPP + Deci & Ryan 1999 — leaderboards públicos backfire |
| **Sin streaks con loss aversion** estilo Duolingo (perder racha si no entras 1 día) | Drive 8 Black Hat Octalysis — addictive, no ético en contexto laboral. La camarera no debe sentir ansiedad en su día libre |
| **Streaks SÍ permitidos como métrica positiva** (current streak visible) pero NUNCA con penalización (no "perdiste 30 días") | Empoderamiento sin manipulación |
| **No comparativos peer-to-peer públicos** sin opt-in de ambas partes | Privacidad + bienestar |
| **Aprendizaje obligatorio NUNCA usa gamificación oscura** | LFT-compliance no debe disfrazarse de juego |
| **Notificación de "te falta poco para tu badge" max 1/semana** | Alert fatigue + no manipulación |
| **Badges performance-contingent, no participation-contingent** | Kapp 2014 — research muestra que extrinsic rewards de mérito fomentan intrinsic motivation; los de participación la destruyen |

---

## 2. Fase 1 — Gamificación Ligera (v1.0.0/v1.1.0 — incluida en DLC L1)

### Componentes

| Componente | Implementación | Drive Octalysis | Riesgo |
|------------|----------------|-----------------|--------|
| **Puntos por lección completada** | `+10` por lesson normal, `+25` por examen pasado | 2 (Desarrollo) | Bajo |
| **Badges fundacionales** | "Primera lección" · "Curso completo" · "10 lecciones" · "Distintivo H certificado" · "Trimestre activo" | 1 (Significado) + 2 | Bajo |
| **Progress bars per-curso + per-módulo** | Visible siempre, no oculto. Color emerald gradient | 2 (Desarrollo) | Cero |
| **Current streak (sin penalización)** | Solo display "12 días consecutivos aprendiendo" — opt-in via `LearningStreak.gamificationOptIn` | 2 + 3 (Empoderamiento) | Medio (si default ON sería §1 violado) |
| **Confetti animation al pasar examen** | Una vez por examen, reducible motion-reduce | 2 + emocional | Bajo |
| **Certificate de descarga PDF + share LinkedIn** | Opt-in. Genera traffic orgánico Zenix | 1 (significado) + 3 (empoderamiento) | Cero |

### Lo que NO va en Fase 1

- ❌ Leaderboards públicos (per-equipo NI per-property NI agregados visibles)
- ❌ Streaks con loss aversion
- ❌ Mini-games complejos
- ❌ Simuladores
- ❌ Team challenges
- ❌ Reward económica (bonos, vouchers)

### Métricas de salto a Fase 2

Se gatilla la transición cuando, **3 meses post-launch en piloto Hotel Monica Tulum**, se cumplen TODAS:

1. **DAU/MAU > 40%** (engagement diario sobre mensual). Industria SaaS sano: 20-30%. >40% en LMS es muy bueno.
2. **Completion rate de cursos compliance > 85%** (Distintivo H, NOM-035).
3. **Survey post-curso "siento que estoy aprendiendo" > 7/10 promedio** (Kirkpatrick L1).
4. **Plateau detectado** — DAU/MAU mes 4 baja ≥10% vs mes 3 (novelty wears off — Hamari 2014).

Si los 3 primeros se cumplen Y el cuarto se gatilla → Fase 2 va.
Si los 3 primeros NO se cumplen → re-iterar Fase 1, no avanzar.
Si solo el 4to se gatilla → es desinterés general del producto, no problema de gamificación.

---

## 3. Fase 2 — Gamificación Media (v1.1.x — DLC L2)

### Componentes nuevos

| Componente | Implementación | Curso afectado | Costo dev estimado |
|------------|----------------|----------------|---------------------|
| **Mini-game drag&drop "Organiza el cuarto"** | HTML5 canvas — arrastrar amenities a su posición correcta en planta de habitación. Score por exactitud + tiempo | Housekeeping Standards | 2 semanas |
| **Quiz timed estilo HQ Trivia** | 10 preguntas, 15 seg cada una, multiplicador por velocidad | Cualquier curso, opt-in | 1.5 semanas |
| **Branching scenarios "Elige tu propia aventura"** | JSON-driven, decisiones cambian outcome del caso | Front Office (quejas), NOM-035 (acoso) | 3 semanas por scenario |
| **Escape room textual** | Resolver 5 puzzles temáticos (acertijos higiénicos, identificación riesgos) para "salir" del cuarto | Distintivo H | 4 semanas |
| **Team challenges opt-in** | Grupo de 3-5 staff acuerda objetivo compartido (ej: "Todos completamos NOM-035 antes del 30") | Cualquier curso | 2 semanas |
| **Recommendation engine basado en historial** | "Completaste Distintivo H — quizás te interese NOM-035 capítulo Liderazgo" | Sistema | 2 semanas (sin AI; reglas heurísticas) |

### Lo que sigue OFF

- ❌ Leaderboards públicos individuales
- ❌ Streaks con penalización
- ❌ Variable rewards (loot boxes) — Drive 7 Black Hat
- ❌ Comparación pública per-staff

### Métricas de salto a Fase 3

1. **Knowledge retention 60d > 70%** (quiz auto-disparado 60 días post-completion).
2. **Behavior change observado**: mystery shopper o supervisor checklist muestra ≥30% mejora baseline en tareas evaluadas (Kirkpatrick L3).
3. **NPS Zenix Learning ≥ 50** (clientes recomendarían el LMS).
4. **Customer demand explícita**: ≥3 clientes piden simuladores realistas (necesidad real, no asumida).

---

## 4. Fase 3 — Gamificación Profunda (v1.3.x+ — DLC L3 o Custom)

### Componentes propuestos

| Componente | Detalle | Costo dev estimado | Diferenciador |
|------------|---------|--------------------|---------------|
| **Front-Desk Simulator** | Sandbox completo del PMS Zenix con guests-IA (LLM Claude/GPT-4 mini como huésped) — check-in, queja, escalation, upselling. Sesión 20-40 min. Score multi-dimensional (eficiencia, tono, compliance PCI, upsell) | 8-12 semanas | Único en LATAM PMS-LMS |
| **Crisis Response VR** | Escenarios VR: incendio en piso 4, asalto en lobby, huésped en convulsión. Hardware Oculus Quest 3 o equivalente. Stand-alone web XR fallback | 12-16 semanas | Único globalmente para PMS |
| **Role-play LLM** | Sesión 1-a-1 con LLM que actúa como huésped difícil. Coach IA califica respuesta del recepcionista en tiempo real, sugiere mejoras | 6-8 semanas | Diferenciador real |
| **Digital credentials abiertos** | Badges Open Badges 2.0 / Verifiable Credentials W3C — staff puede embeber en LinkedIn, CVs, portfolios | 4 semanas | Hard differentiator |
| **Integración con People (v1.7)** | Skills mapping automático — completar X curso desbloquea progresión a rol Y. Trigger en `PerformanceReview` | 6-8 semanas | Combo unique |

### Riesgos a vigilar

- **Sobre-engineering vs problemas reales**: si en piloto solo 5% usa VR, no es ROI.
- **VR en LATAM**: hardware escaso, costo barrier. Mantener fallback web XR + standard player.
- **LLM tutor costos**: tokens API caros si uso masivo. Cache aggressive de respuestas + rate-limiting per-staff.
- **Privacy del simulador**: si guarda video del usuario, requiere consent explícito (LFPDPPP).

### Métricas de éxito Fase 3

- Kirkpatrick **L4 (Results)**: turnover staff capacitado < turnover staff no-capacitado en ≥15%.
- Kirkpatrick **L5 (ROI Phillips)** demostrable: Zenix Learning ROI > 200% (beneficio monetario / costo programa).
- NPS staff sobre el LMS > 60.
- Diferenciador en pitch comercial Cloudbeds/Mews/Opera ROI medible.

---

## 5. Comparación lado-a-lado de las 3 fases

| Aspecto | Fase 1 — Ligera | Fase 2 — Media | Fase 3 — Profunda |
|---------|-----------------|----------------|---------------------|
| Versión Zenix | v1.0.0 / v1.1.0 | v1.1.x | v1.3.x+ |
| DLC tier | L1 incluido | L2 incluido | L3 Custom + L4 Marketplace |
| Costo dev incremental | bundled en sprint base | ~12-15 semanas dedicadas | ~30-40 semanas dedicadas + hardware |
| Octalysis Drives activos | 1, 2, 3 (todos White Hat) | 1, 2, 3, 5 (con guardrails) | 1, 2, 3, 5 + más profundo (no 6-8) |
| Riesgo crowding-out | Bajo (opt-in) | Medio (team dynamics) | Alto si no se cura |
| Retention 60d target | 50% | 70% | 80% |
| Mobile-first | ✅ siempre | ✅ algunos juegos solo desktop | ✅ + VR opcional |
| Diferenciador comercial | Bundle PMS | LMS feature-rich | PMS+LMS único en LATAM |
| Métricas Kirkpatrick | L1+L2 | L1-L3 | L1-L5 |

---

## 6. Anti-patterns explícitos (lo que NUNCA hacer)

1. **NO copiar Duolingo Streak con loss aversion**. Funciona porque Duolingo es voluntario; Zenix Learning es semi-obligatorio (compliance LFT). Combinación = explotación.
2. **NO publicar leaderboard "Recamarera del Mes"**. LFPDPPP + Deci & Ryan crowding-out + cultura tóxica.
3. **NO usar variable reward** (loot boxes con probabilidades secretas) — Drive 7 Octalysis Black Hat, regulado como gambling en varios países.
4. **NO recompensar tiempo en pantalla** (más tiempo ≠ más aprendizaje; gamification de tiempo lleva a "farming" — Hamari 2014).
5. **NO ocultar progress bars hasta el final**. El learner debe ver dónde está siempre (NN/g H1 visibility).
6. **NO mostrar "tu compañero ya terminó este curso"**. Comparación social no consensuada destruye motivación intrínseca.
7. **NO dar bono económico por completion** sin estudio Kirkpatrick L3+ — riesgo de aprender solo para cobrar, olvidar al día siguiente.

---

## 7. Bitácora de revisiones

- **2026-05-21** — Doc creado. 3 fases + métricas gate + 8 reglas éticas + anti-patterns.

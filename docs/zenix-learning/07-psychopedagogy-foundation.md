# Zenix Learning — Fundamentos psicopedagógicos

> Bases académicas que justifican CADA decisión del LMS Zenix. Cualquier feature que no se pueda trazar a 1+ teoría citada aquí debe re-debatirse.
> **Última actualización:** 2026-05-21

---

## 1. Andragogía (Knowles 1980/1984) — 6 principios aplicados al LMS hotelero

Malcolm Knowles publicó las primeras 4 asunciones en 1980; la quinta apareció en 1984; la sexta (necesidad de saber) se consolidó posteriormente. La andragogía no es "pedagogía para adultos" — es un modelo distinto que asume que el adulto aprende cuando el contenido **resuelve un problema inmediato**, no cuando se le impone por jerarquía ([Knowles via Research.com](https://research.com/education/the-andragogy-approach); [eLearning Industry — Knowles](https://elearningindustry.com/the-adult-learning-theory-andragogy-of-malcolm-knowles)).

| Principio | Aplicación en Zenix Learning |
|-----------|------------------------------|
| **1. Necesidad de saber** | Cada curso abre con "Por qué esto importa hoy en tu turno" (no historia del hotel, no marco legal abstracto). Ej: módulo "Limpieza profunda" abre con foto del último chargeback Visa 13.1 por habitación sucia. |
| **2. Auto-concepto (autodirección)** | Permitir reordenar capítulos, marcar "ya lo sé" para saltar pre-test, elegir orden de los cursos opcionales. El recepcionista NO es estudiante de primaria. |
| **3. Experiencia previa** | Cada lección pide al inicio: "¿Has manejado un huésped agresivo? Sí/No". Si sí → caso analítico. Si no → caso introductorio. Pattern Khan Academy diagnostic. |
| **4. Disposición a aprender** | Vincular contenido a evento real próximo: "Tienes 3 OTAs llegando este fin de semana → 5 min sobre check-in OTA ahora". |
| **5. Orientación al aprendizaje** | Problem-based, no subject-based. En lugar de "Capítulo: Tipos de habitación" → "Caso: un huésped quiere upgrade y no hay disponibilidad — ¿qué haces?". |
| **6. Motivación interna (evolutiva)** | Knowles reconoce que adultos PUEDEN motivarse extrínsecamente ("o aprendes o te despiden") pero retención es inferior. Diseño debe **migrar progresivamente** a motivación intrínseca (ver §6 SDT). |

**Implicación crítica para LATAM:** la motivación de compliance LFT-México arranca extrínseca. Pero si el LMS solo ofrece "completar para no ser sancionado", el contenido se olvida. Hay que diseñar el primer 5-10% del curso como **demostración de utilidad personal** ("este curso te enseña a manejar la queja del huésped sin que tu supervisor tenga que rescatarte"), no como "esto es obligatorio".

---

## 2. Taxonomía de Bloom revisada (Anderson & Krathwohl 2001)

La revisión convirtió **sustantivos → verbos**, y movió "Crear" arriba de "Evaluar" ([Quincy College PDF de Anderson & Krathwohl](https://quincycollege.edu/wp-content/uploads/Anderson-and-Krathwohl_Revised-Blooms-Taxonomy.pdf); [Valamis Hub](https://www.valamis.com/hub/blooms-taxonomy); [PMC NIH](https://pmc.ncbi.nlm.nih.gov/articles/PMC4511057/)).

### 6 niveles + verbos para escribir objetivos medibles

| Nivel | Verbos canónicos | Ejemplo hotelero | Competencia típica |
|-------|------------------|------------------|---------------------|
| **1. Recordar** | listar, nombrar, definir | "Lista los 5 amenities estándar de una habitación Junior Suite" | Onboarding día 1 |
| **2. Comprender** | explicar, parafrasear, clasificar | "Explica la diferencia entre OTA-collect y Hotel-collect" | Front-desk semana 1 |
| **3. Aplicar** | ejecutar, demostrar, resolver | "Procesa un check-in con saldo OTA pendiente en el simulador" | **Housekeeping operativo**, recepción rutinaria |
| **4. Analizar** | comparar, diferenciar, atribuir | "Identifica por qué este intento de no-show tiene riesgo de chargeback Visa 13.7" | Supervisor recepción |
| **5. Evaluar** | criticar, justificar, validar | "Evalúa si la tarifa propuesta para temporada alta maximiza RevPAR vs ocupación" | **Revenue management**, dirección |
| **6. Crear** | diseñar, formular, planear | "Diseña un protocolo de respuesta para una crisis de overbooking" | GM, propietario |

**Regla operativa Zenix:** todo objetivo de aprendizaje en el LMS debe empezar con verbo (no "Comprensión de no-shows" sino "**Identificar** 3 señales tempranas de un no-show antes de las 20:00"). Esto hace la evaluación inequívoca.

**Dimensión del conocimiento (innovación 2001):** además de los 6 niveles cognitivos, añadieron 4 tipos de conocimiento — Factual, Conceptual, Procedimental, Metacognitivo. Housekeeping es 80% Procedimental; Revenue Management es 80% Conceptual + Metacognitivo. **El LMS debe estar etiquetado en ambos ejes** para que el algoritmo de spaced repetition (ver §4) sepa cuánto repaso necesita cada item.

---

## 3. Microlearning (Karl Kapp 2013/2019; Will Thalheimer)

### Por qué chunks de 3-7 minutos

Kapp define microlearning no como "videos cortos" sino como **información altamente targeted que cubre 1-2 conceptos** ([Talented Learning podcast Kapp](https://talentedlearning.com/about-microlearning-karl-kapp-podcast-interview/); [getAbstract resumen Kapp & Defelice 2019](https://www.getabstract.com/en/summary/microlearning-short-and-sweet/38272)). El argumento es cognitivo: la working memory (Miller 1956: 7±2 chunks) se satura tras 8-10 minutos de contenido nuevo denso.

### Evidencia de retención

- **Estudios sintetizados por Kapp et al. (2015)**: información en piezas pequeñas se retiene mejor que en formato curso largo ([Walden University dissertation citing Kapp](https://scholarworks.waldenu.edu/cgi/viewcontent.cgi?article=19444&context=dissertations)).
- **Pilot con mobile spaced microlearning**: retención **20% mayor** vs formato curso tradicional ([Haekka 2025 sintetiza estudios](https://www.haekka.com/blog/microlearning-vs-traditional-learning); [TechClass mobile learning](https://www.techclass.com/resources/learning-and-development-articles/how-mobile-learning-improves-knowledge-retention-and-engagement)).
- **Will Thalheimer ("Spacing Learning Events Over Time", 2009)**: el spacing effect — distribuir aprendizaje en el tiempo en vez de masivo — es uno de los efectos más replicados en ciencia del aprendizaje. **Importante: micro NO basta solo**; sin spacing es ineficaz. ([Thalheimer PDF](https://www.worklearning.com/wp-content/uploads/2017/10/Spacing_Learning_Over_Time__March2009v1_.pdf); [Five reasons spacing effect](https://www.worklearning.com/2017/01/07/five-reasons-learners-experience-the-spacing-effect/)).

### Aplicación a housekeeping LATAM en breaks

Camarera de hostal típicamente tiene:
- 5-7 min entre cuartos (cargar carrito, mover al siguiente)
- 30 min de almuerzo
- 10 min al cierre del turno

**Diseño Zenix:** módulos de **4 min con audio + 1 quiz de 2 preguntas**. Audio porque las manos están ocupadas (ver §10). Quiz al final fuerza retrieval practice (efecto de prueba — Roediger & Karpicke 2006).

---

## 4. Spaced Repetition (Ebbinghaus 1885; SuperMemo SM-2; Anki)

### Forgetting curve

Ebbinghaus (1885) experimentó consigo mismo memorizando sílabas sin sentido. Descubrió que:
- **20 min después**: 42% olvidado
- **1 hora después**: 56% olvidado
- **24 horas después**: ~66% olvidado
- Después la curva se aplana ([SuperMemo - Ebbinghaus history](https://www.supermemo.com/en/blog/history-of-spaced-repetition); [Tegaru SM-2 explained](https://tegaru.app/en/blog/sm2-algorithm-explained))

### Algoritmo SM-2 (Piotr Woźniak, SuperMemo 1987)

SM-2 ajusta el intervalo de repaso basado en la calidad de recuerdo del estudiante (escala 0-5). Componentes:

1. **Easiness Factor (EF)** inicial = 2.5. Sube si responde fácil, baja si responde difícil. Mínimo 1.3.
2. **Intervalo siguiente:**
   - 1ª repetición correcta → 1 día
   - 2ª repetición correcta → 6 días
   - n-ésima repetición → `intervalo_anterior × EF`
3. **Si falla** (calidad < 3) → reset a 1 día.

SM-2 logra **200-300% mejor retención** vs estudio masivo ([SATHEE IIT-K SM-2](https://sathee.iitk.ac.in/pyqs/spaced-repetition/algorithms/sm2-algorithm/); [Julien Sobczak Anki SRS](https://juliensobczak.com/inspect/2022/05/30/anki-srs/)). Anki y todos los SRS modernos derivan de SM-2.

### Aplicación a re-certificación anual STPS

LFT-México obliga a cursos anuales para ciertos roles. En lugar de "1 día de curso anual" donde se olvida el 80% en 30 días:

- **Curso inicial**: 4h distribuidas en 8 sesiones de 30 min durante 2 semanas
- **Cards SRS** generadas automáticamente desde los conceptos críticos (formulación legal, números, procedimientos)
- **Re-trigger automático** del card cuando SM-2 predice olvido inminente
- **Examen STPS** se reduce a "checkpoint" — el contenido ya está fijado por repetición espaciada
- **Cumplimiento auditable**: el LMS exporta histórico de retrievals exitosos con timestamps para defensa ante inspector STPS

---

## 5. Cognitive Load Theory (Sweller 1988, 1994, 2011)

Sweller construyó CLT sobre Miller 1956 (working memory 7±2) ([Cognitive Load - Wikipedia](https://en.wikipedia.org/wiki/Cognitive_load); [Sweller, Ayres & Kalyuga 2011 via Springer](https://link.springer.com/article/10.1007/s10648-019-09465-5); [Paas & van Merriënboer 2020](https://journals.sagepub.com/doi/10.1177/0963721420922183)).

### 3 tipos de carga

| Tipo | Definición | Estrategia de diseño |
|------|-----------|----------------------|
| **Intrínseca (ICL)** | Complejidad inherente del contenido (ej: cálculo CFDI tiene ICL alta; saludar al huésped tiene ICL baja) | NO se puede reducir, solo **segmentar**: enseñar partes antes de el todo (worked examples) |
| **Extrínseca (ECL)** | Carga IRRELEVANTE causada por mala instrucción (animaciones decorativas, jerga, layout confuso) | **Eliminar agresivamente** — esto es donde el diseñador agrega valor |
| **Germane (GCL)** | Carga "buena" — esfuerzo de construir esquemas mentales | Promover con preguntas reflexivas, ejemplos contrastantes |

**Nota 2011:** Sweller refinó el modelo: germane ya no es categoría independiente sino los recursos working-memory **devotos a procesar ICL** ([Frontiers Psychology 2017](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01997/full); [PMC Collaborative CLT](https://pmc.ncbi.nlm.nih.gov/articles/PMC6435105/)).

### Aplicación a pantallas de curso

Conexión directa con **§Principio Rector de Diseño Zenix (max 7 elementos)**:

- Una pantalla de lección NUNCA muestra más de 5 elementos simultáneos (botón seguir, video, transcripción, progreso, takeaway). Cualquier extra es ECL.
- **Coherence principle (Mayer 2009 — multimedia learning principle)**: eliminar música de fondo, decoraciones, iconos genéricos que no aportan al concepto.
- **Modality principle**: si hay imagen compleja, audio en lugar de texto narrativo (los dos canales sensoriales se distribuyen mejor que dos cargas visuales).
- **Worked examples** antes de problem solving: para conceptos ICL alta (ej: aritmética CFDI), mostrar ejemplo resuelto paso a paso ANTES de pedir al usuario resolver.

---

## 6. Self-Determination Theory (Deci & Ryan 1985, 2000, 2020)

3 necesidades psicológicas básicas universales ([SDT - APA](https://www.apa.org/research-practice/conduct-research/self-determination-theory.html); [Ryan & Deci 2000 PDF](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf); [Ryan & Deci 2020 review](https://stial.ie/resources/Ryan%20and%20Deci%202020%20self%20determination%20theory.pdf)):

1. **Autonomía** — sensación de elección y autogobierno. NO de hacer lo que sea, sino de actuar con volición.
2. **Competencia** — sentir que progresas, que el reto es alcanzable pero no trivial.
3. **Relación (relatedness)** — sentirte conectado, valorado, parte de algo.

Cuando las 3 se satisfacen → **motivación intrínseca alta** + bienestar + persistencia.

### Crowding-out effect (Deci 1971 experimento clásico)

Si das **recompensa extrínseca** (dinero, badge, leaderboard rank) por una tarea **intrínsecamente motivante**, la motivación intrínseca **se destruye**. El estudiante deja de hacer la actividad por interés y la hace solo por la recompensa. Cuando la recompensa desaparece, la tarea se abandona.

Mecanismo: la recompensa cambia el **locus of causality** de interno ("lo hago porque me interesa") a externo ("lo hago por el premio"). El cerebro reinterpreta retrospectivamente.

### Implicación: leaderboards públicos son riesgo

Un leaderboard público de "Recamarera del Mes" puede:
- ✅ **Funcionar** en culturas hospitalarias donde el reconocimiento público es valor (varias subculturas mexicanas).
- ❌ **Backfirar** porque (a) los que pierden se desmotivan (crowding-out por comparación social); (b) Deci & Ryan 1999 meta-análisis: efectos negativos de leaderboards en motivación intrínseca son moderados pero replicables; (c) en LFPDPPP / privacidad LATAM, exponer métricas individuales puede ser violación.

**Decisión Zenix §50 ya alineada**: métricas individuales son **privadas**. Comparativos solo agregados o opt-in explícito.

### Cómo evolucionar de extrínseca → intrínseca

Ryan & Deci proponen el **Continuum de Motivación**: amotivación → extrínseca controlada → extrínseca identificada → extrínseca integrada → intrínseca. El LMS debe:

1. **Mes 1**: contenido obligatorio (extrínseca controlada). Diseño debe demostrar utilidad personal inmediata.
2. **Mes 2-3**: dar choices ("elige el siguiente curso entre 3"). Construye autonomía.
3. **Mes 4+**: contenido opcional vinculado a ascenso ("Junior Supervisor track"). Construye competencia + identificación.
4. **Mes 6+**: opt-in a foros peer ("ayuda a otra camarera nueva"). Construye relación.

---

## 7. Flow (Csikszentmihalyi 1990)

Flow es el estado óptimo de experiencia donde **el reto iguala o levemente excede la habilidad**, hay metas claras, feedback inmediato, y se pierde la consciencia del tiempo ([Csikszentmihalyi via Structural Learning](https://www.structural-learning.com/post/flow-state); [Flow theory educational](https://www.growthengineering.co.uk/flow-theory/); [Flow psychology Wikipedia](https://en.wikipedia.org/wiki/Flow_(psychology))).

### Diagrama clásico (canal de flow)

```
Reto alto + habilidad baja  = ANSIEDAD
Reto bajo + habilidad alta  = ABURRIMIENTO
Reto bajo + habilidad baja  = APATÍA
Reto alto + habilidad alta  = FLOW ✓
```

### Aplicación a quiz adaptativo

Quiz fijo (10 preguntas iguales para todos) garantiza:
- Trabajadores experimentados → aburrimiento → skipping
- Trabajadores nuevos → ansiedad → abandono

**Quiz adaptativo Zenix:**
- Pregunta 1: dificultad media.
- Si correcto → siguiente sube +1 nivel. Si fallo → baja -1.
- Algoritmo IRT (Item Response Theory) o el más simple "elo-rating" estilo Khan Academy.
- **Resultado: cada usuario opera ~5-10% por encima de su nivel actual** → flow.

Estudios muestran 30-40% mayor engagement con tareas en flow vs fuera ([Growth Engineering — flow research synthesis](https://www.growthengineering.co.uk/flow-theory/)).

---

## 8. Gamification — Kapp 2012; Werbach & Hunter 2012; Octalysis (Chou)

### Diferencia: gamification superficial vs serious games

| Concepto | Definición | Ejemplo |
|----------|-----------|---------|
| **Gamification superficial (PBL)** | Aplicar mecánicas de juego (Points, Badges, Leaderboards) a contexto no-juego | Salesforce trailhead badges |
| **Serious games** | Juego completo con mecánica y narrativa diseñados para enseñar | "Foldit" (jugar a plegar proteínas) |
| **Simulación** | Réplica fiel del entorno real para entrenar | Simulador front-desk |

Werbach & Hunter ("For the Win", 2012, Wharton Press, [Goodreads](https://www.goodreads.com/book/show/16033680-for-the-win)) advierten: **PBL no es razón para implementar gamificación — es algo que sucede dentro**. Su framework: Dynamics > Mechanics > Components (puntos son componentes; narrativa y propósito son dynamics).

### Octalysis — 8 core drives (Yu-kai Chou 2003, libro 2015)

[Octalysis Group](https://octalysisgroup.com/framework/) · [Wikipedia Octalysis](https://en.wikipedia.org/wiki/Octalysis) · [Yu-kai Chou Medium](https://medium.com/@yukaichou/the-octalysis-framework-for-gamification-behavioral-design-fe381150f0c1).

| # | Core Drive | Tipo | Riesgo ético |
|---|-----------|------|--------------|
| 1 | Significado épico & llamado | **White Hat** | Bajo |
| 2 | Desarrollo & logro | **White Hat** | Bajo |
| 3 | Empoderamiento de creatividad & feedback | **White Hat** | Bajo |
| 4 | Propiedad & posesión | Neutral | Medio (loot box) |
| 5 | Influencia social & relación | Neutral | Medio (FOMO) |
| 6 | Escasez & impaciencia | **Black Hat** | Alto |
| 7 | Imprevisibilidad & curiosidad | **Black Hat** | Alto (gambling) |
| 8 | Pérdida & evitación | **Black Hat** | Muy alto (loss aversion + streaks = addiction) |

**White Hat** = empoderante, eleva al usuario, motivación sostenible.
**Black Hat** = urgencia, ansiedad, manipulación — efectivo a corto plazo pero erosiona confianza y bienestar.

**Decisión ética Zenix:**
- ✅ Drives 1, 2, 3 son base: vincular cursos a propósito ("mejora el servicio al huésped"), progreso visible, dar feedback constructivo.
- ⚠️ Drives 4, 5 con cuidado: "tu equipo" (relación) sí; ranking vs otros equipos (FOMO) no.
- ❌ Drives 6, 7, 8 evitar como motor principal. **Especialmente: streaks de Duolingo + loss aversion** son éticamente cuestionables en contexto laboral. La camarera no debe sentir ansiedad de perder racha en su día libre.

### Cuándo gamificación FALLA — Hamari, Koivisto, Sarsa 2014

Meta-revisión de 24 estudios empíricos ([HICSS 2014 paper](http://creativegames.org.uk/modules/Gamification/Hamari_etal_Does_gamification_work-2014.pdf); [ACM DL](https://dl.acm.org/doi/10.1109/HICSS.2014.377)). Conclusiones:

1. Gamificación produce **efectos positivos**, pero la efectividad **depende fuertemente del contexto** y del usuario.
2. **Falla** cuando: (a) los puntos/badges no se vinculan a metas reales del usuario; (b) la novedad se acaba (efecto "novelty wears off" en ~3 meses); (c) crowding-out se activa en usuarios con motivación intrínseca preexistente.
3. **Funciona mejor** cuando: contexto educativo + usuarios autoseleccionados + diseño coherente con dinámicas del dominio.

---

## 9. Mobile learning patterns validados

### Sesiones cortas

Duolingo lecciones 2-5 min logran **40% mayor retención día 30** vs sesiones largas. Streak es su mecánica más potente pero también la más éticamente cuestionable (loss aversion — Drive 8 Black Hat) ([KeyGroup Duolingo gamification](https://key-g.com/blog/how-duolingos-gamification-mechanics-drive-customer-loyalty-a-guide-to-engagement-and-retention); [Health Matters Substack — Duolingo](https://healthmattersandme.substack.com/p/duolingo-analyzing-all-engagement); [ACM Duolingo microlearning study](https://dl.acm.org/doi/fullHtml/10.1145/3631991.3632026)).

### Notificaciones contextuales — alert fatigue

Aunque no se localizó el "Cisco Healthcare Alert Fatigue Study 2021" exacto citado en CLAUDE.md §58, la literatura biomédica reciente confirma el principio: clínicos reciben >56 alertas/día, dedican 49 min/día respondiendo, y la desensibilización a alertas no-urgentes compromete seguridad ([PMC alert fatigue qualitative 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12919987/); [Olakotan & Yusof 2021 systematic review](https://journals.sagepub.com/doi/10.1177/14604582211007536)). **Aplicación a Zenix Learning:**

- Max 1 push notification de aprendizaje por día (no 3, no 5).
- **Contextual**: enviar reminder de curso "Limpieza profunda" **solo** los días que el calendario muestra checkouts (no aleatorio).
- **Tiempo de envío inteligente**: 10 min antes del break de la camarera (basado en patrón de uso) — no a las 11 PM.
- **Silenciable per-usuario** sin penalización.

### Offline-first

Hoteles boutique LATAM: el wifi del back-of-house es marginal. LMS debe:
- Descargar próximas 3 lecciones al abrir app con buen wifi.
- SRS cards pre-cargados local.
- Sync de progreso queue-based (analog a SyncManager del módulo mobile housekeeping).

### Audio-first para hands-busy roles

Investigación de podcast learning ([Assemble You](https://www.assembleyou.com/about/why-podcast-learning); [Castos remote learning](https://castos.com/remote-learning/); [ResearchGate Podcasts and Informal Learning](https://www.researchgate.net/publication/385035054_Podcasts_and_Informal_Learning_Exploring_Knowledge_Acquisition_and_Retention)) muestra que audio en contexto "hands-busy / eyes-busy" (commute, repetitive task, walking) genera engagement equivalente o superior al video, con menos fatiga.

**Aplicación a housekeeping:** versión audio de cada microlección, escuchable con audífonos mientras se hace la cama. Quiz se hace después en break. Esto evita el problema "no tengo 5 min para sentarme a ver video".

---

## 10. Métricas de aprendizaje que importan

### Kirkpatrick 1959 (4 niveles) — escala temporal y de costo

Modelo de Donald Kirkpatrick publicado en 1959 en la revista ASTD, codificado en su libro 1994 ([Kirkpatrick Partners official](https://www.kirkpatrickpartners.com/the-kirkpatrick-model/); [Ardent Learning](https://www.ardentlearning.com/blog/what-is-the-kirkpatrick-model); [Mindtools](https://www.mindtools.com/ak1yhhs/kirkpatricks-four-level-training-evaluation-model/)).

| Nivel | Qué mide | Cómo se mide en Zenix | Costo medición |
|-------|----------|----------------------|----------------|
| **1. Reaction** | ¿Le gustó al participante? | Survey 1-pregunta NPS post-curso ("¿Recomendarías este curso?") | Bajo |
| **2. Learning** | ¿Aprendió? | Quiz pre-test vs post-test 30/60/90 días (knowledge retention curve) | Medio — automatizable |
| **3. Behavior** | ¿Lo aplica en el job? | Mystery shopper · Supervisor checklist · KPI operativo (% checkouts limpios a tiempo) | Alto |
| **4. Results** | ¿Benefició al hotel? | NPS guest · Turnover staff · Chargeback rate · RevPAR | Muy alto |

**Trampa común:** 90% de empresas miden solo L1 ("smile sheets"). L1 alto NO predice L3-L4. Zenix Learning debe medir mínimo L2 desde día 1.

### Engagement rate ≠ completion rate

- **Completion rate** = % usuarios que terminan curso. Inflado por compliance forzado.
- **Engagement rate** = tiempo activo / tiempo asignado, quiz scores, opt-in a contenido extra. Más honesto.

Diferencial Zenix: dashboard expone **ambas** métricas separadas. El cliente ve "85% completion, 32% engagement" y entiende que pasaron pero no aprendieron.

### Knowledge retention 30/60/90 días

Aplicación directa de Ebbinghaus + Thalheimer: el LMS dispara quiz de 3 preguntas a los 30, 60, 90 días post-completion. Esto **es** la métrica L2 real (no el quiz al final del curso).

### Phillips ROI (L5) — para clientes enterprise

Phillips Model añade Level 5 — ROI calculado en pesos/dólares ([Whatfix Phillips ROI](https://whatfix.com/blog/phillips-roi-model/); [HCM Deck Phillips](https://hcmdeck.com/en/blog/the-fifth-level-of-the-new-kirkpatrick-model-or-why-and-how-to-calculate-training-roi/); [Training Industry glossary](https://trainingindustry.com/glossary/phillips-roi-methodology/)).

Fórmula:
```
ROI% = ((Beneficio_monetario_atribuible - Costo_programa) / Costo_programa) × 100
```

**Para Zenix Learning:**
- Beneficio = (reducción turnover × costo de reemplazo) + (reducción chargeback × monto promedio) + (lift en NPS × valor de un repeat guest)
- Costo = licencia Zenix Learning + horas-staff dedicadas a curso
- **Reto crítico: isolation of effects** (paso requerido Phillips). Hay que separar el efecto del LMS vs otros cambios. Control group A/B entre propiedades de la misma cadena resuelve esto.

---

## Conclusión ejecutiva

Zenix Learning puede ser un diferenciador comercial real frente a Cornerstone Hospitality, Typsy, Lobster Ink — pero solo si cumple con 4 reglas no-negociables derivadas de esta investigación:

1. **Diseño basado en andragogía + SDT, no en compliance forzado**. La motivación extrínseca arranca el sistema; la intrínseca lo sostiene. Si el LMS solo castiga (no completar = sanción), perderá engagement en 90 días.

2. **Microlearning + spaced repetition algorítmico (SM-2)**. No "videos de 30 min con quiz al final". Sin spacing, retención L2 colapsa a 30 días.

3. **Gamificación ligera por defecto, profunda opt-in**. PBL básico (Drives 1-3 White Hat). Leaderboards públicos OFF por default per §50 CLAUDE.md. Streaks opcionales sin loss aversion (no perder racha si te enfermas un día).

4. **Métricas Kirkpatrick L2-L3 medidas desde día 1**, no solo L1. Sin retention 60/90d ni behavior change observado, el ROI no es defendible ante un cliente enterprise.

El consultor de aprendizaje organizacional debería poder leer este documento, identificar las decisiones de diseño en el LMS, y trazarlas 1-a-1 a la bibliografía citada. Eso es el estándar al que apuntamos.

---

## Bibliografía completa

**Andragogía (Knowles):**
- [Adult Learning Theory: Andragogy of Malcolm Knowles — eLearning Industry](https://elearningindustry.com/the-adult-learning-theory-andragogy-of-malcolm-knowles)
- [The Andragogy Approach — Research.com](https://research.com/education/the-andragogy-approach)
- [Six Principles of Andragogy — Brilliant Learning Systems](https://brilliantlearningsystems.com/six-principles-of-andragogy-malcolm-knowles/)
- [IJRAR paper on Knowles' theory of andragogy (PDF)](https://ijrar.org/papers/IJRAR19K9694.pdf)
- [Andragogy in Practice: Team Science Training — PMC NIH 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11008574/)
- [Knowles, informal adult education — Infed.org](https://infed.org/dir/welcome/malcolm-knowles-informal-adult-education-self-direction-and-andragogy/)

**Bloom revisado (Anderson & Krathwohl 2001):**
- [Anderson & Krathwohl Revised Bloom's Taxonomy — Quincy College PDF](https://quincycollege.edu/wp-content/uploads/Anderson-and-Krathwohl_Revised-Blooms-Taxonomy.pdf)
- [Bloom's Taxonomy explained — Valamis](https://www.valamis.com/hub/blooms-taxonomy)
- [Bloom's taxonomy of cognitive learning objectives — PMC NIH](https://pmc.ncbi.nlm.nih.gov/articles/PMC4511057/)
- [A Taxonomy for Learning, Teaching, and Assessing — ResearchGate](https://www.researchgate.net/publication/235465787_A_Taxonomy_for_Learning_Teaching_and_Assessing_A_Revision_of_Bloom's_Taxonomy_of_Educational_Objectives)

**Microlearning (Kapp, Thalheimer):**
- [Microlearning: Short and Sweet — Kapp & Defelice via getAbstract](https://www.getabstract.com/en/summary/microlearning-short-and-sweet/38272)
- [Podcast with Karl Kapp — Talented Learning](https://talentedlearning.com/about-microlearning-karl-kapp-podcast-interview/)
- [Microlearning as effective training — Walden University dissertation](https://scholarworks.waldenu.edu/cgi/viewcontent.cgi?article=19444&context=dissertations)
- [Spacing Learning Events Over Time — Thalheimer PDF](https://www.worklearning.com/wp-content/uploads/2017/10/Spacing_Learning_Over_Time__March2009v1_.pdf)
- [Five Reasons Spacing Effect — Work-Learning Research](https://www.worklearning.com/2017/01/07/five-reasons-learners-experience-the-spacing-effect/)
- [Microlearning vs Traditional Learning — Haekka](https://www.haekka.com/blog/microlearning-vs-traditional-learning)

**Spaced repetition (Ebbinghaus, SM-2):**
- [Ebbinghaus and the forgetting curve — SuperMemo](https://www.supermemo.com/en/blog/history-of-spaced-repetition)
- [SuperMemo method overview](https://www.supermemo.com/en/supermemo-method)
- [SM-2 Algorithm Explained — Tegaru](https://tegaru.app/en/blog/sm2-algorithm-explained)
- [SATHEE SM-2 Algorithm — IIT Kanpur](https://sathee.iitk.ac.in/pyqs/spaced-repetition/algorithms/sm2-algorithm/)
- [Anki SRS Algorithm — Julien Sobczak](https://juliensobczak.com/inspect/2022/05/30/anki-srs/)

**Cognitive Load Theory (Sweller):**
- [Cognitive Load — Wikipedia](https://en.wikipedia.org/wiki/Cognitive_load)
- [Cognitive Architecture and Instructional Design: 20 Years Later — Springer](https://link.springer.com/article/10.1007/s10648-019-09465-5)
- [Cognitive-Load Theory — Paas & van Merriënboer 2020](https://journals.sagepub.com/doi/10.1177/0963721420922183)
- [CLT Development and Validation — Frontiers Psychology 2017](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01997/full)
- [Cognitive Load Theory and Instructional Design — University of Kentucky PDF](https://www.uky.edu/~gmswan3/544/Cognitive_Load_&_ID.pdf)

**Self-Determination Theory (Deci & Ryan):**
- [Self-Determination Theory — APA](https://www.apa.org/research-practice/conduct-research/self-determination-theory.html)
- [Ryan & Deci 2000 — SDT PDF](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf)
- [Ryan & Deci 2020 — SDT review PDF](https://stial.ie/resources/Ryan%20and%20Deci%202020%20self%20determination%20theory.pdf)
- [Self-Determination Theory — Wikipedia](https://en.wikipedia.org/wiki/Self-determination_theory)
- [Self Determination Theory and Motivation — Positive Psychology](https://positivepsychology.com/self-determination-theory/)

**Flow (Csikszentmihalyi):**
- [Flow Theory: A Learning Professional's Guide — Growth Engineering](https://www.growthengineering.co.uk/flow-theory/)
- [Flow State in Learning — Structural Learning](https://www.structural-learning.com/post/flow-state)
- [Flow (psychology) — Wikipedia](https://en.wikipedia.org/wiki/Flow_(psychology))

**Gamification (Kapp, Werbach & Hunter, Chou, Hamari):**
- [For the Win — Kevin Werbach, Wharton Magazine](https://magazine.wharton.upenn.edu/issues/fall-2015/the-gamification-toolkit-for-the-win/)
- [The Gamification Toolkit — Werbach & Hunter Google Books](https://books.google.com/books/about/The_Gamification_Toolkit.html?id=2PU1EAAAQBAJ)
- [Octalysis Framework — official Octalysis Group](https://octalysisgroup.com/framework/)
- [Octalysis Framework — Yu-kai Chou Medium](https://medium.com/@yukaichou/the-octalysis-framework-for-gamification-behavioral-design-fe381150f0c1)
- [Octalysis — Wikipedia](https://en.wikipedia.org/wiki/Octalysis)
- [Does Gamification Work? — Hamari, Koivisto, Sarsa 2014 (PDF)](http://creativegames.org.uk/modules/Gamification/Hamari_etal_Does_gamification_work-2014.pdf)
- [Does Gamification Work? — ACM Digital Library](https://dl.acm.org/doi/10.1109/HICSS.2014.377)

**Mobile learning, Duolingo, audio learning, alert fatigue:**
- [Duolingo Gamification — KeyGroup](https://key-g.com/blog/how-duolingos-gamification-mechanics-drive-customer-loyalty-a-guide-to-engagement-and-retention)
- [Duolingo App as Microlearning Tool — ACM 2024](https://dl.acm.org/doi/fullHtml/10.1145/3631991.3632026)
- [Mobile Learning Engagement & Retention — TechClass](https://www.techclass.com/resources/learning-and-development-articles/how-mobile-learning-improves-knowledge-retention-and-engagement)
- [Empower Workforce with Audio Learning — Assemble You](https://www.assembleyou.com/about/why-podcast-learning)
- [Podcasts and Informal Learning — ResearchGate](https://www.researchgate.net/publication/385035054_Podcasts_and_Informal_Learning_Exploring_Knowledge_Acquisition_and_Retention)
- [Alert Fatigue Qualitative — PMC NIH 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12919987/)
- [CDS alerts systematic review — SAGE 2021](https://journals.sagepub.com/doi/10.1177/14604582211007536)

**Kirkpatrick & Phillips (evaluation):**
- [Kirkpatrick Model — Kirkpatrick Partners official](https://www.kirkpatrickpartners.com/the-kirkpatrick-model/)
- [Kirkpatrick Model — Mindtools](https://www.mindtools.com/ak1yhhs/kirkpatricks-four-level-training-evaluation-model/)
- [Phillips ROI Model — Whatfix](https://whatfix.com/blog/phillips-roi-model/)
- [Phillips ROI Methodology — Training Industry](https://trainingindustry.com/glossary/phillips-roi-methodology/)

---

## Bitácora

- **2026-05-21** — Doc creado a partir de research del agente de psicopedagogía. 10 secciones + bibliografía 50+ fuentes.

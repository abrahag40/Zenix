# Zenix Learning — Visión estratégica

> El LMS embebido al PMS Zenix. Add-On pago (DLC) con curso-regalo como hook comercial.
> **Última actualización:** 2026-05-21

---

## 1. Posicionamiento

### 1.1 Frase de venta (single sentence)

> "Zenix Learning es el primer LMS embebido a un PMS LATAM que capacita a tu equipo, genera la evidencia STPS que tu auditoría exige, y te certifica al staff en Distintivo H sin sacarlos del piso — todo desde la misma app móvil que ya usan para limpiar y registrar huéspedes."

### 1.2 Las 4 promesas comerciales

1. **Compliance LFT/STPS sin Excel.** DC-3 generado automáticamente al completar curso. Evidencia auditable conservada 5+ años (Art. 30 CFF).
2. **Mismo staff, mismo login.** El `Staff` del PMS es el `Learner` del LMS. Cero re-onboarding, cero rosters duplicados.
3. **Estudio en breaks de 5-10 min desde el teléfono.** Microlearning (Karl Kapp 2013) — el HK estudia entre check-outs, no en aula. Modo offline + sync.
4. **Cursos hechos para hotelería LATAM, no genéricos.** Distintivo H, AHLEI Front Office, NOM-035-STPS — no cursos de "diversidad e inclusión corporate" reciclados.

### 1.3 A quién NO va dirigido

- Cadenas enterprise multinacionales con Cornerstone/SuccessFactors ya implementado → no podemos competir en ese tier (v1.x).
- Hoteles que ya pagan a una consultora externa por su capacitación presencial — Zenix Learning es para el 80% que NO la paga.
- Universidades / academias hoteleras (EHL, Glion) — ellas son content providers potenciales (partner, no competencia).

---

## 2. Las 5 capas de monetización del módulo

| Capa | Producto | Pricing modelo | Margen estimado |
|------|----------|----------------|-----------------|
| **L0 — Learning Lite** | LMS habilitado + 1 curso regalo (Distintivo H o NOM-035) + DC-3 PDF | Bundle con PMS al cierre (curso de regalo). Sin recurrente. | Hook comercial, no revenue directo |
| **L1 — Learning Core (DLC)** | 3 cursos MVP + gamificación ligera + reporting STPS + mobile sync | $4-7 USD/staff/mes (per-seat) | 60-70% |
| **L2 — Learning Pro** | Lo anterior + SCORM/xAPI player + course authoring básico (texto + quiz + video upload) + advanced reporting + reminders push | $9-15 USD/staff/mes | 60-70% |
| **L3 — Learning Marketplace** | Catálogo de cursos externos AHLEI/eHotelier vendidos por unidad. Zenix cobra 20-30% commission | Per-course pricing variable $30-300 USD/curso | 20-30% commission |
| **L4 — Custom course authoring** | ZaharDev consulting produce cursos custom para cadenas grandes | $5-25k USD por curso producido | Servicio, 50-60% |

**Realidad:** L0 + L1 son el foco v1.0.0 / v1.0.5. L2-L4 son v1.1.x+.

### 2.1 Hook "curso regalo" — cómo opera comercialmente

```
1. Prospect tiene PMS actual (Cloudbeds/Mews/manual).
2. ZaharDev demo: muestra Zenix PMS + menciona Learning como add-on.
3. Si prospect duda:
   "Hagamos esto: cierro contigo el PMS y de mi parte
    te regalo el curso 'Distintivo H' para tu equipo
    completo. Lo certificamos antes del cierre del año
    y ya tienes la auditoría STPS resuelta."
4. Costo marginal Zenix = $0 (curso ya producido)
5. Valor percibido prospect = $3-8k MXN (1 capacitación in-person promedio)
6. Conversión esperada incremento: +15-25% vs sin hook (Cialdini reciprocidad)
```

### 2.2 Bundling con Zenix Activate (§77-§80)

El wizard `Zenix Activate` ya tiene 8 etapas. Etapa 6 "Staff" agrega un toggle:

> ☐ Activar Zenix Learning (DLC) — incluye curso regalo "Distintivo H" para todo el equipo

Al marcar:
- Cuenta Learning se aprovisiona automáticamente
- Todos los `Staff` se enrolan al curso regalo
- Email + push notification "Bienvenido a tu primera capacitación"
- Manager recibe dashboard de tracking del curso

---

## 3. Diferenciadores documentados vs competencia

> Análisis detallado en [03-competitor-analysis.md](03-competitor-analysis.md). Aquí solo el resumen ejecutivo de los 6 diferenciadores que vamos a defender.

| Dimensión | SuccessFactors | TalentLMS | AHLEI Academy | **Zenix Learning** |
|-----------|----------------|-----------|---------------|---------------------|
| Embebido al PMS | No | No | No | ✅ Sí |
| Mobile offline LATAM | Limitado | Sí | Limitado | ✅ Sí (apps/mobile existente) |
| DC-3 generation automática México | ❌ | ❌ | ❌ | ✅ Sí |
| Catálogo curado hotelería | No | Marketplace genérico | ✅ Sí (premium) | ✅ Sí (curado ZaharDev) |
| Setup en <30 min | ❌ 2-12 semanas | ✅ Sí (genérico) | N/A | ✅ Sí (Zenix Activate) |
| Pricing transparente <$15 USD/seat | ❌ Enterprise $$ | ✅ Sí | ❌ Per-course $$$ | ✅ Sí |
| Course authoring requerido aparte | ❌ Sí (Articulate/Captivate) | ✅ Bundled básico | N/A | ✅ Bundled básico (Fase 2 L2) |

---

## 4. Lo que tomamos de SuccessFactors (lo que la gente ama)

- **Learning Paths** — secuencias de cursos pre-armadas por rol (FO Receptionist Path = 5 cursos en orden). Validado.
- **Recurrent training (recertification)** — un curso completado hoy con `expiresAt` automático al año genera re-enrollment auto. Crítico para Distintivo H (re-cert anual).
- **Curricula completion vs course completion** — distinguir "tomó el curso" de "completó el path entero". Métrica importante para manager.
- **Approval workflows** — manager autoriza enrollment a cursos caros (marketplace L3). Configurable.
- **Compliance dashboard rojo/amarillo/verde** — STPS audit-readiness en un vistazo.

## 5. Lo que NO tomamos de SuccessFactors (lo que la gente odia)

- **Authoring externo Articulate/Captivate.** Resultado: cursos lucen distintos, formato inconsistente, herramientas $$$ aparte. → Zenix: authoring nativo bundled desde Fase 2.
- **Taxonomías rígidas (category trees profundos).** Resultado: curso "se pierde" en la jerarquía. → Zenix: tags + búsqueda fuzzy, sin árbol obligatorio.
- **UI lenta + navegación profunda.** Resultado: learners abandonan. → Zenix: max 3 clicks a "empezar curso" desde dashboard.
- **Reporting con SQL escondido.** Resultado: manager pide reporte a IT. → Zenix: reportes pre-armados + export CSV/PDF al click.
- **Mobile como afterthought.** Resultado: la app mobile de SF es famosa por bugs. → Zenix: mobile-first desde día 1, app ya existe.
- **Mensajes de error genéricos.** Resultado: usuario no sabe qué hacer. → Zenix: §39 feedback informativo obligatorio.

---

## 6. Visión a 24 meses

### v1.0.0 / v1.0.5 — Learning Core
- 3 cursos MVP nativos
- Tracking + reporting STPS
- Mobile sync
- Gamificación ligera
- DC-3 PDF generator

### v1.0.x — Polish
- 2-3 cursos adicionales nativos
- Gamificación media (mini-games por curso)
- Reminders inteligentes (no fatigue)
- Manager dashboard refinado

### v1.1.x — Learning Pro
- SCORM 1.2 player (catálogo AHLEI externo)
- xAPI básico
- Course authoring bundled (text + quiz + video)
- Recurrent training automático
- Learning Paths editor

### v1.2.x — Learning Marketplace
- Marketplace cursos externos (partner ZaharDev)
- Commission model (Zenix 20-30%)
- Partner portal para content providers (EHL, eHotelier, AHLEI)
- xAPI completo + LRS embebido

### v1.3.x+ — Learning Elite
- Gamificación profunda: simuladores (front-desk simulator, escape rooms)
- IA tutor (Claude API) — Q&A contextual sobre el curso
- Skills mapping + competency framework
- Integration People (v1.7) — capacitación auto-asignada por performance review

---

## 7. Riesgos identificados + mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Scope creep impide release v1.0.0 a tiempo | Alta | Alto | Rama independiente `claude/zenix-learning-lms-v1-2qz8l`. Merge solo cuando esté listo. Fallback v1.1.0. |
| Contenido de cursos sin revisor experto → reputacional si cliente reprueba auditoría | Media | Alto | Reviewer externo certificado por curso (consultor Distintivo H, AHLEI member) ANTES de publicar. Disclaimer "material de apoyo, no sustituye auditoría oficial". |
| Crowding-out effect gamificación destruye motivación intrínseca | Media | Medio | Fase 1 sin leaderboards públicos. Opt-in por staff (§52). Métricas de uso vigiladas. |
| SuccessFactors-style overengineering | Alta | Alto | Principio: si una feature no se usa en piloto Hotel Monica, no la portamos a v1.1. |
| Conflicto con módulo People (v1.7) — duplicación de Skill / Competency | Media | Medio | Schema diseñado pensando en People desde día 1: `LearningCompetency` será re-exportada/extendida por People. |
| Costo de producir contenido + grabación + revisión por curso | Alta | Medio | Cursos MVP usan textos + diagramas + screenshots (no video producido). Video llega en v1.1 cuando hay budget validado. |
| DC-3 generado no aceptado por STPS (formato incorrecto) | Media | Alto | Investigar formato vigente 2024-2026 en [02-legal-compliance-research.md](02-legal-compliance-research.md). Reviewer legal antes de release. |

---

## 8. Bitácora de revisiones

- **2026-05-21** — Doc creado. Visión, monetización L0-L4, hook curso-regalo, diferenciadores, roadmap 24 meses, riesgos.

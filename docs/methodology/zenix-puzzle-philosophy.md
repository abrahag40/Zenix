# Filosofía de trabajo Zenix — "Construir el rompecabezas"

> Documento fundacional que codifica la **ideología de trabajo** de ZaharDev al construir Zenix. Aplica a todo sprint, todo commit, todo diseño. Permanente. Versión 1.0 (2026-05-23).

---

## 0. Tesis central

> **Zenix no se construye linealmente. Se construye como un rompecabezas: cada pieza se desarrolla en profundidad, validada con estudio de mercado + decisión justificada, y al final se ensamblan todas para formar el cuadro completo. Una pieza floja contamina el cuadro entero.**

Esta filosofía es opuesta al "MVP iterativo Lean Startup". Lean MVP optimiza para velocidad de mercado a costa de calidad de cada pieza. Zenix optimiza para **calidad de cada pieza** porque el producto final compite con software premium (SAP/IBM/Salesforce/Mews/Cloudbeds) en un mercado donde la fragilidad de una pieza puede romper la confianza del cliente.

---

## 1. Las 5 disciplinas del rompecabezas

### 1.1 Cada pieza se justifica con datos verificables
- Toda decisión de diseño (UX, schema, arquitectura) DEBE citar al menos una fuente verificable: estudio académico (NN/g, Baymard, Sweller, Miller), benchmark industry (HFTP, AHLEI, STR), regulación (Visa Core Rules, CFDI, GDPR), o competitor documentation pública.
- **Sin cita = no decisión.** "Porque me gusta" o "porque suena bien" son anti-pattern.
- Cuando no hay fuente, se hace un estudio de mercado MICRO antes de decidir (research subagent dedicado).
- Ejemplo: el patrón de chip post-push CRS (Sprint CHANNEX-UX-E2-E3 §151) se justifica con quote G2 Cloudbeds 2024: *"Finally I know it actually went through"*. Cita verificable.

### 1.2 Cada pieza se debate epistémicamente
- El agente IA y el owner son co-creadores con criterios distintos. El owner aporta intuición de negocio + experiencia de campo; el agente aporta estudio sistemático + memoria amplia.
- **Ninguno tiene la verdad absoluta.** Cada propuesta se debate con argumentos contrastables.
- Si el owner propone X y el agente detecta riesgo arquitectónico, el agente **debe alertar antes de implementar** — protocolo §"Principio de Debate Epistémico" en CLAUDE.md.
- Resultado: decisiones fundacionales (Naming Nova, RBAC 5-tier, Domain strategy, Schema Partner) pasan por 2-3 rondas de propuesta-debate-refinamiento antes de cristalizar.

### 1.3 Cada pieza se ensambla a futuras
- **No se construye nada aislado.** Cada decisión documenta cómo encaja con sprints anteriores y futuros.
- El bloque "Cómo encaja en el rompecabezas" del EOD report es obligatorio.
- Ejemplo: el AuditLog universal (Nova) ya considera la retention policy de v1.0.3 REPORTS-CORE (cold storage partition >365d) — la decisión §167 lo declara explícitamente para evitar refactor futuro.

### 1.4 Cada pieza preserva visibilidad UI/UX
> **Nada que funcione en backend puede quedar invisible en la UI.** Si una feature impacta al usuario, debe ser visible en la pantalla del usuario.

- Pattern Channex post-push chip (E2): backend hace push CRS → frontend muestra chip estado. Sin la mitad UI, el backend es "magic" desde la perspectiva del operador → usuario desconfía del sistema.
- En Day 17 del sprint NOVA-CHANNEX-COMMAND-CENTER hay un **CERT GATE** que audita feature ↔ ruta UI cliente con screenshot evidence — formalización de esta disciplina.

### 1.5 Cada pieza se documenta antes de cerrar
- **Sprint plan + decisiones §-numeradas + bitácora CLAUDE.md** se actualizan en el mismo PR que entrega el código.
- Si la documentación queda "para después", se vuelve legacy en 1 sprint.
- Patrón: PR docs-only ANTES del sprint de código (caso PR #44 Nova architecture) cuando hay decisiones fundacionales que requieren aprobación owner.

---

## 2. La construcción del rompecabezas — fases

### Fase 1: Discovery (research + decisión)
- Estudio comparativo en 3-6 competidores
- Mining de reviews (Capterra/G2/HotelTechReport/Reddit) — quotes verbatim
- Cita de fuentes académicas / regulatorias / industry
- Propuesta(s) al owner con tabla pro/contra
- Debate epistémico → decisión cristalizada

### Fase 2: Documentation antes de código
- Sprint plan technical doc
- Decisiones §-numeradas en CLAUDE.md
- ADR fundacional si la decisión es estructural
- Update vision docs si cambia el modelo de negocio o roadmap
- Update sales master si es diferenciador comercial
- **PR docs-only para approval owner antes de tocar código**

### Fase 3: Implementation con EOD reports
- Day-by-day execution
- EOD report con test plan + UI verification steps
- Continuous integration con cert gates donde aplique
- Visibility check: feature ↔ UI mapping

### Fase 4: QA + cert + merge
- Test suite verde (unit + integration + e2e)
- Cert audit si aplica (caso Channex Stage 4)
- Owner manual QA con guion
- Merge to main

### Fase 5: Ensamble con piezas previas
- Cross-feature regression check
- Documentación actualizada en CLAUDE.md bitácora
- Master sales doc updated con diferenciador
- Cierre del rompecabezas: cómo este sprint se conecta con sprints futuros

---

## 3. Anti-patterns que rompen la filosofía

| Anti-pattern | Por qué rompe | Mitigación |
|--------------|---------------|------------|
| "Ship it ahora, documentamos después" | Decisiones se vuelven legacy + auditoría imposible | Docs en mismo PR |
| "Backend silent, UI later" | Usuario no confía + Channex cert reject | Visibility checkpoint per sprint |
| "Copia de competidor sin justificación" | No diferenciador + sin defensa comercial | Tabla comparativa + estudio reviews |
| "Decisión sin cita" | No defendible al cliente / inversor | Bibliografía obligatoria |
| "Roadmap inflado sin priorización" | Bloque 1 explota, no llega v1.0.0 | Sprint plan con días-dev estimados |
| "Feature flag sin uso real" | Código muerto + complejidad | Solo flags con use case real activo |

---

## 4. El rol del owner vs el agente

### Owner (Abraham — ZaharDev CEO)
- **Visión estratégica + intuición de negocio** (experiencia consultor SuccessFactors)
- **Decisión final** en arquitectura, naming, prioridades de sprint
- **Validación de pain real** con piloto Monica Tulum + research de mercado LATAM boutique
- **Aprobación de PRs** antes de merge a main
- **Storytelling comercial** al cliente final + inversores futuros

### Agente IA (Claude)
- **Estudio sistemático**: research market, mining reviews, citing sources verificables
- **Proposal generation**: 2-4 opciones con pro/contra + recomendación con rationale
- **Debate epistémico**: alertar riesgos arquitectónicos, generar contrapropuestas, citar precedentes industry
- **Implementation**: code + tests + docs + EOD reports
- **Mantenimiento del rompecabezas**: tracking dependencies cross-sprint, actualizar CLAUDE.md, evitar legacy

---

## 5. Métricas del rompecabezas

Cada sprint se evalúa por:

| Dimensión | Pregunta | Mitigación si falla |
|-----------|----------|---------------------|
| **Justificación** | ¿Cada decisión tiene cita verificable? | Research subagent dedicado pre-sprint |
| **Visibilidad** | ¿Backend cambios se reflejan en UI cliente? | Cert gate day-X mid sprint |
| **Test coverage** | ¿>85% en módulos nuevos? | Specs incluidos en cronograma día-por-día |
| **Documentación** | ¿CLAUDE.md + sprint plan + bitácora updated? | PR review enforcing |
| **Ensamble** | ¿La pieza se conecta clara con sprints anteriores/futuros? | EOD section "Cómo encaja en el rompecabezas" |

---

## 6. Casos concretos de la filosofía aplicada

### Caso 1 — Sprint CHANNEX-UX-E2-E3 (mayo 2026)
- **Discovery**: estudio comparativo 6 PMS sobre cancel push CRS + chip post-push + multi-room group bookings
- **Decisión justificada**: chip post-push citado con G2 Cloudbeds quote; brand chip colors citados con Mehrabian-Russell 1974; check-in 3-modos hostal per-bed citado como gap real en TODOS competidores
- **Documentation antes de código**: 10 decisiones §149-§158 registradas en CLAUDE.md antes de implementar
- **Implementation con EOD**: cada day delivery con preview verification + screenshots
- **Visibilidad**: chip post-push aparece en BookingDetailSheet de cada cliente (no backend silent)
- **Ensamble**: con sprint Cancel-Archive previo (soft-delete + restore window), con sprint Channex-Outbound (push mechanism)

### Caso 2 — Sprint Nova foundation (sprint actual)
- **Discovery**: 3 rondas de debate naming (Atelier rechazado → Axis rechazado → Nova aceptado) + 4 patrones SAP/IBM/Salesforce analizados para tenant switcher
- **Decisión justificada**: hierarchy 5-tier alineado SAP PartnerEdge + PartnerTier 4 valores con cita partner programs SAP/Cisco/Microsoft
- **Documentation antes de código**: NOVA-architecture.md (2016 líneas ADR) + 17 decisiones §159-§175 + vision docs actualizados ANTES de Day 1
- **PR docs-only** (#44) para approval owner antes de tocar código
- **Implementation**: Day 1 arranca DESPUÉS de aprobar arquitectura

---

## 7. Re-lectura periódica

Esta filosofía se re-lee al inicio de cada sprint nuevo. Si una propuesta contradice una de las 5 disciplinas, el agente DEBE alertar al owner.

Mantenedor: el agente IA + owner. Cambios mayores requieren entrada en bitácora.

---

## Bitácora

- **2026-05-23 Late PM** — v1.0 inicial. Codificada tras 4 sprints donde la filosofía emergió implícita. Formalizada por solicitud del owner (mensaje "documentar ideología de trabajo"). Aplica retroactivamente a todo el repo Zenix.

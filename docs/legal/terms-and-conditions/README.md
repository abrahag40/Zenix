# Terms & Conditions — Zenix PMS

> Documentos legales B2B SaaS de Zenix. Workflow de versioning, authoring,
> revisión legal y publicación.

---

## Archivos

| Archivo | Status | Idioma |
|---|---|---|
| [v0.9-es-borrador.md](v0.9-es-borrador.md) | **Vigente piloto** — sujeto a validación legal | Español |
| v1.0-es.md | Pendiente validación con abogado mercantil senior | Español |
| v1.0-en.md | Pendiente — traducción post v1.0 final | Inglés |
| changelog.md | Pendiente — al publicar v1.0 | — |

## Workflow de versioning

### Numeración

- **vMAJOR.MINOR** (e.g., v1.0, v1.1, v2.0)
  - `MAJOR` cambia cuando hay modificación sustancial de derechos/obligaciones
  - `MINOR` cambia cuando hay agregados de cláusulas o ajustes materiales
  - `vMAJOR.MINOR.PATCH` para correcciones tipográficas (sin requerir re-aceptación)

### Proceso de publicación

1. ZaharDev escribe nueva versión en Markdown bajo este directorio
2. Asesor legal junior (o owner) revisa contenido y compliance
3. Si MAJOR/MINOR, abogado mercantil senior valida (~$15-30k MXN, 1-2 sesiones)
4. Script `scripts/publish-tc.ts` (BILLING-CORE sprint) computa SHA-256 + inserta DB row
5. Owner ejecuta `UPDATE termsAndConditionsVersion SET isCurrent=true WHERE version='X.Y'` cuando esté listo
6. Backend dispara email mass a todos los Org Owners + 30 días grace para aceptar nueva versión

### Validación legal pendiente (v1.0)

10 puntos identificados al final de v0.9-es-borrador.md (sección "Notas para validación legal senior") que requieren validación del abogado mercantil mexicano senior antes de v1.0:

1. Tratamiento del consultor partner como agente vs no agente
2. Cláusula no-reembolso anual vs Art. 47 LFPC
3. Datos agregados anonimizados — alcance del consentimiento LFPDPPP
4. Cap responsabilidad 12 meses — jurisprudencia mexicana
5. Exclusión daños indirectos vs Art. 2110 CCF
6. Indemnización del Cliente — legitimación procesal de partners
7. Sumisión jurisdiccional CDMX cross-border
8. Eliminación datos vs CFF Art. 30
9. Cláusulas Tipo CE en Anexo C DPA
10. Considerar arbitraje CAM-CANACO o ICC

### Aceptación por Cliente

Pre-v1.1.0 BILLING-CORE (sprint que automatiza):
- Aceptación manual con DocuSign o equivalente
- Owner marca `Organization.termsAcceptedVersion = '0.9-draft'` desde script de admin

Post-v1.1.0:
- Wizard Step 8 checkbox obligatorio "He leído y acepto los T&C v[X.X]"
- Modal con scroll-to-bottom gating
- Acceptance registrada en `TermsAcceptance` table con IP + user-agent
- PDF adjunto en welcome email del Org Owner

## Workflow de redacción

### Antes de escribir nueva versión

1. Lee `v0.9-es-borrador.md` actual (vigente)
2. Identifica qué cambia y por qué (regulación nueva, feedback de cliente, ajuste comercial)
3. Documenta el cambio en `changelog.md` con justificación

### Estilo de redacción

- Lenguaje técnico-legal mexicano (no traducciones literales del inglés)
- Citas explícitas a leyes mexicanas (LFPC, LFPDPPP, CFF, CCF, Código de Comercio)
- Cláusulas numeradas N.M (e.g., 5.7) para referencia fácil
- Tono neutro pero defendiendo intereses de ZaharDev sin exceder lo legalmente permitido

### Estructura mínima

20 secciones principales + 3 anexos (A privacidad, B datos huéspedes, C DPA opcional). Ver v0.9 para template completo.

## Referencias de la industria

Documentos B2B SaaS revisados al armar v0.9:

- Stripe Services Agreement (https://stripe.com/legal/ssa) — modelo limitación responsabilidad + IP
- Cloudbeds Terms of Service (https://www.cloudbeds.com/terms) — modelo PMS B2B
- Mews Terms of Service — modelo SaaS hospitality con multi-jurisdicción
- HubSpot Customer Terms of Service — modelo SaaS B2B con Annexes claros
- Salesforce Master Subscription Agreement — modelo enterprise con DPA + SLA detallado
- Atlassian Customer Agreement — modelo SaaS con cancel/no-refund clear

Marco normativo mexicano:

- Ley Federal de Protección al Consumidor (PROFECO) — Art. 47, 56, 85, 90, 91
- Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) + Reglamento
- Código Fiscal de la Federación (CFF) — Art. 30 (conservación documentos)
- Código de Comercio — Art. 89 (mensajes de datos como prueba)
- Código Civil Federal — Art. 2014 (gastos cobranza), Art. 2110 (daños indirectos)

## Contacto legal

- **legal@zenix.com** — preguntas generales sobre T&C
- **arco@zenix.com** — solicitudes ARCO (derechos del titular bajo LFPDPPP)
- **dpa@zenix.com** — solicitudes formales de DPA (Anexo C)
- **soporte@zenix.com** — soporte operativo (no asuntos legales formales)

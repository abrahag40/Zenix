# CLAUDE.md — Zenix PMS

> **Memoria del proyecto.** Se lee al inicio de cada sesión, así que **cuesta contexto y compite
> por atención**: objetivo, **200 líneas**. Lo que no cabe aquí no se pierde — vive en `docs/` y en
> `.claude/rules/`, que cargan sólo cuando hacen falta.
>
> Si sólo vas a leer dos secciones, lee la **2 (los principios)** y la **5 (dónde estamos hoy)**.

<!-- Nota para humanos: este archivo se partió el 2026-09-23, de 2292 a ~190 líneas. Las 94
     decisiones no negociables están íntegras en docs/decisiones-no-negociables.md y el relato
     largo en docs/00-estado/estado-detallado.md. Estos comentarios HTML no cuestan tokens:
     Claude Code los elimina antes de inyectar el contenido. -->

---

## 1 · Qué es Zenix

**Un PMS para hoteles boutique y hostales de LATAM**, con dormitorios compartidos y habitaciones
privadas. El eje es el **calendario de reservas, que es la fuente de verdad** de huéspedes,
ocupación y operación; de él se derivan housekeeping, no-shows, reportes, mantenimiento y
disponibilidad.

Es producto-pilar de **ZaharDev**, consultoría de hotelería que además monetiza datos agregados.
*(El repositorio conserva el nombre `housekeeping3` por continuidad técnica: empezó como prueba de
concepto de limpieza y desde el sprint 6 es un PMS completo.)*

**Lo que lo distingue del mercado:** calendario con SSE en tiempo real · **gestión por cama, no por
habitación** · **checkout de dos fases** —planificación matutina + confirmación física, que ningún
competidor tiene— · app móvil con cola de sincronización sin conexión · auditoría de no-shows con
rastro inmutable y reversión a 48 h · *night audit* multi-huso con `Intl.DateTimeFormat`.

### Monorepo

| App | Stack | Puerto |
|---|---|---|
| `apps/api` | **NestJS 10 + Prisma + PostgreSQL** · JWT · EventEmitter · SSE · Jest | 3000 |
| `apps/web` | React 18 + Vite + Tailwind · React Query · Zustand | 5173 |
| `apps/mobile` | Expo + Expo Router · SyncManager para cola sin conexión | — |
| `packages/shared` | **Fuente única** de enums y DTO | — |

Estructura detallada en [`docs/00-estado/estado-detallado.md`](docs/00-estado/estado-detallado.md).
Reglas por carpeta —cargan solas—: [`apps/api`](.claude/rules/api.md) ·
[`apps/web`](.claude/rules/web.md) · [`packages/shared`](.claude/rules/compartido.md) ·
[pruebas](.claude/rules/pruebas.md).

---

## 2 · 🔴 Los cuatro principios — no negociables

### 2.1 · Debate epistémico

**Mi verdad no es la única verdad.** Puedes y debes debatir cualquier argumento con
justificaciones sólidas. Existe porque el desarrollador puede desconocer procesos hoteleros
estandarizados que parecen detalles y comprometen la operación real, y el asistente puede asumir
premisas de UX correctas en general e incorrectas para una recepción de hotel. **El debate
fundamentado protege al sistema de los dos sesgos.**

Todo argumento se apoya en al menos una de estas cuatro fuentes:

1. **Ingeniería y UX:** NN/g · Baymard · Apple HIG · ISO 9241-110:2020 · WCAG 2.1 AA · carga
   cognitiva (Sweller 1988, Hick 1952, Fitts 1954, Kahneman 2011, Von Restorff 1933).
2. **Hotelería:** AHLEI · ISAHC · HFTP y **USALI** · comportamiento documentado de Opera Cloud,
   Mews, Cloudbeds, Clock PMS+, Little Hotelier · Visa/Mastercard Core Rules para contracargos.
3. **Fiscal LATAM:** CFDI 4.0 (SAT) · DIAN · SUNAT · AFIP · GDPR / LGPD / **LFPDPPP**.
4. **Psicología del consumidor:** Mehrabian-Russell (1974) · Cialdini (1984) ·
   Csikszentmihalyi (1990) · Tversky & Kahneman (1981).

### 2.2 · Análisis crítico

Antes de cualquier decisión de implementación, arquitectura o alcance:

1. **Comunicar los riesgos detectados** — arquitectónicos, de mantenimiento, de UX o de deuda.
2. **Contrapropuesta cuando la propuesta choca con un estándar** o introduce duplicación. Debe
   respetar el insight nuclear del usuario y atacar el riesgo concreto.
3. **Justificar TODA recomendación con datos verificables.** Nunca «porque sí».
4. **La verdad del usuario es hipótesis, no axioma.** Aceptar pasivamente no es profesionalismo.
5. **Educar mientras se ejecuta:** al introducir una metodología o un patrón, decir qué es, de
   dónde viene y por qué se elige.

**Forma:** qué está bien en la idea (con cita) · riesgos (con cita) · contrapropuesta · tabla
comparativa cuando hay ≥2 opciones · recomendación final justificada.

### 2.3 · Calidad y visión a largo plazo

> Formalizado el 2026-05-30 tras el reclamo del dueño: *«estás pensando muy a corto plazo… solo me
> estás entregando soluciones que parchan el problema inicial, dejando bugs en el proceso»*.

1. **Verificación funcional de punta a punta ANTES de decir «listo».** Ejecutar el flujo completo
   —frontend dispara, backend procesa, respuesta vuelve, UI actualiza— o **declarar qué rama no se
   pudo verificar y por qué**. Las pruebas automatizadas cubren regresión; el *smoke test* cubre
   «esto funciona ahora». No se sustituyen.
2. **Visión predictiva.** Toda decisión responde *«¿qué pasa cuando esto escala 10×?»*. Si la
   respuesta es «rompe», es deuda técnica disfrazada de funcionalidad. ¿Qué se ve con 2 elementos,
   con 12, con 50? ¿Qué pasa cuando este campo es null por primera vez? ¿El endpoint nuevo respeta
   multi-inquilino, alcance de propiedad y guards de rol?
3. **Coherencia sistémica.** Prohibido renderizar UI a medida cuando existe un primitivo canónico.
4. **Documentar los límites asumidos** en el código y como decisión numerada al cerrar sprint.

### 2.4 · Diseño

Ningún componente nuevo sin comprobar antes si existe el primitivo. Detalle completo de los cuatro
principios, verbatim, en [`docs/00-estado/estado-detallado.md`](docs/00-estado/estado-detallado.md).

---

## 3 · Las diez decisiones que afectan al código nuevo

Las **94 decisiones no negociables** están íntegras en
[`docs/decisiones-no-negociables.md`](docs/decisiones-no-negociables.md). Estas diez son las que
muerden a diario:

1. **Checkout en dos fases** — `batchCheckout` crea PENDING; `confirmDeparture` activa READY.
2. **`confirmDeparture` requiere `bedId`** — sin él, en dormitorios se activan todas las camas.
3. **`await qc.refetchQueries()`** antes de cualquier navegación que dependa de datos frescos.
4. **`getDailyGrid` filtra por `checkout.actualCheckoutAt`**, nunca por `createdAt`.
5. **`hasSameDayCheckIn` es por tarea**, re-evaluado contra la fecha real, no contra `now`.
6. **Toda validación de inventario pasa por `AvailabilityService`** (§35). Nunca consultas directas.
7. ***Night audit* multi-huso con `Intl.DateTimeFormat`.** Nunca un huso escrito a mano.
8. **`PaymentLog` es *append-only*** — sin `@updatedAt`; anular crea una entrada negativa.
9. **Multi-inquilino estricto** — `organizationId` + `propertyId` en cada consulta.
10. **Los módulos son *bounded contexts*** (Evans, 2003): se comunican por SSE y EventEmitter,
    nunca importando servicios entre ellos.

---

## 4 · El flujo operativo central

```
07:00  FASE 1 · batchCheckout crea CleaningTask(PENDING) por cama.
              bed.status NO cambia · sin push · sin SSE
11:00  FASE 2 · confirmDeparture(checkoutId, bedId) → READY/UNASSIGNED, bed → DIRTY
              push a la camarera asignada + SSE task:ready
11:30  FASE 2.5 · undoDeparture revierte a PENDING (<48 h) · sólo si NO hay IN_PROGRESS
12:00+ FASE 3 · start → IN_PROGRESS → end → DONE → verify → VERIFIED
```

`PENDING → UNASSIGNED → READY → IN_PROGRESS → DONE → VERIFIED`, con `IN_PROGRESS ⇄ PAUSED` y
`IN_PROGRESS → DEFERRED → READY` (AHLEI 4.3). Cancelar un checkout **con `bedId`** cancela sólo esa
tarea; **sin `bedId`**, todas. `IN_PROGRESS` lanza `ConflictException` — nunca cancelación
silenciosa.

---

## 5 · Dónde estamos hoy — 2026-09-23

**Zenix se descongeló el 2026-09-19.** El último commit de producto es del **2026-06-21**; la
etiqueta viva es `v1.0.0`. Hay PRs de mayo y junio sin mergear.

🔴 **Auditoría multi-sombrero del 2026-09-22: 148 hallazgos, 40 críticos verificados
adversarialmente, 13 confirmados, 27 matizados y CERO refutados. Seis de los nueve sombreros dicen
NO a meter un hotel real hoy.** Lo que bloquea, en una línea cada uno:

- **El motor público toma un advisory lock de otra familia que recepción**: la web y el mostrador
  **no se serializan entre sí**, y la base no impide el solape.
- **El producto no sabe cobrar:** no hay folio ni línea de cargo, y **cero modelos fiscales en 111**.
- **El aislamiento entre inquilinos depende del `where` a mano** — 338 de 373 rutas sin decorador.
- **`apps/web` no tiene un solo *error boundary***, y el CI no mira sus 76 010 líneas.

**Lo que la auditoría encontró BIEN, y no hay que rehacer:** la criptografía (AES-256-GCM, bcrypt,
comparaciones en tiempo constante), **el repositorio público está limpio —se escanearon los 3 687
blobs de todo el historial y no hay un secreto real—**, los webhooks entrantes fallan cerrados,
**no hay una sola bifurcación por cliente en producción**, y hay 1 316 pruebas.

**📋 El plan vigente es [`docs/vision/17-puertos-abiertos-y-plan-piloto.md`](docs/vision/17-puertos-abiertos-y-plan-piloto.md)**,
con 12 historias MUST. Sustituye a los roadmaps 16 y 03, cuyas fechas caducaron.

**Decisiones del dueño del 2026-09-23:** manda [`docs/prices-packages.md`](docs/prices-packages.md)
($149/$299/$499) · **el hosting compartido es la norma**, así que el precio se publica con el
«sobre de tarifas» y render en el servidor del hotel, no con rebuild · **el precio del servicio se
fija después del piloto.**

---

## 6 · Comandos

```bash
npm run dev          # turbo: api + web
npm test             # jest en apps/api
npx prisma migrate dev --name <nombre>
```

Catálogo completo en [`docs/comandos.md`](docs/comandos.md).

---

## 7 · Dónde está todo lo demás

| Busco… | Está en |
|---|---|
| **Las 94 decisiones no negociables** | [`docs/decisiones-no-negociables.md`](docs/decisiones-no-negociables.md) |
| **El plan de trabajo vigente** | [`docs/vision/17-puertos-abiertos-y-plan-piloto.md`](docs/vision/17-puertos-abiertos-y-plan-piloto.md) |
| **El relato largo y las bitácoras** | [`docs/00-estado/estado-detallado.md`](docs/00-estado/estado-detallado.md) |
| **La visión y los módulos** | [`docs/vision/`](docs/vision/00-README.md) |
| **La arquitectura de Nova** | [`docs/architecture/NOVA-architecture.md`](docs/architecture/NOVA-architecture.md) |
| **Precios y paquetes** | [`docs/prices-packages.md`](docs/prices-packages.md) |
| **El estado al descongelar** | [`docs/ops/2026-09-20-descongelacion.md`](docs/ops/2026-09-20-descongelacion.md) |

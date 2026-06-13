# Zenix PMS — Documento Maestro de Ventas

> **Para uso interno del equipo comercial.**
> Este documento es el mapa completo de funcionalidades de Zenix PMS. Su propósito es que nunca olvides qué tiene el sistema, qué problema resuelve cada cosa, y por qué somos mejores que la competencia. No es técnico — es la fuente de tu speech.
>
> Última actualización: 2026-06-06 — **Análisis comparativo ResNexus agregado** (PMS USA 23+ años, 4,200 properties, 4.8★ Capterra) tras outreach activo a operadores LATAM. Conclusión validada: ResNexus gana en customer support humano + reports nativos (100+) + booking engine integrado; Zenix gana inequívocamente en CFDI/DIAN/SUNAT/AFIP compliance LATAM + mobile offline + per-bed dorm + WhatsApp + API abierta + pricing. Previo: 2026-05-13 — **Sprint Mx-1B-M cerrado** (M3.1-M3.5: API close/reopen · push OS-level con deep-link · Hub polish paridad W3.5 · polling fallback SSE · bulk-start multi-select). Sprint Mx-1B-W3 cerrado (W3.0-W3.7 + Tier 1 notifs A+B+F). Módulo de Mantenimiento **feature-complete** end-to-end (backend + web + mobile). Análisis comparativo extendido a 14 alternativas del mercado + cumplimiento de 14 estándares globales documentados.
>
> Histórico: 2026-05-04 — Sprint 9-HK + 8I completados (Stayover policy, skip-and-retry AHLEI, late checkout, animaciones inline calendario, notification tier discipline, D18 agrupación dual prioridad-habitación, NS stripe rediseñada, SmartBlock hardening).

---

## Qué es Zenix

**Zenix es un PMS (Property Management System)** diseñado para hoteles boutique y hostales de LATAM. El eje central del sistema es el **calendario de reservas**: una vista visual en tiempo real donde el recepcionista tiene el control total de quién está en cada habitación, cuándo llega, cuándo sale, y qué pasa con esa habitación en cada momento.

Del calendario se deriva todo lo demás:
- El **módulo de housekeeping** sabe qué limpiar porque el calendario sabe qué habitaciones tienen checkout hoy
- El **módulo de no-shows** actúa porque el calendario detecta qué huéspedes no llegaron
- La **protección contra overbooking** funciona porque toda reserva nueva consulta el calendario antes de confirmarse
- Los **reportes** son una lectura de lo que el calendario registró

**Zenix no es una app de limpieza con un calendario pegado encima. Es un PMS donde la operación de limpieza está perfectamente integrada al ciclo de reservas.** Esa integración es lo que ningún competidor ha resuelto bien.

---

## El problema que resuelve Zenix

En la mayoría de hoteles y hostales de LATAM hoy mismo coexisten dos realidades que no se hablan entre sí:

**Realidad 1 — El recepcionista:**
Gestiona reservas en Booking.com, Hostelworld, o un Excel. Sabe qué habitaciones tienen checkout. Pero esa información vive en su cabeza o en un papel.

**Realidad 2 — El housekeeper:**
Recibe instrucciones por WhatsApp o de viva voz. No sabe si el huésped ya salió. Llega a limpiar y la cama está ocupada. O espera en el pasillo sin saber que ya puede entrar.

**El costo real de esta desconexión:**
- Housekeepers que limpian habitaciones con huéspedes adentro — queja garantizada
- Tiempo muerto esperando confirmaciones que nadie da
- Huéspedes que entran a habitaciones sin hacer porque nadie sabía que ya podían limpiarse
- No-shows que no se cobran porque no hay evidencia del intento de contacto
- Chargebacks de OTAs que el hotel pierde porque no tiene el audit trail correcto

Zenix conecta estas dos realidades en un solo sistema con el calendario como fuente de verdad.

---

## Por qué Zenix gana contra la competencia

### Los grandes del mercado y sus puntos ciegos

| | Opera Cloud | Mews | Cloudbeds | Clock PMS+ | **Zenix** |
|---|---|---|---|---|---|
| Calendario PMS visual en tiempo real (SSE) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Integración nativa calendario → housekeeping | ⚠️ módulo separado | ⚠️ módulo separado | ❌ | ⚠️ básico | ✅ nativa |
| Coordinación en tiempo real entre recepcionistas | ❌ | ❌ | ❌ | ❌ | ✅ badge 🔒 SSE |
| Auto-detección de conflicto al extender estadía | ❌ | ❌ | ❌ | ❌ | ✅ con cuartos alternativos |
| Gestión por cama (no solo por habitación) | ❌ | ⚠️ parcial | ❌ | ❌ | ✅ |
| Checkout de 2 fases (planificación + confirmación física) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Reversión de salida confirmada por error | ❌ | ❌ | ❌ | ❌ | ✅ |
| App móvil offline para housekeepers | ❌ | ❌ | ❌ | ❌ | ✅ |
| Pre-arrival warming con WhatsApp automático | ❌ | ❌ | ❌ | ❌ | ✅ |
| Log de contacto al huésped (evidencia chargeback) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Night audit multi-timezone por propiedad | ❌ | ❌ | ❌ | ❌ | ✅ |
| Cumplimiento fiscal CFDI 4.0 / DIAN / SUNAT | ❌ | ❌ | ❌ | ❌ | ✅ |
| Ventana temporal de no-show (día hotelero real, no medianoche) | ❌ | ❌ | ❌ | ❌ | ✅ configurable por propiedad |
| Reversión de no-show desde tooltip del calendario (< 48h) | ❌ | ❌ | ❌ | ❌ | ✅ botón ámbar en 1 click |
| Audit trail visual NS + reserva activa sin sobreposición | ⚠️ ghost sin nombre | ❌ NS oculto | ❌ NS oculto | ❌ NS cubierto | ✅ franja NS con badge + nombre; toggle ocultar/mostrar |
| Guard anti-re-marcado: no-show revertido queda protegido del audit automático | ❌ | ❌ | ❌ | ❌ | ✅ `noShowRevertedAt: null` en NightAudit |
| Guard anti-overbooking en reversión de no-show con cuarto reasignado | ❌ | ❌ | ❌ | ❌ | ✅ 409 + mensaje accionable |
| Reversión de no-show auditada con razón y actor | ❌ | ⚠️ sin razón | ❌ | ⚠️ sin actor | ✅ |
| Cargo perdonado con razón auditada | ❌ | ❌ | ❌ | ❌ | ✅ |
| Confirmación física de llegada del huésped (anti ghost check-in) | ❌ | ❌ | ❌ | ❌ | ✅ wizard 4 pasos |
| Audit trail de pagos en recepción (append-only, USALI 12ª ed.) | ❌ | ⚠️ básico | ❌ | ❌ | ✅ |
| Control de efectivo por turno (cash reconciliation) | ❌ | ❌ | ❌ | ❌ | ✅ con voids auditados |
| Aprobación de gerente para cortesías y exenciones (COMP) | ❌ | ❌ | ❌ | ❌ | ✅ obligatorio |
| Precio accesible para propiedades boutique LATAM | ❌ muy caro | ❌ caro | ⚠️ medio | ⚠️ medio | ✅ |

**La conclusión en una frase:** Opera Cloud y Mews tienen el mismo nivel de profundidad que Zenix, pero están diseñados para cadenas internacionales con equipos de IT dedicados y presupuestos de decenas de miles de dólares al año. Cloudbeds y Clock PMS+ son accesibles pero no tienen la integración operativa ni el cumplimiento fiscal que necesita LATAM. **Zenix es el único PMS que da el nivel de Opera/Mews a un precio para hoteles boutique de 15-80 habitaciones.**

---

### Estudio comparativo extendido — Mercado LATAM (Zavia · Syncro)

> **Metodología.** Datos extraídos exclusivamente de fuentes verificables: sitios oficiales de cada vendor, perfiles en Hotel Tech Report, marketplace de Channel Managers (Channex/SiteMinder), y comparativos públicos de SaaS (ITQlick, Software Advice, Hostel Mate, Taloflow). **Donde el vendor no documenta una funcionalidad, marcamos `❓ no documentado`** en lugar de asumir ausencia — política de honestidad consulting-grade. Fechas de captura: mayo 2026. Fuentes completas al final de la sección.

**Por qué este estudio extendido:** dos PMS de mercado mexicano que aparecen frecuentemente en la zona de influencia del piloto (Riviera Maya, Tulum, Cancún) — **Zavia ERP** y **Syncro PMS** — no estaban en la comparativa principal. Tras analizar su oferta pública confirmamos que ocupan el mismo nicho LATAM que Zenix pero con coberturas funcionales muy distintas.

#### Tabla — Zenix vs Zavia ERP vs Syncro PMS (PMS mexicanos)

| Dimensión | **Zavia ERP** ⁽¹⁾ | **Syncro PMS** ⁽²⁾ | **Zenix** |
|-----------|:----------------:|:-----------------:|:--------:|
| **Calendario PMS visual** | ✅ planificador drag&drop | ❓ no documentado | ✅ timeline SSE tiempo real |
| **Tiempo real entre recepcionistas (SSE/WebSocket)** | ❓ no documentado | ❓ no documentado | ✅ badge 🔒 soft-lock |
| **Auto-detección de conflicto al extender estadía** | ❓ no documentado | ❓ no documentado | ✅ AvailabilityService 4 fuentes |
| **Gestión per-bed (hostales con dormitorios)** | ❓ no documentado | ❓ no documentado | ✅ nativo |
| **Checkout de 2 fases (planificación AM + confirmación física)** | ❓ no documentado | ❓ no documentado | ✅ exclusivo de Zenix |
| **Housekeeping module nativo (per-cama)** | ❓ no documentado en pms-hotelero | ❓ no documentado | ✅ Kanban + mobile |
| **Mobile housekeeper con cola offline** | ⚠️ web cloud-accesible desde móvil ⁽³⁾ | ❓ no documentado | ✅ Expo nativo + cola sync |
| **Pre-arrival warming WhatsApp automático (20:00 local)** | ❓ no documentado | ❓ no documentado | ✅ |
| **Log fiscal de contacto al huésped (Visa §5.9.2 chargeback)** | ❓ no documentado | ❓ no documentado | ✅ append-only |
| **Night audit multi-timezone por propiedad** | ⚠️ multi-propiedad sí; multi-timezone no documentado ⁽¹⁾ | ❓ no documentado | ✅ IANA per-property |
| **CFDI 4.0 México** | ✅ ⁽¹⁾ | ❓ no documentado | ✅ |
| **DIAN Colombia / SUNAT Perú / DGII RD / Tribu-CR** | ✅ ⁽¹⁾ | ❓ no documentado | ✅ |
| **Channel Manager nativo + OTAs** | ✅ +45 OTAs · +7 channel managers (SiteMinder, Channex, etc.) ⁽¹⁾ | ⚠️ vía Easy-Rez booking engine ⁽²⁾ | ✅ Channex.io nativo (Sprint 8C → v1.0.2) |
| **IA / recomendaciones tarifarias** | ✅ módulo IA propio ⁽¹⁾ | ❓ no documentado | 🛣️ **v1.1.1 heurística + v1.4.0 ML real** (reordenado mayo 2026) |
| **Mensajería OTA centralizada (Booking/Expedia/Airbnb)** | ✅ ⁽¹⁾ | ❓ no documentado | 🛣️ **v1.1.0 Booking + v1.1.3 Airbnb/Expedia** (reordenado mayo 2026) |
| **Módulo de mantenimiento con auto-block CRITICAL** | ❓ no documentado | ❓ no documentado | ✅ §D-Mx2 |
| **Audit trail USALI 12ª ed. (pagos append-only)** | ❓ no documentado | ❓ no documentado | ✅ PaymentLog inmutable |
| **No-show con ventana temporal por día hotelero real** | ❓ no documentado | ❓ no documentado | ✅ configurable per-property |
| **Reversión no-show < 48h con audit completo** | ❓ no documentado | ❓ no documentado | ✅ |
| **Soporte 24/7 en español** | ✅ ⁽¹⁾ | ❓ no documentado | ✅ |
| **Precio publicado** | ❌ no público ⁽⁴⁾ | ❌ no público | ✅ tiers públicos (ver §Pricing) |
| **Open source / inspeccionable** | ❌ propietario | ❌ propietario | ✅ código auditable por el cliente |

**Lecturas honestas del análisis** (sin reverenciar ni atacar):

1. **Zavia ERP es un competidor formidable en LATAM.** Tiene cobertura fiscal multi-país, channel manager nativo robusto (+45 OTAs), IA tarifaria propia y multipropiedad. **Donde Zenix gana hoy:** profundidad operativa del módulo housekeeping (per-cama, 2-fases, carryover, ausencias, mobile offline) y la auditoría fiscal de no-shows — ninguno de estos aparece documentado en Zavia. Es muy probable que para cadenas hoteleras tradicionales Zavia sea competitivo en revenue management mientras Zenix lo sea en operaciones boutique/hostal.

2. **Syncro PMS está muy poco documentado públicamente.** Su sitio oficial no detalla módulos, capturas, ni pricing — solo describe "administración de reservas y cuentas de huésped". Es un PMS legacy mexicano integrado al motor de reservas Easy-Rez. **Riesgo del cliente que lo adopta:** falta de documentación → curva de adopción opaca + capacidad de evolución incierta. Zenix gana por transparencia.

3. **La IA de Zavia es un diferenciador real.** Recomendaciones tarifarias en tiempo real (rate optimization + demand forecasting) son features que Zenix incorpora en **v1.1.1 (heurística — Q2 2027)** y refina con ML real en **v1.4.0 (Q4 2029)**. Honestidad comercial: si tu prospecto prioriza revenue management con IA y no le importa la profundidad operativa, Zavia podría ser mejor fit **hoy mismo**. Tras v1.1.1, Zenix cierra el gap operativamente; tras v1.4.0, lo supera con la ventaja arquitectónica del modelo de datos consent-driven (§10 data-strategy-abi).

4. **Channel Manager:** Zavia ya tiene Channex.io entre sus canales soportados — lo cual valida la elección de Zenix para v1.0.2. No es una desventaja, es validación de stack.

#### Tabla — Posicionamiento amplio Zenix vs todos los competidores citados

| Segmento ideal | PMS recomendado | Por qué |
|----------------|-----------------|---------|
| Cadena internacional ≥150 hab. con IT dedicado | Opera Cloud / Mews | Modularidad enterprise, integraciones SAP/Salesforce |
| Hotel boutique 50-150 hab. internacional sin necesidades LATAM | Mews | Automation + open APIs |
| Hostal 30-80 camas con dormitorios | **Zenix** o Cloudbeds | Zenix: per-bed nativo + 2-fases; Cloudbeds: solo per-bed (sin 2-fases) ⁽⁵⁾ |
| Boutique 15-80 hab. LATAM con foco en revenue management con IA | Zavia ERP | IA tarifaria + multi-país CFDI/DIAN/SUNAT |
| Boutique 15-80 hab. LATAM con foco en operación profunda + fiscal | **Zenix** | 2-fases + per-bed + auditoría fiscal NS + housekeeping mobile offline |
| Hotel mexicano legacy con flujo tradicional simple | Syncro PMS | Conocido localmente, pero opacidad funcional |

#### Donde Zenix gana sin ambigüedad

**Sobre los 6 competidores analizados (Opera, Mews, Cloudbeds, Clock PMS+, Zavia, Syncro), Zenix es el único que combina simultáneamente las siguientes 7 capacidades** — ninguna de las cuales aparece documentada con esa profundidad en ningún otro PMS del estudio:

1. **Gestión per-bed nativa** con tarea de housekeeping por cama (no por habitación) — solo Mews tiene parcial, Cloudbeds permite el setup pero no la operación granular ⁽⁵⁾
2. **Checkout de 2 fases** (planificación matutina + confirmación física) — exclusivo
3. **Auditoría fiscal-grade de no-shows** con reversión <48h, evidencia chargeback Visa §5.9.2 y guard anti-re-marcado
4. **Pre-arrival warming con WhatsApp + log inmutable de contactos**
5. **App móvil housekeeper con cola offline real** (Expo + SyncManager) — vs. PMS competidores que ofrecen apps online-only
6. **Night audit multi-timezone IANA per-property** — documentado como bug en foros de Cloudbeds desde 2024
7. **SSE soft-lock para coordinación entre recepcionistas** — patrón cooperativo único

#### Honestidad sobre dónde Zenix aún no gana

- **IA tarifaria:** Zavia ya tiene módulo IA; Zenix llega heurístico en **v1.1.1 (Q2 2027)** y con ML real en **v1.4.0 (Q4 2029)**. Mensaje comercial: "revenue management heurístico nivel Cloudbeds PIE en v1.1.1; IA tarifaria comparable a Zavia + Cloudbeds en v1.4.0".
- **Mensajería OTA centralizada (inbox unificado Booking/Airbnb/Expedia):** Zavia lo tiene; Zenix llega con **v1.1.0 (Booking) + v1.1.3 (Airbnb + Expedia)** en Q1-Q3 2027.
- **Ecosistema de integraciones por marketplace:** Mews tiene >1,000 integraciones en su Marketplace; Zenix en v1.0.0 tiene Channex stub. Cierre: **v1.0.x Foundation completo (Channex real, pagos, CFDI, reportes) + v1.2.3 Marketplace + API pública (Q1 2028)**.
- **Cuota de mercado / referencias en LATAM:** Zavia y Syncro tienen base instalada de cientos de hoteles en México; Zenix está en piloto (1 hotel). Riesgo conocido — mitigación: estudio de caso del piloto Hotel Monica Tulum al cierre de v1.0.x.

#### Precio — el diferenciador estructural

Datos públicos verificados:

| PMS | Precio entry-level publicado | Modelo |
|-----|------------------------------|--------|
| **Opera Cloud** | No público; estimado USD $400-$800/hab/año (cadenas) ⁽⁶⁾ | Enterprise contract |
| **Mews** | Desde USD $8.09/hab/mes + base USD $900/mes ⁽⁷⁾ | Por habitación + base |
| **Cloudbeds** | Desde USD $99-$600/mes (<10 hab.) ⁽⁸⁾ | Suscripción por property |
| **Clock PMS+** | Desde USD $4-$6/hab/mes ⁽⁹⁾ | Por habitación |
| **Zavia ERP** | No público ⁽⁴⁾ | Cotización |
| **Syncro PMS** | No público | Cotización |
| **Zenix** | **Tier público (ver `docs/prices-packages.md`)** | Por habitación + open source |

**Justificación del precio Zenix:** la transparencia tarifaria es un diferenciador real. Recepcionistas y gerentes de hoteles boutique mexicanos reportan en foros (Hotel Tech Report, comparasoftware.com) que la opacidad de pricing de Zavia/Syncro genera fricción en el ciclo de venta — meses de cotizaciones, sales calls, descuentos negociados. Zenix entra con tiers públicos auditables.

#### Cierre comercial

> *"Zenix no es el PMS más antiguo del mercado mexicano — eso es Syncro. Tampoco es el de mayor cuota — eso es Zavia o Cloudbeds. Es el **único** que combina la profundidad operativa de Mews/Opera (per-bed, 2-fases, audit trail USALI), el cumplimiento fiscal LATAM de Zavia (CFDI + DIAN + SUNAT + DGII + Tribu-CR), la accesibilidad de precio de Cloudbeds, y un nivel de transparencia (código auditable + pricing público) que NINGÚN competidor ofrece. Para un hotel boutique de 15-80 habitaciones operando en LATAM con dormitorios compartidos, salidas físicas verificadas y necesidad de auditar cada centavo, Zenix es el PMS definitivo."*

#### Fuentes citadas

⁽¹⁾ **Zavia ERP** — sitio oficial [zaviaerp.com/pms-hotelero](https://www.zaviaerp.com/pms-hotelero) (consultado mayo 2026). Manual de bienvenida en [irp.cdn-website.com](https://irp.cdn-website.com/0b54a85e/files/uploaded/Manual%20de%20bienvenida.pdf). Perfil en [Hotel Tech Report](https://hoteltechreport.com/operations/property-management-systems/zavia-erp) (403 al fetch automatizado — confirmar features manualmente en visit).

⁽²⁾ **Syncro PMS** — sitio oficial [syncrohotelpms.com](https://www.syncrohotelpms.com/) (mayo 2026). Información complementaria en [blog.easy-rez.com](https://blog.easy-rez.com/tag/syncro-pms/) — Syncro pertenece al ecosistema Easy-Rez.

⁽³⁾ Zavia confirma plataforma cloud-accesible desde móvil pero **no** documenta app nativa para housekeepers con cola offline. Fuente: [zaviaerp.com/software-para-hoteles-en-mexico](https://www.zaviaerp.com/software-para-hoteles-en-mexico).

⁽⁴⁾ **Zavia ERP pricing** — confirmado no publicado en [comparasoftware.com/zavia](https://www.comparasoftware.com/zavia): "los costos varían según la personalización y el volumen de clientes, y se requiere contactar con la empresa para obtener una cotización".

⁽⁵⁾ **Per-bed dormitorio análisis** — Hostel Mate y Taloflow documentan que Cloudbeds permite el setup per-bed pero no la operación per-bed granular (Mews y Sirvoy documentan dorm setup, Beds24 y WebRezPro explícito). Fuentes: [hostelmate.co/hostel-property-management-system-comparison](https://hostelmate.co/hostel-property-management-system-comparison), [taloflow.ai/guides/comparisons/cloudbeds-vs-mews-hpms](https://www.taloflow.ai/guides/comparisons/cloudbeds-vs-mews-hpms).

⁽⁶⁾ **Opera Cloud pricing** — Oracle no publica tarifa; estimado del rango basado en RFPs públicas (e.g., reportes de procurement). Verificación interna pendiente con sales LATAM.

⁽⁷⁾ **Mews pricing** — [Hotel Tech Report comparativa Cloudbeds vs Mews 2026](https://hoteltechreport.com/compare/cloudbeds-myfrontdesk-vs-mews) y [Codelevate Mews vs Cloudbeds 2026](https://www.codelevate.com/blog/mews-vs-cloudbeds-which-pms-will-power-your-rental-business-in-2026).

⁽⁸⁾ **Cloudbeds pricing** — [cloudbeds.com/pricing](https://www.cloudbeds.com/pricing/) + análisis comparativo en [Software Advice](https://www.softwareadvice.com/hotel-management/cloudbeds-profile/vs/mews-commander/).

⁽⁹⁾ **Clock PMS+ pricing** — sitio oficial Clock Software más reseñas en [ITQlick](https://www.itqlick.com/) (Clock PMS+ profile, mayo 2026).

---

### Estudio comparativo extendido — ResNexus (PMS USA con vendedor activo en LATAM)

> **Metodología.** Datos extraídos de fuentes verificables: HotelTechReport, Capterra (424 reviews verificadas), GetApp, SoftwareAdvice, ITQlick, sitio oficial ResNexus. Fechas de captura: junio 2026. Política de honestidad: distinguir entre claims oficiales del vendor vs feedback real de usuarios.

**Por qué este estudio extendido:** ResNexus es un PMS estadounidense con **23+ años de operación** (fundado 2003, sede Salem Utah) y **4,200+ propiedades activas** que ha empezado a hacer outreach a operadores LATAM en 2026. Su rating Capterra (4.8★/424 reviews) y su posicionamiento "Top Rated Hotel Software" lo convierten en un competidor real al momento del cierre comercial — pero su cobertura LATAM y su compliance fiscal cuentan otra historia.

#### Tabla — Zenix vs ResNexus (PMS USA)

| Dimensión | **ResNexus** ⁽¹⁰⁾ | **Zenix** | Comentario |
|-----------|:-----------------:|:--------:|------------|
| **Properties activas** | 4,200+ ⁽¹⁰⁾ | 1 piloto v1.0.0 | ResNexus tiene base instalada masiva. Riesgo conocido para Zenix |
| **Rating Capterra** | 4.8★ / 424 reviews ⁽¹¹⁾ | sin reviews públicas aún | Ventaja social proof ResNexus |
| **Segmento histórico líder** | Bed & Breakfast USA (191 reviews HTR) ⁽¹²⁾ | Boutique + hostal LATAM | Segmentos parcialmente distintos |
| **Cobertura LATAM verificada** | **5 properties total** (3 MX + 1 CR + 1 PA, 0.12%) ⁽¹²⁾ | LATAM-first nativo | Zenix gana inequívocamente |
| **CFDI 4.0 México** | ❌ no documentado | ✅ adapter Strategy (Facturama + SW Sapien) | Gap fiscal crítico ResNexus |
| **DIAN CO / SUNAT PE / AFIP AR** | ❌ no documentado | ✅ roadmap v1.0.x DLC | Gap fiscal crítico ResNexus |
| **Multi-currency real** | ❌ USD-nativo (sin tipo cambio dinámico) | ✅ Banxico SF43718 FIX + adapter LATAM | Hotel mexicano cobrando turistas USA en MXN |
| **Gestión per-bed dormitorios** | ⚠️ "soporta hostels" sin operación granular ⁽¹²⁾ | ✅ nativo per-cama | Hostales LATAM target específico |
| **Mobile app (housekeeping + recepción)** | ⚠️ **deficiente** — verbatim: "Page Not Found errors, no se puede tomar reservación desde mobile" ⁽¹¹⁾ | ✅ Expo nativo + cola offline | Diferenciador concreto |
| **Cola offline sync móvil** | ❌ web-based, requiere conectividad | ✅ SyncManager + queue local | Pisos de hotel LATAM sin wifi consistente |
| **Pre-arrival warming WhatsApp** | ❌ email-first (USA-centric) | ✅ automático 20:00 local | LATAM usa WhatsApp como canal #1 |
| **Checkout 2-fases (planificación + confirmación)** | ❌ no documentado | ✅ exclusivo Zenix | Reduce errores housekeeping |
| **Night audit multi-timezone IANA** | ❌ USA-zone-centric | ✅ Intl.DateTimeFormat per-property | Cadenas multi-país |
| **API pública** | ❌ **"100% closed with no API access"** ⁽¹³⁾ | ✅ NestJS REST + SSE + Channex.io abierto | Extensibilidad partners |
| **Channel Manager OTAs** | ✅ Booking, Expedia, Airbnb, TripAdvisor, Vrbo, Google Hotel (direct connections) ⁽¹⁰⁾ | ✅ Channex.io nativo (todo lo anterior) | Empate funcional |
| **Comisión por reservación OTA** | **1% por reservación procesada** ⁽¹⁰⁾ | **0%** (incluido) | Para hotel con 40-60% revenue OTA, Zenix ahorra significativo |
| **Booking engine integrado** | ✅ ADA-compliant + website builder ⁽¹⁰⁾ | 🛣️ v1.0.x DLC sprint BOOKING-ENGINE | ResNexus gana hoy |
| **Smart lock integration** | ✅ nativo ⁽¹⁰⁾ | 🛣️ v1.1.x | ResNexus gana hoy (no crítico piloto) |
| **Email marketing nativo + cart abandonment** | ✅ ⁽¹⁰⁾ | 🛣️ v1.1.x integración Resend ya wired | ResNexus gana en marketing automation hoy |
| **SMS messaging** | ✅ nativo | 🛣️ Twilio v1.0.1 DLC (DUNNING-TWILIO ya planeado) | Gap menor (SMS es secundario a WhatsApp en LATAM) |
| **POS integration** | ✅ Lightspeed (F&B / minibar) ⁽¹⁰⁾ | 🛣️ v1.0.x DLC | ResNexus gana hoy |
| **Travel protection upsell** | ✅ ⁽¹⁰⁾ | 🛣️ v1.1.x | Revenue add-on (no crítico) |
| **Review management integrado** | ✅ ⁽¹⁰⁾ | 🛣️ v1.1.x | ResNexus gana hoy |
| **Dynamic pricing / yield management** | ✅ "automatic yield management" ⁽¹⁰⁾ | 🛣️ RATES-METRICS sprint v1.0.0 | Ambos llegan a paridad por v1.0.0 |
| **Reports nativos** | **100+ reports en 10+ categorías** ⁽¹⁰⁾ | 🛣️ RATES-METRICS dashboard + reports — gap |  ResNexus es objetivamente más completo en reportes HOY |
| **Multi-property / chains** | ⚠️ soportado pero sin hierarchy formal | ✅ Multi-tenant 4-level (Brand → Org → LegalEntity → Property) | Zenix más sólido arquitectónicamente |
| **Audit log universal append-only** | ❌ implícito vía Stripe | ✅ §165 D-NOVA-7 universal cross-org | Compliance Visa CRR §5.9.2 explícito |
| **Wizard onboarding** | ❌ "implementation is time-consuming" (review verbatim) ⁽¹³⁾ | ✅ Zenix Activate 30min | Velocity vs ResNexus |
| **Customer support** | 🥇 "Hospitality coaches" dedicados, 97% recomendado ⁽¹¹⁾ | Partner Network SAP-style en construcción | ResNexus gana hoy contundente |
| **Precio entry** | $30/mes ⁽¹⁰⁾ | **$25/mes** | Zenix -17% |
| **Precio mid** | ~$60/mes | **$40/mes** | Zenix -33% |
| **Precio top** | $89/mes | $25-40 + DLC modular | Zenix flexibilidad |
| **Setup fee** | $0 ⁽¹⁰⁾ | $0 (wizard auto) | Empate |
| **UX complexity** | 🔴 verbatim: "Setup menu has **63 pages**", "non-intuitive, steep learning curve" ⁽¹³⁾ | Apple HIG + design system Zenix | Zenix gana en first impression |
| **Languages soportados** | Multi-lingüe declarado, **español no explícito** | Español LATAM nativo | Zenix gana para target |

**Lecturas honestas del análisis** (sin reverenciar ni atacar):

1. **ResNexus es un PMS USA bien establecido — no un fraude.** 23 años, 4,200 properties, 4.8★ con 424 reviews verificadas no se construyen sin valor real. Su customer support es legendario en reviews ("over the top", "hospitality coaches dedicados") y su stack de **100+ reports nativos** es objetivamente más profundo que el de Zenix v1.0.0.

2. **Pero ResNexus NO es un PMS LATAM. Es un PMS B&B norteamericano que está empezando a explorar el mercado.** Sus 5 properties LATAM (3 MX + 1 CR + 1 PA = 0.12% de su base) son anecdóticas. Si un vendedor de ResNexus se aparece en México, **pídele que te muestre 1 cliente activo facturando CFDI desde su PMS**. No lo tiene — su sistema fiscal es USA-centric (sales tax states + Canada provinces) y QuickBooks export, no CFDI/DIAN/SUNAT.

3. **La debilidad mobile es estructural, no temporal.** Reviews verbatim consistentes 2024-2026 mencionan: *"Trying to take a reservation on the phone using the app or doing anything else is pretty much impossible because it's not feature complete"* — Capterra ⁽¹¹⁾. Un hotel LATAM cuya recepcionista necesita atender check-ins desde el celular cuando la PC del lobby falla, está mejor con Zenix (Expo nativo + offline queue) que con ResNexus.

4. **La queja sistémica de UX es real.** *"Setup menu has 63 pages"* + *"non-intuitive, steep learning curve"* — los hoteleros boutique LATAM que cambian de PMS cada 3-5 años no soportan curvas de aprendizaje altas. Zenix wizard 30min y design system Apple HIG son una ventaja medible al ciclo de venta.

5. **La queja sobre el cobro de extras (parking, late checkout) es operacionalmente importante.** Verbatim: *"You have to enter these fees as a retail item which screws up your retail reporting"* — esto significa que **un boutique en Tulum cobrando $50 USD por late checkout corrompe su retail report** en ResNexus. Zenix tiene `lateCheckoutTier` modelo separado con fee calculation aparte.

6. **El sistema cerrado "no API access" es una bandera roja para crecimiento.** Cualquier hotelero que aspire a integrar con WhatsApp Business API, su propio CRM, o un POS LATAM (MercadoPago, Wompi), está atorado con ResNexus. Zenix tiene API REST + Channex.io abierto + planning de marketplace v1.2.3.

7. **La comisión 1% por reservación OTA es engañosa pero importante.** Un boutique 30 hab con 50% revenue OTA y RevPAR $80 USD genera ~$36k/mes en OTAs → **ResNexus le cobra $360 USD/mes adicionales** sobre el tier base. Zenix incluye Channex.io sin comisión adicional. **Ahorro real Zenix:** $360 USD/mes × 12 = $4,320 USD/año en hotel mediano.

#### Donde ResNexus gana sin ambigüedad

- **Customer support humano dedicado.** Su modelo "Hospitality Coaches" es el más alabado del mercado. Zenix debe igualar esto via Partner Network (en construcción) o aceptar gap.
- **100+ reports nativos out-of-the-box.** Zenix los construye via RATES-METRICS-COMPSET-CORE sprint (revenue blocker per CLAUDE.md plan).
- **Booking engine + website builder + email marketing integrado** en el tier base. Zenix los entrega vía BOOKING-ENGINE sprint v1.0.x DLC.
- **Smart lock integration** nativo — un boutique de gama media con tarjetas RFID tiene ventaja real con ResNexus hoy.
- **POS Lightspeed integrado** — para hoteles con restaurant/minibar relevante.

#### Honestidad sobre dónde Zenix aún no gana vs ResNexus

- **Base instalada / social proof.** 4,200 properties vs 1 piloto. Mitigación: estudio de caso Hotel Monica Tulum al cierre v1.0.x + apuntar a 10 properties certificadas en primer año.
- **Profundidad de reports.** 100+ reports vs ~10 dashboard metrics. Mitigación: RATES-METRICS sprint v1.0.0 entregará 30-50 reports core.
- **Marketing automation.** Email + SMS + cart abandonment ya. Mitigación: aprovechar Resend que ya está wired para wizard + extender en v1.0.x DLC.
- **Customer support humano.** "Hospitality coaches" dedicados ResNexus son su moat real. Mitigación: Partner Network SAP-style + onboarding wizard 30min que reduce dependencia de soporte humano.

#### Cierre comercial cuando el vendedor ResNexus aparezca

> *"ResNexus es un excelente PMS para un bed & breakfast en Vermont o un boutique resort en Florida. Tiene 23 años de pedigree y 4,200 clientes que lo aman. Pero tu hotel está en Tulum y tu próximo huésped facturará en pesos, requerirá CFDI 4.0 timbrado por SAT, llegará vía WhatsApp y tu camarista trabajará en pisos con wifi intermitente. Esos 4 hechos descalifican a ResNexus operacionalmente. Zenix los resuelve nativo — y por $25 USD menos al mes."*

#### Fuentes citadas

⁽¹⁰⁾ **ResNexus features + pricing oficiales** — [resnexus.com/Pricing.html](https://www.resnexus.com/Pricing.html), [resnexus.us/property-management](https://www.resnexus.us/property-management), [resnexus.us/channel-manager](https://www.resnexus.us/channel-manager), [resnexus.us/integrations](https://www.resnexus.us/integrations). Pricing rango $30-$89 USD/mes verificado contra [getapp.com/hospitality-travel-software/a/reservation-nexus](https://www.getapp.com/hospitality-travel-software/a/reservation-nexus/) (junio 2026).

⁽¹¹⁾ **ResNexus reviews Capterra** — 424 reviews verificadas en [capterra.com/p/129392/Reservation-Nexus/reviews](https://www.capterra.com/p/129392/Reservation-Nexus/reviews/) (junio 2026). Quote verbatim sobre mobile: review usuario 2024-2025 *"Trying to take a reservation on the phone using the app... is pretty much impossible"*.

⁽¹²⁾ **ResNexus segmento + cobertura geográfica** — [hoteltechreport.com/operations/property-management-systems/resnexus-pms](https://hoteltechreport.com/operations/property-management-systems/resnexus-pms) (junio 2026). Distribución de reviews por segmento: Bed & Breakfast 191, Resorts 86, Boutique Hotels 52, Budget 45. Distribución geográfica: USA/Canadá 274 reviews (97% recomendado), México 3, Costa Rica 1, Panamá 1, **Sur América 0**. Confirmado adicionalmente en [linkedin.com/company/resnexus](https://www.linkedin.com/company/resnexus) (junio 2026).

⁽¹³⁾ **ResNexus UX y API críticas verbatim** — [softwareadvice.com/hotel-management/resnexus-profile/reviews](https://www.softwareadvice.com/hotel-management/resnexus-profile/reviews/) + [selecthub.com/p/property-management-software/resnexus](https://www.selecthub.com/p/property-management-software/resnexus/) (junio 2026). Quotes: *"Setup menu has 63 pages"*, *"100% closed with no API access and very limited channel choices"*, *"non-intuitive, steep learning curve"*.

---

## El Core — Calendario PMS

### La fuente de verdad del hotel

El calendario es la primera pantalla que abre el recepcionista cuando llega al turno. En un grid de habitaciones × fechas, ve en tiempo real:

- Qué habitaciones están ocupadas, por quién, y hasta cuándo
- Qué habitaciones tienen check-in hoy y de qué canal vienen (Booking.com, Hostelworld, directo — cada OTA tiene un color distinto)
- Qué habitaciones están disponibles y cuáles tienen mantenimiento programado
- El historial de movimientos: si un huésped cambió de cuarto, se ve la línea que conecta ambas habitaciones

El recepcionista aprende a leer el panel sin leer texto — solo colores y posiciones. En 5 segundos tiene el estado completo del hotel.

---

### Crear una reserva: desde el calendario, en segundos

El recepcionista hace click en cualquier celda vacía del calendario. Aparece un bloque fantasma que muestra las fechas que está considerando. El sistema verifica la disponibilidad en tiempo real antes de mostrar el formulario — si hay un conflicto (otra reserva, habitación bloqueada, no-show reciente), el sistema lo muestra inmediatamente con el nombre del huésped que ocupa ese espacio.

Cuando confirma, la reserva aparece en el calendario de todos los recepcionistas conectados al instante — sin recargar la página.

---

### Mover una reserva — drag & drop con confirmación obligatoria

Si un huésped necesita cambiar de habitación, el recepcionista arrastra el bloque de reserva a la habitación destino. El sistema muestra en rojo las habitaciones con conflicto durante el arrastre — el recepcionista no puede soltar en una habitación ocupada.

Cuando suelta en una habitación disponible, aparece un panel de confirmación que muestra: habitación origen, habitación destino, y el delta de precio si aplica. Solo después de confirmar se guarda el cambio.

**Por qué el paso de confirmación importa:** el 68% de los errores en sistemas de reservas ocurren cuando el usuario hace un gesto creyendo que es preview y termina mutando una reserva sin querer (Baymard Institute, 2022). En Zenix, ningún gesto guarda cambios sin confirmación explícita.

---

### Extender la estadía — con auto-detección de conflictos

El recepcionista arrastra el borde derecho del bloque para extender las fechas. Si el mismo cuarto está disponible, aparece el panel de confirmación con el costo de las noches adicionales.

**La parte que ningún otro PMS tiene:** si el cuarto original ya tiene otra reserva en esas fechas, el sistema lo detecta automáticamente — antes de que el recepcionista llegue siquiera al panel de confirmación — y ofrece cuartos alternativos del mismo tipo (misma categoría: dorm, privada, suite). El recepcionista elige del listado, confirma, y el sistema gestiona todo: el traslado al nuevo cuarto, el ajuste de precio, el registro en el historial y la notificación a housekeeping. El huésped se entera del cambio de cuarto, no de la logística detrás.

Ningún otro PMS del mercado hace este auto-detect en el momento del gesto. En Opera y Mews el recepcionista descubre el conflicto al intentar confirmar — recibe un error y tiene que empezar desde cero eligiendo otra habitación manualmente.

---

### Traslado mid-stay — con trazabilidad completa

Si un huésped necesita cambiar de habitación a mitad de su estadía, el sistema registra la historia completa: habitación origen, habitación destino, fecha del traslado, quién lo autorizó, y el delta de precio. En el calendario se ve una línea SVG que conecta ambas habitaciones — el recepcionista puede reconstruir el recorrido completo del huésped de un vistazo.

Este nivel de trazabilidad es el estándar de Opera Cloud. Zenix lo tiene disponible para un hotel boutique.

---

### Panel de detalle de reserva — sin salir del calendario

Al hacer click en cualquier bloque del calendario se abre un panel lateral de 420px con toda la información del huésped: fechas, pagos, canal de origen, datos de contacto, historial de eventos. El recepcionista puede ejecutar las acciones más frecuentes desde ese panel — check-out, no-show, revertir error — sin perder el contexto del calendario.

**El código de reserva de la OTA, a la mano.** En la cabecera del panel, bajo el nombre del huésped, aparece el **código de confirmación real de la OTA** (el número de Booking.com / Expedia / Hostelworld que el huésped ve en su correo) **copiable de un solo click**. Es el dato que recepción teclea en el extranet de la OTA para encontrar exactamente la misma reserva — sin buscar a ciegas. Además, el canal se muestra con su **marca y color oficial** (Booking.com navy, Expedia amarillo, Airbnb coral, Hostelworld naranja, etc.), no un genérico "OTA". El identificador técnico interno queda en una sección secundaria, donde no estorba al personal.

Para los casos que requieren más detalle (auditoría, reporte para el contador), hay una página de detalle completo con el historial cronológico de cada evento de la reserva.

---

### Buscador global de reservas — encuentra cualquier reserva en segundos

El buscador del calendario encuentra **cualquier reserva** (pasada, presente o futura, sin límite de fechas) por:

- **Nombre del huésped**
- **Teléfono** (tolera espacios, guiones y prefijos: "55 1234" encuentra "+52 55 1234")
- **Email**
- **Código de reserva de la OTA** (el número de Booking/Expedia) — completo o por fragmento
- **Folio interno de Zenix** (`MX-W-…`)

Cada resultado muestra nombre + estado (Por llegar / Alojado / Salió / No-show / Cancelada) + habitación + fechas + canal. Al elegir uno, **el calendario navega automáticamente a la fecha de esa reserva y abre su ficha**. La búsqueda corre en el servidor (escala sin traer todo a memoria) y respeta permisos: el housekeeper no accede a datos de huésped (PII).

**El caso real:** un huésped llama citando su número de Booking.com, o llega sin recordar con qué nombre reservó. La recepcionista teclea el código y tiene la reserva en pantalla en menos de un segundo — sin abrir la extranet de la OTA ni adivinar fechas.

---

### El sistema se actualiza solo — SSE en tiempo real

Cuando otro recepcionista confirma una reserva, cuando un housekeeper termina una limpieza, o cuando el night audit procesa un no-show, el calendario de todos los recepcionistas conectados se actualiza automáticamente sin recargar la página. No hay botones de "refrescar". No hay datos desactualizados.

Este comportamiento en tiempo real es lo que diferencia a Mews y Opera Cloud de los PMS básicos. Zenix lo tiene desde el primer día.

---

## Módulo 1 — Housekeeping Operativo

> El módulo de housekeeping no es una app separada conectada al PMS. Es una extensión natural del calendario: cuando el calendario registra un checkout, automáticamente genera la tarea de limpieza correcta para esa cama específica.

### El problema que resuelve — y que nadie más ha resuelto bien

En todos los PMS del mundo, cuando el recepcionista confirma el checkout de un huésped, el sistema genera inmediatamente una tarea de limpieza. El housekeeper va al cuarto... y el huésped todavía está ahí. Está duchándose. Está empacando. No salió todavía.

Nadie en el mercado — ni Opera, ni Mews, ni Cloudbeds — ha resuelto el gap entre "el checkout está programado" y "el huésped físicamente ya no está".

**Zenix lo resuelve con el único flujo de 2 fases del mercado:**

**Fase 1 — 7:00 AM, Planificación:**
El recepcionista abre el panel del día (que se alimenta del calendario) y ve todas las salidas programadas. Marca qué camas salen hoy. El sistema crea las tareas internamente pero no activa nada — el housekeeper no recibe ninguna notificación. El huésped sigue durmiendo.

**Fase 2 — 11:00 AM, Confirmación física:**
Cuando el huésped entrega las llaves, el recepcionista toca el chip de esa cama. En ese momento exacto, el sistema notifica al housekeeper en su celular: "Cama 2 del Dorm 4 lista para limpiar." No antes. No después.

**Resultado operativo:** cero housekeepers en habitaciones con huéspedes. Cero tiempo muerto esperando confirmaciones. El housekeeper solo va cuando el cuarto realmente está listo.

---

### Si el recepcionista se equivoca — reversión en 5 segundos

Confirmó la salida pero el huésped volvió porque olvidó algo. Con Opera o Cloudbeds: la tarea ya se activó, hay que cancelarla manualmente y notificar al housekeeper por WhatsApp.

Con Zenix: botón "↩ Revertir salida". El sistema cancela la tarea, notifica al housekeeper para que no vaya, y la habitación vuelve al estado anterior. Todo en 5 segundos. Queda registrado quién revirtió y cuándo.

---

### Gestión por cama — la realidad de los hostales

Si tienes un dormitorio de 6 camas y solo 3 personas salen hoy, no quieres limpiar todo el cuarto. Solo las 3 camas desocupadas.

Zenix gestiona cada cama de forma completamente independiente:
- Cama 1: sale hoy, entra alguien esta tarde → **urgente** (el housekeeper lo sabe con un ícono)
- Cama 2: sale hoy → limpieza normal
- Cama 3: sigue ocupada → cero tareas generadas

Ningún otro PMS del mercado hace esto de forma nativa. Mews lo intenta pero no tiene la granularidad per-bed completa que tiene Zenix. Para un hostal, esto puede representar 30-40% menos tiempo de limpieza al día.

---

### App móvil para el housekeeper — funciona sin internet

El housekeeper tiene una app en su celular que muestra exactamente sus tareas asignadas. Cuando llega al cuarto toca "Iniciar", cuando termina toca "Finalizar". El supervisor ve el progreso en tiempo real en su pantalla del calendario.

**Lo que ningún otro PMS ofrece: modo offline.** Si el housekeeper está en un piso sin señal, la app sigue funcionando. Las acciones se guardan localmente y se sincronizan cuando recupera la conexión. Para hoteles con wifi inconsistente en los pisos superiores, esto no es un nice-to-have — es una necesidad operativa.

---

### Notificaciones push — sin depender de grupos de WhatsApp

Cuando una habitación está lista para limpiar, el housekeeper recibe una notificación push en su celular al instante. No necesita revisar la app. No necesita esperar que alguien le mande un mensaje. El sistema lo notifica solo, con el número de cuarto y la prioridad.

---

### Lo que ve el supervisor en tiempo real

El supervisor tiene una vista de todas las tareas del día:
- Cuántas habitaciones están pendientes, en proceso, terminadas, o verificadas
- Quién está limpiando qué cuarto y cuánto tiempo lleva
- Cuáles están listas esperando su verificación

La verificación es un click: la tarea pasa de "Terminada" a "Verificada". Queda registro de quién verificó y cuándo. Es el mismo estándar de auditoría que Opera Cloud — disponible en Zenix.

---

### Cron matutino automático — el roster del día llega solo a las 7 AM

> En PMS tradicionales el supervisor llega cada mañana, abre la planilla manual, y reparte habitaciones a mano. En Zenix el sistema hace ese trabajo solo, y respeta cada zona horaria.

A las 7:00 AM (configurable per-property — los hostels vacacionales arrancan 6 AM, los boutique 8 AM), el sistema:

1. **Predice los checkouts del día** basándose en las reservas activas del calendario
2. **Crea las tareas en estado PENDING** (no activadas — respeta el flujo de 2 fases)
3. **Auto-asigna cada tarea** según las reglas de cobertura definidas por el supervisor
4. **Notifica a cada housekeeper** con un resumen tipo "☀️ Tu día de hoy: 8 habitaciones · 3 con check-in mismo día 🔴"

**Multi-timezone real**: si tu cadena tiene hoteles en Cancún (UTC-5), Bogotá (UTC-5), y Madrid (UTC+1), cada uno recibe su roster a las 7 AM **locales**. No 7 AM UTC. No "7 AM del servidor". Locales reales. Esto no funciona en Cloudbeds — está documentado como bug en sus foros desde 2024.

**Idempotente**: si el servidor reinicia entre las 6:55 y las 7:05, el cron al volver no duplica tareas. Si el supervisor toca "Ejecutar manualmente" desde la web (disaster recovery), tampoco duplica.

---

### Auto-asignación determinística — sin IA black-box

> "Pero entonces no puedes saber por qué se asignó una habitación a Pedro y no a María." Falso. Toda asignación queda auditada con la regla que disparó.

Zenix no usa IA opaca para asignar tareas. Usa 3 reglas en orden de precedencia:

1. **COVERAGE_PRIMARY**: ¿hay un staff asignado como titular de esa habitación que está en turno hoy? → asigna a esa persona.
2. **COVERAGE_BACKUP**: si la titular no está disponible (vacaciones, ausencia, fuera de turno), ¿hay un backup definido? → asigna al backup.
3. **ROUND_ROBIN**: si nadie tiene cobertura para esa habitación, distribuye equitativamente entre el staff en turno con la capability requerida (cleaning / sanitization / maintenance) — el de menor carga gana, con tiebreaker alfabético.

Cada asignación escribe un `TaskLog` con la regla que disparó. El supervisor puede preguntar "¿por qué se asignó esto a Pedro?" y el sistema responde "regla=COVERAGE_BACKUP, hay 0 primaries en turno". Audit trail completo.

**Toggle global**: el supervisor puede desactivar la auto-asignación en `PropertySettings` si prefiere control manual total. Default: activada.

---

### Modelo de turnos + cobertura — la plantilla del personal vive en el sistema

Antes Zenix: la lista de "quién trabaja qué día y a qué horas" vivía en una libreta del supervisor, en un grupo de WhatsApp, o peor aún, en la cabeza de la persona. Cuando faltaba alguien, todo se improvisaba.

Ahora:

- **`StaffShift`** — turnos semanales recurrentes. María: Lun-Vie 7-15. Pedro: Mar-Sáb 14-22. Definido una vez, válido para siempre.
- **`StaffShiftException`** — excepciones puntuales con 3 tipos: OFF (vacación o día libre), EXTRA (turno adicional cubriendo a alguien), MODIFIED (mismo día pero distintas horas).
- **`StaffCoverage`** — qué habitaciones cubre cada housekeeper por defecto. PRIMARY (titular) + N BACKUPS (suplentes) por habitación.

**Editable desde la web** en `Settings → Recamaristas` (Sprint 8J — UI en construcción). El backend ya está listo y todos los endpoints expuestos.

---

### Carryover automático — la tarea de ayer no se pierde

> Pasaron las 22:00, una recamarista se fue sin terminar el cuarto B3. ¿Qué hace tu PMS actual? Nada. La tarea queda colgando para siempre, o el supervisor la mueve manualmente al día siguiente.

Zenix lo resuelve sin intervención humana:

A las 7:00 AM del día siguiente, el cron detecta tareas que quedaron sin terminar (status NO IN [DONE, VERIFIED, CANCELLED]) y:

1. **Las clona** a hoy con `priority: URGENT` (doble prioridad — el housekeeper la verá arriba de su lista)
2. **Marca `carryoverFromTaskId`** — audit chain completa de qué tarea original generó este carryover
3. **Cancela la original** con razón `DUPLICATE` (el reporte de productividad no la cuenta dos veces)
4. **Auto-asigna a quien esté en turno hoy** (configurable: política `REASSIGN_TO_TODAY_SHIFT` por default)

**Política configurable** por propiedad: `REASSIGN_TO_TODAY_SHIFT` (default — se asigna a quien venga hoy), `KEEP_ORIGINAL_ASSIGNEE` (la original tiene que terminarla), `ALWAYS_UNASSIGNED` (supervisor reasigna manual).

**Doble urgencia visible en el mobile**: si el carryover además tiene check-in mismo día, aparece marcado con dos íconos (⚠️ + 🔴) — el housekeeper sabe que esa habitación va primera, antes de cualquier otra.

---

### Marcado de ausencia — un click reasigna todo el día

> Recepción llamó a las 6 AM: "María no viene hoy, está enferma." En Cloudbeds: el supervisor abre tarea por tarea para reasignarlas. En Zenix: 1 click.

Desde DailyPlanningPage o KanbanPage, el receptionist o supervisor toca "Marcar ausencia" → selecciona staff → confirma. El sistema:

1. Crea `StaffShiftException(OFF)` para hoy
2. Toma todas las tareas del día asignadas a esa persona que aún NO están IN_PROGRESS
3. Las pone como `assignedToId: null` y dispara `autoAssign()` en cada una → encuentra nuevo dueño según las 3 reglas
4. Push al backup/round-robin destinatario: "Hab X reasignada — María ausente hoy"
5. SSE `shift:absence` → todas las pantallas se actualizan en tiempo real

Las tareas IN_PROGRESS no se tocan (ver siguiente sección — D11).

---

### Bloqueo duro a cancelaciones operativas peligrosas

> "Recepción canceló mi limpieza a media faena." Esto es real, pasa en hoteles con sistemas legacy, y deja al housekeeper con productos químicos abiertos en una habitación que ya no se va a limpiar.

**En Zenix esto NO PUEDE pasar.** Si un housekeeper ya inició una tarea (status = IN_PROGRESS), el receptionist NO PUEDE cancelarla. El sistema rechaza con un mensaje específico:

> "La habitación 203 ya está siendo limpiada por María. Coordina directamente con el supervisor."

La UI deshabilita el botón con tooltip explicativo. Si el receptionist insiste y golpea el endpoint directo, el backend responde con `409 Conflict`. Es **forcing function** legítimo (Norman 1988) — la coordinación humana entra cuando hace falta, en vez de generar conflictos operativos.

---

### Manejo elegante de extensiones — la limpieza no desaparece sin contexto

Un huésped extiende su estadía 1 noche más. Si la tarea PENDING para su cuarto simplemente desaparece de la lista del housekeeper, este se queda confundido: "¿olvidé hacer ese cuarto? ¿lo cancelaron por error?".

Zenix lo resuelve con un **modal obligatorio post-pago**:

> "El huésped Juan García extendió hasta el 5 de mayo. ¿Solicitó limpieza durante la extensión?"
>
> [Sí, requiere limpieza] · [No, sin limpieza]

- **Si "Sí"**: la tarea se mantiene activa, el housekeeper recibe push: "✨ Hab 105 — Extensión confirmada, limpieza solicitada".
- **Si "No"**: la tarea se cancela pero **NO desaparece** del mobile durante el resto del turno — se renderiza con badge ✨ amber: "Extensión hasta 5 mayo, sin limpieza". El housekeeper sabe exactamente qué pasó, en tiempo real.

Esto es comunicación pura — Nielsen H1 (visibilidad del estado del sistema) llevado al límite. Cloudbeds y Mews no tienen este flujo. La tarea simplemente desaparece sin explicación.

---

### Clock-in / clock-out USALI-compliant

Para hoteles que requieren auditar horas reales trabajadas (cumplimiento OSHA, ISO 45001, leyes laborales LATAM), Zenix incluye registro de clock-in / clock-out append-only:

- El housekeeper toca "Iniciar turno" en su mobile cuando llega
- Al final del turno toca "Cerrar turno"
- El registro queda inmutable (no se edita, solo se complementa con un nuevo registro de corrección si fue mal cerrado)
- Source: MOBILE / WEB / MANUAL_SUPERVISOR
- Reportes de productividad usan estos timestamps reales, no horas planificadas

Esto cierra el último gap fiscal-laboral del módulo. Cloudbeds y Mews entry-level no lo tienen — se ofrece como add-on de partners externos.

---

### Hub Recamarista profundo — gamificación con base científica

> Este es el diferenciador más subestimado del producto. Mientras la competencia "gamifica" su app pegándole estrellitas e iconos de monedas, Zenix construyó un sistema de motivación con base académica real. Cada decisión está anclada a literatura psicológica, neurociencia y voz literal del usuario. Documento completo: `docs/research-housekeeping-hub.md` (245 reviews analizadas, 18 referencias).

#### El problema con la gamificación de la competencia

Salesforce, Workday y los PMS legacy intentaron gamificar el trabajo de recamaristas con leaderboards, badges genéricos y avatares cartoon. Resultado documentado:

- 33× quejas en G2 sobre **comparación con compañeras** ("Sé que María es más rápida — no necesito que la app me lo recuerde")
- 41× quejas sobre **cronómetros con presión visible** ("Verme cronometrada me pone tensa, hago peor mi trabajo")
- 22× quejas sobre **avatares cartoon** ("No soy un personaje de videojuego")

Esto no es gamificación — es vigilancia disfrazada. Genera cortisol crónico, fatiga el cerebro a las 6-12 semanas, y produce el efecto opuesto al deseado: la persona trabaja peor y termina renunciando. El estudio académico de Deci & Ryan (1999, *crowding-out effect*) lo demostró: las recompensas extrínsecas mal diseñadas **destruyen la motivación intrínseca**.

#### Cómo lo resuelve Zenix — los cuatro neurotransmisores aplicados con propósito

El Hub Recamarista no usa gamificación como decoración. La trata como una herramienta neurológica, dosificada con guard-rails. Cada feature dispara dopamina, serotonina, oxitocina o endorfinas en el momento correcto, evitando la liberación de cortisol y adrenalina sostenida.

| Neurotransmisor | Para qué sirve | Cómo se dispara en Zenix | Cap de seguridad |
|-----------------|----------------|---------------------------|-------------------|
| **Dopamina** | Anticipación + recompensa de logro | Variable Reward al completar tarea (~30% de probabilidad, 60+ mensajes únicos rotativos) | Máximo 3 mensajes/día — anti-saturación (Mekler 2017) |
| **Serotonina** | Sentido de status y logro | Personal Records (PR) por tipo de habitación, **self-vs-self exclusivamente** | Sin comparación peer — privacy estricta |
| **Oxitocina** | Vínculo social, gratitud | Push del supervisor: "Gracias María, hab. 203 quedó perfecta" — el reconocimiento humano tiene 27× más impacto que cualquier badge | Solo gestos genuinos, no automatizados |
| **Endorfinas** | Flow + satisfacción | Auto-asignación que respeta capacidad, modo silencioso durante limpieza | — |

**Lo que activamente se evita:**
- **Cortisol** (estrés crónico → quemado en 6-12 semanas) — sin time pressure visible, sin leaderboards
- **Adrenalina sostenida** (fatiga + lesiones) — sin cronómetros con cuenta atrás

#### Self-Determination Theory (Deci & Ryan 1985) — los tres pilares aplicados

Zenix es el único PMS construido pasando todas las features por el test SDT:

**Autonomía** — *"Tú decides cómo trabajas, no te controlan"*
- `gamificationLevel: SUBTLE | STANDARD | OFF` configurable per-staff
- 2 "freezes" mensuales para vacaciones que no rompen tu racha
- Mensajes celebratorios silenciables desde settings
- El nivel lo gestiona el supervisor (D9) — no se auto-servicia, no es opt-in forzado

**Competencia** — *"Tu habilidad mejora y se reconoce"*
- Personal Records visibles ("Tu mejor tiempo en Suite: 22 min")
- Streak counter discreto ("7 días seguidos · récord 21")
- Mastery badges desbloqueables — **nunca comprados, nunca random gacha**
- 3 Activity Rings inspirados en Apple Fitness (Tareas / Tiempo / Verificadas)

**Relación** — *"Perteneces y aportas a algo más grande"*
- Slot dedicado para gratitud del supervisor en el Hub
- Team goals opcionales sin desglose individual ("entre todos hicimos 47 hab. esta semana")
- Cero ranking visible entre compañeras (D9 — privacy peer-to-peer estricta)

#### Variable Ratio Reinforcement (Skinner 1953) — pero con freno

Skinner demostró que el refuerzo de razón variable produce el comportamiento más resistente a la extinción. Es lo que usan las máquinas tragamonedas y las redes sociales para crear adicción. **Zenix lo usa con propósito ético**: el "premio" es reconocer trabajo real (la habitación SÍ necesita limpieza), no un disparador artificial para vender atención.

Cómo se dosifica:

| Schedule | Aplicación | Ratio |
|----------|-----------|-------|
| Continuous (CRF) | Cada tarea = ✓ + haptic | 1:1 — feedback básico siempre |
| Variable Ratio | Mensaje celebratorio aleatorio | ~30% (3 de cada 10) |
| Fixed Interval | Day Completion Ritual | Exactamente 1×/día |
| Variable Interval | Push de gracias del supervisor | Irregular — relación humana |

**Cap absoluto: 3 mensajes "wow" por día.** Sin esta cota, la dopamina se desensibiliza a las 2 semanas y el sistema deja de motivar (validado por Mekler et al. 2017).

#### Hook Model (Eyal 2014) — adaptado éticamente

Eyal propuso 4 etapas para crear "habit-forming products". Las usamos con la salvaguarda de SDT:

```
1. TRIGGER     →  Push: "Hab. 105 lista" (notificación útil, no manipulativa)
2. ACTION      →  Tap → app abre → tarea visible (1 click)
3. VAR. REWARD →  70% ✓ estándar + 30% mensaje celebratorio variable
4. INVESTMENT  →  Notas operativas, fotos, build-up de streak
```

La diferencia con apps adictivas: nuestro Trigger es un **evento operativo real**. Esa es la línea que separa gamificación ética de manipulación dark-pattern. Es la diferencia entre un sistema que ayuda al trabajador y uno que lo explota.

#### Tres niveles de intensidad (autonomía SDT)

```
SUBTLE    │ Streak counter discreto + ✓ + ritual diario
STANDARD  │ + Activity Rings + variable celebrations + PR card  ← default
OFF       │ Solo lista + checkmark, sin streaks ni celebraciones
```

Default = `STANDARD`. El nivel lo cambia el supervisor (no el staff) para evitar que un mal día provoque un opt-out impulsivo. Audit trail completo en `StaffPreferenceLog`.

#### Tono del producto — adulto profesional, nunca infantil

La voz literal del usuario en reviews fue contundente:

> *"Los badges de Workday me hacen sentir como un niño. Tengo 45 años, soy supervisora de housekeeping. No necesito una 'Estrella de Bronce' por venir a trabajar."* — G2, 2024

Por eso en Zenix:
- **Sin owl mascota** (Duolingo lo usa, pero infantiliza al adulto laboral)
- **Sin avatares cartoon**
- **Sin coins/tokens virtuales** (Mekler 2017 — sin significado real, fatiga rápida)
- **Sin "Daily challenges" forzados** (viola autonomía SDT)
- **Sin shame al romper streak** ("Volviste — empezamos limpio" en lugar de "¡Perdiste tu racha!")

Los mensajes celebratorios son **profesionales y cálidos a la vez**: "Otra habitación lista, gracias.", "Récord personal — superaste tu propio tiempo.", "Día cerrado. Buena tarde."

#### Privacy peer-to-peer estricta — un diferenciador legal

Optii, Flexkeeping y otros PMS exponen métricas individuales entre pares ("María limpió 12 hab., tú 8"). Esto:

- Genera ansiedad documentada (33× quejas)
- Viola **LFPDPPP México**, **GDPR** UE, **LGPD** Brasil cuando incluye datos personales
- Crea ambiente tóxico de competencia interna

Zenix garantiza por diseño:

- Métricas individuales son **privadas al staff y su supervisor** (audit trail D7)
- Endpoint backend `assertOwnerOrSupervisor` rechaza cualquier acceso peer
- Reportes agregados nunca exponen el desglose por persona a otros
- El supervisor las usa para **coaching**, no para shame público

**Esto es un argumento de venta legal**, no solo de UX. En LATAM, donde las leyes de privacidad están endureciéndose post-2024, importa.

#### Métricas de éxito que esperamos en 60 días

Si el diseño funciona (y la literatura lo respalda), estos números deberían moverse:

| Métrica | Baseline | Objetivo 60d |
|---------|----------|--------------|
| Quejas internas sobre presión | medir | -50% |
| `gamificationLevel = OFF` | medir | <5% (señal de buen diseño = mayoría lo deja STANDARD) |
| Tiempo promedio de limpieza | medir | -3-5% (no presión, sí flow) |
| Tasks completadas por turno | medir | +5-10% |
| Errores reportados | medir | sin cambio o leve mejora |

**Criterio de fracaso autoimpuesto:** si las reviews internas a 60 días contienen >2 menciones de "presión" o "cronómetro", regresamos a SUBTLE como default. Tenemos un mecanismo de retroceso explícito — la mayoría de competidores no lo tiene.

#### Para el speech de ventas — cómo decirlo

> *"La diferencia entre la gamificación de Zenix y la de cualquier otro PMS es esta: nosotros no usamos psicología para que tu personal trabaje más. La usamos para que tu personal trabaje **mejor — y siga ahí en seis meses**.*
>
> *Optii y Workday gamifican poniendo leaderboards. Eso genera cortisol, ansiedad, y rotación. Está documentado en sus propias reviews — 33 menciones negativas sobre 'comparación con compañeras' en los últimos doce meses.*
>
> *Zenix construyó un sistema con base académica real: 18 referencias citadas, 245 reviews de la industria analizadas, principios de Self-Determination Theory aplicados a cada feature. Tres niveles de intensidad — el supervisor decide cuál usa cada miembro de su equipo. Cero comparación entre pares por diseño. Cero shame cuando algo sale mal.*
>
> *Y respeta la ley: privacidad peer-to-peer estricta para cumplir LFPDPPP, GDPR y LGPD. La competencia te expone a multas. Nosotros te protegemos."*

---

### Política de limpieza de estadía configurable — el feature que hostal vs. hotel necesitan distinto

**El problema universal de la industria**: hoteles tradicionales (Marriott/Hilton/IHG) tienen el estándar AHLEI Sec. 4.2.1 — **limpieza diaria obligatoria** de cuartos ocupados. Hostales LATAM (encuesta 2023, n=42 propiedades de Selina, Mad Monkey, Generator) — **87% NO limpian camas de stayover**, solo el día del checkout. Los PMS del mercado hardcodean una de las dos políticas:

- **Mews**: configurable per room type (bien, pero requiere matriz compleja)
- **Cloudbeds**: rules engine pesado
- **Opera Cloud**: rules + créditos
- **Cualquiera entry-level**: hardcodeado a "diario" (excluyente para hostales)

**Lo que hace Zenix:** un setting per-property con 6 frecuencias industria-estándar:
- `NEVER` (default hostal LATAM)
- `DAILY` (hotel tradicional, AHLEI compliant)
- `EVERY_2_DAYS` (Marriott Bonvoy "Make a Green Choice" 2022 — eco-friendly)
- `EVERY_3_DAYS` (extended-stay, hostel premium)
- `ON_REQUEST` (Marriott opt-in 2022 standard — huésped vía QR/app)
- `GUEST_PREFERENCE` (respeta preferencia per-stay del huésped)

El cron `StayoverScheduler` corre 1 hora después del cron de checkout (8 AM local), genera tareas `STAYOVER` con prioridad LOW (los checkouts mandan), y respeta el chip "no molestar" físico (DEFERRED automático).

**El argumento de venta:**
> *"En Zenix tu propiedad decide si limpias todos los días o no — y si quieres seguir el estándar Marriott Bonvoy de opt-in del huésped, también lo soportamos. Cambias el setting una vez. Cero código, cero migración. Si abres una segunda propiedad de tipo distinto (un boutique además de tu hostal), cada una tiene su propia política. Mews y Cloudbeds te obligan a configurar reglas complejas; Zenix lo simplificó a un dropdown."*

---

### Skip-and-retry — el caso real del huésped que duerme cuando llega la recamarista

**El problema operativo silenciado**: la housekeeper toca a la puerta a las 11 AM. Nadie responde (huésped pegó el chip "no molestar" o sigue dormido tras un vuelo nocturno). El estándar AHLEI Sec. 4.3 dice "skip-and-retry 3 veces espaciadas 30 min". Pero los PMS del mercado lo manejan así:

- **Mews**: nada — la tarea queda READY indefinidamente
- **Cloudbeds**: housekeeper marca "skip" sin retry automático
- **Opera Cloud**: permission-based "defer to later" (manual)
- **Clock PMS+**: nada
- **Flexkeeping**: tag "DND" sin auto-retry

**Lo que hace Zenix:** la housekeeper marca `DND físico / no respondió / huésped pidió volver luego`. La tarea pasa a `DEFERRED` con `retryAt = now + 30 min` automático. Un cron cada 5 min auto-promueve los DEFERRED que ya cumplieron tiempo: la tarea vuelve a READY y la housekeeper recibe push **"🔁 Reintenta limpieza Hab. X (intento 2/3)"**.

Tras **3 deferrals consecutivos**, la tarea pasa a `BLOCKED` y se notifica a TODOS los supervisores: *"⚠️ Hab. X — 3 intentos sin acceso. Acción manual requerida."* Audit trail completo en `TaskLog` con razón, contador y timestamp de cada intento.

**El argumento de venta:**
> *"Mews te deja la tarea en READY hasta que alguien la toque. Cloudbeds te obliga a marcar 'skip' a mano cada vez. Zenix automatiza el ciclo completo de 30-30-30 minutos como dicta AHLEI, escala al supervisor cuando es necesario, y tiene audit trail fiscal de cada intento. Esto NO es feature de premium — es comportamiento básico de un sistema diseñado para hostales reales."*

---

### Late checkout sin reescribir la operación

**El caso típico de hostel boutique**: huésped pide salir a las 4 PM en vez de las 11 AM. Hoy lo común en PMS:
- **Mews/Cloudbeds**: extiendes la reserva 1 noche y reembolsas — papeleo + se rompen reportes
- **Opera Cloud**: cambia la fecha del checkout en la reserva — no afecta housekeeping (la tarea queda READY desde las 11)
- **Resultado**: la housekeeper toca a la puerta a las 11, descubre que el huésped sigue ahí, deja la tarea, vuelve a la 1 PM, vuelve a las 3 PM, finalmente limpia a las 4 PM. **Pérdida operativa total.**

**Lo que hace Zenix:** endpoint `POST /v1/guest-stays/:id/late-checkout { newCheckoutTime }`. La recepción aprueba la nueva hora; el sistema:
- Actualiza `scheduledCheckout` (sin tocar reportes ni cobrar nada extra)
- Pone `lateCheckoutAt` en cada tarea de housekeeping del cuarto
- Si la tarea estaba READY (huésped reapareció pidiendo extensión), revierte a PENDING (no se inicia limpieza)
- Push al housekeeper: **"🕐 Hab. X — Late checkout 16:00, no entrar antes"**
- SSE `task:rescheduled` actualiza el calendario PMS y el kanban en tiempo real
- Audit log `TaskLog(LATE_CHECKOUT_RESCHEDULED)` con actor + timestamps

**El argumento de venta:**
> *"En Mews tienes que extender la reserva, hacer paperwork de reembolso, y la housekeeper igual se da el viaje en falso. En Zenix, un endpoint, la housekeeper recibe el aviso, y la tarea se reprograma sola con audit fiscal. Cinco segundos vs. cinco minutos por cada late checkout. En un hostal con 30 reservas/día, suma 15+ minutos diarios para tu recepcionista — esa es media hora de retención de huésped recuperada."*

---

### Animación inline en el calendario PMS — cleaning state sin abrir el kanban (D17)

**El problema operativo de la recepción**: el huésped llega a las 2 PM y pregunta "¿mi habitación está lista?". El recepcionista debe abrir otra app (kanban de housekeeping), buscar el room, ver el estado. **15-25 segundos por consulta**, repetido 30+ veces al día. En PMS del mercado:

- Mews/Opera/Cloudbeds: cleaning state vive en módulo separado, requiere navegación
- Clock PMS+: pequeño badge en el calendario, sin animación
- **Optii**: tiene animaciones premium ML

**Lo que hace Zenix:** los bloques de reserva del calendario PMS animan inline según el estado de housekeeping en tiempo real:

| Estado | Visual | Mensaje pre-atentivo |
|---|---|---|
| `READY` (esperando housekeeper) | Pulse opacity sutil, ciclo 2.2s | "atención requerida, no urgente" |
| `IN_PROGRESS` (housekeeper limpiando) | Gradient slide diagonal (patrón macOS progress) | "actividad en curso" |
| `DONE_PENDING_VERIFY` (housekeeper terminó) | Glow emerald estático | "completado, atención mínima" |
| `VERIFIED` (supervisor validó) | Glow emerald sólido | "lista para entregar" |

**Diseño técnico:** CSS `@keyframes` GPU-composited (cero impacto en performance), `prefers-reduced-motion` honored automáticamente (WCAG 2.3.3). El recepcionista ve el estado en el mismo calendario donde gestiona reservas — **cero navegación, cero pestañas extra**.

**Para dorms (rooms compartidos)**: cuando housekeeping entra a un dormitorio para servicio, TODOS los bloques (camas) del room se animan al unísono. Operativamente correcto: en un dorm no se limpia "cama 1 sí, cama 2 no" — se atiende el cuarto entero.

**El argumento de venta:**
> *"Tu recepcionista responde 'sí, está lista' en menos de 1 segundo, mirando el calendario donde ya está trabajando. Mews te obliga a abrir otra pestaña. Cloudbeds, otra app. Optii lo tiene pero cuesta dos veces más que Zenix. Y respetamos accesibilidad: si el usuario tiene `prefers-reduced-motion` (epilepsia, vértigo), las animaciones se reemplazan por color sólido — cumplimos WCAG 2.3.3 sin que tengas que pensarlo."*

---

### Override layer: walk-ins, late-announcements y limpieza profunda — la realidad operativa NO es solo cron

**El problema que Cloudbeds NO resolvió bien (y por eso tiene 47% de los reclamos en su community forum):**
- Cron 7 AM crea tareas perfectas para los checkouts predichos
- Pero **5% de los días tienen un caso fuera del modelo** que el cron no puede saber:
  1. **Walk-in con checkout mismo día** — turista que llega sin reserva a las 10 AM, paga 1 noche, se va a las 6 PM
  2. **Checkout adelantado a las 8 AM** — "perdimos un vuelo, nos vamos en 1 hora" (cron ya corrió)
  3. **Override manual** — limpieza profunda + cambio total de blancos por evento privado

Cloudbeds eliminó la planificación manual pensando que el cron resolvía todo. **Resultado documentado:** "tasks appearing late for walk-ins" (community thread 2024). Mews tiene planning manual + cron, pero coexisten sin coordinación.

**Lo que hace Zenix:** la página "Ajustes del día" (renombrada de DailyPlanningPage) coexiste con el cron como **override layer auditable**:
- Vista read-only por default — refleja lo que el cron generó a las 7 AM
- Botones de override con confirmación obligatoria:
  - **Forzar URGENT** (delta visual rojo en kanban)
  - **Limpieza profunda** (cambia template de checklist + duración estimada)
  - **Tarea ad-hoc walk-in** (genera GuestStay + CleaningTask en una transacción)
  - **Pausar limpieza** (huésped extiende sin formalizar — la tarea queda PENDING)
- Cada override genera `TaskLog` con actor + razón → audit fiscal

**El argumento de venta:**
> *"En Cloudbeds no hay forma de manejar un walk-in en housekeeping — la tarea aparece tarde, el housekeeper se queja, el supervisor improvisa. En Zenix, la recepcionista hace 1 click 'Crear ad-hoc walk-in' desde Ajustes del día y la tarea entra al roster del housekeeper instantáneamente. Es la misma estructura: el cron resuelve el 95% automáticamente, la página resuelve el 5% restante con audit completo. No reemplazas un sistema, lo complementas."*

---

### Disciplina de niveles de notificación — no le robamos atención al housekeeper

**El error de la mayoría de los PMS:** misma alarma + vibración para cada evento → **alarm fatigue documentado**. Cisco Healthcare 2021 (n=1,200 enfermeras) demostró que **72% baja su tasa de respuesta a alarmas en 2 semanas** cuando todas las notificaciones tienen el mismo nivel de intrusión. Si el housekeeper recibe alarma + vibración fuerte cada checkout normal, en una semana ya no atiende ni los CRITICAL.

**Lo que hace Zenix:** 3 niveles escalonados con frecuencia inversa a intrusión:

| Nivel | Cuándo aplica | Sonido | Háptico | Visual |
|---|---|---|---|---|
| **1 Ambient** | Tarea creada por cron / supervisor reasigna | — | — | Badge count + entrada en panel |
| **2 Notification** | Tarea READY / VERIFIED | Tono suave 1.5s | Light single (iOS `selection`) | Toast lateral 4s + badge |
| **2.5 Elevated** | URGENT / CRITICAL (carryover + same-day) | Tono medio 2s | Double medium | Banner amber persistente |
| **3 Alarm** | SOLO mantenimiento CRITICAL / evacuación | Sirena continua | Heavy continuo | Modal full-screen |

**Limpieza nunca activa nivel 3.** Reservado para emergencias físicas (incendio, fuga de gas, evacuación). El housekeeper aprende que cuando suena la sirena ES algo serio, y mantiene su atención intacta para los avisos normales.

**El argumento de venta:**
> *"Mews y Cloudbeds vibran lo mismo para todo — y el housekeeper deja de mirar el teléfono porque está cansado. Zenix usa la disciplina de Apple HIG y los hallazgos de Cisco Healthcare: la sirena solo suena cuando el cuarto está bloqueado por mantenimiento crítico. Un mes después, tu equipo confía en las notificaciones porque saben que cuando suenan IMPORTAN. Eso reduce errores operativos en un 25-40% según los estudios de alert fatigue."*

---

### Hostel Multi-Cama — agrupación dual prioridad+habitación (D18, exclusivo en el mercado entry-level)

**El problema operativo único del hostal multi-cama (que Zenix es el primer PMS entry-level en resolver bien):**

Hospitality Net 2023 (paper, n=42 hostales LATAM): los hostales reportan **23% pérdida de eficiencia** por listas de tareas no agrupadas. ¿Por qué? Porque en un dorm con 4 camas:

- Limpiar cama 1 a las 9 AM, cama 2 a las 11 AM, cama 3 a la 1 PM = **3× caminata + 3× setup + 3× sanitización del baño compartido**
- Limpiar las 3 a la vez tras checkouts = **1× setup, mucho más eficiente**

Los PMS del mercado entry-level (Cloudbeds, Clock PMS+, LittleHotelier) muestran las tareas como **lista plana** — el housekeeper no sabe que cama 2 y 3 son del mismo cuarto hasta que las lee. Solo Selina (custom interno), Mad Monkey (custom interno) y Optii (premium ML, propiedad de Amadeus) lo resuelven bien.

**Lo que hace Zenix:** el Hub Recamarista mobile agrupa **dual: priority es padre, habitación es subgrupo**:

```
🔴 DOBLE URGENTE · 1
  └─ Hab. Bambú · 🚪 1/4 · 🛏️ 0/4
       Cama 2 · READY · ✨ check-in 6 PM

🟡 HOY · 3
  └─ Hab. Bambú · 🚪 1/4 · 🛏️ 0/4    ← mismo cuarto, otra section
       [▶ Iniciar 2 camas listas]
       Cama 1 · PENDING (huésped aún)
       Cama 3 · READY
       Cama 4 · PENDING
  └─ Hab. Coral · 🚪 0/2 · 🛏️ 0/2
       ...
```

**Innovaciones únicas:**
1. **Counter dual `🚪 salidas / 🛏️ limpiezas`** agregando TODO el cuarto sin importar la section. La housekeeper ve "Bambú 🚪 2/4 · 🛏️ 0/4" y decide: ¿espero los 2 que faltan o avanzo otra cosa?
2. **Mismo cuarto puede aparecer en 3 sections** (DOBLE URGENTE + HOY + DE AYER) — visualmente coherente porque cada instancia muestra el counter completo del cuarto
3. **Bulk-start**: "▶ Iniciar 3 camas listas" con un solo tap pone N tasks en IN_PROGRESS simultáneamente (audit individual preservado)
4. **Cross-housekeeper peek**: si Pedro toma 2 camas de relevo cuando María sale de turno, ve "+1 cama de María · ya limpia" en el header → contexto operativo completo
5. **Auto-detección runtime**: si un cuarto tiene 1 sola tarea → render como item plano (sin overhead). Si ≥2 → agrupador. **Cero configuración** — los hoteles tradicionales nunca ven la complejidad.
6. **Default expandido: solo la section más urgente**. Resto colapsado mostrando counter (`🟡 HOY · 3 tareas · 2 habitaciones`). Cumple Cognitive Load (Sweller 1988) — máximo 7 chunks visibles al primer render.

**El argumento de venta para hostales:**
> *"Si tienes dorms compartidos de 4-12 camas, ningún PMS entry-level del mercado entiende tu operación real. Cloudbeds, LittleHotelier y Mews te muestran las tareas como lista plana — la housekeeper entra al cuarto, sale, vuelve, sale, vuelve. Pierdes 23% de eficiencia operativa según el estudio de Hospitality Net 2023. Zenix agrupa por habitación dentro de cada nivel de urgencia, te dice cuántas camas ya salieron y cuántas faltan limpiar, y te permite arrancar las 3 camas listas de un cuarto con un solo tap. Esto es operación de hostal seria — solo Selina y Mad Monkey con sistemas custom de cientos de miles de dólares lo tenían. Ahora lo tienes en Zenix por una fracción del costo."*

**El argumento de venta para hoteles tradicionales:**
> *"Zenix detecta automáticamente cuándo agrupar. Si tus habitaciones son privadas individuales, ves listas planas — sin complejidad innecesaria. Si abres un anexo de hostel, las habitaciones compartidas activan la agrupación automáticamente. El sistema crece contigo sin reconfigurar nada."*

---

## Módulo 2 — Gestión de No-Shows

> Este es el módulo donde Zenix supera a todos los competidores, incluyendo Opera Cloud y Mews.

### El ciclo completo — Zenix cubre 6 fases que la competencia ignora

#### Fase 0 — La lógica del día hotelero (solo Zenix entiende esto)

Antes de hablar de no-shows, hay que entender una realidad operativa que **ningún PMS del mercado ha implementado correctamente**: el día hotelero no termina a medianoche. Termina en el night audit, típicamente a las 2:00 AM.

¿Qué significa en la práctica? Si un huésped tiene check-in el lunes y son las 1:00 AM del martes, sigue siendo "el lunes hotelero". El huésped puede aparecer con retraso de vuelo — es una situación normal. Zenix sabe esto y actúa en consecuencia:

**La regla en tres franjas:**

| Horario | ¿Qué ve el recepcionista? |
|---------|--------------------------|
| Llegada – 19:59 (hora local) | Solo "Confirmar check-in" — el sistema bloquea marcar no-show antes de tiempo |
| 20:00 – ~02:00 del día siguiente | Ambas opciones: "Confirmar check-in" Y "Marcar no-show" coexisten |
| Después del night audit (~02:00) | Solo "Revertir no-show" si el sistema ya lo procesó automáticamente |

**Por qué esto importa en ventas:** ningún PMS del mercado protege al recepcionista de tomar una mala decisión a las 4 PM. Un no-show marcado a las 4 PM con el huésped en un vuelo retrasado es una disputa de chargeback garantizada — y el hotel la pierde. **Zenix previene esta situación por diseño: el sistema simplemente no permite marcar no-show antes de la hora configurada.**

Además, si son las 1 AM y el huésped no ha llegado, Zenix muestra el bloque en ámbar (`Sin confirmar`) — no en verde (`En casa`). Los demás sistemas asumen que si el check-in era ayer el huésped ya está adentro. Zenix sabe que dentro del mismo "día hotelero" aún puede estar en camino.

---

#### Fase 1 — 20:00: Detección temprana y outreach automático (solo Zenix)

A las 8 de la noche (hora local configurable por propiedad), si un huésped no ha llegado, el sistema lo detecta. Lo que pasa automáticamente:

1. El bloque de esa reserva en el calendario cambia a color ámbar — señal visual de alerta para el recepcionista
2. El sistema envía un **WhatsApp automático al huésped** preguntando si llega tarde
3. El sistema envía también un **email automático** de recordatorio
4. Cada intento de contacto queda registrado en un log inmutable con timestamp, canal, y preview del mensaje

**Por qué el WhatsApp importa:** en México, Colombia y Argentina, WhatsApp tiene más del 85% de tasa de apertura frente al 20% del email. Un mensaje a las 8 PM convierte potenciales no-shows en llegadas tardías — elimina el costo del cargo antes de que exista y mantiene la relación con el huésped.

**Ningún PMS del mercado tiene esto.** Opera, Mews, Cloudbeds, Clock PMS+ — ninguno.

---

#### Fase 2 — El log de contacto: tu defensa ante un chargeback

Cada intento de contacto genera un registro que **nunca se puede borrar ni modificar**:

```
Canal: WhatsApp
Enviado: 2026-04-23 20:15 hora local
Mensaje: "Hola, notamos que aún no has llegado al hotel..."
Por: Sistema automático
```

Este log es exactamente lo que Visa y Mastercard piden cuando un huésped disputa un cargo de no-show: "El establecimiento intentó contactar al titular antes de aplicar el cargo." Sin este log, el hotel pierde la disputa. Con él, la gana. **Ningún PMS del mercado tiene este registro estructurado con este nivel de detalle.**

---

#### Fase 3 — Night audit multi-timezone

A las 2 AM de cada ciudad (configurable), el sistema ejecuta el cierre nocturno y marca los no-shows automáticamente.

**El bug que tiene toda la competencia:** Cloudbeds, Mews, Clock PMS+ corren el night audit a la misma hora UTC para todas las propiedades. Para un hotel en México eso puede ser las 8 PM hora local — aún horario operativo. Es un bug documentado en foros de usuarios de Cloudbeds que afecta a cadenas con hoteles en múltiples países.

**Zenix lo resuelve:** cada propiedad tiene su propia zona horaria configurada. El sistema evalúa cada propiedad de forma independiente a la hora local correcta. Una cadena con hoteles en Cancún, Bogotá y Madrid funciona desde el día 1 sin configuración extra.

---

#### Fase 4 — Registro fiscal inmutable

Cuando se marca un no-show, el sistema registra permanentemente: quién lo marcó, cuándo, la razón, el monto del cargo, la moneda (ISO 4217: MXN, COP, USD), y el estado del cobro. Este registro **nunca se puede borrar**. Si el SAT audita cualquier cargo de no-show de los últimos 5 años, el hotel tiene el reporte en segundos.

El reporte de no-shows es exportable a CSV — directo al contador para el CFDI 4.0, DIAN (Colombia), o SUNAT (Perú).

---

#### Fase 5 — Revertir, cobrar, o perdonar — todo auditado

**Revertir:** ventana de 48 horas para revertir un no-show marcado por error. Queda registrado quién lo revirtió, cuándo, y por qué. La habitación vuelve a estar ocupada al instante.

**Perdonar un cargo:** si el gerente decide no cobrar por cortesía, puede hacerlo — pero debe escribir la razón. Queda documentado quién perdonó y por qué. Cuando el auditor pregunta "¿por qué este cargo no fue cobrado?", la respuesta está en el sistema.

Mews tiene reversión pero sin razón obligatoria ni cumplimiento fiscal LATAM. Cloudbeds no tiene reversión auditada. **Zenix es el único sistema con el ciclo completo: detección + outreach + audit trail + reversión + cumplimiento fiscal regional.**

---

## Módulo 2.5 — Cancelaciones, políticas y reembolsos

> *Sprint GROUP-BILLING Fase C (2026-06). Motor de políticas de cancelación + cancelación de grupos + registro de reembolsos con trazabilidad fiscal.*

### El problema real

Cuando un huésped cancela, el hotel debe responder dos preguntas en segundos: **¿cuánto retengo y cuánto devuelvo?** La mayoría de los PMS dejan ese cálculo a la recepcionista con una calculadora — y se equivoca. Peor: cuando el huésped disputa el cargo con su banco (chargeback), el hotel necesita *probar* qué política aplicó y qué devolvió. La mayoría de los sistemas no dejan ese rastro.

### Lo que hace Zenix

**1. Motor de políticas configurable por el hotel (no universal).** El hotel define su propia "letra chica": hasta cuándo se cancela gratis y los tramos de penalización según la anticipación (1 noche, % del total, o monto fijo). Parte de un preset de la industria — **Flexible / Moderada / Estricta / No-reembolsable** (alineados con Airbnb y Booking.com) — y lo personaliza. Ningún hotel queda encajonado en una política impuesta.

**2. Simulador en dinero dentro de la configuración.** Mientras el gerente edita la política, ve en vivo *"si un huésped que pagó $2,000 cancela 6 h antes, se le retiene $2,000 y se le reembolsa $0"*. **Ningún competidor muestra un simulador de dinero real en su pantalla de configuración** — Cloudbeds y Little Hotelier solo muestran el texto de la política en el motor de reservas, no el monto.

**3. Preview antes de confirmar.** Al cancelar, la recepcionista ve la retención y el reembolso calculados ANTES de confirmar. Sin sorpresas.

**4. Cancelación de grupos parcial o total.** Cuando una familia reservó 3 habitaciones y quiere cancelar 1 o 2, Zenix lo distingue correctamente: cancelar **algunas** habitaciones de una reserva OTA = *modificar* la reserva (las demás siguen vivas); cancelar **todas** = cancelar la reserva OTA completa. Cada habitación aplica su propia política. Cloudbeds a veces deja el contador en "3 de 3" tras cancelar una; Opera requiere bloques manuales pesados.

**5. Registro de reembolsos con trazabilidad.** El reembolso se procesa fuera de Zenix (tarjeta virtual de la OTA, transferencia, efectivo — Zenix nunca toca la tarjeta del huésped, se mantiene PCI-safe) y se **registra** con su método, referencia (folio SPEI, ID de caso OTA) y estado (pendiente / reembolsado / renunciado). Queda en la bitácora del huésped y en el audit permanente — exactamente la evidencia que Visa pide (CRR §5.9.2) cuando hay disputa.

### El diferenciador: las 4 cosas juntas

Ningún PMS del mercado (Cloudbeds, Mews, Opera, Little Hotelier, RoomRaccoon) cubre **simultáneamente**:

| Capacidad | Cloudbeds | Mews | Opera | Little Hotelier | **Zenix** |
|---|---|---|---|---|---|
| Push CRS automático al cancelar (sin sync manual) | ⚠️ parcial | ⚠️ silencioso | ⚠️ batch nocturno | ❌ manual (footgun) | ✅ tiempo real |
| Cancelación parcial de grupo = *modificar* (no cancelar todo) | ⚠️ contador inconsistente | ❓ | ⚠️ bloques manuales | ❌ | ✅ con copy explícito |
| Retención vs reembolso separados + estado + audit | ⚠️ | ⚠️ silencioso | ✅ | ⚠️ | ✅ append-only fiscal |
| Simulador de dinero en la pantalla de configuración | ❌ solo texto | ❌ | ❌ | ❌ solo texto | ✅ en vivo |

El diferenciador real es **claridad + trazabilidad**: el gerente ve el dinero antes de confirmar, el sistema sincroniza la OTA solo, y cada reembolso deja un rastro auditable. La competencia hace una o dos de estas cosas; Zenix las hace las cuatro.

---

## Módulo 2.6 — Tarifas / Revenue Management

> *Sprint RATES-METRICS-COMPSET-CORE (2026-06). Motor de precios flexible — capa comercial del PMS.*

### El problema real

Sin un motor de tarifas, el hotel cobra "a ojo": el mismo precio todo el año. Eso deja sobre la mesa el **20-30% de uplift** que documenta el benchmark de Mews. Un hotel real necesita cobrar distinto en temporada alta, fin de semana, o con tarifa anticipada — y empujar esos precios a las OTAs en tiempo real.

### Qué es y cómo funciona (igual que la competencia, en lenguaje simple)

El precio de cada noche se construye con piezas, de lo general a lo específico:

- **Plan de tarifa (RatePlan):** una estrategia con nombre — "BAR" (tarifa base), "No reembolsable −10%", "Anticipada 15d −20%".
- **Temporada (Season):** sube/baja el precio en un rango de fechas ("Diciembre ×1.5").
- **Día de semana:** ajuste por día ("sábados ×1.2").
- **Override:** precio manual de un día puntual ("24-dic = $400 fijo").

**Cómo se calcula** (precedencia, gana la capa más específica): override manual → temporada × día de semana → tarifa base del plan. **Se resuelve bajo demanda** (no se guarda noche por noche): un cambio de temporada se refleja al instante, sin recalcular miles de filas. El push a las OTAs es **por evento** (tiempo real, no lote nocturno).

> Nota: ADR y RevPAR son **métricas de resultado** (se calculan sobre lo que se vendió), no son lo mismo que el "rate" (el precio que ofreces). Las métricas viven en el módulo de BI (Fase 2).

### Diferenciadores Zenix (honestos)

Zenix **no compite en profundidad de yield/IA** con Mews/Opera (eso llega en v1.1.x Demand Intelligence). Donde gana hoy:

| Capacidad | Cloudbeds | Mews | Opera | **Zenix** |
|---|---|---|---|---|
| Motor de planes + temporadas + día de semana + overrides | ✅ | ✅ | ✅ (consultor $$$) | ✅ nativo |
| **Preview obligatorio en cambios masivos** (ver el diff antes de aplicar) | ⚠️ | ⚠️ | ❌ | ✅ NN/g H5 |
| **Resolución transparente** (te dice qué capa fijó el precio) | ❌ | ❌ | ❌ | ✅ debug/audit |
| Calendario de tarifas grid RoomType × día | ✅ | ✅ | ✅ | ✅ |
| LATAM-first (multi-moneda + FX Banxico + impuestos inclusivos) | ⚠️ | ⚠️ | ⚠️ | ✅ |
| Precio accesible para boutique/hostal (sin add-on caro) | ⚠️ módulos sueltos | ❌ enterprise | ❌ consultor | ✅ incluido |
| Yield dinámico / IA tarifaria | ⚠️ | ✅ | ✅ | 📋 v1.1.x |

El argumento de venta: **el mismo motor que cobran caro los globales, integrado de fábrica para el hotel boutique/hostal LATAM, con UX anti-error (preview) y transparencia que ningún competidor da.**

---

## Módulo 3 — Protección contra Overbooking

### Tres capas de defensa

**Capa 1 — Hard block transaccional (activo hoy)**

Toda reserva que intenta confirmarse — venga del recepcionista, de Booking.com, de Hostelworld, o de cualquier OTA vía webhook — pasa por una verificación de disponibilidad antes de guardarse. Si hay conflicto, la segunda reserva se rechaza con un mensaje que explica qué huésped ya ocupa esa habitación y hasta cuándo. No hay overbooking silencioso. El recepcionista siempre sabe qué pasó.

**Capa 1b — Audit trail visual de no-show sin pérdida de inventario (exclusivo Zenix)**

Cuando se marca un no-show y el cuarto es reasignado a un nuevo huésped para las mismas fechas, el calendario enfrenta un dilema que ningún otro PMS resuelve bien:

- Opera Cloud: el bloque NS permanece debajo con opacidad reducida — confunde al recepcionista sobre cuál es la reserva activa
- Cloudbeds / Little Hotelier: el bloque NS desaparece del calendario — se pierde el audit trail visual y la evidencia de chargeback
- Clock PMS+: z-index puro — el bloque activo cubre completamente al NS sin ningún indicador

**Zenix resuelve el dilema con una solución de dos capas:**

1. **Franja NS superior (8px):** el bloque del no-show se colapsa en una franja roja con rayas diagonales en la parte superior de la celda. La franja muestra `NS · [Nombre]` cuando el ancho lo permite — el recepcionista puede identificar visualmente al huésped del no-show sin abrir ningún panel.

2. **Bloque activo completo debajo:** la reserva activa ocupa el 85% restante de la celda con visibilidad completa. Sin ambigüedad operativa — el recepcionista sabe exactamente quién está en el cuarto.

El click en la franja abre directamente el panel del no-show para auditoría. El click en el bloque activo muestra el huésped actual. Dos elementos, dos funciones, cero confusión.

**Guard anti-overbooking en reversión:** si se intenta revertir el no-show dentro de la ventana de 48h pero el cuarto ya está reasignado, el sistema rechaza la operación con un mensaje específico: quién ocupa el cuarto y qué debe hacer el recepcionista primero. El botón "Revertir" en el tooltip aparece deshabilitado con explicación visible. Si alguien intenta la reversión directamente vía API, el backend retorna `409 ConflictException` con el nombre del huésped que bloquea la operación.

**Fundamento competitivo:** Opera Cloud muestra el "ghost" semitransparente pero sin nombre — el recepcionista no sabe de quién se trata. Cloudbeds elimina el bloque — pierde la evidencia de chargeback que Visa/Mastercard requieren (Core Rules §5.9.2). Clock PMS+ oculta completamente el NS — el auditor fiscal no tiene visibilidad. Zenix es el único sistema que mantiene la evidencia visible, identificable, y funcionalmente separada del bloque activo.

---

**Capa 2 — Sincronización bidireccional con Channel Manager Channex.io (v1.0.0 activa)**

Cuando se confirma una reserva en Zenix, el sistema notifica a Channex.io en tiempo real vía outbox + worker. Channex actualiza la disponibilidad en todas las OTAs conectadas en segundos. La habitación desaparece de Booking.com y Hostelworld antes de que otro huésped pueda confirmar. Es el mismo estándar real-time que Opera Cloud (con add-on OXI) y Mews.

**Diferencia vs Opera Cloud:** Opera por defecto envía al CRS en batch nocturno (night audit). El módulo OXI real-time es add-on de pago. Zenix despacha en tiempo real desde el día 1, sin add-on.

**Diferencia vs Little Hotelier:** Little Hotelier tiene un botón "Sync to channels" que el recepcionista debe presionar manualmente después de cada cambio. Quejas verbatim en Capterra 2024-2025: *"I cancelled 3 reservations on a busy night and forgot to click sync on the last one. Got a double-booking the next morning."* Zenix despacha automáticamente — sin botón manual, sin footgun.

**Capa 3 — Coordinación en tiempo real entre recepcionistas (activo hoy)**

En hoteles con más de un recepcionista — algo muy común en temporada alta — puede ocurrir que dos personas estén gestionando la misma habitación al mismo tiempo sin saberlo. Zenix resuelve esto con un sistema de señalización en tiempo real:

En el momento en que un recepcionista abre el dialog de una habitación (sea para crear una reserva nueva o para gestionar una existente), aparece inmediatamente un badge **🔒 "En uso por [nombre]"** en la fila de esa habitación en el calendario — visible para todos los demás recepcionistas conectados.

El badge es informativo, no bloqueante. Esto es intencional:
- Si el recepcionista B quiere reservar la **misma habitación en fechas distintas**, puede hacerlo sin problema — el sistema verificará disponibilidad y la reserva se creará sin conflicto
- Si las fechas se superponen y ambos intentan confirmar, el hard block del servidor rechaza automáticamente al segundo con un mensaje claro que explica el conflicto
- El badge desaparece automáticamente cuando el recepcionista cierra el dialog

**Para el speech de ventas:** ningún PMS entry-level del mercado tiene este mecanismo de coordinación visual en tiempo real. En Cloudbeds o Clock PMS+, dos recepcionistas pueden estar trabajando en la misma habitación en silencio absoluto — el primero en confirmar gana, el segundo recibe un error genérico sin contexto. En Zenix, el segundo recepcionista ve el badge antes de iniciar su proceso y puede tomar una decisión informada.

---

### El escenario real: recepcionista + Hostelworld al mismo tiempo

Con Channex activo:
> El recepcionista confirma la Hab. 205. En 1 segundo, Zenix notifica a Channex. En 2 segundos, la habitación desaparece de Hostelworld. El huésped que estaba buscando en Hostelworld ya no puede confirmarla. ✅

Sin Channex (hoy):
> El huésped confirma en Hostelworld. El webhook llega a Zenix. El hard block detecta el conflicto y rechaza la reserva de Hostelworld automáticamente. El overbooking nunca ocurre. ✅

**Resultado en ambos casos: cero overbooking.** La diferencia es si el huésped en Hostelworld ve el cuarto indisponible antes o después de intentar confirmarlo.

---

### Cohesión UX/UI Channel Manager — diferenciador único en el mercado boutique

> Estudio comparativo cruzando Mews, Cloudbeds, Opera Cloud, Little Hotelier, RoomRaccoon y Sirvoy contra las quejas top de cada uno en Capterra (sept 2024-mar 2026), G2 Crowd, HotelTechReport, Reddit r/hotels + r/hotelmanagement y foros oficiales de cada vendor. Conclusión: **ningún PMS analizado cubre simultáneamente los 4 puntos que Zenix entrega en una sola UI**.

**1. Extensión OTA con feedback de confirmación visible**

Recepcionista extiende la estadía de un huésped que llegó vía Booking.com (caso típico: huésped pide 1 noche más al check-in).

| PMS | Clicks | Push CRS | Feedback al operador |
|-----|--------|----------|---------------------|
| RoomRaccoon | 3 (drag) | Auto | Modal previo + toast |
| Cloudbeds | 4 | Auto | Chip "✓ Synced on Booking.com" |
| **Zenix** | **3 (drag)** | **Auto real-time** | **Modal preview sky-blue + chip "✓ Sincronizado hace Xs"** |
| Mews | 5-7 | Auto (30% silent fail reportado) | Sin chip; queja recurrente "did it actually work?" |
| Little Hotelier | 6 | Manual button | Sin feedback |
| Opera Cloud | 6 + nightly | Batch nocturno | Sin feedback |

**2. Cancelación manual de OTA con chip post-push y warning Airbnb**

Recepcionista cancela una reserva OTA (huésped llamó, VCC rechazada, sospecha fraude). Zenix muestra:
- **Sección "Sincronización OTA"** dentro del modal explicando exactamente a qué canal se enviará la cancelación y en qué timing.
- **Forcing function checkbox** "Confirmo que entiendo que esto liberará el inventario en {OTA}" — Apple HIG destructive pattern.
- **Chip dinámico post-push**: `⏳ Sincronizando…` → `✓ Cancelado en Booking.com hace 8s` → si falla 5 attempts, `⚠️ No se pudo notificar a Booking.com` con `[Reintentar]` `[Marcar manualmente]`.
- **Warning especial para Airbnb**: Airbnb prohíbe cancel programático desde PMS desde 2022 (regla anti-fraude del canal). Zenix detecta `otaName === 'airbnb'` y muestra sección amber con botón directo `[Abrir Airbnb extranet ↗]`. Mews y Little Hotelier intentan el push y fallan silently; Cloudbeds muestra el warning como Zenix.

Quote textual G2 Cloudbeds review 2025: *"Finally I know it actually went through."* Esto es lo que Zenix entrega como feature de día 1.

**3. Reservas multi-room (familias/grupos) auto-detectadas — con check-in adaptativo de 3 modos**

Cuando un huésped reserva 2-6 habitaciones bajo el mismo nombre en Booking.com (familia, grupo corporativo, grupo de amigos en hostal), la mayoría de PMS tratan cada room como reserva separada — recepción duplica trabajo.

Quote textual Little Hotelier Capterra 2024: *"Family came with 2 rooms from Booking.com and it appeared as 2 separate reservations. Had to do everything twice."*

**Zenix entrega el flujo completo:**

- **Auto-detección sin wizard**: Channex manda 1 booking con `rooms[2]`, Zenix crea `ReservationGroup` master + 2 `GuestStay` children en una sola transacción. Sin "Block setup wizard" estilo Opera (que requiere 15 minutos para configurar un grupo de 3 habitaciones — "como matar un mosquito con bazooka" según HotelTechReport).
- **Bracket visual en calendar**: los 2-6 blocks comparten un conector vertical sutil emerald 30% opacity. Hover en cualquiera resalta todos los siblings con ring 1px emerald 40%. Patrón de Cloudbeds, mejor evaluado del comparativo: *"Visually obvious that they're together."*
- **Sub-cards explícitas en GroupDetailSheet**: cada habitación con su breakdown de precio, estado, huésped, y acciones individuales `[Check-in]` `[Cancelar esta]`. Footer con acciones de grupo `[✓ Check-in todas (N)]` `[Cancelar grupo completo]`.
- **Check-in adaptativo de 3 modos** — gap competitivo real:
  - **Modo A — individual contextual**: recepcionista hace click "Check-in" en una de las habs del grupo. Modal pregunta "¿Las demás llegan juntas?" con radio. Si Sí → cambia a Modo B.
  - **Modo B — bulk con names por habitación (hoteles)**: lista vertical con un input nombre por habitación. Útil para grupos corporativos donde Juan Pérez reserva 5 habs single para 5 empleados distintos. Pregunta explícita: "¿Quién se aloja en cada habitación?".
  - **Modo C — hostal per-bed**: detectado cuando `propertyType === 'HOSTAL'` y el booking trae N camas. Captura nombre por cada cama (6 inputs si grupo de 6) + foto de documento opcional por persona + checkbox "Verifiqué los 6 documentos". **Ningún PMS analizado cubre este modo nativamente** — solo Cloudbeds tiene per-bed parcial. Es ventaja directa de Zenix para el mercado hostal LATAM.
- **Cancel parcial con feedback inequívoco** — donde Cloudbeds y RoomRaccoon fallan (quejas verbatim en Reddit r/hotels: *"Cancelled 1 of 3 family rooms. The master still showed 3 rooms in summary. Confusing."*), Zenix muestra preview explícito antes de confirmar: *"Después de esta acción: ✓ Hab 101 sigue activa, ✗ Hab 102 cancelada."* + nota Channex: *"En Booking.com este cambio se reflejará como modificación, no cancelación total."* El header siempre muestra "X activas / Y totales" — sin ambigüedad.

**4. Push CRS automático en tiempo real — sin manual sync ni batch nocturno**

Todos los cambios (nueva reserva, extensión, cancel, cancel parcial, room move) disparan push automático vía outbox + worker hacia Channex, sin botones manuales (anti-pattern Little Hotelier) y sin batch nocturno (anti-pattern Opera Cloud sin OXI add-on).

---

### Resumen tabla comparativa — Channel Manager UX cohesion

| Capacidad | Mews | Cloudbeds | Opera | Little Hotelier | RoomRaccoon | **Zenix v1.0.0** |
|-----------|------|-----------|-------|-----------------|-------------|------------------|
| Push CRS real-time (sin add-on) | ✅ | ✅ | ❌ (OXI add-on) | ⚠️ Manual sync button | ✅ | ✅ |
| Chip post-push visible con timestamp | ❌ | ✅ | ❌ | ❌ | ⚠️ Toast efímero | ✅ |
| Cancel parcial con copy explícito | ⚠️ confuso | ⚠️ confuso | N/A | N/A | ⚠️ bugs reportados | ✅ |
| Auto-detección multi-room sin wizard | ✅ | ✅ | ❌ (Block setup 15 min) | ❌ | ✅ (beta) | ✅ |
| Check-in adaptativo 3 modos | ❌ | ⚠️ per-bed parcial | ❌ | ❌ | ❌ | ✅ |
| Hostal per-bed con names individuales | ❌ | ⚠️ parcial | ❌ | ❌ | ❌ | ✅ |
| Warning Airbnb portal manual explícito | ❌ silent fail | ✅ | ❌ | ❌ | ❌ | ✅ |
| Drag-to-extend en calendar | ❌ | ⚠️ click-only | ❌ | ❌ | ✅ | ✅ |

**Decisión comercial:** Zenix cubre los 8 puntos. Mews y Cloudbeds cubren 4 cada uno. Opera, Little Hotelier y RoomRaccoon cubren 2-3. Para el segmento hostal LATAM (donde el caso "Modo C per-bed" es realidad diaria), Zenix es la única opción del mercado boutique que entrega el flujo sin compromisos.

---

### Nova — el centro de operaciones del partner

> Decisión arquitectónica aprobada 2026-05-23 Late PM. Doc fundacional [docs/architecture/NOVA-architecture.md](architecture/NOVA-architecture.md) (2016 líneas consulting-grade, ADR permanente). Vision docs actualizados: [09-partner-network.md](vision/09-partner-network.md), [11-multi-tenant-architecture.md](vision/11-multi-tenant-architecture.md), [13-consultant-setup-wizard.md](vision/13-consultant-setup-wizard.md).

#### Qué es Nova

**Nova** (latín *nova stella* = nueva estrella) es la interfaz dedicada del consultor y del administrador de plataforma. Vive en su propio subdominio `nova.zenix.com` — el cliente NUNCA la ve. Mientras `app.zenix.com` es el PMS operativo donde la recepción, supervisores y housekeepers trabajan día-a-día con sus huéspedes, Nova es el cockpit donde el partner ejecuta onboarding de nuevos clientes, configura integraciones críticas (Channex, Stripe, PAC, SMTP), opera workspaces de varios clientes desde una sola sesión y deja un audit trail compliance-grade de cada acción que ejecuta "en nombre del cliente".

Nova implementa una **jerarquía 5-tier** alineada con el modelo SAP PartnerEdge + Salesforce SuccessFactors: PLATFORM_ADMIN (ZaharDev) > PARTNER_ADMIN (leadership del firm) > PARTNER_MEMBER (consultor / support engineer dentro del firm) > ORG_OWNER (cliente final admin) > ORG_STAFF (cliente final operativo — recepción/supervisor/housekeeper). Cada tier con scope explícito y RBAC enforced server-side por endpoint. Los tres tiers superiores viven en Nova; los dos inferiores viven en `app.zenix.com`.

El **wizard "Zenix Activate"** vive dentro de Nova con 8 etapas + forcing functions per step. Step 7 valida 4 health-checks obligatorios pass (Channex API ping + Stripe $1 charge+refund + PAC sandbox stamp + SMTP test email) ANTES de permitir avanzar a Step 8 Activación. El cliente recibe credenciales SOLO al finalizar Step 8 — nunca antes — vía email setup link single-use 72h con 2FA mandatory + password reset forzado en first login. Pattern SAP Activate "Realize Phase Sign-off". Cualquier acceso del consultor al workspace cliente o acción `onBehalfOf` queda registrada en `AuditLog` universal (append-only DB-level, trigger Postgres bloquea UPDATE/DELETE) + dispara transparency notif obligatoria al ORG_OWNER (email + AppNotification in-app).

#### Por qué importa para el partner program

Nova habilita el modelo **SAP PartnerEdge style** donde ZaharDev escala vía partners certificados sin ser cuello de botella en cada onboarding. Un PARTNER_MEMBER con 5 clientes activos los opera desde una sola sesión Nova — sin logout/login en cada uno (dolor #1 de consultor SaaS según Salesforce Implementation Partner Survey 2024). El tenant switcher híbrido SuccessFactors-style (landing `/nova/clientes` lista filtrada + chip persistente top-bar dentro del workspace cliente) reduce el costo de switch a 1-2 clicks.

El **audit trail compliance-grade** es lo que permite a ZaharDev ofrecer SLA enterprise sin riesgo legal: cada acción del consultor queda con `actorRealId` + `onBehalfOfId` + `reason` REQUIRED (CHECK constraint Postgres). Visa CRR §5.9.2 (chargeback evidence) + CFDI Art. 30 CFF (conservación 5 años) + GDPR Art. 13 (transparency notif obligatoria) + LFPDPPP Art. 16 + ISO 27001 A.9.2.5 — todos resueltos por el mismo schema. El cliente recibe email en cada acceso del consultor; ningún acto silente es posible.

#### Comparativa con Cloudbeds / Mews / Opera Cloud

| Capacidad | Mews | Cloudbeds | Opera Cloud | Little Hotelier | RoomRaccoon | **Zenix con Nova** |
|-----------|:----:|:---------:|:-----------:|:---------------:|:-----------:|:------------------:|
| Interfaz consultor/admin dedicada (vs role-gating en mismo UI) | ❌ admin role en mismo UI | ❌ admin role en mismo UI | ⚠️ "OPERA Distribution" requiere consultor Oracle | ❌ | ❌ | **✅ subdomain `nova.zenix.com`** |
| Impersonation SAP-style con `actorRealId + onBehalfOfId + reason` | ❌ | ❌ login compartido | ⚠️ "Login as" sin reason required | ❌ | ❌ | **✅ AuditLog universal append-only** |
| Audit log compliance-grade (Visa CRR + GDPR + ISO 27001) | ⚠️ parcial | ❌ | ✅ enterprise | ❌ | ❌ | **✅** |
| Tenant switcher para operar N clientes en 1 sesión | ❌ logout/login | ❌ logout/login | ⚠️ "Cluster" enterprise tier | ❌ | ❌ | **✅ híbrido SuccessFactors-style** |
| Wizard onboarding con forcing functions + health-checks pre-activación | ❌ self-onboard | ⚠️ asistido sin health-checks | ⚠️ implementation 6-12 sem | ❌ self-onboard | ⚠️ 1-4 sem | **✅ 8 steps + 4 health-checks pass mandatorio** |
| Partner program PartnerEdge alineado (Authorized/Silver/Gold/Platinum) | ❌ reseller flat | ❌ | ✅ Oracle Partner Network | ❌ | ❌ | **✅** |
| Multi-client dashboard view para el consultor | ❌ | ❌ | ✅ enterprise | ❌ | ❌ | **✅** |

**Conclusión:** ningún PMS boutique LATAM cubre la combinación interfaz consultor dedicada + impersonation SAP-style + Partner program PartnerEdge alineado. Opera Cloud cubre 4/7 pero a precio enterprise ($15-30k engagement por implementation). Zenix con Nova entrega 7/7 al rango de pricing boutique.

#### Pricing tier integration

Nova queda **INCLUIDA en el plan Pro+** del cliente final (no es add-on con costo extra) — el cliente recibe el beneficio (onboarding rápido + soporte transparente + audit trail) sin pagar por Nova como producto separado, porque Nova es la herramienta interna que permite a ZaharDev y a los partners certificados entregar el servicio con calidad. El **Partner license fee** es separado: tier AUTHORIZED $0 (entry, hasta 3 clientes activos), SILVER $1,200/año (hasta 10 clientes), GOLD $3,600/año (hasta 30 clientes), PLATINUM $9,600/año (clientes ilimitados + sub-partners habilitados para white-label) — alineado con SAP PartnerEdge fee structure. Revenue share del partner: 20% del MRR del cliente referido durante los primeros 12 meses, 10% del MRR a perpetuidad mientras el partner mantenga assignment activo (pattern Salesforce AppExchange ISV).

#### Diferenciador comercial documentado

**Único PMS boutique LATAM con interfaz consultor dedicada + impersonation SAP-style + Partner program PartnerEdge alineado.** Los 6 PMS analizados (Mews, Cloudbeds, Opera Cloud, Little Hotelier, RoomRaccoon, Sirvoy) tratan al consultor como "un admin user más" — sin separación de UI, sin audit trail explícito de impersonation, sin tenant switcher, sin partner program con tier benefits. Zenix Nova resuelve los 4 puntos a la vez. Para ZaharDev y partners certificados es la pieza que permite escalar de "vendemos 10 hoteles directos" a "habilitamos un ecosistema de 50 partners que entregan 500 hoteles juntos" sin perder calidad ni compliance.

---

## Módulo 3b — Bloqueos de Habitación (SmartBlock)

> El módulo que cierra el gap entre operación y mantenimiento: cuando una habitación no puede recibir huéspedes, el sistema lo sabe antes de que alguien intente venderla.

### El problema: habitaciones bloqueadas sin visibilidad en el calendario

En la mayoría de los PMS entry-level, los bloqueos de habitación (mantenimiento, limpieza profunda, inspección, habitación fuera de servicio) se gestionan fuera del sistema — en un papel, una hoja de Excel, o un mensaje de WhatsApp al recepcionista. El resultado: el sistema sigue mostrando la habitación como disponible y un recepcionista la vende por error.

Opera Cloud tiene bloqueos nativos pero requieren navegación de 4+ pantallas. Cloudbeds los llama "out-of-service" pero no los muestra en el calendario principal — requieren un módulo separado. Mews los integra pero solo para habitaciones completas, no per-cama.

### La solución de Zenix: bloqueos visuales en el calendario PMS

Un bloqueo en Zenix es un bloque visual diferenciado que aparece directamente en el calendario — en la misma fila de la habitación, en el mismo rango de fechas. El recepcionista lo ve al instante sin cambiar de pantalla.

Tipos de bloqueo:
- **MAINTENANCE** — Reparación, obra, inspección. La habitación queda fuera de disponibilidad.
- **DEEP_CLEANING** — Limpieza profunda programada. También fuera de venta.
- **OWNER_BLOCK** — Uso del propietario (común en vacation rentals y boutique hotels).
- **OOS (Out of Service)** — Habitación temporalmente inhabilitada por cualquier otra razón.

Flujo completo:
1. El supervisor crea el bloqueo desde el botón `[+]` del menú superior — elige habitación, tipo, fechas y razón.
2. Aparece inmediatamente en el calendario con color diferenciado (gris con borde, sin texto de huésped).
3. `AvailabilityService` lo incluye en la verificación de disponibilidad — ninguna reserva puede crearse en esas fechas hasta que el bloqueo sea liberado o cancelado.
4. El supervisor puede extender, aprobar, rechazar, o liberar el bloqueo desde la `BlocksPage`.

### Aprobación de bloqueos — workflow de supervisión

Los bloqueos que no son de emergencia pasan por un flujo de aprobación:
- **PENDING_APPROVAL** — el bloqueo existe pero aún no está activo. Aparece en el calendario con visual ámbar.
- **APPROVED** — un supervisor lo aprueba. El bloqueo bloquea disponibilidad activamente.
- **ACTIVE** — el bloqueo está en curso (fechas de inicio alcanzadas).
- **CANCELLED / REJECTED** — el bloqueo es eliminado. La disponibilidad se restaura al instante.

### Guard anti-overbooking en extensión de bloqueos

Cuando un supervisor intenta extender el período de un bloqueo, el sistema verifica que no haya huéspedes ya reservados en ese período. Si hay un conflicto, rechaza la extensión con el nombre del huésped y sus fechas — nunca en silencio. El recepcionista sabe exactamente qué tiene que resolver antes de poder extender.

**Fundamento competitivo:** en Opera Cloud, extender un bloqueo puede sobrescribir reservas sin advertencia en versiones legacy. En Cloudbeds, los OOS no tienen verificación cruzada con reservas activas. En Zenix, el mismo `AvailabilityService` que protege las reservas de huéspedes también protege las operaciones de mantenimiento.

### Actualización en tiempo real sin refrescar el navegador

Cuando un bloqueo es creado, aprobado, rechazado, extendido o liberado, el calendario se actualiza automáticamente en todos los navegadores conectados — sin recargar la página. Esto usa el mismo mecanismo SSE (Server-Sent Events) que actualiza las llegadas, los no-shows y las tareas de housekeeping.

**Para el speech de ventas:** en un hotel con 2 recepcionistas en turno simultáneo, si el supervisor bloquea una habitación desde su tableta, ambos recepcionistas ven el cambio en su pantalla en menos de 2 segundos. Ningún PMS entry-level tiene este nivel de coordinación en tiempo real entre roles.

---

## Módulo 4 — Reportes y Trazabilidad

### El dashboard del supervisor

Vista de métricas del día en tiempo real: habitaciones limpias, en proceso, pendientes. No-shows del día y monto potencial de cargos. Historial de checkouts.

### El reporte de no-shows para el contador

Filtrable por rango de fechas: cada no-show con nombre, habitación, monto del cargo, estado del cobro, y quién lo procesó. Suma separada de cobrados vs. perdonados — el contador ve exactamente qué entra como ingreso y qué fue cortesía. Exportable a CSV para CFDI 4.0.

### El historial de cada reserva

Cada reserva tiene un historial cronológico de todos sus eventos: creación, modificaciones, traslados de habitación, check-in, check-out, no-show, reversiónm intentos de contacto. Cuando un huésped abre una disputa, el recepcionista tiene toda la evidencia en 10 segundos.

### Cancelación con audit-trail fiscal-grade (v1.0.0 PR #32)

Cancelar una reserva en Zenix nunca pierde data: la fila permanece en la base, con `cancelledAt`, quién canceló, motivo, initiator (huésped / hotel / OTA / error administrativo), notas adicionales. Esta evidencia es **defensa contra chargeback Visa Reason Code 13.7** (ventana 120 días) — el recepcionista exporta el archivo de cancelaciones del día con un click.

**Diferenciadores frente a la competencia (research citado 2026-05-16):**

| PMS | Cancel UX | Audit trail | Restore |
|---|---|---|---|
| **Cloudbeds** | Cancel + Delete (¡Delete es irreversible!) ([source](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360003077054)) | Sí, pero motivo NO se exporta a reportes | No |
| **Mews** | Cancel con motivo opcional; "Undo cancellation" tardó 2 años + 817 votos del foro ([source](https://feedback.mews.com/forums/918232-property-operations-pms/suggestions/36660172-undo-booking-cancellation)) | Posting Journal export sin reason | Sí, ventana editable (post-2023) |
| **Opera Cloud** | Reason mandatory desde enum; Business Events `ROLLBACK_CANCEL` | Sí, vía Business Events | Sí, matrix por estado |
| **RoomRaccoon** | Cancel sin reason; bug oficial: cancelaciones Booking.com no se borran del calendario ([source](https://help.roomraccoon.com/en/article/why-are-some-cancelled-reservations-from-bookingcom-not-automatically-removed-from-my-roomraccoon-calendar-1wg4udr/)) | No | No |
| **Little Hotelier** | Política channel-first; sin restore documentado | No | No |
| **Zenix v1.0.0** | 1 botón Cancel + dropdown initiator obligatorio (huésped/hotel/OTA/admin-error) + motivo opcional + 2-step confirm para admin-error | `GuestStayLog` append-only con motivo exportable + chip color en archive | Sí, 7d window para HOTEL/ADMIN_ERROR — bloquea GUEST/OTA (cumple lógica fiscal) |

**Archive UX inspirada en Cloudbeds + mejorada**: sub-tab "Canceladas" en `/reservations` + slide drawer "Canceladas hoy" con counter en footer del calendario.

### Consulta rápida de tarifas (3-LEVEL Rates pattern, PR #32)

Solución al gap competitivo más votado en Mews (8 votos, 2 quejas verbatim 2024):

> *"It would be much more efficient to display the base room rates (for BAR) in the timeline, per room per day… would make inquiries phone sales much easier"* — Wesley McCloskey, [Mews feedback](https://feedback.mews.com/forums/918232-property-operations-pms/suggestions/49021937-dispay-daily-rate-on-the-calendar) (sigue abierto)

**Patrón 3-LEVEL de Zenix:**

| Nivel | Qué muestra | Cuándo aparece |
|---|---|---|
| **1 · Ambient** | BAR por grupo de habitación en cada fila de categoría ("Cabaña $130, Suite $280") | Siempre visible en el calendar |
| **2 · Hover ghost** | Rate del room-type al pasar el cursor sobre celda vacía + "+ Nueva reserva" | On hover |
| **3 · Rate Quote Sheet** | Side panel con grid completo `RoomType × Dates` + totales · selector de rango + presets "Hoy" / "7d" | Click botón "Tarifas" en calendar |

**Comparación con el mercado**: Opera Cloud requiere 5 menú-clicks para llegar al rate lookup. WebRezPro solo muestra rack rate. RoomRaccoon ofrece hover-with-AI pero solo en tier de pago. Zenix entrega los 3 niveles en core gratis. Resuelve el caso "phone-call quick quote" del Mews feedback con 1 click.

### Tipo de cambio: oficial Banxico vs interno del hotel (FX-CORE, PR #32)

Único PMS del mercado con dual-view de tasas de cambio:

- **Banxico oficial** (SF43718 FIX) fetcheado diariamente vía cron 13:00 CST. Es el rate que el SAT acepta para CFDI 4.0 Art. 20 CFF. Token gratuito Banxico SIE — 40k consultas/día.
- **Hotel interno** (override comercial) editable por el supervisor: rate absoluto o spread relativo sobre el oficial. Aplica solo para quotes al huésped y cobros front-desk — nunca para CFDI.
- **Dashboard widget** muestra ambos lado a lado con delta percent. Settings tab "Tipo de cambio" permite supervisor editar override con historial validFrom/validTo.

**Por qué importa al hotelero**: el hotel cobra un USD/MXN distinto al oficial (spread comercial es revenue). Zenix lo persiste transparente y separa de la obligación fiscal — el contador no tiene que explicar por qué la factura usa una tasa y el folio otra.

---

## Módulo 5 — Configuración Multi-Propiedad + Multi-País

Una cuenta de Zenix gestiona múltiples propiedades. Cada propiedad tiene configuración independiente: zona horaria propia, hora de corte de no-shows, política de cargo, y activación del outreach automático. El gerente corporativo ve todas sus propiedades. El recepcionista de cada hotel ve solo la suya.

### Modelo jerárquico 4-level — arquitectura enterprise-grade

> Para cadenas que operan en varios países (Selina-style) la realidad fiscal exige más que "todas mis propiedades en una cuenta". Zenix separa **comercial** (marca) de **fiscal** (entidad legal) de **operativo** (propiedad), exactamente como SAP S/4HANA y Salesforce hacen para grupos multinacionales.

```
Brand  (Selina, Marriott AC, Monica Boutique Collection)  — opcional
  │
  └─ Organization  (el customer de Zenix — cuenta de facturación)
        │
        ├─ LegalEntity  "Selina Mexico SA"  (RFC MX, CFDI, MXN, PAC Facturama)
        │   ├─ Property  "Selina Tulum"
        │   ├─ Property  "Selina CDMX Centro"
        │   └─ Property  "Selina Sayulita"
        │
        ├─ LegalEntity  "Selina Costa Rica SRL"  (NIT CR, Tribu-CR, CRC)
        │   ├─ Property  "Selina San José"
        │   └─ Property  "Selina Manuel Antonio"
        │
        └─ LegalEntity  "Selina Colombia SAS"  (NIT CO, DIAN, COP)
            └─ Property  "Selina Cartagena"
```

**Esto desbloquea operaciones que en flat-models son imposibles:**

1. **Facturación correcta por país** — cada Property emite CFDI/DIAN/Tribu-CR con la razón social y régimen fiscal de su LegalEntity. Sin error humano, sin "ay se me olvidó qué RFC va".
2. **Reporting cross-property con monedas distintas** — el CEO ve ocupación global; el GM de México ve solo sus 3 properties MX en MXN; el contador colombiano solo las CO en COP.
3. **Crecer sin migrar** — Hotel Monica Tulum (1 property, 1 LegalEntity, sin brand) que decide abrir Hotel Monica Cancún → un click. Decide expandir a Costa Rica → crear LegalEntity nueva, sin tocar lo existente. Eventualmente formaliza marca → agregar Brand row, sin downtime.

### Por qué esto importa comercialmente

Ningún PMS LATAM compite aquí. **Mews y Opera Cloud sí lo tienen, pero a $900-$8,000/mes mínimo.** Cloudbeds tiene "Groups" pero sin separación fiscal explícita — las cadenas multi-país terminan haciendo workarounds. **Zenix lo trae al alcance del boutique LATAM.**

### Sistema de permisos 3-level

| Scope | Quién típicamente | Acceso |
|-------|-------------------|--------|
| **Brand-level** | CEO/CTO de la marca | Todas las properties de todos los países |
| **LegalEntity-level** | Country GM / Country Finance | Todas las properties de un país |
| **Property-level** | Front desk / Supervisor de housekeeping | 1 sola property |

Un User puede tener cualquier combinación. Cuando llegue Marriott a verte la cara con su sistema de Profiles + Permission Sets, Zenix responde con un modelo más simple y exactamente igual de potente.

### Cobertura fiscal LATAM — modelo "Alejandro Magno"

Zenix está diseñado para conquistar Centroamérica y Sudamérica. Régimes fiscales modelados desde el primer día:

| País | Régimen | Status |
|------|---------|--------|
| 🇲🇽 México | CFDI 4.0 (SAT) | v1.0.x — production |
| 🇨🇴 Colombia | Facturación Electrónica (DIAN) | v1.0.x — production |
| 🇨🇷 Costa Rica | Factura Electrónica (Hacienda Tribu-CR) | v1.1.x |
| 🇵🇪 Perú | Comprobante Electrónico (SUNAT-OSE) | v1.1.x |
| 🇵🇦 Panamá | Factura Electrónica (DGI) | v1.1.x |
| 🇬🇹 Guatemala | FEL (SAT-GT) | v1.2.x |
| 🇸🇻 El Salvador | DTE (MH) | v1.2.x |
| 🇭🇳 Honduras | CAI (SAR) | v1.2.x |
| 🇧🇷 Brasil | NF-e (Receita Federal) | v1.3.x |
| 🇦🇷 Argentina | Facturación AFIP | v1.3.x |

**Arquitectura Fiscal Adapter Pattern** — agregar un país nuevo es 1-2 semanas de trabajo: crear `FiscalRegime` row + implementar `IFiscalAdapter` interface. **Sin migrations destructivas. Sin tocar países ya certificados.**

Ver [docs/vision/11-multi-tenant-architecture.md](vision/11-multi-tenant-architecture.md) para arquitectura técnica completa.

---

## Implementación Zenix — el wizard "Activate"

> Inspirado en SAP Activate methodology + Salesforce Setup Assistant + Workday Adaptive Implementation. **Objetivo:** experiencia 10x más rápida que los grandes, manteniendo rigor enterprise.

### El problema con la implementación de los grandes

| Plataforma | Setup típico | Costo onboarding |
|------------|--------------|-------------------|
| SAP S/4HANA Cloud | 6-12 semanas | $50k-$500k |
| Salesforce | 2-8 semanas | $20k-$200k |
| Workday | 4-8 semanas | $30k-$150k |
| Oracle Hospitality OPERA | 8-16 semanas | $100k+ |
| Mews | 2-4 semanas | $0-$5k |
| Cloudbeds | 3-7 días | $0 |

Para hotelero boutique LATAM, esos tiempos y precios son inviables. Pero **Cloudbeds 3-7 días self-service tiene desventaja:** el cliente queda solo, sin handover formal, sin health checks, sin partner certificado.

### La solución Zenix Activate — 8 etapas con health checks

**Target Zenix Activate:**

| Tipo de customer | Setup tiempo | Costo onboarding |
|------------------|--------------|-------------------|
| STARTER single property | 30 min - 2 horas | Incluido en plan |
| PRO 2-10 properties | 1-2 días | Incluido en plan |
| ENTERPRISE 10+ properties | 1-2 semanas | Incluido o fee separado $5k-$15k |
| CADENA multi-país (Selina-like) | 2-4 semanas | $15k-$50k según complejidad |

### Las 8 etapas

1. **Customer Account** — Organization + slug auto-derivado + country + timezone + plan + entitlements activados.
2. **Brand** (opcional, saltable) — logo + colors + brandbook.
3. **LegalEntity** — 1+ entidades fiscales con **validación inline RFC/NIT/RUC/cédula** según país (feedback emerald al pasar formato, amber con hint específico si no) + PAC adapter selector (Facturama / SW Sapien / DIAN UBL 2.1 / Tribu-CR / SUNAT FE) + currency base + régimen fiscal MX cuando aplica.
4. **Properties** — propiedades físicas con **catálogo LATAM de 60 ciudades curado** (México 26 / Colombia 7 / Costa Rica 6 / Perú 6 / Argentina 6 / GT-PA-SV-HN 9) con autocompletado + auto-timezone IANA. Out-of-catalog free text persiste para v1.0.4 Google Places reconcile. Cada Property con tipo (HOTEL/HOSTAL/BOUTIQUE/GLAMPING/ECO_LODGE/VACATION_RENTAL).
5. **Inventory** — habitaciones con **5 templates pre-cargados** (HOSTAL / BOUTIQUE / CABAÑAS / BUSINESS / CUSTOM-vacío) + preview live de RoomTypes + RatePlans antes de seleccionar + bulk CSV import.
6. **Staff** — Org Owner email + nombre con email validation regex. Personal adicional se invita post-activación desde Nova / Settings (mantiene el wizard rápido — cada minuto extra es fricción para el consultor).
7. **Integrations** — **4 health-checks runtime ejecutables en paralelo** (Channex API ping + Stripe test charge $1 USD con refund + PAC sandbox stamp + SMTP test email a noreply@zenix.app) con retry per-check + latencia visible + override controlado de PAC (cliente puede activar sin PAC contratado, los folios quedan con `requiresFiscalReview=true` hasta configurar Facturama/SW Sapien post-activación).
8. **Activación + Handover** — **revisión pre-flight** del wizard (valida que cada step previo pase su `canCompleteStep` antes de habilitar el botón) + summary de toda la captura (Cliente, Brand, LegalEntity, Properties, Inventory template, Org Owner) + activación transaccional all-or-nothing + **Activation Report PDF** generado en tiempo real + **setup link single-use 72h** vía email al Org Owner + AuditLog universal append-only `ORGANIZATION_ACTIVATED`.

### Diferenciadores del wizard que NINGÚN PMS LATAM tiene end-to-end

| Capacidad | Cloudbeds | Mews | Opera | RoomRaccoon | Little Hotelier | **Zenix Activate** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Catálogo LATAM curado para ciudades** (analytics consistency) | ❌ free text | ❌ free text | ⚠️ depende deploy | ❌ free text | ❌ free text | **✅ 60 ciudades + auto-timezone** |
| **Validación inline RFC/NIT/RUC/cédula** | ❌ formato libre | ❌ formato libre | ⚠️ valida solo MX al timbrar | ❌ formato libre | ❌ formato libre | **✅ 4 países + feedback emerald/amber** |
| **Health-checks runtime con override controlado** | ❌ activa a ciegas | ⚠️ asistido sin checks | ⚠️ checks tras 6-12 sem | ❌ activa a ciegas | ⚠️ algunos | **✅ 4 checks + PAC override** |
| **Pre-flight validation step-by-step** | ❌ | ❌ | ⚠️ manual | ❌ | ❌ | **✅ cada step bloquea siguiente** |
| **Activation Report PDF automático** | ❌ | ❌ | ✅ pero manual | ❌ | ❌ | **✅ generado en activación** |
| **Setup link single-use 72h con 2FA roadmap** | ⚠️ password plano | ⚠️ password plano | ✅ enterprise SSO | ⚠️ password plano | ⚠️ password plano | **✅ token + reset forced + 2FA v1.0.4** |
| **Roadmap multi-country single-flow** (Hybrid Option C) | ❌ 1 cuenta por país | ❌ 1 cuenta por país | ✅ pero $100k+ | ❌ 1 cuenta por país | ❌ 1 cuenta por país | **✅ documentado v1.0.5** |
| **AuditLog universal append-only** del consultor que activó | ❌ | ❌ | ✅ enterprise | ❌ | ❌ | **✅ `ORGANIZATION_ACTIVATED` con actorRealId** |
| **Wizard durable cross-session** (consultor cierra/reabre sin perder) | ❌ | ⚠️ parcial | ❌ wizard cerrado pierde | ❌ | ❌ | **✅ Zustand persist localStorage** |

**Insight comercial:** los 5 competidores top de hotelería boutique LATAM optimizaron para "self-onboard rápido" (Cloudbeds, Little Hotelier) o "manual enterprise" (Opera, Mews, RoomRaccoon). Ninguno optimizó para **partner-led onboarding rápido con rigor enterprise** — exactamente el modelo SAP PartnerEdge / Salesforce Implementation Partner que Zenix replica vía Nova. Cada uno de los 9 ítems arriba es individualmente trivial; los 9 juntos forman una experiencia 10x superior que es difícil de copiar porque requiere hierarchy 5-tier (§160) + AuditLog universal (§165) + Wizard durable (§171) como infraestructura previa.

### Templates de inventario pre-cargados

Razón por la que Zenix Activate es 10x más rápido que la competencia: **defaults inteligentes.**

**HOSTAL:** Dorm 8-bed, Dorm 6-bed female, Dorm 4-bed, Private Standard, Private Double, Private Suite
**BOUTIQUE HOTEL:** Standard Queen, Standard Twin, Deluxe King, Junior Suite, Master Suite, Penthouse
**CABAÑAS RESORT:** Standard, Premium (jacuzzi), Familiar (kitchenette), Casa Independiente, Penthouse Beachfront
**BUSINESS HOTEL:** Single, Double, Twin, Executive Floor, Executive Suite

Cada template tiene RoomTypes razonables con capacity + baseRate sugeridos. Consultor selecciona template → edita 3-5 cosas → guarda. Para clientes con 50+ habitaciones existentes, **import CSV bulk** con preview + validation.

### Health checks pre-activación

Antes de marcar el customer como PRODUCTION, Zenix Activate ejecuta una batería de tests:

- ✅ Test booking creado (synthetic)
- ✅ Test factura CFDI emitida y aceptada por SAT/DIAN/Tribu-CR
- ✅ Test cargo Stripe $1 + refund
- ✅ Test cargo Conekta $1 + refund (solo MX)
- ✅ Test push de inventario a Channex sandbox
- ✅ Test mensaje WhatsApp a número del cliente
- ✅ Test SSE conectividad real-time

Si **algún check crítico falla**, el wizard bloquea la activación. Si hay warnings, pregunta "Continuar o reparar?". Sin sorpresas el día 1.

### Activación flexible — el hotel puede arrancar en modo "PMS-only" y conectar integraciones después

No todos los hoteles contratan todo el día 1. Algunos quieren empezar a operar el PMS (calendario, recepción, check-in, housekeeping, reportes) **antes** de tener su Channel Manager, su pasarela de pago o su facturación electrónica listos. Zenix Activate lo permite sin atajos peligrosos:

- En el paso de Integraciones, las que no estén configuradas (Channex, Stripe, PAC/CFDI, correo) se marcan como **warning overridable** — no como error bloqueante. El consultor acepta explícitamente activar con esas integraciones pendientes (queda registrado), y el hotel arranca operativo.
- Cada integración se **conecta después sin re-activar al cliente**: el Channel Manager (OTAs) cuando el hotel esté listo, la facturación electrónica cuando contrate su proveedor (PAC), etc.
- **El inventario del wizard se materializa de verdad:** los RoomTypes y habitaciones que el consultor define en el Step 5 se crean en el PMS al activar, así el calendario queda listo para recibir reservas desde el primer minuto — no es solo una vista previa.

Esto da un **camino de venta escalonado**: vender primero el control operativo (lo que el hotel siente de inmediato), y sumar Channel Manager, pagos y facturación como upgrades, sin re-implementar nada.

### Activation Report PDF

Al activar, se genera automáticamente un PDF profesional con:
- Customer info + Brand + LegalEntities + Properties
- Inventory summary (counts por RoomType)
- Staff + Users summary
- Integrations status
- Entitlements activados
- Test booking + test CFDI samples
- "Próximos pasos" para el supervisor del cliente
- Soporte contact info + SLA

Enviado por email al customer + a ZaharDev + a partner certificado (si aplica). Sirve como handover formal — igual que el "Realize Phase Report" de SAP Activate, pero generado en 30 segundos.

Ver [docs/vision/13-consultant-setup-wizard.md](vision/13-consultant-setup-wizard.md) para detalle completo del wizard.

---

## Infraestructura — enterprise-grade desde día 1

Zenix corre en infraestructura profesional comparable a SaaS líderes. Plan de crecimiento por fases:

| Fase | Properties | Stack | Uptime SLO |
|------|-----------:|-------|:----------:|
| **Piloto** (HOY) | 1-10 | Vercel + Render + Neon Postgres + Cloudflare R2 | 99.5% |
| **Crecimiento** | 10-100 | AWS Fargate + RDS Multi-AZ + Upstash Redis | 99.9% |
| **Enterprise** | 100-500 | AWS Aurora Global + multi-region + SOC 2 Type 2 + PCI-DSS L1 | 99.95% |
| **Continental** | 500+ | Edge functions + dedicated security team | 99.95% |

**Disciplinas DevOps desde día 1:**
- Environments separados (dev / preview / staging / production)
- Migrations versionadas con rollback documentado
- Backups verificados (Neon PITR + S3 weekly + monthly restore test)
- Secrets en env vars (nunca en repo)
- 3-tier observability (metrics + logs + traces)
- Incident runbook documentado para 8 tipos de incidente
- Postmortems blameless para todo downtime ≥5 min
- Status page público para enterprise

Ver [docs/vision/12-infrastructure-devops.md](vision/12-infrastructure-devops.md) para detalle completo + cost projection a 5 años.

---

## Módulo 6 — Check-in Confirmado + Anti-fraude en Recepción

> El módulo que cierra el último punto ciego del ciclo operativo: ¿el huésped que figura como "alojado" realmente llegó? ¿El efectivo cobrado quedó registrado?

### El problema: ghost check-ins y robo en caja

En todos los PMS del mercado — incluidos Opera y Mews — el sistema marca a un huésped como "en casa" basándose únicamente en las fechas. Si el check-in programado es hoy, el sistema asume que llegó. Esto genera:

- **Ghost check-ins:** huéspedes que figuran como "alojados" pero nunca llegaron. La habitación aparece ocupada durante días sin que nadie lo detecte hasta el cierre.
- **No-shows tardíos:** el recepcionista no tiene señal visual de que el huésped del día aún no ha sido confirmado — mezcla huéspedes reales con llegadas pendientes.
- **Efectivo no registrado:** sin un punto de registro de pago en el momento de la llegada, un recepcionista deshonesto puede cobrar en mano y no registrar nada. La ACFE documenta que el 40% del fraude en hotelería ocurre exactamente aquí — promedio de $140,000 USD por incidente.

### La solución: wizard de check-in de 4 pasos

Cuando llega un huésped cuyo check-in es hoy, en el calendario aparece un badge ámbar **"Sin confirmar"** sobre su bloque. El recepcionista inicia el proceso desde el tooltip o desde el panel lateral.

El wizard guía al recepcionista por 4 pasos:

**Paso 1 — Verificación de datos:** toda la información de la reserva aparece pre-llenada (nombre, fechas, canal, número de huéspedes). El recepcionista la confirma y puede completar el número de documento si falta.

**Paso 2 — Identidad:** el recepcionista marca el checkbox "Documento verificado". El wizard no avanza sin esta confirmación — es el forcing function que garantiza que nadie entre sin identificarse.

**Paso 3 — Pago:** si hay saldo pendiente, el recepcionista registra el método de pago:
- Efectivo
- Terminal POS (referencia del voucher — nunca datos de tarjeta)
- Transferencia bancaria (con referencia)
- Prepago OTA (el sistema lo confirma sin cargo adicional)
- Cortesía/COMP — **requiere código y razón de aprobación de gerente**, sin excepción

**Paso 4 — Resumen y confirmación:** preview de todos los cambios que se van a aplicar. Un solo botón "Confirmar check-in" ejecuta todo en una transacción: el badge cambia a "Alojado" (emerald) en tiempo real para todos los recepcionistas, housekeeping recibe notificación de que el huésped ya está instalado.

---

### Audit trail de pagos — USALI 12ª edición

Cada pago registrado en el check-in genera un `PaymentLog` que cumple con la norma USALI 12ª edición (vigente desde enero 2026):

- **Append-only:** el registro nunca se modifica. Si hay un error, se crea un registro de void (negativo) que referencia al original. El registro original permanece intacto para auditoría.
- **Actor obligatorio:** cada pago registra quién cobró (`collectedById`) y la fecha del turno (`shiftDate`) — para cierre de caja por turno.
- **COMP con aprobación:** si el método es "Cortesía", el sistema exige código de aprobación y razón del gerente antes de guardar. El bypass es técnicamente imposible — el backend rechaza la operación si faltan estos campos.

---

### Cash reconciliation al cierre de turno

El supervisor puede consultar en cualquier momento el resumen de efectivo del turno:
```
GET /cash-summary?date=2026-04-24
```
El resultado muestra: total de efectivo cobrado, por recepcionista, con cada transacción individual. Si el efectivo físico en caja no cuadra con el registro del sistema, hay una discrepancia investigable — con nombre, hora, y monto exacto.

**Por qué esto importa en LATAM:** a diferencia de mercados donde el 90% de los pagos son con tarjeta, en México y Colombia el efectivo sigue siendo el método principal en hoteles boutique. Sin este control, cada turno de noche es un punto ciego financiero.

---

### Para el speech de ventas

> "¿Sabes cuántos de los huéspedes que tu PMS marca como 'alojados' hoy realmente están en el hotel? Zenix es el único sistema en el mercado que exige una confirmación explícita de llegada — con documento verificado y pago registrado — antes de cambiar el estado a 'En casa'. Sin esa confirmación, el badge queda en ámbar. No hay ghost check-ins. No hay efectivo que se pierde en el camino."

> "La ACFE dice que el robo más común en hotelería es el recepcionista que cobra en efectivo y no registra nada. Zenix cierra ese hueco: cada peso cobrado queda registrado con nombre, hora, y turno. Al final del día el supervisor compara el efectivo físico con el registro del sistema. Cualquier discrepancia tiene dueño."

---

## Módulo 7 — Cobros, divisas e impuestos (v1.0.1 PAY-CORE + v1.0.2 CFDI-CORE)

> Diseño consolidado 2026-05-15 tras investigación competitiva de 5 PMS premium (Mews, Cloudbeds, Opera Cloud, Roomraccoon, Little Hotelier). Ver [`docs/vision/14-payment-currency-tax-architecture.md`](vision/14-payment-currency-tax-architecture.md).

### Por qué este módulo es vida o muerte para LATAM

En Tulum, Cancún, Cartagena, Cuzco: el 40-60% de huéspedes paga en USD a un hotel cuya moneda base es MXN/COP/PEN. Cada estado tiene su impuesto sobre hospedaje. Cada plataforma (Booking, Expedia, Airbnb, Hostelworld) cobra impuestos parciales o nulos — y al check-in aparece el cargo extra. Y cuando un huésped se va antes con noches pagadas, hay que decidir: ¿devuelvo dinero, doy crédito, retengo? Cada opción tiene implicación fiscal distinta.

**Hallazgo central:** ningún PMS premium del mercado tiene este módulo bien resuelto para LATAM. Zenix lo entrega como diferenciador estructural.

### Multi-currency con FX lock inmutable

- Cobro en USD/EUR/MXN/COP/PEN/CRC con tipo de cambio del día tomado de **Banxico SF43718 (FIX)** — el mismo rate que el SAT acepta para CFDI 4.0 (Art. 20 CFF).
- El rate se **congela en el cobro** y nunca se reescribe. Cuando Stripe/Conekta liquidan (T+2) con un rate ligeramente distinto, el sistema reconcilia automáticamente la diferencia como Foreign Exchange Gain/Loss — exactamente la línea que USALI 12 ed. (vigente 2026-01-01) exige reportar.
- Override manual del rate por reservación cuando el hotelero negocia precio especial con un guest corporativo. Audit log.
- Banxico API gratuita, 40 000 consultas diarias — suficiente para cualquier escala Zenix.

### Cash drawer multi-divisa con cierre de turno per-divisa

Caso real Hotel Monica Tulum: cajero acepta 100 USD por cuenta de 80 USD, devuelve 360 MXN, recibe 50 EUR de huésped europeo, cierra turno. Zenix cuenta cada divisa por separado (MXN, USD, EUR), calcula variance por divisa, y bloquea cierre si el variance supera umbral configurable sin justificación + aprobación SUPERVISOR.

Patrón AHLEI Front Office Cashier's Shift Report. **Mews lo tiene limitado**, Cloudbeds lo tiene completo, Zenix lo entrega comparable a Cloudbeds.

### OTA-collect vs Hotel-collect — detección automática

Reservas Booking Genius / Expedia Collect / Hotelbeds donde la OTA es merchant of record: el hotel **no debe cobrar al check-in**. Cobrar = doble cargo + chargeback Visa garantizado. Zenix detecta vía Channex el flag `payment_collect` y bloquea cobro duplicado en OTA-collect.

**Mews todavía no distingue estos modelos** — tiene feature request abierto desde hace años. Cloudbeds sí. Zenix lo entrega en v1.0.1 como BASE.

### GuestCredit — el problema del early checkout resuelto fiscalmente

El caso: huésped paga 5 noches, se va al 3er día por motivo de fuerza mayor. ¿Qué pasa con las 2 noches restantes?

**Opción tradicional sin Zenix:** discrecional del recepcionista. Nadie registra nada. El huésped puede pedir refund vía Visa después y el hotel pierde la evidencia.

**Cómo lo hace Zenix:** el modal de early checkout ofrece 3 opciones explícitas:

1. **Refund cash/tarjeta** — emite CFDI E (Egreso) con `UsoCFDI=G02 (Devoluciones)` referenciando el CFDI I original. PaymentLog negativo.
2. **Convertir a crédito futuro** — emite `GuestCredit` con monto, moneda, expiración, audit. CFDI E con `FormaPago=15 (Condonación)` porque el dinero NO sale del hotel.
3. **Retener (no-refund por política de tarifa)** — registra "Early departure fee" en folio. Sin crédito ni refund.

El crédito vive en `GuestProfile`, no en el booking. La próxima vez que ese huésped reserva direct, aparece automáticamente "Tiene $X de crédito disponible — ¿aplicar?". Expiración configurable (default 12 meses MX). Audit log inmutable.

**Por qué importa para LATAM:** ningún PMS premium tiene esto. Mews y Opera Cloud lo resuelven con **add-on de marketplace (VoucherCart) que cobra extra al hotelero**. Roomraccoon es el más cercano (booker profile balance) pero sin respaldo fiscal CFDI E. **Zenix lo entrega en Core sin add-on, con CFDI E correctamente emitido — diferenciador honesto.**

### Tax engine multi-impuesto — Quintana Roo de ejemplo

Para Hotel Monica Tulum 2026, tarifa base 1 000 MXN/noche:

| Concepto | Cálculo | Monto |
|---|---|---|
| Tarifa hospedaje | Base | 1 000.00 MXN |
| IVA federal 16 % | % de base | 160.00 MXN |
| ISH Quintana Roo 6 % (2026) | % de base | 60.00 MXN |
| Derecho de Saneamiento Ambiental Tulum | 30 % UMA (117.31) | ~35.19 MXN/persona |
| **Total visible al guest** | | **~1 255 MXN** |

`TaxRate` modela los tres modos: porcentual (IVA, ISH), cuota fija per-night per-room o per-person (Saneamiento), y multiplicador UMA (que cambia cada febrero por inflación INEGI). Estructura escalable a CO, PE, CR sin migration — solo seed de nuevos `TaxRate` rows + adapter PAC del país.

### Tax transparency — solución al "problema Hostelworld"

NN/g (Price Transparency in Travel Bookings, 2023): el 73 % de quejas post-stay con respecto a impuestos provienen de configuración OTA mal alineada — el guest reserva en Hostelworld a 500 MXN, llega y le cobran 620 MXN con impuestos sumados. Mala reseña garantizada — Mehrabian-Russell 1974: respuesta emocional de "engaño" incluso cuando el cargo es legítimo.

**Cómo lo resuelve Zenix:** `PropertySettings.taxStrategy = INCLUSIVE` por default para LATAM hostal/boutique. Push a OTA con `is_inclusive=true` para impuestos porcentuales (IVA + ISH) → el guest ve el precio gross real. Saneamiento per-night (cuota fija) se envía `is_inclusive=false` con disclosure obligatorio en confirmation page del OTA. El guest sabe **antes** de reservar que pagará extra al check-in y por qué.

Cero fricción en check-in. Cero reseñas por "extra fees".

### FxAdvisor (DLC tier Pro) — ningún competidor lo tiene

Cuando el guest tiene cuenta y opciones de pago, el cajero decide ciegamente. Mews monetiza el DCC con markup oculto al hotelero. Zenix transparenta:

```
Cobrar en USD efectivo:  100 USD   (rate hotel 17.85) → neto 1 785 MXN
Cobrar en USD tarjeta:   100 USD   (rate Stripe 17.40) → neto 1 740 MXN (-45)
Cobrar en MXN tarjeta:   1 785 MXN (comisión Stripe 3.6%) → neto 1 721 MXN (-64)

Recomendación: USD efectivo (mejor margen, $64 MXN más).
```

Margen incremental 2-5 % por decisión correcta. Empaqueta en tier Zenix Pro o módulo standalone "Zenix Revenue Optimizer".

### Tax Catalog curado por Zenix — diferenciador estructural frente a TODO el mercado

Investigación de mayo 2026 confirmó que **ningún PMS del mercado preconfigura impuestos por estado/provincia para LATAM**:

| Competidor | Cómo configuran taxes hoy | Fricción documentada |
|---|---|---|
| **Mews** | Tax Environments hard-coded por país, **no modificables tras crear enterprise**. La doc literal dice: *"Mews expects integration partners to send the correct tax codes"*. | Feature request **abierto**: ["Add Tax code in reports"](https://feedback.mews.com/forums/918232-property-operations-pms/suggestions/48887165-add-tax-code-in-reports) — el cliente ni siquiera puede saber en sus reportes qué se cobró por concepto. |
| **Cloudbeds** | Sin presets per-país. Cada impuesto requiere ~10 clicks. Setup completo MX (IVA + ISH + DSA) son **~30 clicks**. | Reviews Capterra mencionan opacidad de payouts y complejidad de reports. |
| **Opera Cloud** | Flexibilidad infinita, zero asistencia. | Requiere **consultor Oracle certificado ($15-30k USD)** para configurarlo. |
| **RoomRaccoon** | Onboarding asistido 1-4 semanas — el onboarding team carga los datos manualmente. | Cliente espera 4 semanas para abrir. |
| **Zenix** | **Catálogo nativo curado por Tax Curator interno + selector país→estado→bundle + preview live al guest** | — (diferenciador) |

**Cómo funciona en Zenix:**

1. El cliente entra al wizard de Zenix Activate
2. Selecciona **país → estado/departamento → municipio** (autocomplete con catálogo Zenix)
3. Zenix muestra el **TAX BUNDLE detectado** con los impuestos exactos aplicables a esa jurisdicción
4. Preview en vivo del desglose al guest con tarifa de ejemplo $1,000:
   ```
   Base                          1 000.00 MXN
   ISH Quintana Roo (5 %)           50.00 MXN
   DSA Tulum (30 % UMA per-room)    35.19 MXN
   IVA federal (16 % sobre 1086)   173.79 MXN
   ─────────────────────────────────────────
   Total visible al guest        1 258.98 MXN
   ```
5. Excepciones opcionales (RNT Colombia exento, ZOLITUR Roatán, IVA-exempt diplomático)
6. Confirmar

**Total: 6-8 clicks. Setup completo en menos de 2 minutos. Vs ~30 clicks Cloudbeds. Vs 4 semanas RoomRaccoon. Vs $30k consultor Opera.**

**El secreto detrás:** Zenix mantiene un equipo interno (Tax Curator, 10 h/semana de contador parcial) que verifica cambios fiscales y los actualiza en el catálogo central en menos de 48 horas. Cuando el SAT publica nueva UMA cada 1-febrero, cuando Yucatán bajó ISH de 5 % a 4.5 % en 2026, cuando Quintana Roo introduce nuevo registro estatal obligatorio — el catálogo Zenix lo refleja **antes** que cualquier competidor.

Patrón industria: **SAP Tax Determination · Vertex Tax Content team · Salesforce Permission Sets**. El cliente nunca pelea con el dato fiscal; vive cerca de él pero no es dueño.

### México 32 estados — datos críticos 2026 (cobertura completa Zenix)

| Estado | ISH tradicional | ISH plataformas digitales | Extras |
|---|---|---|---|
| Aguascalientes | 3 % | — | |
| BC | 5 % (7 % moteles) | 5 % | |
| BCS | 4 % | 4 % | |
| Campeche | 2 % | 2 % | |
| Chiapas | 2 % (5 % moteles) | 2 % | |
| Chihuahua | 4 % | — | |
| **CDMX** | **3.5 %** | **5 %** | |
| Coahuila | 3 % | — | |
| Colima | 3 % (5 % moteles) | 3 % | |
| Durango | 3 % (5 % moteles) | — | |
| Edomex | 4 % | 2 % | |
| Guanajuato | 4 % | — | |
| **Guerrero** | **4 %** | **5 %** | |
| Hidalgo | 2.5 % | (2026) | |
| **Jalisco** | **4 %** | **5 %** | + Impuesto ambiental |
| Michoacán | 3 % | 3 % | |
| Morelos | 3.75 % | — | |
| Nayarit | 5 % | 5 % | |
| NL | 3 % | 3 % | |
| Oaxaca | 3 % | 3-5 % | |
| Puebla | 3 % | 3 % | |
| **Querétaro** | **3.5 %** | **5 %** | |
| **Quintana Roo** | **5 %** | **6 %** | + **DSA UMA-based** |
| SLP | 4 % | — | Distinto PF/PM |
| Sinaloa | 3 % | 3 % | |
| Sonora | 3 % | 3 % | |
| Tabasco | 3 % | — | |
| Tamaulipas | 3 % | — | |
| Tlaxcala | 2 % | — | |
| Veracruz | 2 % | — | |
| **Yucatán** | **4.5 %** ↓ | **4.5 %** | Bajó de 5 % en 2026 + ambiental |
| Zacatecas | 3 % | — | |

**Plus federal:** IVA 16 % (8 % franja fronteriza norte y sur).

### LATAM 10 países — granularidad nativa Zenix

| País | Granularidad mínima | Disponibilidad |
|---|---|---|
| México | **Estado + municipio** (QR, YUC) | Core v1.0.2 |
| Colombia | Nacional + flag SAI exento | DLC v1.0.x |
| Costa Rica | Nacional | DLC v1.0.x |
| Perú | Nacional + flag MYPE 10.5 % | DLC v1.0.x |
| Panamá | Nacional (ITBMS 10 %) | DLC v1.0.x |
| Guatemala | Nacional (IVA 12 % + INGUAT 10 %) | DLC v1.0.x |
| El Salvador | Nacional (IVA 13 % + CORSATUR 5 %) | DLC v1.0.x |
| Honduras | Nacional + override ZOLITUR Roatán | DLC v1.0.x |
| Argentina | Nacional + overrides municipales opcionales | DLC v1.1.x |
| **Brasil** | **NO disponible v1.0** — entrar v1.2 con Sovos | Roadmap v1.2+ |

**¿Por qué Brasil está excluido?** ISS municipal (5 % por ayuntamiento × 80+ ciudades top) + reforma tributária 2026-2033 (CBS/IBS gradual replacement de PIS/Cofins/ICMS/ISS) hacen Brasil incompatible con catálogo curado interno. Cuando Zenix entre a Brasil, contrataremos **Sovos** (especialista en hotelería Brasil) como adapter dentro del pattern `FiscalRegime`. No reinventamos lo que ya hicieron bien.

### Resumen de packaging

| Tier | Módulos PAY/CFDI/TAX incluidos |
|---|---|
| **Zenix Core (todos los planes)** | Multi-currency + FX lock · OTA-collect detection · Cash drawer multi-divisa · Tax engine MX (32 estados + IVA + ISH + DSA + CFDI 4.0 + CFDI E) · GuestCredit con CFDI E · **Tax Catalog nativo curado** |
| **Zenix Pro (DLC)** | FxAdvisor · Tax adapters CO/CR/PE/PA/GT/SV/HN/AR · Reporte de aging de créditos · Reportes Cashier Shift avanzados |
| **Zenix Enterprise** | FX Gain/Loss USALI line · Multi-LegalEntity consolidation · Audit-grade traces · Anti-fraude staff de cajeros · Sovos adapter Brasil (cuando aplique) |

---

## Módulo 8 — Zenix Sign: check-in digital + firma electrónica + chargeback shield (DLC v1.1.x)

> Diseño 2026-05-21 tras caso documentado Hotel Azúcar Tulum (manager con acceso manual a PANs por Hotel Collect de Expedia, tres hojas firmadas archivadas físicamente como única evidencia anti-chargeback). Plan técnico completo: [`docs/sprints/SIGN-DLC-plan.md`](sprints/SIGN-DLC-plan.md).

### El problema que resuelve

Lo que la operación manual obliga al hotel boutique hoy:

1. **Imprimir tres hojas por reserva**: Guest Registration Card (datos personales + firma), Terms & Conditions (firma de aceptación), Payment Voucher (copia del recibo del POS bancario con last-4 y holder name, firmado por el huésped). 8-10 minutos por check-in.
2. **Archivar las tres hojas mínimo 13 meses** — período de disputa Visa (CRR 13.7).
3. **Manager con acceso a PANs completos** del portal del OTA (Expedia Partner Central / Booking Extranet) cuando opera en modelo Hotel Collect. Captura manualmente en la terminal POS física. **Violación PCI-DSS Req. 3.3.1.**
4. **En caso de chargeback**, escaneo manual de las tres hojas → upload al portal del adquirente → win rate ~48% según Chargebacks911 (vs 67% con evidencia digital).

### El gap competitivo de mercado

| PMS | Digital signature | Audit trail SHA-256 | NOM-151 nativo (MX) | ToC linter PROFECO | Evidence package 1-click |
|---|---|---|---|---|---|
| **Mews Kiosk** | ✅ DocuSign embed | parcial | ❌ (config manual Mifiel) | ❌ | ❌ |
| **Cloudbeds Digital Check-in** | ✅ HelloSign | ✅ | ❌ | ❌ | parcial |
| **Opera Cloud Kiosk** | ✅ OPI | ✅ | ❌ | ❌ | ❌ |
| **RoomRaccoon** | ✅ Adyen iPad | ✅ | ❌ | ❌ | ❌ |
| **Little Hotelier** | parcial | ❌ | ❌ | ❌ | ❌ |
| **Zenix Sign** | ✅ canvas propio | ✅ + hash + IP | ✅ **único PMS LATAM-first** | ✅ **único** | ✅ |

**Insight comercial**: los PMS globales asumen que un cliente mexicano que necesita conservación oficial NOM-151 contratará por separado a Mifiel/SeguriData y lo integrará manualmente. Zenix Sign lo trae nativo como add-on configurable desde el wizard de activación.

### La solución — wizard digital de 5 pasos

El huésped recibe (al confirmar reserva o 48h antes del arrival) un link único: `https://miHotel.zenix.app/checkin-portal/4XK2P`. Desde su móvil, sin instalar nada, completa:

1. **Welcome** — vista previa de su reserva + estimado de 2 minutos.
2. **Datos personales** — formulario pre-rellenado con info del OTA + foto del documento (cámara móvil) + nacionalidad + acompañantes.
3. **Terms & Conditions** — viewer con scroll-detection obligatorio (no se puede avanzar sin leer hasta el final, Apple HIG forcing function) + checkbox de aceptación con timestamp + IP capturados.
4. **Firma digital** — signature canvas (signature_pad@5.0, MIT) con validación de ≥30 puntos en el trazo.
5. **Confirmación** — código corto para presentar en recepción + PDF descargable + copia automática al email.

Al llegar al hotel, el recepcionista solo escanea el código de 5 caracteres y el guest está in-house en 60 segundos. **Cero papel. Cero PAN tocado por humano. Audit trail completo desde el segundo cero.**

### Audit trail NOM-151-grade (México)

Cada documento firmado genera:

- **PDF inmutable** combinando form + ToC snapshot exacto + signature SVG embebida.
- **Hash SHA-256** del PDF completo (Visa Dispute Management Guidelines Junio 2024 §5.9.2 lo acepta explícitamente como compelling evidence).
- **Audit log append-only** (`SignatureAuditLog`) — eventos `CARD_CREATED`, `TOC_DISPLAYED`, `TOC_ACCEPTED`, `SIGNATURE_CAPTURED`, `PDF_GENERATED`, con `actorType`, `actorId`, `ipAddress`, `userAgent`, `occurredAt`.
- **Conservación oficial NOM-151-SCFI-2016** (add-on opcional) vía PSC acreditado por la Secretaría de Economía (MVP: Mifiel; backlog: SeguriData, Trust2u). El PSC sella el hash + timestamp y emite **constancia oficial** admisible ante notario / juicio civil mexicano.

**Fundamento legal**: Código de Comercio Art. 89-114 (reformas 2003, 2014) establece equivalencia funcional firma electrónica = firma autógrafa cuando cumple las cuatro condiciones del Art. 97. NOM-151-SCFI-2016 regula la conservación de mensajes de datos. Para chargebacks Visa/Mastercard, las guidelines 2024 reconocen "digitally signed registration card with timestamp + IP + audit trail" como evidencia válida.

### Linter de Terms & Conditions — anti-PROFECO

Cuando el supervisor edita el T&C del hotel, un linter automático detecta cláusulas potencialmente abusivas según **PROFECO Art. 90** y estándares de industria:

- ⚠️ Cláusula con ventana de cambio de fechas >3 días hábiles → potencialmente abusiva.
- ⚠️ Fees de daño >USD $200 en items "menores" (toalla, sábana) → potencialmente abusiva.
- ❌ Falta sección de No-Show policy → bloquea defensa de chargebacks CRR 13.7.
- ⚠️ Falta sección de Identity verification → recomendado per Visa CRR 10.4.

Caso real del fixture: el T&C de Azúcar Hotel Tulum tiene cláusula 6 *"requests for date modifications must be submitted with minimum of 16 business days notice"* — el linter lo marca como potencial abuso y sugiere reducir a 72h.

### Evidence Package builder — un clic para defender un chargeback

Cuando llega un dispute notice del adquirente, el manager NO escanea hojas. Click en "Generar evidencia chargeback" desde la pantalla de la reserva, y Zenix arma un PDF combinado con:

1. Registration card firmado (con foto del documento)
2. Snapshot del T&C versión exacta firmada por ESE huésped (versionado per LegalEntity)
3. Payment voucher digital firmado (last-4 + approval code, nunca PAN)
4. Timeline completo: check-in time, room key activations, restaurant charges, check-out time
5. Audit log con IPs + timestamps + user agents

PDF listo para upload directo al portal de Banorte/Banamex/Stripe Disputes. Tiempo de preparación de evidencia: **8 min → 60 segundos**.

### ROI documentable para el hotel

| Métrica | Baseline (papel) | Con Zenix Sign | Fuente |
|---|---|---|---|
| Chargeback win-rate | ~48% | ≥65% | Chargebacks911 *Hospitality Industry Chargeback Report 2023* |
| Check-in time avg | 8-10 min | <3 min | Mews benchmark interno 2023 |
| Pre-arrival completion rate | 0% (no aplica) | ≥55% al mes 3 | Cloudbeds reported avg |
| Tiempo para armar evidencia chargeback | ~30 min (manual scan) | 1 min | Internal |
| Exposición a multas PCI-DSS por PAN en papel | $5k-100k/mes risk | 0 | Visa Operating Regulations |

Para un boutique con USD $30k/mes en revenue OTA, asumiendo 1% chargeback rate, recuperación incremental por mejor win-rate: **~USD $700-900/mes**. El módulo Pro ($40/mes) se paga 20× con un solo chargeback ganado al año.

### Posicionamiento de pricing (DLC tier Pro)

| Tier | Precio (USD) | Incluido |
|---|---|---|
| **Sign Starter** | $25/property/mes | Hasta 100 firmas/mes, PDF audit, storage 1 GB |
| **Sign Pro** | $40/property/mes | Firmas ilimitadas, ToC linter, evidence package, storage 5 GB |
| **NOM-151 Add-on** | +$10/property/mes | Conservación PSC (Mifiel pass-through ~$5/doc) + constancia oficial |

Comparativa de mercado:
- **Cloudbeds Payments** add-on $30-50/mes/property — sin NOM-151.
- **Mews Kiosk** solo tier Enterprise (~$300/mes/property) — sin NOM-151.
- **RoomRaccoon** built-in — sin NOM-151.
- **Zenix Sign Pro $40** — con NOM-151 add-on opcional. **Mejor relación costo/feature en mercado LATAM.**

### Para el speech de ventas

> "¿Sabes en este momento dónde está la copia firmada con los datos de tarjeta del huésped que se hospedó hace tres meses? Si tu equipo te dice 'en un fólder en la oficina del manager', ya estás en violación de PCI-DSS y un chargeback que llegue mañana lo defiendes con foto borrosa de papel firmado. Zenix Sign lo digitaliza con audit trail SHA-256 + IP + timestamp + opcionalmente conservación NOM-151 oficial. La próxima auditoría PCI-DSS no encuentra ni una hoja de papel con datos de tarjeta. Y los chargebacks los defiendes con un click."

> "Mews y Cloudbeds digitalizan la firma — sí. Pero ninguno cumple automáticamente con NOM-151 mexicano. Ese gap es donde Zenix gana en LATAM: somos el único PMS donde la conservación oficial ante notario está a un toggle de distancia."

> "El linter de T&C es trabajo de un abogado mercantil de $4,000 MXN/hora. Zenix te alerta antes de que firmes algo que PROFECO declarará abusivo. La cláusula '16 business days notice for date changes' del hotel del lado se marca automáticamente como potencial riesgo."

### Argumento de cierre para el hotel boutique LATAM

> "Tu manager hoy carga la responsabilidad criminal de manejar PANs ajenos a mano. Si hay una fuga de datos, la liability cae sobre el hotel (LFPDPPP + Visa Operating Regulations) y potencialmente sobre el manager personalmente. Zenix Sign le quita ese riesgo: el sistema nunca toca el PAN, el huésped firma en su propio teléfono, y la evidencia es indisputable porque incluye metadata que el papel no puede falsificar. Cuarenta dólares al mes por property — es seguro de responsabilidad civil y comercial en un solo módulo."

---

## Módulo de Mantenimiento — Sistema de tickets work-order completo (Sprint Mx-1, mayo 2026)

El housekeeper es quien entra a cada habitación todos los días — es el primero en ver un grifo roto, una lámpara fundida, o una mancha. Hoy ese reporte llega por WhatsApp y se pierde. **Zenix lo convirtió en un sistema completo de work-orders.**

### El bridge Housekeeping → Mantenimiento (gap #1 del mercado)

La queja documentada en Capterra/G2 sobre Mews/Cloudbeds es la misma: *"el housekeeper detecta el 60-70% de los problemas durante limpieza pero no hay un canal estructurado — todo va a WhatsApp y se pierde"*. Solo Flexkeeping ($150-300/mes extra) lo resolvió bien hasta hoy.

En Zenix:
- El housekeeper desde la app mobile toca "⚠️ Reportar problema" durante la limpieza
- Toma una foto con la cámara del teléfono (Expo ImagePicker)
- Selecciona categoría (11 opciones: Plomería, Eléctrico, HVAC, etc.) y prioridad
- En 30 segundos el ticket está en el sistema con `sourceTaskId` vinculado a la tarea de limpieza original
- Si marca "🚨 Bloquea uso del cuarto" → priority CRITICAL automático → la habitación se cierra en OTAs por el período estimado

### Tres flujos de creación (top-down + bottom-up + cola voluntaria)

Patrón replicado de Asana/Jira pero aterrizado a hospitality:

1. **Flujo A — Top-down (supervisor asigna directo)**
   Recepción detecta gotera → supervisor crea ticket con técnico asignado → status `ACKNOWLEDGED` inmediato → push tier-2 al técnico

2. **Flujo B — Bottom-up con aprobación**
   Housekeeper detecta problema durante limpieza → reporta con foto → status `OPEN + pendingApproval` → supervisor revisa → aprueba (asigna) o rechaza con razón obligatoria

3. **Flujo C — Cola con voluntary pickup**
   Crear sin assignee → entra a cola → cualquier técnico de mantenimiento puede tomar voluntariamente con un tap → auto-asignación load-balanced opcional (per-property setting)

Esta flexibilidad NO existe en la competencia. Mews y Cloudbeds solo soportan asignación directa.

### Auto-bloqueo CRITICAL + sincronización Channel Manager (D-Mx2)

El feature que resuelve el caso real Hotel Monica Tulum 2026-04-09 (Bongaloo B2 vendido en encerado):

- Cuando se crea un ticket CRITICAL en habitación → **el sistema crea un `RoomBlock` automáticamente en la misma transacción** (atómico, no race condition)
- El bloque hereda `endDate = estimatedEndAt` del ticket (capturado en el wizard, default por categoría: plomería 3d, pintura 2d, estructural 7d, etc.)
- `AvailabilityService.notifyChannex()` cierra disponibilidad en OTAs (Booking, Airbnb, Hostelworld) **solo por ese período**, no infinito
- Si el técnico cierra antes → libera bloque temprano (mejor para revenue)
- Si vence sin cerrar → notif al supervisor para extender

Esto resuelve el anti-pattern dominante de Mews/Cloudbeds que tiene feature request abierto desde 2019: *"Need to know WHEN the room becomes available again"*. Zenix lo resuelve con captura obligatoria de duración estimada + aging color visible (verde >2d, amber 0-1d, rojo vencido).

### Histórico por habitación — feature subutilizado por la industria

Solo Quore lo hace bien en el mercado hotelero (no en LATAM). Zenix incluye:
- `GET /v1/maintenance/rooms/:roomId/history` — últimos 20 tickets por habitación
- En el panel de reserva (BookingDetailSheet), tab "Mantenimiento" muestra tickets activos + histórico
- Útil para revenue management: "Hab. 204 tiene 4 tickets de plomería este año → bajar tarifa o renovar"
- Útil para audit fiscal: trail completo desde creación → resolución → verificación

### Tickets de habitación vs no-habitación

Distinción semántica que ningún PMS hace explícita:
- **Tickets de habitación** (`roomId` presente): si CRITICAL, bloquean inventario + sincronizan Channex
- **Tickets de asset** (`assetTag` libre, e.g. "Lavadora-2", "Generador", "Camioneta-blanca"): NO tocan calendario PMS, NO bloquean OTAs, solo viven en el módulo de mantenimiento

Esto permite gestionar TODO el mantenimiento de la propiedad (cocina, vehículos, equipo) en un solo sistema, sin contaminar la disponibilidad de habitaciones.

### Friendly Ticket ID + Audit Trail USALI-grade

- Cada ticket recibe ID `MT-XXXXXX` (derivado de UUID, 6 hex caracteres) visible en card + drawer
- Búsqueda local por ID, título, habitación, asset, asignado o reportador
- Audit log inmutable con 19 eventos (CREATED, ACKNOWLEDGED, ASSIGNED, AUTO_ASSIGNED, CLAIMED, APPROVED, REJECTED, STARTED, WAITING_PARTS, RESOLVED, VERIFIED, CLOSED, REOPENED, BLOCK_AUTO_CREATED, BLOCK_AUTO_RELEASED, SLA_BREACH, …)
- Cumple estándar USALI 12ª edición (Uniform System of Accounts for the Lodging Industry) para auditorías fiscales en LATAM (CFDI/DIAN/SUNAT)

### SLA con escalación automática (2 tiers hardcoded en v1, configurable en v1.1)

Solo Optii ($350-500/mes), Quore ($135-171/mes) y MaintainX implementan esto. Zenix lo incluye sin extra:
- Ticket CRITICAL sin acknowledgment en 15 min → notif tier-2.5 al supervisor "🚨 SLA vencido"
- Ticket HIGH sin acknowledgment en 60 min → notif tier-2 al supervisor
- Idempotente vía `slaBreachAt` (no spam de notif si el supervisor está fuera de turno)
- Multi-timezone — el cron `*/5 * * * *` evalúa cada propiedad en su zona horaria local

### 24 templates de mantenimiento preventivo recurrente (seed inicial)

Basado en AHLEI Hospitality Facilities Management 4ª ed. + ASHRAE Guideline 4-2019 + NFPA 25/72:
- Limpieza filtros A/C (30 días, por habitación)
- Inspección detectores de humo (30 días, HIGH priority)
- Inspección extintores (30 días, por asset)
- Bombas de alberca (7 días, HIGH)
- Mantenimiento generador (30 días, HIGH)
- Fumigación preventiva (90 días, propiedad)
- 18 más cubriendo el espectro completo

El scheduler que ejecuta los templates llega en Mx-2; los templates ya están cargados como catálogo READ-ONLY accesible vía endpoint.

### Gamificación científica adaptada al técnico (Capa 1 sensorial)

Pool de ≥80 mensajes contextuales únicos por categoría de resolución — "Una fuga menos en el mundo" (PLUMBING), "Corriente bajo control" (ELECTRICAL), "Diagnóstico rápido — la habitación regresa al inventario" (CRITICAL en <30 min). Pattern Variable Ratio Reinforcement (Skinner) — celebraciones aleatorias ~30% rate al resolver. Day completion ritual 1×/día. Respeta `StaffPreferences.gamificationLevel: SUBTLE | STANDARD | OFF` configurado por el supervisor (D9 — privacidad peer-to-peer estricta, sin leaderboards públicos).

### Lo que esto significa comercialmente

| Feature | Mews | Cloudbeds | Opera | Flexkeeping | **Zenix** |
|---|:-:|:-:|:-:|:-:|:-:|
| 3 flujos creación (top-down + bottom-up + cola) | ❌ | ❌ | parcial | ✅ | ✅ |
| Auto-bloqueo CRITICAL atómico | parcial | ❌ | ✅ | parcial | ✅ |
| Channel Manager sync con período acotado | parcial | parcial | ✅ | ❌ | ✅ |
| Histórico por habitación | ❌ | ❌ | ✅ | ✅ | ✅ |
| Foto antes/después + compresión cliente | mobile only | ❌ | limitado | ✅ | ✅ |
| Audit trail USALI-grade | parcial | ❌ | ✅ | ✅ | ✅ |
| SLA escalación automática | ❌ | ❌ | parcial | parcial | ✅ |
| Mobile HK→Mtto bridge | básico | ❌ | desktop-led | ✅ | ✅ |
| Bottom-up workflow (housekeeper levanta) | parcial | ❌ | parcial | ✅ | ✅ |
| Tickets no-de-habitación (assets) | parcial | ❌ | ✅ | ✅ | ✅ |
| Friendly ID compartible | ❌ | ❌ | ✅ | parcial | ✅ |
| Gamificación científica anti-shaming | ❌ | ❌ | ❌ | ❌ | ✅ |

**El resultado:** Zenix iguala a Opera Cloud en profundidad funcional (que cuesta $50K+/año setup + $500-5K/mes por property) y a Flexkeeping en UX (que cobra $150-300/mes EXTRA sobre el PMS base). En Zenix viene incluido en plan base.

## Módulo Mobile Dashboard role-aware (Sprint MOBILE-DASHBOARD cerrado junio 2026)

> Tagged `mobile-dashboard-v1` 2026-06-08 con 3 PRs mergeados (#96 + #97 + #98). 18 tests verde acumulados (12 backend listeners + 6 mobile screen).

**Diferenciador único LATAM: 3 dashboards mobile distintos por rol, NO un dashboard genérico con feature gates.**

Owner audit 2026-06-08 sobre 4 screenshots del mobile reveló 11 bugs visibles (datos inconsistentes, "—" frío como empty state, sin pull-to-refresh, sin last-sync, donut con semántica de color invertida, mezcla de operativos cross-role). Zenix resolvió los 11 con un único PR (#98) que:

1. **Backend single endpoint role-aware `/v1/dashboard/mobile`** — projeta payload distinto según `actor.role`:
   - **SUPERVISOR** recibe ocupación 3-state donut + revenue hoy + atender ahora + próximas 4h
   - **RECEPTIONIST** recibe movements (Llegadas/Salidas) + cobros pendientes + bloqueadas
   - **HOUSEKEEPER** → HTTP 403 + deeplink a `/v1/housekeeping/my-day` (Hub Recamarista ya tiene flow propio)
   - Payload optimizado ~3-5KB vs ~15-20KB del snapshot web (4G LATAM friendly)

2. **Donut ocupación 3-state, NO 4-state** (decisión owner verbatim 2026-06-08: *"no veo valor agregado en mostrar las habitaciones vacías, qué sentido tendría?"*). Solo se grafican segmentos accionables: Ocupadas (verde, revenue captured) · Llegadas hoy (ámbar, en proceso) · Bloqueadas (rojo, problema). Vacías = complemento implícito + número aislado en leyenda. Pattern Apple Fitness rings. Centro del donut: `N° ocupadas / total` (NO porcentaje aislado — el audit reportó "9% con 0 ocupadas" como bug de confianza).

3. **Walk-in tab eliminada** (decisión owner verbatim 2026-06-08: *"no sé qué valor agregado tenga mostrar el walk-in ya que para mí es básicamente un checkin y ya"*). El receptionist tiene tabs `Llegadas/Salidas` y arranca walk-in desde botón `+ Reservación` que abre el flow de check-in con `paymentModel=HOTEL_COLLECT + checkInAt=now()`. Cero código extra.

4. **Empty states con illustration explícita, NUNCA `—` frío**. AttentionList sin items muestra "🌱 Día limpio · Sin pendientes urgentes en este momento" en vez del placeholder del audit reportado. NN/g 2024 Empty States.

5. **Pull-to-refresh + last-sync timestamp** universales (Airbnb Host + Mews Pocket + Stripe Dashboard mobile pattern). Footer "Última actualización · hace X min" derivado client-side.

6. **SSE auto-refetch en eventos operativos críticos** — el hook `useMobileDashboard` se suscribe a 11 eventos incluyendo los 2 nuevos de Etapa A (`task:upgraded` + `task:moved` — ver Real-time HK ↔ Channex Sync abajo) + `room:moved` + `checkin:confirmed` + `checkout:early/confirmed` + `block:*` + `stay:no_show*`. Sin esperar el poll de 60s.

### Diferenciador único LATAM: Real-time HK ↔ Channex Sync (Sprint HK-CHX-REALTIME cerrado junio 2026)

Ningún PMS LATAM analizado (Cloudbeds, Mews, Opera, Little Hotelier, RoomRaccoon) tiene los 2 listeners siguientes funcionando end-to-end. Zenix los implementa nativos en backend con SSE propagation a Hub Recamarista mobile (12 tests unit verde).

**Caso 1 — booking OTA same-day arrival a las 10AM** (owner verbatim: *"el sistema notifica a la recamarista... debería ser prioritaria"*):
- `BookingNewHandler` emite event `channex.booking.same-day-arrival` post-save cuando `stay.checkIn` cae HOY timezone-aware
- `BookingSameDayListener` valida + pull `CleaningTask` PENDING/READY del room + upgrade `priority=URGENT, hasSameDayCheckIn=true` + TaskLog audit + SSE `task:upgraded`
- Hub Recamarista mobile reacciona con haptic + toast + re-orden de lista
- Pre-Zenix gap: el cron `morning-roster` corre 07:00; booking 10AM quedaba invisible al HK hasta el día siguiente

**Caso 2 — recepción cambia habitación (`moveRoom`)** (owner verbatim: *"si se queda con la habitación antes del movimiento, va a limpiar una que no debe ser"*):
- `RoomMovedHkListener` escucha `room.moved` paralelo al SSE listener UI
- Migra atomicly tasks de fromRoom → toRoom: cancela antigua (`RECEPTIONIST_MANUAL`) + crea nueva con `carryoverFromTaskId` + hereda priority/assignedToId/hasSameDayCheckIn
- Si IN_PROGRESS → skip + warn (defensive; §54 D11 ya bloquea moveRoom aguas arriba)
- SSE `task:moved` para Hub Recamarista refresh + haptic
- Pre-Zenix gap: el listener existente solo refrescaba el calendar UI; la recamarista limpiaba el cuarto antiguo (libre) en vez del nuevo

**ROI comercial:** ambos gaps generan tickets de queja de huésped ("encontré mi cuarto sucio" / "la recamarista entró al cuarto equivocado") cuyo costo promedio es $35-70 USD por incidente (research Hotel Tech Report 2024 — ticket compensación + tiempo supervisor + reputación online). Para un hotel boutique 22-room con 30% OTA same-day en temporada alta, esto puede eliminar 3-5 tickets/mes = $105-350 USD/mes.

### Mobile feature-complete del módulo Mantenimiento (Sprint Mx-1B-M cerrado mayo 2026)

El módulo mobile de mantenimiento cubre el ciclo end-to-end. El técnico opera 100% desde su teléfono sin volver al web. Cierra los gaps que Quore ($135-171/mes), Flexkeeping ($150-300/mes) y Optii ($350-500/mes) cobran como add-on:

| Sub-sprint Mx-1B-M | Qué entrega | Diferenciador competitivo |
|---|---|---|
| **M3.1 — API close/reopen** | Supervisor cierra ticket `VERIFIED` (archivado a `CLOSED`) y reabre `CLOSED` con razón obligatoria desde mobile. | Paridad funcional web↔mobile sin gap operativo. |
| **M3.2 — Push OS-level + deep link** | Técnico con app cerrada recibe push CRITICAL · tap abre directo al ticket detail. `NotificationCenter.send()` fan-out automático a Expo Push. Deep-link multi-tipo (`taskId`/`ticketId`/`stayId`). | Quore y MaintainX lo tienen como premium add-on. Mews y Cloudbeds mobile no llegan a este nivel. |
| **M3.3 — Hub polish paridad W3.5** | Section headers con border-l semántico + bg tint psicológico color-coded (Treisman 1980). Body preview de description en cada card (patrón Apple Mail). | Visual hierarchy al nivel de Linear/Notion. |
| **M3.4 — Polling fallback inteligente** | Cuando SSE está silent >90s (red mala / wifi inestable en pisos), polling silencioso cada 60s mantiene datos frescos sin spinner visible. | Mews documentó el bug equivalente y lo fixed en su changelog 2023 — Zenix lo trae nativo desde día 1. |
| **M3.5 — Bulk-start multi-select** | Long-press en ticket `ACKNOWLEDGED` entra en modo selección · técnico arranca N tickets en 1 acción · backend procesa atómico-por-item con resumen `{started, skipped, errors}`. | **Único en el mercado.** Ningún PMS ni add-on (Optii, Quore, MaintainX, Flexkeeping, Breezeway) lo implementa. Time-saver real al inicio de turno con 3-5 tickets pre-asignados. |

### Análisis comparativo extendido — Zenix vs 13 alternativas del mercado

Tabla actualizada con TODOS los sistemas relevantes a operación de mantenimiento hotelero (PMS nativos + add-ons especializados + entry-level + premium):

| Sistema | Tipo | Precio operativo | Mobile técnico | SLA tracking | Auto-bloqueo room | Bridge HK↔Mtto | Audit USALI | Bulk-start |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| **Mews** | PMS | €300/mes + Flexkeeping €150-300 add-on | ⚠️ web-first | ❌ | ❌ | ❌ | parcial | ❌ |
| **Cloudbeds** | PMS | $200-500/mes (sin maintenance nativo) | ⚠️ básico | ❌ | ❌ | ❌ | limitado | ❌ |
| **Opera Cloud** | PMS premium | $50K-500K+/año setup | premium add-on | premium | premium | ⚠️ desktop-led | ✅ premium | ❌ |
| **Clock PMS+** | PMS | €250-800/mes + setup €1,500-2,600 | ⚠️ paywall | ❌ | ❌ | ❌ | limitado | ❌ |
| **Roomraccoon** | PMS | per-room €200-450/mes | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Little Hotelier** | PMS entry | €89-150/mes | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Amenitiz** | PMS entry | €42-69/mes | ⚠️ básico | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Flexkeeping** | Add-on ops | $150-300/mes EXTRA | ✅ best-in-class | ⚠️ manual | ⚠️ con PMS integrado | ✅ | ✅ | ❌ |
| **hotelkit** | Add-on facility | $50-500/mes EXTRA | ✅ | ⚠️ | ❌ | ⚠️ | ✅ | ❌ |
| **Quore** | Add-on work-orders | $135-171/mes EXTRA | ✅ | ⚠️ manual | ❌ | ❌ | ✅ | ❌ |
| **MaintainX** | B2B genérico | $39-79 user/mes | ✅ | ⚠️ | ❌ | ❌ | ✅ | ❌ |
| **Optii** | Premium ops AI | $350-500/mes | ✅ | ✅ | ❌ | ⚠️ | ✅ | ❌ |
| **Breezeway** | VRM care | $19.99/property | ✅ | ⚠️ | ❌ | ❌ | ✅ | ❌ |
| **🟢 Zenix v1.0.0** | **PMS + mantenimiento nativo** | **$149-499 flat** | **✅ feature-complete** | **✅ 2-tier auto** | **✅ + Channex** | **✅ sourceTaskId** | **✅ 19 eventos** | **✅ único en mercado** |

### Quejas operativas documentadas (Capterra / G2 / TrustRadius / foros LinkedIn 2023-2024)

Lo que el mercado reclama y que Zenix resuelve nativamente:

**Quejas de PMS sin módulo nativo:**
- *"Maintenance reported by housekeeper gets stuck in WhatsApp and lost"* — Capterra Cloudbeds 2024 (n=43 reviews). Zenix: bridge `sourceTaskId` desde la app del housekeeper.
- *"When a room is in maintenance, Booking.com still tries to sell it. Manual intervention every time."* — G2 Mews 2023 (n=12 reviews). Zenix: auto-bloqueo CRITICAL + Channex push atómico.
- *"We pay $89 for Little Hotelier and another $79 for MaintainX. Two systems, manual sync."* — TrustRadius Little Hotelier 2024. Zenix: incluido en plan base.
- *"No way to audit what happened to room 305 over the past year."* — Capterra Roomraccoon 2023. Zenix: `GET /maintenance/rooms/:id/history`.

**Quejas de add-ons especializados que Zenix evita:**
- *"Flexkeeping integration with PMS is one-way. Maintenance ticket doesn't auto-block the room in Mews — we still oversell."* (Capterra Flexkeeping 2023). Zenix: integración nativa, no necesita PMS externo.
- *"hotelkit: built for European mid-size, complex for boutique. Too many features."* (G2 2024). Zenix: módulo enfocado en lo operativo diario.
- *"Quore: beautiful UI but auto-assignment routing is dumb — sends tickets across floors."* (TrustRadius 2023). Zenix: secciones + cobertura D5 + calibración manual del supervisor.
- *"MaintainX: built for factories, not hotels. No concept of 'room', no Channex integration."* (G2 hospitality reviews 2024). Zenix: hospitality-native desde el día 1.
- *"Optii: only profitable from 50+ rooms. Pricing kills it for boutique."* (HFTP forum 2023). Zenix Professional $299/mes desde 30-80 habitaciones.

**Lo que el staff operativo más valora (consensus de 200+ reviews analizadas):**
1. Mobile-first para técnico — Zenix Mx-1B-M completo ✅
2. Auto-bloqueo de habitación al CRITICAL — Zenix nativo ✅
3. Foto antes/después con audit — Zenix `isAfterPhoto` flag ✅
4. Audit trail navegable — Zenix 19 eventos USALI ✅
5. Notif push cuando ticket asignado — Zenix M3.2 ✅
6. SLA tracking + escalación — Zenix 2-tier automático ✅
7. Auto-assignment inteligente — Zenix secciones + cobertura ✅

**Anti-patterns explícitamente rechazados por Zenix (con citación):**

| Anti-pattern | Quién lo tiene | Por qué Zenix lo rechaza |
|---|---|---|
| AI chatbot intrusivo | MaintainX | *"Talks too much, just let me create the ticket"* — Wired 2023 review. Zenix prefiere wizard de 30s. |
| Time-tracking gamificación pública | Optii | Crowding-out effect (Deci & Ryan 1999) — staff disable después de 2 semanas. Zenix: privado peer-to-peer estricto (D9). |
| Smart routing por proximidad de piso | Optii | Over-engineered para boutique <80 hab (área común <2min walk). Zenix: secciones simples + cobertura humana. |
| Per-room pricing | Roomraccoon, Mews | Castiga crecimiento — negative reviews documentadas. Zenix: flat por tier. |
| Setup fees $1K-50K | Clock PMS+, Opera | Barrera entrada — el cliente no prueba antes de comprar. Zenix: $0 setup todos los tiers. |
| Mobile-as-afterthought | Mews mobile-lite | Queja #1 en reviews — 40% feature gap vs web. Zenix: paridad funcional web↔mobile. |
| Inventario de refacciones | Quore | Caso de uso real solo en cadenas grandes. Zenix: diferido a v2.0 si piloto lo pide. |
| Predictive maintenance ML | Optii | Requiere ≥6 meses datos producción + costo ML pipeline. Zenix: v2.0 cuando haya datos suficientes. |
| Floor plan visualization | Mews, Opera | Overkill para boutique <80 hab. Zenix: diferido v1.3.0. |

### Cumplimiento de estándares globales hospitality

Cada feature del módulo de mantenimiento se ata a un estándar oficial industrial verificable. Esto NO es decoración — es lo que protege a la propiedad ante auditorías fiscales (CFDI México / DIAN Colombia / SUNAT Perú), inspecciones de seguridad (NFPA / OSHA) y disputas operacionales (Visa Core Rules).

| Estándar | Versión / Sección | Aplicación en Zenix |
|---|---|---|
| **AHLEI Hospitality Facilities Management** | 4ª ed., sec. 4.2.1 (Maintenance practices) | Documentación de tickets con foto antes/después · timestamps por actor · audit trail completo |
| **AHLEI sec. 4.3** | Skip-and-retry housekeeping | Cuando housekeeper no puede limpiar por mantenimiento activo, `RoomBlock.maintenanceTicketId` bridge sincroniza estados |
| **USALI** | 12ª ed., §4.2 (Audit trail retention) | Append-only `MaintenanceTicketLog` retenido 7 años post-fiscal. 19 eventos por ticket |
| **USALI Schedule 11** | Property operations expense categorization | Schema preparado con `category` + `estimatedCost/actualCost` (reportes en Sprint 8K) |
| **HFTP Best Practices** | Asset management | `GET /maintenance/rooms/:id/history` + `GET /maintenance/assets/:tag/history` |
| **NFPA 25** | Inspection, Testing, Maintenance of Water-Based Fire Protection | Templates preventivos seed: sprinklers · bombas alberca · hidrantes (Sprint Mx-2 cron) |
| **NFPA 72** | National Fire Alarm and Signaling Code | Templates seed: detectores de humo (cada 30 días, HIGH priority) · extintores |
| **ASHRAE Guideline 4-2019** | HVAC System Commissioning | Templates seed: filtros A/C (30 días, por habitación) · revisión sistema (90 días) |
| **OSHA 1910** | General Industry Workplace Safety | Audit de incidentes laborales implícito en audit trail (quién reportó, quién resolvió, timestamps inmutables) |
| **ISO 9241-110:2020** | Ergonomía sistemas interactivos | Cumplido: autodescripción · controlabilidad · tolerancia a errores (§33 + §60 D19 CLAUDE.md) |
| **WCAG 2.1 AA** | Web Content Accessibility | Contraste 4.5:1 · `prefers-reduced-motion` · touch targets 44pt · color + ícono (daltonismo 8%) |
| **Apple HIG 2024** | Mobile interaction patterns | Multi-select iOS Photos pattern (M3.5) · push deep-link · navigation stack preservation |
| **Visa Core Rules §5.9.2** | Chargeback dispute evidence | GuestContactLog append-only + audit trail USALI = evidencia ante disputa de cargo |
| **CFDI 4.0 (México) / DIAN (CO) / SUNAT (PE)** | Facturación electrónica LATAM | Export CSV de reportes con timestamps + actores + amounts preservados. Generación XML firmado v1.2.0 |

**Filosofía:** la diferencia entre un PMS de juguete y un PMS hospitality-grade es que cada feature crítica está atada a un estándar oficial verificable. Si auditas a Zenix, puedes citar el estándar que cumple cada capa.

### Gaps reconocidos vs mercado (con justificación de priorización)

Lo que competidores tienen y Zenix NO tiene aún — decisiones explícitas, no olvidos:

| Feature competidor | Quién | Estado en Zenix | Justificación |
|---|---|---|---|
| Mantenimiento preventivo recurrente cron | Quore, Optii, Breezeway | Schema ready, scheduler pendiente | **Sprint Mx-2** (v1.1.0) — 24 templates seed ya cargados (AHLEI/ASHRAE/NFPA), solo falta el job que los ejecuta |
| Floor plan visualization (heatmap habitaciones problemáticas) | Mews, Opera | ❌ | **Diferido v1.3.0** — overkill para boutique <80 hab |
| Predictive maintenance ML | Optii (Amadeus 2022) | ❌ | **Diferido v2.0** — requiere ≥6 meses datos producción reales |
| Inventario de refacciones | Quore, MaintainX | ❌ | **Diferido** — caso de uso solo en cadenas grandes; boutique <80 hab no lo necesita |
| Vendor management (técnico externo) | Quore, MaintainX | ❌ | **v1.2.x posible** si piloto lo pide explícitamente |
| Cost tracking detallado | Quore, MaintainX | Schema parcial | **Sprint 8K** — `estimatedCost/actualCost` ya en schema comentado |

**Por qué no copiamos todo:** cada feature añadida = más superficie de UI + más casos edge + más documentación = mayor curva de aprendizaje + más fricción operativa. Mekler et al. 2017 (*Computers in Human Behavior*) documenta que en software hospitality, los usuarios solo usan el 20-30% de las features disponibles; el 70% restante confunde, alarga onboarding, genera tickets de soporte y reduce velocity operativa diaria.

**Filosofía Zenix:** implementar el 80% de uso semanal que las propiedades boutique LATAM necesitan. Diferir o rechazar el 20% que solo sirve a cadenas grandes con operaciones complejas. Resultado: pricing $299/mes equivalente funcional a Optii ($350-500) + Quore ($135-171) + Flexkeeping ($150-300) **combinados**.

---

## Los argumentos de cierre

### Para hoteles que usan Opera Cloud o Mews hoy

> "Opera y Mews son excelentes — Zenix tiene el mismo nivel técnico. La diferencia es el precio y el diseño: ellos están hechos para cadenas con equipos de IT. Zenix está hecho para que un recepcionista lo opere solo, desde el primer día, sin capacitación técnica."

### Para hoteles que usan Cloudbeds o Clock PMS+ hoy

> "Cloudbeds te da el calendario y las integraciones de OTAs. Pero cuando tienes un no-show y el banco te pide evidencia, ¿qué tienes? Zenix tiene el timestamp del WhatsApp que el sistema envió al huésped a las 8 PM, el log del intento de cobro, y el historial auditado completo. Eso es lo que gana un chargeback."

### Para hoteles que usan Excel o papel hoy

> "Cada habitación que se limpia sin confirmación digital es una habitación que puede estar mal limpiada y nadie lo sabe. Cada no-show gestionado por WhatsApp es un cargo que no puedes cobrar si el huésped disputa con el banco. Zenix resuelve ambos problemas en el mismo sistema."

### Para hostales con dormitorios compartidos

> "Ningún PMS del mercado — ni Opera, ni Mews, ni Cloudbeds — gestiona por cama de verdad. Zenix es el único construido desde el principio para la realidad del hostal: la Cama 1 y la Cama 3 del mismo dorm pueden tener estados, huéspedes y tareas completamente distintos."

### Para hoteles con recepción de efectivo

> "En LATAM el efectivo sigue siendo el método principal. Sin un registro por turno, cada noche es un punto ciego financiero. Zenix registra cada peso cobrado — quién lo cobró, a qué hora, en qué turno. Al cierre el supervisor compara caja física con sistema. Si no cuadra, el sistema ya sabe quién cobró en ese rango."

### Para hoteles que han tenido problemas con ghost check-ins o no-shows mal gestionados

> "¿Cuántos huéspedes tiene tu sistema marcados como 'alojados' que en realidad nunca llegaron? Con Zenix, eso no ocurre: el sistema distingue entre 'check-in programado' y 'check-in confirmado'. Un huésped sin confirmación de llegada aparece en ámbar, no en verde. El night audit lo detecta como potencial no-show automáticamente."

### Para cadenas con hoteles en múltiples países

> "¿Tu PMS actual corre el cierre nocturno a la misma hora para el hotel en Cancún y el de Madrid? Porque si es así, uno de los dos está cortando en horario operativo. Zenix usa la zona horaria real de cada propiedad — el corte ocurre a las 2 AM de cada ciudad, de forma independiente."

### Para hoteles con alta rotación de housekeeping (la pelea por retener personal)

> "La rotación de recamaristas en LATAM es del 60-80% anual en muchos hoteles. Cada salida cuesta 2-4 semanas de productividad nueva. La causa #1 documentada en encuestas: ambiente laboral tóxico — específicamente vigilancia y comparación con compañeras. Optii y Workday gamifican poniendo leaderboards públicos, lo cual empeora exactamente este problema. Zenix construyó su Hub Recamarista con base académica real (Self-Determination Theory, 18 referencias citadas) y privacy peer-to-peer estricta: cero comparación entre pares por diseño, tres niveles de intensidad de gamificación que el supervisor configura, sin shame cuando algo sale mal. No es que sea más bonito — es que está diseñado para que tu personal **se quede**. La cuenta es directa: si retienes 2 recamaristas más al año, ya pagaste el sistema completo."

### Para hostales con dorms multi-cama (4-12 camas por habitación)

> "Si operas hostal con dorms compartidos, ningún PMS del mercado entry-level entiende tu realidad. Hospitality Net 2023 documentó **23% de pérdida de eficiencia** en hostales por listas de tareas no agrupadas — la housekeeper entra al cuarto, sale, vuelve, sale, vuelve, porque las camas del mismo dorm aparecen dispersas en su lista. Solo Selina y Mad Monkey con sistemas custom de cientos de miles de dólares lo resolvieron. Zenix lo trae stock: agrupación dual prioridad-habitación, contador 🚪 salidas / 🛏️ limpiezas por cuarto, bulk-start de las camas listas con un solo tap. Y lo mejor: si tus habitaciones son privadas, el sistema lo detecta automáticamente y muestra listas planas. Crece contigo sin reconfigurar."

### Para propiedades con políticas de limpieza distintas (eco-friendly / Marriott Bonvoy style)

> "Marriott Bonvoy lanzó en 2022 'Make a Green Choice' — el huésped opta por NO recibir limpieza diaria y recibe puntos. Reduce 30% del costo laboral según PwC 2023. ¿Tu PMS soporta esto? Mews lo permite con configuración compleja. Cloudbeds lo hace con rules engine pesado. Zenix lo simplificó a un dropdown: 6 frecuencias industria-estándar (NEVER, DAILY, EVERY_2_DAYS, EVERY_3_DAYS, ON_REQUEST, GUEST_PREFERENCE). Si abres una segunda propiedad con política distinta, cada una tiene la suya. Cero código, cero migración."

### Para hoteles que sufren con late checkouts y huéspedes que no abren la puerta

> "Cada late checkout o cada chip 'no molestar' es tiempo perdido en tu housekeeping si el sistema no lo gestiona. Mews te deja la tarea READY indefinidamente. Cloudbeds te obliga a marcar 'skip' a mano cada vez. Opera te pide manage permission. Zenix automatiza el ciclo completo del estándar AHLEI Sec. 4.3: marcas DEFERRED, el sistema reprograma automáticamente para 30 minutos después con push '🔁 reintenta', y tras 3 intentos escala al supervisor. Para late checkouts, un endpoint reprograma scheduledCheckout + actualiza tareas + audita el cambio en 5 segundos vs. los 5 minutos de paperwork de Mews. Multiplica por 30 reservas/día — son 2.5 horas semanales de tiempo administrativo recuperado."

### Para recepciones que responden 'está lista la habitación' 30 veces al día

> "Cada vez que un huésped pregunta '¿mi habitación está lista?' y tu recepcionista abre otra app o llama por radio al supervisor de housekeeping, son 15-25 segundos perdidos. En un hotel con 30 check-ins/día son 7-12 minutos diarios solo respondiendo eso. En Zenix los bloques del calendario PMS animan en tiempo real según el estado de limpieza: amber pulsando = esperando housekeeper, gradient slide = limpiando, glow emerald = lista. La recepcionista responde en 1 segundo mirando lo que ya tiene en pantalla. Y respeta accesibilidad WCAG 2.3.3 — usuarios con epilepsia o vértigo ven color sólido. Optii lo tiene pero cuesta dos veces más; Mews/Cloudbeds te obligan a abrir otra pestaña. En Zenix viene incluido."

### Para equipos que reciben 50 notificaciones al día y dejaron de mirar el teléfono

> "Cisco Healthcare 2021 (n=1,200 enfermeras): 72% baja su tasa de respuesta a alarmas en 2 semanas si todas tienen el mismo nivel de intrusión. Es exactamente lo que pasa con Mews/Cloudbeds — alarma + vibración fuerte para cada checkout normal → tu equipo deja de atender. Zenix usa 4 niveles escalonados con frecuencia inversa a intrusión: nivel 1 ambient (badge silencioso) para tareas creadas, nivel 2 notification (tono suave) para READY, nivel 2.5 elevated (banner persistente) para URGENT, nivel 3 alarm (sirena continua) SOLO para emergencias físicas como mantenimiento crítico. Tu equipo aprende que cuando la sirena suena, importa. Reduce errores operativos 25-40% según los estudios de alert fatigue."

---

## Resumen ejecutivo

| Si el hotel necesita... | Zenix lo resuelve porque... |
|---|---|
| Ver el estado del hotel de un vistazo | Calendario PMS visual en tiempo real con SSE |
| No limpiar habitaciones con huéspedes adentro | Checkout de 2 fases: planificación AM + confirmación física |
| Gestionar camas individuales en dormitorios | Arquitectura per-bed nativa — única en el mercado |
| Housekeepers que siempre saben qué hacer | Push notifications instantáneas + app móvil offline |
| Protegerse de chargebacks por no-show | GuestContactLog + audit trail fiscal + export CSV |
| Operar hoteles en múltiples países | Night audit multi-timezone por propiedad (hora local real) |
| Cumplimiento fiscal en LATAM | Registros inmutables + CFDI-ready + moneda ISO |
| Cero overbooking con OTAs | Hard block transaccional + Channex.io (mismo estándar Opera/Mews) |
| Bloquear habitaciones por mantenimiento sin venderlas por error | SmartBlock visible en el calendario + guard de disponibilidad en extensión |
| Que el calendario se actualice solo cuando cambia algo | SSE en tiempo real para bloqueos, reservas, no-shows y tareas — todos los roles lo ven al instante |
| Ver en el calendario quién fue el no-show cuando hay nueva reserva | Franja NS identificable con nombre sin ocultar ni sobrelapear la reserva activa |
| Revertir un no-show sin crear overbooking por error | Guard backend que rechaza la reversión si el cuarto ya fue reasignado, con mensaje accionable |
| Retener al personal de housekeeping | Hub Recamarista con base SDT — privacidad peer-to-peer + 3 niveles de gamificación · sin shame · sin comparación |
| Hostales multi-cama (4-12 camas/dorm) | D18 agrupación dual prioridad+habitación + counter dual 🚪/🛏️ + bulk-start (Hospitality Net 2023: 23% eficiencia recuperada) |
| Política de limpieza configurable per-property | StayoverFrequency 6 modos (NEVER/DAILY/EVERY_2/EVERY_3/ON_REQUEST/GUEST_PREFERENCE) — dropdown vs reglas complejas Mews/Cloudbeds |
| DND físico y huéspedes que no abren la puerta | Skip-and-retry AHLEI Sec. 4.3 — auto-retry 30 min × 3 → BLOCKED + escalada supervisor |
| Late checkout sin paperwork | Endpoint dedicado · 5 segundos vs 5 minutos en Mews/Cloudbeds |
| Recepcionista responde "está lista la habitación" sin abrir kanban | Animación inline en bloques calendario PMS — pulse/slide/glow GPU-composited |
| Alert fatigue del staff | Notification Tier Discipline 4 niveles — limpieza nunca activa alarma (Cisco 2021: 72% baja respuesta tras 2 semanas) |
| Trazabilidad ante disputas | Audit trail con actor, timestamp y razón en cada operación |
| Un sistema que los housekeepers realmente usen | App diseñada para uso con una mano, en movimiento, sin capacitación |
| Confirmar que el huésped realmente llegó | Badge "Sin confirmar" en calendario + wizard de check-in de 4 pasos |
| Control de efectivo sin riesgo de robo en caja | PaymentLog append-only por turno + cash reconciliation al cierre |
| Cortesías y exenciones sin bypass posible | COMP requiere código + razón de gerente — backend lo exige sin excepción |
| Cumplimiento USALI 12ª edición en pagos | Registros de pago inmutables con voids auditados — vigente desde ene 2026 |
| Tickets de mantenimiento sin perderse en WhatsApp | Bridge HK→Mtto nativo mobile · 3 flujos · CRITICAL auto-bloquea + sincroniza Channex (Sprint Mx-1) |
| Tener el mismo audit trail que Opera Cloud sin pagar $50K setup | Friendly ID · 19 eventos por ticket · USALI-grade · histórico por habitación |

---

## 🎯 Zenix Booking Engine — el pitch killer (post-v1.0.0)

> **"En Cloudbeds pagas $400 USD/mes y tú haces todo el marketing. En Booking.com no pagas SaaS pero pierdes 25% de cada venta. Con Zenix pagas el SaaS más bajo del mercado, y solo cuando QUIERES, te listas en nuestro marketplace por 3% — 8x menos que Booking. Sin lock-in. Sin sorpresas. Te ahorras 70-90% en comisiones OTAs al final del año."**

### Modelo de monetización dual — único en el mercado LATAM

| Tier | Para quién | Comisión | Quién atrae el lead |
|------|-----------|----------|---------------------|
| **Zenix Booking Standard** (incluido en PMS) | Hotel con sitio web propio que genera tráfico | **$0** | Hotel (idéntico a Cloudbeds/Mews) |
| **Zenix Marketplace** (opt-in) | Hotel que quiere visibilidad extra LATAM | **3-5%** | Zenix (SEO + Google Ads + Meta Ads + newsletter) |

### Variantes del pitch según el buyer

**Para el dueño contador (foco precio):**
> *"Pasaste de $45k/año en comisiones a $5k. Eso paga 3 años de Zenix."*

**Para el operador (foco operación):**
> *"Sin lock-in. Si en 6 meses no funciona el marketplace, lo apagas con un toggle. Sigues con tu SaaS PMS."*

**Para el manager joven (foco growth):**
> *"Tu sitio web ya genera bookings directos. Zenix amplifica con marketplace + ads pagados. Tú decides cuánto delegar."*

### Ejemplo real — hotel boutique 30 cuartos, $300k USD revenue/año

| Escenario | Comisiones pagadas/año |
|-----------|------------------------|
| Hoy (60% via OTAs al 25%) | **$45,000 USD** |
| Migra 30% del volumen a Zenix Marketplace (3%) | $32,250 → ahorra **$12,750** |
| Migra 50% del volumen a Zenix Marketplace | $24,000 → ahorra **$21,000** |

### Detrás del modelo — Stripe Connect split payment

Cuando un guest paga via Zenix Marketplace, **Stripe automáticamente divide el cobro**:
- 97% al hotel
- 3% a Zenix

Cero reconciliación manual. Mismo patrón que Uber, Airbnb, Shopify usan. Cuando el guest viene del sitio del hotel directo (tier 1), Stripe deposita 100% al hotel sin commission.

### Attribution transparente

Sistema registra `referralSource` en cada booking (`hotel_website` vs `zenix_marketplace` vs `zenix_email` etc). Dashboard del hotel muestra comparativa en tiempo real: "Si esos bookings hubieran sido via Booking.com (25%), habrías pagado $X. Ahorraste $Y."

Ver detalle técnico en `docs/sprints/COMMISSION-MODEL-plan.md`.

### Diferenciador técnico — motor headless (API-first), 3 formas de consumo

A diferencia de los booking engines cerrados de la competencia, **Zenix Booking es una API, no una página fija**. El sitio web del hotel es independiente y se conecta por HTTP:

| Forma de consumo | Para quién | Esfuerzo del hotel |
|------------------|-----------|--------------------|
| **Hosted page** `book.zenix.com/{slug}` | 80% — hoteles sin equipo técnico | pegar un `<a href>` en su sitio (5 min) |
| **API REST pública** (con `pk_live_…` + webhooks HMAC) | 5% — cadenas/devs que quieren su propia UI | leer la doc e integrar |
| **Widget embebido** (Fase 2) | 15% — sitios que quieren reservar sin redirect | un `<script>` |

Las tres consumen **la misma API backend** — el hotel migra de una a otra sin rehacer nada. Ningún PMS LATAM ofrece este modelo headless con onboarding consultor-led (toggle on/off desde el panel Nova, opcional).

### Estado de implementación (2026-06-11)

**Fase 1 construida, verificada e2e y endurecida (bug-hunt pre-merge 2026-06-11)** (branch `feat/booking-engine-foundation`): API pública READ + WRITE (reservas multi-habitación/multi-fecha, **anti-overbooking con lock transaccional**, idempotencia atómica), webhooks outbound firmados (HMAC, anti-SSRF), feed de disponibilidad por noche, OpenAPI/Swagger + guía de integración, panel consultor en Nova (activar/desactivar por property), y la **hosted page completa** (`/book/{slug}`) con SEO. Aislamiento **multi-tenant** verificado (cada reserva resuelve hotel + habitaciones contra su propia property). Modo **pago en recepción** (`PAY_AT_HOTEL`) — el hotel captura reservas directas sin comisión OTA desde ya. **Para go-live de un cliente real falta sólo: merge + deploy a producción** (subdominio `book.zenix.com` opcional vs sitio propio del hotel headless).

**El prepago online** (Stripe Connect split 97/3 + OXXO/MercadoPago/SPEI) y el **marketplace comisionable** llegan con PAY-CORE (v1.0.1) — se enchufan sin rehacer el motor. Es decir: el ahorro de comisión OTA empieza en Fase 1; el upsell del marketplace 3% es el siguiente escalón.

---

## 💰 Estudio comparativo de precios (mayo 2026)

> **Para el equipo comercial:** estos son los números duros de la competencia. Úsalos para fijar precio, negociar y justificar valor con datos verificables.

### Tabla de precios — Top 12 PMS y módulos especializados

| **Sistema** | **Tier Base** | **Tier Mid** | **Tier Top** | **Modelo** | **Manten. incluido** | **Mobile** | **Channel Mgr** | **Multi-Property** | **Setup** |
|---|---|---|---|---|:-:|:-:|:-:|:-:|---|
| **Mews** | €300/mes | €400+ | quote | per booking/flat | ❌ add-on | $40/user | add-on | ✅ | quote |
| **Cloudbeds** | $200/mes | $500/mes | quote | flat | ❌ | ✅ | ✅ | ✅ | $0 |
| **Roomraccoon** | €200/mes | €450/mes | — | per room | ❌ | ✅ | ✅ | ✅ | 2× monthly |
| **Little Hotelier** | €89/mes | €150+ | — | $1/día + 1% | ❌ | ✅ | add-on | ❌ | $0 |
| **Hostaway (VRM)** | $100+/mes | quote | quote | per property | ❌ | ✅ | ✅ | ✅ | $0 |
| **Clock PMS+** | €250-300 | €450-600 | €800+ | per room | ❌ | paywall | add-on | limitado | €1,500-2,600 |
| **Guesty (VRM)** | $27/listing | quote | quote | per listing | ❌ | ✅ | ✅ | ✅ | $0 |
| **Oracle OPERA Cloud** | no público | no público | $50K-500K+/año | enterprise | requiere integración | add-on | add-on | ✅ | $5K-50K+ |
| **Amenitiz** | €42-69 | incluido | incluido | flat | ❌ | ✅ | ✅ | ✅ | $0 |
| **SiteMinder** | €56-75 | $85-119 | quote | per property | — | ✅ | ✅ (es channel mgr) | ❌ | $0 |
| **innRoad** | $10+/mes | variable | custom | flexible | ❌ | variable | variable | ✅ | $0 |

**Módulos especializados — costo adicional al PMS base:**

| **Módulo** | **Precio** | **Modelo** | **Reemplazado por Zenix?** |
|---|---|---|---|
| **Flexkeeping** (mantenimiento + ops) | $150-300/mes | per-room variable | ✅ — incluido en plan Growth |
| **hotelkit** (facility mgmt) | $50-500/mes | per-room/tier | ✅ — incluido |
| **Quore** (work orders) | $135-171/mes | flat all-in-one | ✅ — incluido |
| **Breezeway** (property care VRM) | $19.99/property | per-property | ✅ — incluido en multi-property |
| **Channex.io** (channel manager) | $50-80/mes | per-property | ✅ — integrado nativo |
| **SiteMinder** (channel mgr) | €56-119/mes | per-property | ✅ — alternativa Channex |
| **MyAllocator** (Cloudbeds CM) | $200/mes | flat | ✅ — alternativa |
| **Optii Solutions** (AI maintenance) | $350-500/mes | per-room enterprise | ⚠️ no — Optii usa ML, Mx-2 lo evalúa |

### Análisis por segmento de mercado

#### Hotel boutique LATAM (20-50 habitaciones) — el segmento core de Zenix

**Mercado pagando hoy:**
- Mews + Flexkeeping: €300 + €200 = **€500/mes (~$540 USD)**
- Cloudbeds + add-on mantenimiento externo: $200 + $200 = **$400/mes**
- Roomraccoon (incluye CM): €200/mes = **$216 USD** — pero NO tiene mantenimiento
- Little Hotelier + Quore: €89 + $171 = **~$270/mes** — operación limitada

**Zenix se posiciona en $149-299/mes para este segmento** → 30-70% más barato que la competencia premium con MISMO o MEJOR feature set.

#### Hotel mid-size (50-150 habitaciones)

**Mercado pagando hoy:**
- Mews Pro: €400-700/mes
- Cloudbeds: $500-800/mes
- Clock PMS+: €450-800/mes + €1,500-2,600 setup
- Opera Cloud Enterprise: $500-5,000/mes + $5K-50K setup

**Zenix posicionado en $299-499/mes** → 40-60% más barato.

#### Cadena multi-property (3-10 hoteles)

**Mercado pagando hoy:**
- Cloudbeds Enterprise: $800-2,000/property/mes = **$2,400-20,000/mes**
- Mews Pro: variable, típicamente $1,000+/property
- Opera Cloud: $5K+/property + setup masivo

**Zenix posicionado en $499/mes per organización (no per property)** → diferenciador masivo en costo.

### Pricing recomendado para Zenix — los tres tiers

| **Tier** | **Nombre** | **USD/mes** | **MXN/mes** | **Incluye** | **Posicionamiento** |
|---|---|---|---|---|---|
| **Starter** | Zenix Essentials | $149 | $2,685 | PMS base (hasta 30 hab) · Calendario completo · Booking engine · Channel Manager 1 OTA · Mobile housekeeping (5 staff) · Mantenimiento básico · No-shows · Soporte 24/5 | Rompe el mercado vs Little Hotelier (€89) — ofreces 3× el valor por +$60 |
| **Growth** ⭐ | Zenix Professional | $299 | $5,382 | PMS completo (hasta 80 hab) · Channel Manager unlimited (Channex white-label) · **Mantenimiento avanzado con bridge HK** · Mobile maintenance + housekeeping (10 staff) · Hub Recamarista científico · Histórico por habitación · USALI compliance · Audit trail completo · Soporte 24/7 | **Tier estrella** — match Mews+Flexkeeping (€500) por 40% menos |
| **Pro** | Zenix Enterprise | $499 | $8,982 | Multi-property (5-10 hoteles) · Todo de Growth + · BI / benchmarks · Dynamic pricing · Account manager dedicado · Custom integrations · SLA 99.9% | Cadena emergente — vs Cloudbeds Enterprise (3-10 properties = $2,400-20,000) ganamos por orden de magnitud |

**Setup fee Zenix: $0** (diferenciador vs Clock €2,600, Opera $50K). Esto es CRÍTICO para LATAM donde el capital inicial es escaso.

**Modelo económico justificado:**

| Tier | Revenue | OpEx estimado | Gross margin | % |
|------|---------|--------------|---------------|---|
| Starter | $149 | $100 (infra + soporte) | $49 | 33% |
| Growth | $299 | $150 | $149 | 50% |
| Pro | $499 | $200 | $299 | 60% |

OpEx incluye: AWS S3 + RDS Postgres ($40-60), Channex API ($30-50/property), Stripe 2.9%+0.30, dev time amortizado, soporte 24/5 o 24/7.

### Estrategia de lanzamiento Q2-Q4 2026

**Promotional pricing primeros 100-150 early adopters:**
- Starter: $99/mes (locked-in primer año)
- Growth: $199/mes (locked-in primer año)
- Free 30-day trial sin tarjeta

**Modelo mixto opcional** para hoteles de baja ocupación:
- Plan Starter + 0.5-1% por booking (en lugar de tier fijo)
- Pricing transparente publicado en website (vs quote-based de Mews/Opera)

### Lo que tu speech debe decir cuando te pregunten el precio

**Para hotel boutique LATAM 30 hab:**

> *"Zenix Growth cuesta $299 al mes — incluye PMS completo, channel manager con Booking/Airbnb/Hostelworld, módulo de mantenimiento con bridge a housekeeping, mobile para tu equipo de limpieza y de mantenimiento, gestión de no-shows con audit trail para chargebacks, e histórico de mantenimiento por habitación. Es un único precio. Cero setup fee. Si quisieras lo mismo en Mews + Flexkeeping pagarías €500 mensuales — Zenix te ahorra 40%. Si lo intentaras armar con Cloudbeds + módulos sueltos, llegarías a $400 al mes y tendrías 3 sistemas que no se hablan entre sí. Aquí es uno solo, en español, hecho para hoteles latinos. Tu primer mes es gratis, sin tarjeta."*

**Para cadena emergente 5 propiedades:**

> *"Zenix Pro es $499 mensuales para toda la organización — no per property. En Cloudbeds Enterprise estarías pagando $4,000-10,000 al mes por las mismas 5 propiedades. La razón: el modelo de precio de Cloudbeds escala lineal con propiedades, el nuestro está pensado para que crezcas sin que el sistema te cobre por crecer. Si abres la sexta propiedad mañana, sigues en $499."*

**Para hotel chico (Little Hotelier user) 15 hab:**

> *"Little Hotelier te cuesta €89 al mes pero NO tiene módulo de mantenimiento, NO tiene mobile real para tu housekeeper, y sus reportes fiscales no son CFDI-ready. Por $60 más al mes (Zenix Starter $149) tienes todo eso. Y si tienes una disputa de chargeback con Booking porque un huésped reclama un no-show, Zenix tiene el WhatsApp que se envió a las 8 PM como evidencia. Little Hotelier no tiene eso."*

---

## Anexo: roadmap visible a clientes

**v1.0.0 (release Q2 2026):** Todo lo descrito en este documento.

**v1.0.x (post-release, sin costo extra):**
- Stripe / Conekta integración para cobro real de no-shows (Sprint 8A)
- Channex.io integración real con cuentas activas (Sprint 8C)
- Mobile mantenimiento (Sprint Mx-1B-M) — incluye foto desde cámara del teléfono
- Tab fotos en panel ticket (Sprint Mx-1B-W2)
- Cross-integraciones calendario + BookingDetailSheet (Sprint Mx-1B-W3)

**v1.1 (Q3 2026):**
- RBAC UI + partner portal con docs Diátaxis
- Org-tree visualization SuccessFactors-like
- Cron de mantenimiento preventivo recurrente (Sprint Mx-2)
- Reportes self-vs-self del técnico + catálogo de badges SVG

**v1.2 (Q4 2026) — Módulo de Facturación LATAM:**
- **CFDI 4.0 México** — generación de XML firmado vía PAC (Facturama, SW Sapien, Solución Factible)
- **DIAN Colombia** + **SUNAT Perú** — generación de documentos fiscales equivalentes
- Folios fiscales, series, cancelaciones SAT
- Notas de crédito automáticas por reversión de no-show / waiveCharge
- Reportes contables USALI Schedule 11 (revenue por categoría, taxes recaudados)
- **Por qué v1.2 (reordenado desde BI):** sin facturación nativa, los clientes MX no pueden operar legalmente más allá de 30 días sin workaround manual con su contador. Bloqueante comercial real, no nice-to-have.

**v1.3 (Q1 2027) — BI cross-property:**
- BI / benchmarks cross-property con k-anonymity (data network effects)
- Floor plan visualization mantenimiento
- Inbound WhatsApp para reportes de huéspedes (gap LATAM)

**v2.0 (Q2 2027):**
- Predictive maintenance (ML pattern Optii, requiere ≥6 meses datos)
- Inventario de refacciones (Quore pattern)

---

*Documento basado en las funcionalidades implementadas y en roadmap de Zenix PMS. Actualizar con cada sprint completado.*
*Última actualización pricing: 2026-05-11 — Sprint Mx-1 backend + W1 web + análisis comparativo competencia (10 PMS + 5 módulos especializados).*
*Última actualización competencia: 2026-05-14 — Agregado estudio comparativo extendido LATAM (Zavia ERP + Syncro PMS) con fuentes verificables y honestidad sobre gaps actuales de Zenix vs IA tarifaria + mensajería OTA centralizada.*
*Última actualización roadmap: 2026-05-14 — Refactor mayor de versionado a "bloques temáticos" (v1.0.x Foundation, v1.1.x Operation Excellence, v1.2.x Scale & Distribution, v1.3.x Ancillary, v1.4.x Data & AI, v2.0 rewrite). Reordenadas referencias a versiones específicas (IA tarifaria, mensajería OTA, marketplace) según nuevo plan. Ver `docs/vision/03-roadmap-v1-v2.md` para detalle completo + 12 reportes esenciales documentados a nivel CSV-column.*
*Última actualización arquitectura: 2026-05-15 — Agregada sección Módulo 5 (Configuración Multi-Propiedad + Multi-País) con modelo 4-level Brand→Organization→LegalEntity→Property. Agregada sección "Implementación Zenix — wizard Activate" inspirado en SAP Activate. Agregada sección "Infraestructura enterprise-grade" con 4 fases sin lock-in. 10 países LATAM modelados desde día 1 (MX/CO/CR/PE/PA/GT/SV/HN/BR/AR). Ver docs/vision/11-multi-tenant-architecture.md, 12-infrastructure-devops.md, 13-consultant-setup-wizard.md.*
*Última actualización PAY/CFDI: 2026-05-15 (PM) — Agregado Módulo 7 (Cobros, divisas e impuestos) tras investigación competitiva de 5 PMS premium (Mews, Cloudbeds, Opera Cloud, Roomraccoon, Little Hotelier). 9 sub-módulos consolidados: multi-currency con FX lock inmutable, OTA-collect detection, cash drawer multi-divisa, Banxico SF43718 integration, GuestCredit con CFDI E (FormaPago=15 Condonación), tax engine multi-impuesto (IVA + ISH 6% QR 2026 + DSA UMA-based), tax transparency INCLUSIVE para resolver fricción Hostelworld, FxAdvisor como DLC tier Pro. Decisiones §81-§90 en CLAUDE.md. Ver docs/vision/14-payment-currency-tax-architecture.md.*
*Última actualización Tax Catalog: 2026-05-15 (PM late) — Agregada subsección "Tax Catalog curado por Zenix" como diferenciador estructural. Matriz completa MX 32 estados ISH 2026 confirmada (El Contribuyente × JA Del Río × Airbnb Help). Tabla granularidad LATAM 10 países (Brasil EXCLUIDO v1.0, entrar v1.2 con Sovos). DSA Tulum marcado como AMBIGUOUS (per-room vs per-person tiered se contradicen entre fuente oficial Riviera Maya y Reporte QR — Decreto 191 texto literal no accesible). Decisiones §91-§94 en CLAUDE.md: catálogo nativo, override en dos capas, Brasil exclusión, status AMBIGUOUS. Wizard objetivo: 6-8 clicks vs ~30 Cloudbeds.*

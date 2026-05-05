# Documentación Zenix

> **Audiencia:** developers de ZaharDev, sub-consultoras licenciadas, hoteles cliente, auditores externos.
> **Última actualización:** 2026-05-03

Zenix es el Property Management System (PMS) especializado en hotelería boutique y hostales que ZaharDev distribuye globalmente vía red de sub-consultoras licenciadas, replicando el modelo SAP PartnerEdge / IBM Business Partner.

Esta carpeta contiene la documentación canónica del producto, la arquitectura, los estándares, y la metodología consultora. Está organizada por **audiencia** siguiendo el [Diátaxis Framework](https://diataxis.fr) (Procida, 2017) y [ISO/IEC/IEEE 26515:2018](https://www.iso.org/standard/74604.html), no por feature.

---

## Mapa de Navegación

| Carpeta | Audiencia primaria | Qué contiene |
|---------|-------------------|--------------|
| [strategy/](strategy/) | ZaharDev + sub-consultoras + dirección | Visión, modelo de negocio, partner program, posicionamiento competitivo |
| [architecture/](architecture/) | Developers + arquitectos | Arquitectura técnica, RBAC, multi-tenancy, integraciones |
| [standards/](standards/) | Auditores, legal, hoteles cliente | AHLEI / HFTP / USALI, fiscal, GDPR/LGPD, accesibilidad, seguridad |
| [business-intelligence/](business-intelligence/) | ZaharDev + dirección | Data strategy, anonymization, benchmarking, modelos predictivos |
| [engineering/](engineering/) | Developers | Estándares de código, sprint methodology, quality gates |
| [consulting-playbook/](consulting-playbook/) | Sub-consultoras | Onboarding de hoteles, fases de implementación, soporte |
| [competitive-intelligence/](competitive-intelligence/) | ZaharDev + ventas | Análisis comparativo PMS, actualización trimestral |
| [research/](.) | Histórico | Investigaciones de fase MVP, preservadas tal cual |

> **Nota:** los archivos sueltos en la raíz de `docs/` (`alarm-flow-audit.md`, `research-housekeeping-hub.md`, etc.) son investigaciones de fase MVP. Se preservan por valor histórico pero no se mantienen activamente. La documentación viva está en las carpetas estructuradas.

---

## Convenciones

### Numeración
Cada archivo dentro de una carpeta tiene prefijo `NN-` que indica el orden de lectura recomendado. Patrón de [HashiCorp Learn](https://developer.hashicorp.com/) y [Kubernetes Docs](https://kubernetes.io/docs/).

### Citaciones
Toda afirmación no trivial cita fuente verificable: estándar industrial (con código), paper académico (con autor + año), framework legal, o documentación de proveedor. Ver `docs/standards/00-industry-alignment.md` para el catálogo completo.

### Idioma
- **Español** para contenido de dominio hotelero y narrativa.
- **Inglés** solo para identificadores técnicos (NestJS, Prisma, RBAC) y citas directas de fuentes en inglés.

### Audiencia explícita
Cada documento empieza con línea `> **Audiencia:** ...` clarificando quién es el lector objetivo. Esto evita que un documento técnico aterrice en manos de un partner sin contexto.

---

## Documento Maestro Operacional

Para decisiones operativas día-a-día, los desarrolladores siguen consultando [`/CLAUDE.md`](../CLAUDE.md) en la raíz del repositorio. Este archivo contiene los principios rectores no-negociables (numerados 1-46), la bitácora de funcionalidades implementadas, y la guía de retomar trabajo.

`CLAUDE.md` es la fuente de verdad operativa. La carpeta `docs/` es la fuente de verdad estratégica y consultora. Ambas se complementan; ninguna sustituye a la otra.

---

## Mantenimiento

| Documento | Frecuencia de revisión | Responsable |
|-----------|----------------------|-------------|
| `strategy/` | Trimestral | ZaharDev dirección |
| `architecture/` | Por sprint relevante | Tech Lead |
| `standards/` | Anual + cuando cambia regulación | Compliance / legal |
| `competitive-intelligence/` | Trimestral | Investigación de mercado |
| `consulting-playbook/` | Por sub-consultora onboarded | ZaharDev partner success |

Los documentos vencidos llevan badge `> ⚠️ Última revisión: YYYY-MM-DD — pendiente de actualización`.

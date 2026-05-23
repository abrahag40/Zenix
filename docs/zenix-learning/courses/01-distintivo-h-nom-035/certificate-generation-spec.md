# Curso 1 — Generador de Certificado + Endpoint /verify (especificación)

> Especificación técnica del sistema de emisión + verificación pública de certificados del Curso 1 Distintivo H + NOM-035. Componente del engine LMS (no del contenido — aplica a TODO certificado emitido por Zenix Learning).
> **Última actualización:** 2026-05-22 (Día 6 producción Fase 1.3)

---

## 0. Identidad del sistema

| Componente | Detalle |
|------------|---------|
| **Modelo de datos** | `LearningCertificate` (existente, schema en doc 04 + decisiones doc 21 §1.3) |
| **Generación** | On-demand al aprobar examen final (NO pre-generar) |
| **Formato** | PDF A4 horizontal · co-branded Hotel + Zenix Learning · QR verificable |
| **Firma criptográfica** | HMAC-SHA256 con key per-LegalEntity |
| **Verificación pública** | Endpoint `/verify/cert/:id` sin login, sin DB query (HMAC self-contained) |
| **Microinteracción al emitir** | PixiJS confetti + reveal del certificado |
| **Roadmap fases** | ZENIX_INTERNAL (Fase 1.3) → STPS_DC3 (post-ACE Fase 1.0.5+) → AHLEI_ALIGNED (Fase 2 marketplace) |

---

## 1. Por qué este sistema es del engine, NO del contenido

> Mismo razonamiento que el Quiz Randomization Standard (doc 21 §1.1.bis): centralizar en engine garantiza estándar universal.

Si dejáramos generación de certificados al creador del curso:
- Cursos producidos por Zenix tendrían un formato; AHLEI partners otro; marketplace v1.5+ otro distinto
- Imposibilidad de verificar autenticidad cross-source (cada uno con su esquema de firma)
- Vulnerabilidad a falsificación (un curso mal hecho con HMAC débil compromete la integridad del sistema)
- El endpoint público `/verify/cert/:id` no podría ser uno solo

Centralizar en el `CertificateGeneratorService` del engine garantiza:
- **Formato visual consistente** — todo certificado Zenix Learning se reconoce al primer vistazo
- **Misma seguridad criptográfica** — HMAC-SHA256 estándar industria, key per-LegalEntity rotable
- **Mismo endpoint de verificación** — `verify.zenix.com/cert/:id` para 100% de los certificados
- **Mismo audit trail** — `LearningCertificate` append-only + log de revocaciones

---

## 2. Datos contenidos en el certificado

### 2.1 Información obligatoria

| Campo | Origen | Visibilidad PDF | Visibilidad `/verify` |
|-------|--------|------------------|------------------------|
| Nombre completo del aprendiz | `Staff.fullName` | ✅ Grande | ✅ |
| Hotel emisor (LegalEntity) | `LegalEntity.commercialName` | ✅ Logo + texto | ✅ |
| Curso completado | `LearningCourseVersion.title` | ✅ Grande | ✅ |
| Versión específica del curso | `LearningCourseVersion.version` | ✅ Pequeño (footer) | ✅ |
| Fecha de emisión | `LearningCertificate.issuedAt` | ✅ | ✅ |
| Vigencia hasta | `LearningCertificate.expiresAt` | ✅ (si aplica, ej. DH 12 meses) | ✅ |
| Score obtenido | `LearningQuizAttempt.score` | ✅ Solo si ≥85% (mención "honores") | ❌ (privacidad) |
| ID verificable único | `LearningCertificate.publicId` | ✅ Footer + QR | ✅ |
| Estándares alineados | `LearningCourse.alignedStandards` | ✅ Texto descriptivo | ✅ |
| Tipo de certificado | `LearningCertificate.type` | ✅ Badge (ZENIX_INTERNAL / STPS_DC3 / AHLEI_ALIGNED) | ✅ |

### 2.2 Información sensible — NO incluir

| ❌ NO incluir | Razón |
|---------------|-------|
| Email / teléfono del aprendiz | GDPR/LFPDPPP — no compartir datos contacto |
| Número de empleado / nómina | No tiene valor verificación, sí riesgo doxxing |
| Score exacto si <85% | Privacidad — el aprendiz aprobó, no necesita exponer score bajo |
| Fecha de nacimiento del aprendiz | No tiene relevancia para certificado profesional |
| RFC / CURP / documento ID | Sensible — no debe estar en PDF público con QR escaneable |
| Foto del aprendiz | Privacidad — opcional con consentimiento explícito Fase 2+ |
| Datos del hotel sensibles (RFC LegalEntity, dirección fiscal) | Comercial — usar nombre comercial, no datos fiscales |

---

## 3. Plantilla visual del PDF

### 3.1 Layout A4 horizontal (297 × 210 mm)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  [Logo Hotel · 60×40mm]              [Logo Zenix Learning · 60×40mm] │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────   │
│                                                                       │
│              COMPROBANTE DE APROBACIÓN                                │
│            (Internal Certificate of Completion)                       │
│                                                                       │
│  Otorgado a:                                                          │
│                                                                       │
│              [ NOMBRE DEL APRENDIZ — 28pt bold ]                     │
│                                                                       │
│  Por haber completado satisfactoriamente el curso:                    │
│                                                                       │
│              Distintivo H + NOM-035-STPS                              │
│              (Combo Compliance México)                                │
│                                                                       │
│  Aprobado el: 12 de mayo de 2026                                      │
│  Vigencia: hasta el 12 de mayo de 2027 (12 meses)                     │
│  [si score ≥85%:] Con mención de honores (score: 91%)                │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────   │
│                                                                       │
│  Alineado a:                                                          │
│  • NMX-F-605-NORMEX-2018 (SECTUR — Distintivo H)                     │
│  • NOM-035-STPS-2018 (STPS — Factores de Riesgo Psicosocial)         │
│  • Codex Alimentarius CAC/RCP 1-1969 (FAO/OMS)                       │
│                                                                       │
│  [Badge: ZENIX_INTERNAL] o [Badge: STPS_DC3 OFICIAL] (futuro)        │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────   │
│                                                                       │
│  ID: ZL-DH-2026-A8F4-9D2E              [QR · 30×30mm]                │
│  Verificable en: verify.zenix.com/cert/ZL-DH-2026-A8F4-9D2E          │
│                                                                       │
│  Curso versión: 2026.05.1 · Emitido por Zenix Learning               │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Tipografía

| Elemento | Familia | Tamaño | Peso |
|----------|---------|--------|------|
| Título "COMPROBANTE DE APROBACIÓN" | Inter | 24pt | Bold |
| Subtítulo en inglés | Inter | 14pt | Regular |
| Nombre del aprendiz | Inter | 28pt | Bold |
| Nombre del curso | Inter | 20pt | Semibold |
| Texto cuerpo | Inter | 12pt | Regular |
| Footer + ID | Inter Mono | 10pt | Regular |

### 3.3 Paleta de colores (alineada con identidad Zenix)

| Uso | Color hex |
|-----|-----------|
| Fondo | `#FFFFFF` blanco puro |
| Texto principal | `#0F172A` slate-900 |
| Texto secundario | `#475569` slate-600 |
| Acento Zenix | `#10B981` emerald-500 |
| Líneas divisorias | `#E5E7EB` gray-200 |
| QR | `#000000` negro sobre `#FFFFFF` |

### 3.4 Reglas de branding

> Decisión 2026-05-22: el certificado es **CO-branded balanced**, NO Zenix-dominant.

| Regla | Detalle |
|-------|---------|
| **Logos del mismo tamaño** | Hotel y Zenix ambos 60×40mm en esquinas superiores opuestas |
| **El emisor formal es el HOTEL**, NO Zenix Learning | "Hotel X otorga este comprobante" (Zenix es la plataforma) |
| **Zenix aparece como "Emitido por Zenix Learning"** en footer, no header | Pattern Coursera: el emisor es la universidad, Coursera es plataforma |
| **Sin slogans de marketing Zenix en el certificado** | Es documento profesional, no advertising |
| **Hotel puede customizar:** colores secundarios + texto adicional opcional | Hasta 100 caracteres extra (ej: "Reconocimiento adicional del Hotel...") |
| **Hotel NO puede:** quitar logo Zenix, alterar QR, modificar firma criptográfica | La integridad del sistema requiere consistencia |

---

## 4. Generación on-demand (NO pre-generar)

### 4.1 Trigger

```typescript
// Trigger: cuando LearningQuizAttempt.passed = true en quiz kind=FINAL

@OnEvent('learning.final-exam.passed')
async onFinalExamPassed(payload: { attemptId: string }) {
  const attempt = await this.prisma.learningQuizAttempt.findUnique({
    where: { id: payload.attemptId },
    include: { enrollment: { include: { staff: true, courseVersion: true } } }
  });
  
  // Crea LearningCertificate row (append-only, §95 paridad)
  const cert = await this.certificateService.issueCertificate({
    enrollmentId: attempt.enrollment.id,
    courseVersionId: attempt.enrollment.courseVersionId,
    staffId: attempt.enrollment.staffId,
    legalEntityId: attempt.enrollment.staff.legalEntityId,
    type: 'ZENIX_INTERNAL', // Fase 1.3. Fase 1.0.5+: STPS_DC3 si ACE registrado
    score: attempt.score,
    issuedAt: new Date(),
    expiresAt: this.calculateExpiration(attempt.enrollment.courseVersion),
  });
  
  // El PDF NO se genera ahora — se genera ON-DEMAND cuando el cliente lo solicita
  // Esto evita generar miles de PDFs que nadie descarga
  
  // Notif al aprendiz
  await this.notificationService.sendPush({
    staffId: attempt.enrollment.staffId,
    title: '¡Felicidades, aprobaste!',
    body: 'Tu certificado está listo. Tócalo para verlo.',
    data: { certificateId: cert.publicId }
  });
  
  // SSE para web (real-time reveal con confetti PixiJS)
  this.eventEmitter.emit('learning.certificate.issued', {
    staffId: attempt.enrollment.staffId,
    certificateId: cert.publicId
  });
}
```

### 4.2 Generación PDF on-demand

```typescript
// GET /v1/learning/certificates/:publicId/pdf

@Get(':publicId/pdf')
async getCertificatePdf(
  @Param('publicId') publicId: string,
  @CurrentUser() actor: JwtPayload | null  // public access OK
): Promise<StreamableFile> {
  const cert = await this.prisma.learningCertificate.findUnique({
    where: { publicId },
    include: { staff: true, legalEntity: true, courseVersion: { include: { course: true }} }
  });
  
  if (!cert) throw new NotFoundException('CERTIFICATE_NOT_FOUND');
  if (cert.revokedAt) throw new ForbiddenException('CERTIFICATE_REVOKED');
  
  // Generación on-demand con @react-pdf/renderer (web) o headless Chromium
  const pdfBuffer = await this.certificatePdfRenderer.render({
    template: 'standard-co-branded',
    data: {
      learnerName: cert.staff.fullName,
      hotelName: cert.legalEntity.commercialName,
      hotelLogoUrl: cert.legalEntity.logoUrl,
      courseTitle: cert.courseVersion.course.title,
      courseVersion: cert.courseVersion.version,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
      score: cert.score >= 0.85 ? cert.score : null, // solo mostrar si honores
      certType: cert.type,
      publicId: cert.publicId,
      verifyUrl: `https://verify.zenix.com/cert/${cert.publicId}`,
      qrCodeDataUrl: await this.generateQrCode(`https://verify.zenix.com/cert/${cert.publicId}`),
      alignedStandards: cert.courseVersion.course.alignedStandards,
    }
  });
  
  return new StreamableFile(pdfBuffer, {
    type: 'application/pdf',
    disposition: `inline; filename="ZenixLearning_${cert.publicId}.pdf"`,
  });
}
```

### 4.3 Por qué on-demand (no pre-generar)

- **80% de certificados nunca se descargan** (data benchmark Coursera 2022)
- Pre-generar 10,000 certificados = 5GB+ de PDFs en R2/S3 sin uso
- Generación on-demand <500ms en Render (latencia aceptable para UX)
- Permite ajustes a la plantilla sin re-generar histórico (lo último válido siempre se ve)
- Reduce costo storage + bandwidth significativamente

---

## 5. Sistema de firma criptográfica HMAC-SHA256

### 5.1 Por qué HMAC y no PKI / blockchain

| Opción | Pro | Contra | Decisión Fase 1.3 |
|--------|-----|--------|---------------------|
| **HMAC-SHA256 con key per-LegalEntity** | Simple, rápido (μs), verificable offline sin DB | Key compartida (no es prueba de no-repudio) | ✅ **Elegido** |
| **PKI con certificado X.509** | Prueba de no-repudio + cadena de confianza | Requiere CA + complejidad operativa | ⚠️ Fase 2+ enterprise |
| **Blockchain (Ethereum, etc.)** | Inmutable + público | Gas fees + complejidad + sobre-ingeniería para hostería | ❌ Anti-patrón v2.0+ |
| **Firma digital STPS (CFDI-style)** | Reconocimiento legal | Requiere ser ACE registrado | ✅ Fase 1.0.5+ post-ACE |

### 5.2 Estructura del payload firmado

```typescript
// El "publicId" del certificado contiene 2 partes:
// publicId = <DATA>.<SIGNATURE>
// 
// DATA: base64url-encoded JSON con datos críticos
// SIGNATURE: HMAC-SHA256(DATA, secretKeyPerLegalEntity).slice(0, 16)

interface CertificateSignedPayload {
  v: 1;                          // versión del esquema (futuro-safe)
  ce: string;                    // certificate entity id (interno DB)
  st: string;                    // staff id (interno DB)
  le: string;                    // legal entity id (para resolver key)
  cv: string;                    // course version id
  ia: number;                    // issued at unix timestamp
  ea: number | null;             // expires at unix timestamp
  sc: number | null;             // score (si ≥85%, sino null para privacidad)
  tp: 'ZI' | 'DC3' | 'AHL';      // type (ZENIX_INTERNAL / STPS_DC3 / AHLEI_ALIGNED)
}

// Ejemplo de publicId resultante (~80 caracteres):
// eyJ2IjoxLCJjZSI6IjAxSEY...fXr3kKQ.a1b2c3d4e5f6g7h8

// Friendly format para mostrar en UI:
// ZL-DH-2026-A8F4-9D2E (los primeros 8 chars del hash de la signature)
```

### 5.3 Rotación de keys

```
- 1 key por LegalEntity, almacenada en `LegalEntity.certSigningKey` (encrypted at rest)
- Rotación recomendada: cada 12 meses
- Migración a key nueva: nuevos certificados firmados con key v2; certificados antiguos siguen verificándose con key v1 (kid en payload identifica versión)
- Pattern JWK Set: array de keys activas, identificada por `kid` (key id)
```

### 5.4 Servicio de firma

```typescript
@Injectable()
export class CertificateSigningService {
  async sign(payload: CertificateSignedPayload, legalEntityId: string): Promise<string> {
    const key = await this.getActiveKey(legalEntityId);
    
    const dataB64 = base64url.encode(JSON.stringify(payload));
    const signature = createHmac('sha256', key.secret)
      .update(dataB64)
      .digest('base64url')
      .slice(0, 22); // 22 chars suficiente para 128-bit security
    
    return `${dataB64}.${signature}.${key.kid}`;
  }
  
  async verify(publicId: string): Promise<CertificateSignedPayload | null> {
    const [dataB64, signature, kid] = publicId.split('.');
    
    if (!dataB64 || !signature || !kid) return null;
    
    const payload: CertificateSignedPayload = JSON.parse(base64url.decode(dataB64));
    const key = await this.getKeyById(kid, payload.le);
    
    const expectedSignature = createHmac('sha256', key.secret)
      .update(dataB64)
      .digest('base64url')
      .slice(0, 22);
    
    // Constant-time comparison (anti-timing attack)
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }
    
    return payload;
  }
}
```

---

## 6. Endpoint público de verificación

### 6.1 Diseño del endpoint

```typescript
// GET /v1/public/verify/cert/:publicId
// SIN autenticación, accesible internet-wide
// Rate limit: 100 req/min per IP

@Public()
@Get('/v1/public/verify/cert/:publicId')
@RateLimit(100, 60)
async verifyCertificate(@Param('publicId') publicId: string): Promise<CertificateVerifyResponse> {
  // 1. Verifica firma HMAC sin consultar DB
  const payload = await this.signingService.verify(publicId);
  
  if (!payload) {
    return {
      valid: false,
      reason: 'INVALID_SIGNATURE',
      message: 'El identificador del certificado no es válido o fue alterado.'
    };
  }
  
  // 2. Verifica expiración (sin DB)
  const now = Math.floor(Date.now() / 1000);
  if (payload.ea && now > payload.ea) {
    return {
      valid: false,
      reason: 'EXPIRED',
      message: 'Este certificado venció el ' + new Date(payload.ea * 1000).toLocaleDateString(),
      expiredAt: new Date(payload.ea * 1000).toISOString()
    };
  }
  
  // 3. Consulta DB solo para revocación + nombres
  // (los nombres son visibles públicamente — ya están consentidos en el PDF)
  const cert = await this.prisma.learningCertificate.findUnique({
    where: { id: payload.ce },
    include: {
      staff: { select: { fullName: true } },
      legalEntity: { select: { commercialName: true, country: true } },
      courseVersion: { select: { version: true, course: { select: { title: true, alignedStandards: true }}}}
    }
  });
  
  if (!cert) {
    return { valid: false, reason: 'NOT_FOUND', message: 'Certificado no encontrado.' };
  }
  
  if (cert.revokedAt) {
    return {
      valid: false,
      reason: 'REVOKED',
      message: 'Este certificado fue revocado el ' + cert.revokedAt.toLocaleDateString(),
      revokedAt: cert.revokedAt.toISOString(),
      revokeReason: cert.revokeReason // visible públicamente para transparencia
    };
  }
  
  // 4. Respuesta exitosa
  return {
    valid: true,
    certificate: {
      learnerName: cert.staff.fullName,
      hotelName: cert.legalEntity.commercialName,
      hotelCountry: cert.legalEntity.country,
      courseTitle: cert.courseVersion.course.title,
      courseVersion: cert.courseVersion.version,
      alignedStandards: cert.courseVersion.course.alignedStandards,
      issuedAt: new Date(payload.ia * 1000).toISOString(),
      expiresAt: payload.ea ? new Date(payload.ea * 1000).toISOString() : null,
      type: this.mapTypeCode(payload.tp), // ZI → 'ZENIX_INTERNAL' display
      withHonors: payload.sc !== null && payload.sc >= 0.85,
    }
  };
}
```

### 6.2 UI pública de verificación

```
┌─────────────────────────────────────────────────────────────┐
│  verify.zenix.com/cert/ZL-DH-2026-A8F4-9D2E                 │
│  ───────────────────────────────────────────────────────────│
│                                                             │
│  ✅ CERTIFICADO VÁLIDO                                       │
│                                                             │
│  Otorgado a: MARÍA GONZÁLEZ HERNÁNDEZ                        │
│  Por: Hotel Sol y Mar, Playa del Carmen, México              │
│                                                             │
│  Curso: Distintivo H + NOM-035-STPS                          │
│  Aprobado el: 12 mayo 2026                                   │
│  Vigencia: hasta 12 mayo 2027                                │
│  Mención: Con honores                                        │
│                                                             │
│  Alineado a:                                                 │
│  • NMX-F-605-NORMEX-2018 (SECTUR)                            │
│  • NOM-035-STPS-2018 (STPS)                                  │
│  • Codex Alimentarius CAC/RCP 1-1969                         │
│                                                             │
│  Tipo: Comprobante interno Zenix Learning                    │
│  ID: ZL-DH-2026-A8F4-9D2E                                    │
│                                                             │
│  Verificado criptográficamente por Zenix Learning            │
│  HMAC-SHA256 · Sin alteración detectada                      │
│                                                             │
│  [ Descargar PDF original ]    [ Compartir verificación ]   │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Casos de error (UX)

**Firma inválida:**
```
❌ CERTIFICADO INVÁLIDO
El identificador proporcionado no corresponde a un certificado
emitido por Zenix Learning. Verifica que copiaste el ID completo.
```

**Expirado:**
```
⚠️  CERTIFICADO EXPIRADO
Este certificado venció el 12 mayo 2026.

María González Hernández completó el curso Distintivo H + NOM-035-STPS,
pero su vigencia anual venció. El portador debe recertificarse para
mantener el reconocimiento activo.
```

**Revocado:**
```
🚫 CERTIFICADO REVOCADO
Este certificado fue revocado el 23 julio 2026.

Razón: "Solicitud del emisor (Hotel Sol y Mar)"

Si tienes preguntas sobre esta revocación, contacta directamente al
emisor del certificado.
```

---

## 7. Microinteracción al revelar certificado (PixiJS confetti)

### 7.1 Cuándo se dispara

- Al hacer click en la notificación push "Tu certificado está listo"
- Al navegar a `/learning/certificates/{publicId}` por primera vez después de emisión
- NO se dispara en visitas subsiguientes (anti-fatiga de microinteracciones)

### 7.2 Implementación PixiJS

```typescript
// apps/web/src/learning/components/CertificateRevealPixi.tsx

import * as PIXI from 'pixi.js';
import { useEffect, useRef } from 'react';

export function CertificateRevealConfetti({ duration = 4000 }: { duration?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Respeta prefers-reduced-motion (a11y WCAG 2.1)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    
    const app = new PIXI.Application({
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
    });
    containerRef.current.appendChild(app.view as any);
    
    // 80 partículas confetti
    const confettiColors = [0x10B981, 0x059669, 0x34D399, 0xF59E0B, 0x3B82F6];
    const particles: PIXI.Graphics[] = [];
    
    for (let i = 0; i < 80; i++) {
      const p = new PIXI.Graphics();
      p.beginFill(confettiColors[Math.floor(Math.random() * confettiColors.length)]);
      p.drawRect(0, 0, 8, 14);
      p.endFill();
      p.x = window.innerWidth / 2 + (Math.random() - 0.5) * 100;
      p.y = window.innerHeight / 2;
      (p as any).vx = (Math.random() - 0.5) * 8;
      (p as any).vy = -(Math.random() * 12 + 8);
      (p as any).rotation = Math.random() * Math.PI * 2;
      (p as any).rotSpeed = (Math.random() - 0.5) * 0.3;
      particles.push(p);
      app.stage.addChild(p);
    }
    
    const ticker = app.ticker.add(() => {
      for (const p of particles) {
        p.x += (p as any).vx;
        p.y += (p as any).vy;
        (p as any).vy += 0.4; // gravedad
        p.rotation += (p as any).rotSpeed;
        if (p.y > window.innerHeight + 50) {
          (p as any).vy = -Math.random() * 12 - 8;
          p.y = -50;
          p.x = Math.random() * window.innerWidth;
        }
      }
    });
    
    setTimeout(() => {
      app.destroy(true, { children: true });
    }, duration);
    
    return () => {
      app.destroy(true, { children: true });
    };
  }, [duration]);
  
  return <div ref={containerRef} className="fixed inset-0 pointer-events-none z-50" />;
}
```

### 7.3 Reglas anti-fatiga

| Regla | Razón |
|-------|-------|
| **Solo primera visita** al certificado dispara confetti | Csikszentmihalyi: novelty matters. Repetir cada vez = ruido |
| **Duración 4 segundos** máximo | Apple HIG microinteracciones <5 seg |
| **`prefers-reduced-motion` desactiva** la animación | WCAG 2.1 motion sensitivity |
| **Pointer-events-none** en el contenedor | El confetti NO bloquea interacción con el PDF/certificado |
| **NO sonido por default** | Auto-play sonido prohibido + accesibilidad |

---

## 8. Roadmap del sistema de certificación

### 8.1 Fase 1.3 (sprint actual) — ZENIX_INTERNAL

- Generador on-demand operativo
- HMAC-SHA256 con key per-LegalEntity
- Endpoint público `/verify/cert/:id` sin DB query
- PDF co-branded balanceado
- QR + verify URL
- Microinteracción PixiJS confetti
- Tipo certificado: `ZENIX_INTERNAL` con disclaimer "no sustituye DC-3 oficial STPS"

### 8.2 Fase 1.0.5+ — STPS_DC3 (post-ACE registro)

> Cuando Zenix se registre formalmente como **Agente Capacitador Externo (ACE)** ante STPS México, los certificados del Curso 1 podrán emitirse adicionalmente como **DC-3 oficial** según LFT Art. 153-V.

| Cambio | Detalle |
|--------|---------|
| Tipo certificado | Cambio dinámico: si LegalEntity está vinculada a ACE registrado, emite `STPS_DC3` además del ZENIX_INTERNAL |
| Plantilla PDF | Variante con formato DC-3 oficial STPS (cumple Anexo 5 LFT) |
| Folio STPS | Generación adicional de folio oficial STPS |
| Endpoint /verify | Muestra "Reconocido como DC-3 oficial STPS — Folio #..." |

### 8.3 Fase 2+ — AHLEI_ALIGNED + Marketplace

- Cursos AHLEI partner pueden emitir certificados marcados `AHLEI_ALIGNED`
- Marketplace de cursos terceros: tipo `EXTERNAL_PARTNER` con sub-clasificación
- Soporte multi-firma (Zenix HMAC + emisor original PKI)

### 8.4 Fase 3+ — Multi-país LATAM

- CONOCER (México alternativa)
- SENA (Colombia)
- INA (Costa Rica)
- SUNAFIL (Perú)
- INTECAP/INFOP/INSAFORP/INADEH (Centroamérica)

---

## 9. Anti-patrones explícitamente prohibidos

> Estos errores en sistemas de certificación han causado fraudes documentados en LMS competidores. Documentados para que NUNCA aparezcan en Zenix Learning.

1. **❌ Pre-generar todos los PDFs.** Storage caro + imposibilidad de ajustar plantilla retroactivamente.
2. **❌ Firma con MD5/SHA-1.** Colisiones documentadas, no son criptográficamente seguros.
3. **❌ Verificación que requiere login.** El certificado debe ser verificable por terceros (futuros empleadores) sin cuenta Zenix.
4. **❌ Endpoint /verify que devuelve datos sensibles** (email, teléfono, RFC). Verificación pública = solo info pública del certificado.
5. **❌ Permitir al hotel quitar el logo Zenix.** Compromete integridad del sistema de verificación cross-plataforma.
6. **❌ Permitir al hotel alterar el QR.** Vector de fraude.
7. **❌ Generar certificado SIN haber completado examen final.** Trivial parecer, pero documentado en LMS gratuitos.
8. **❌ Logo Zenix dominante sobre logo Hotel.** El emisor formal es el hotel, no Zenix.
9. **❌ Slogans de marketing en el certificado.** Es documento profesional, no advertising.
10. **❌ Mostrar foto del aprendiz sin consentimiento explícito.** GDPR/LFPDPPP — opcional Fase 2+ con opt-in.
11. **❌ Confetti que bloquea la interacción con el certificado.** Pointer-events-none obligatorio.
12. **❌ Sonido automático al revelar certificado.** Auto-play sonido prohibido + accesibilidad.

---

## 10. Mapping al schema Prisma existente

```prisma
model LearningCertificate {
  id            String   @id @default(cuid())
  publicId      String   @unique  // ZL-DH-2026-A8F4-9D2E friendly
  signedPayload String   @unique  // formato <DATA>.<SIG>.<KID> HMAC
  
  enrollmentId  String
  enrollment    LearningEnrollment @relation(fields: [enrollmentId], references: [id])
  
  courseVersionId String
  courseVersion   LearningCourseVersion @relation(fields: [courseVersionId], references: [id])
  
  staffId       String
  staff         Staff @relation(fields: [staffId], references: [id])
  
  legalEntityId String  // para resolver signing key
  legalEntity   LegalEntity @relation(fields: [legalEntityId], references: [id])
  
  type          LearningCertificateType  // ZENIX_INTERNAL | STPS_DC3 | AHLEI_ALIGNED | EXTERNAL_PARTNER
  
  score         Decimal?   // score final examen, null si <85% (privacidad)
  scoreShown    Boolean    @default(false)  // si mostrar "con honores"
  
  issuedAt      DateTime   @default(now())
  expiresAt     DateTime?  // null si certificado sin vigencia
  
  revokedAt     DateTime?  // null si vigente
  revokeReason  String?    // visible públicamente en /verify
  revokedById   String?    // staff que revocó (audit)
  
  // Audit fields
  pdfRenderedAt DateTime?  // última vez que se generó el PDF
  pdfRenderCount Int @default(0)
  verifyVisitCount Int @default(0)
  
  @@index([staffId, courseVersionId])
  @@index([legalEntityId])
  @@index([publicId])
}

model LegalEntity {
  // ... campos existentes
  certSigningKey       String   @encrypted  // key actual
  certSigningKid       String   @default("v1")  // key id
  certSigningKeyPrev   String?  @encrypted  // key anterior durante rotación
}
```

---

## 11. Implementación técnica — Fase 1.3

### 11.1 Componentes a producir (3 días estimados)

| Componente | Esfuerzo | Owner |
|------------|----------|--------|
| `CertificateSigningService` + tests | 0.5 día | Backend |
| `CertificateService.issueCertificate` + event listener | 0.5 día | Backend |
| `CertificatePdfRenderer` con `@react-pdf/renderer` | 1 día | Backend |
| Endpoint `/v1/public/verify/cert/:id` con rate limit | 0.5 día | Backend |
| UI pública `verify.zenix.com` (Next.js app standalone) | 1 día | Frontend |
| `CertificateRevealConfetti` con PixiJS | 0.5 día | Frontend |
| QR code generation con `qrcode` npm | 0.25 día | Backend |
| Integration tests E2E | 0.5 día | QA |

### 11.2 Decisiones técnicas clave

| Decisión | Justificación |
|----------|---------------|
| **PDF renderer:** `@react-pdf/renderer` | TypeScript-first, React components, mismo stack Zenix. Alternativa Puppeteer + Chromium descartada (memoria + complejidad). |
| **QR library:** `qrcode` npm | Estándar mantenido, soporte error correction |
| **HMAC library:** Node.js `crypto` built-in | No dependencia externa, FIPS 140-2 compliant |
| **Storage de PDFs renderizados:** **NO almacenamos**, re-renderizamos on-demand | Plantilla puede ajustarse retroactivamente |
| **Verify endpoint hosting:** `verify.zenix.com` como subdominio CDN | URL corta, brandeable, fácil de citar verbalmente |
| **Rate limit:** 100 req/min per IP | Anti-scraping + uso legítimo de verificadores |

---

## 12. Métricas a observar post-launch

| Métrica | Target Year 1 |
|---------|----------------|
| Pass rate primer intento examen final | 60-75% |
| Certificados emitidos vs enrollments completados | ≥85% (algunos abandonan post-aprobación sin pedir cert) |
| Verify URL hits / certificados emitidos | ≥0.3 (proxy de uso comercial del cert) |
| Compartidos en LinkedIn / certificados emitidos | ≥0.1 |
| Revocaciones (% de emitidos) | <0.5% (raras, solo por error o fraude) |
| Tiempo de generación PDF on-demand | <500ms p95 |
| Endpoint /verify latencia p95 | <100ms (mayoría sin DB query gracias a HMAC self-contained) |
| Errores criptográficos detectados | 0 (firma siempre válida) |

---

## Bitácora

- **2026-05-22** (Día 6 producción PM) — Especificación completa del sistema de certificación + endpoint /verify pública + microinteracción PixiJS confetti redactada. Plantilla PDF co-branded balanceada (Hotel emisor formal, Zenix plataforma). HMAC-SHA256 con key per-LegalEntity (rotable). Self-contained verification sin DB query para mayor seguridad y velocidad. Roadmap fases: ZENIX_INTERNAL Fase 1.3 → STPS_DC3 post-ACE Fase 1.0.5+ → AHLEI_ALIGNED Fase 2 → Multi-país LATAM Fase 3+. 12 anti-patrones prohibidos. Mapping completo a schema Prisma. Implementación técnica 3 días Fase 1.3.

**🎉 Día 6 completo: question bank 180 + spec examen final + spec generador certificado + Quiz Randomization Standard universal del engine LMS.**

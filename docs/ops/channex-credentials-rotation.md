---
Audiencia: DevOps + on-call ZaharDev
Tipo: Ops runbook — runbook ejecutable
Status: Sprint CHANNEX-AUTO-PROVISION cerrado 2026-05-29
Padre arquitectónico: docs/architecture/channex-provisioning-flow.md
Última actualización: 2026-05-29
---

# Runbook: rotación de credenciales Channex

Dos secretos sensibles en el ecosistema Channex auto-provisioning, con
runbooks distintos:

| Secret | Scope | Rotation cadence sugerida | Trigger emergencia |
|---|---|---|---|
| **CHANNEX_API_KEY** | 1 master account (Fase 1) o per `LegalEntity` (Fase 2/3) | Anual | Comprometido (consultor leakeó), Channex flag de actividad sospechosa |
| **CHANNEX_CREDENTIALS_KEK** | KEK 32-bytes que cifra `Channel.settingsEncrypted` AES-256-GCM | Anual | KEK leakeó (.env público, log accidental), audit anual |

> **TL;DR para on-call.** Si un consultor o engineer subió accidentalmente
> el `.env` a git, ejecuta inmediatamente la rotación de **ambos** secrets
> (paranoia justified). Asume worst-case: el atacante tiene tanto la API
> key como la KEK.

---

## 1. Rotación de `CHANNEX_API_KEY`

### 1.1 Caso normal (rotación anual programada)

**Pre-requisitos**:
- Acceso al Channex master extranet (ZaharDev cuenta corporativa).
- Acceso a `.env` de los environments productivos (staging + production).
- Ventana de mantenimiento <5 min — el wizard de activación queda inactivable
  durante el swap. Programar fuera de horarios pico de provisioning (típicamente
  consultor activa cliente en horario laboral MX 10:00-18:00).

**Pasos**:

1. **Generar nueva key en Channex extranet**:
   - Login en https://app.channex.io (cuenta master ZaharDev).
   - Settings → API Keys → "Create New API Key".
   - Anotar el valor (Channex lo muestra UNA sola vez).

2. **Setear como `CHANNEX_API_KEY_NEW` en `.env`** (variable adicional, no
   reemplaza la vieja todavía):
   ```bash
   echo "CHANNEX_API_KEY_NEW=<nueva-key>" >> apps/api/.env
   ```

3. **Smoke test** contra sandbox antes de promover:
   ```bash
   cd apps/api
   CHANNEX_API_KEY="$CHANNEX_API_KEY_NEW" \
     npx jest channex.gateway.integration --runInBand
   ```
   Si verde → la nueva key funciona.

4. **Swap atómico** en `.env`:
   ```bash
   # Renombrar la vieja a LEGACY (failsafe rollback) y promover la nueva
   sed -i.bak \
     -e 's/^CHANNEX_API_KEY=/CHANNEX_API_KEY_LEGACY=/' \
     -e 's/^CHANNEX_API_KEY_NEW=/CHANNEX_API_KEY=/' \
     apps/api/.env
   ```

5. **Reiniciar el server** (Nest no soporta hot-reload de env):
   ```bash
   # Render / Fly / etc. — restart del servicio
   render services restart <service-id>
   ```

6. **Validar** que el ping Channex sigue funcionando:
   ```bash
   curl -X POST http://localhost:3000/v1/nova/wizard/health/channex \
     -H "Authorization: Bearer <admin-jwt>" -H "Content-Type: application/json" -d '{}'
   ```
   → debe retornar `{ status: 'success', latencyMs: <500 }`

7. **Después de 24h sin issues**, revoca la key vieja en Channex extranet +
   borra `CHANNEX_API_KEY_LEGACY` del `.env`.

### 1.2 Caso emergencia (key comprometida)

Si sospechas que la key se leakeó (consultor lo subió a git, log accidental,
phishing exitoso):

1. **REVOCAR INMEDIATAMENTE** la key en Channex extranet (Settings → API Keys →
   Delete). Esto rompe el provisioning live, pero es preferible a que el
   atacante mute inventory de tus clientes.

2. Ejecuta los pasos 1-6 de 1.1 con urgencia.

3. **Audit del scope del leak**:
   - ¿Qué Properties pudo haber accedido? (Todas las del master account en Fase 1.)
   - Revisar Channex `audit_log` en su extranet por requests con la key
     comprometida posteriores al leak detectado.
   - Notificar clientes afectados si hay evidencia de acceso indebido (GDPR
     Art. 33 — 72h breach notification).

### 1.3 Migration a Fase 2 (BYO key per `LegalEntity`)

Cuando ZaharDev firme Channex Partner Program (estimado Q3 2026), la rotación
cambia de "1 key master" a "N keys per LegalEntity". El gateway lo soporta:

- `LegalEntity.channexApiKey String?` nullable — si set, gateway usa ESA key
  en lugar del master.
- Migration gradual cliente por cliente: contratar Partner sub-account per
  Org → setear key en `LegalEntity` → al siguiente provision/retry usa la
  nueva key.
- La key master no se rota — solo se queda como fallback para Orgs aún en
  Fase 1.

---

## 2. Rotación de `CHANNEX_CREDENTIALS_KEK`

### 2.1 Contexto

La KEK (Key Encryption Key) cifra `Channel.settingsEncrypted` con AES-256-GCM.
Format del blob persistido (base64): `[12 bytes IV][16 bytes auth tag][N bytes ciphertext]`.

**Si la KEK rota sin migration, todos los blobs viejos quedan inválidos**:
el `auth tag` se valida contra la KEK actual → mismatch → throw
`InternalServerErrorException`. Los channels existentes pierden capacidad
de re-publicar credentials.

**Por eso la rotación requiere migration**, no un swap directo.

### 2.2 Caso normal (rotación anual)

**Pre-requisitos**:
- Acceso a `.env` productivo.
- Acceso a Prisma Studio o al DB cliente (para query Channels).
- Ventana de mantenimiento ~15-30 min (depende de cuántos channels existan).

**Pasos**:

1. **Generar nueva KEK 32-bytes**:
   ```bash
   openssl rand -base64 32 > /tmp/channex-kek-new.txt
   cat /tmp/channex-kek-new.txt
   ```

2. **Setear como `CHANNEX_CREDENTIALS_KEK_NEW`** en `.env`:
   ```bash
   echo "CHANNEX_CREDENTIALS_KEK_NEW=$(cat /tmp/channex-kek-new.txt)" >> apps/api/.env
   ```

3. **Reiniciar el server** para cargar ambas (vieja + nueva en memoria
   simultáneamente). Esto requiere un cambio de código menor en
   `ChannelCredentialsCryptoService`: aceptar 2 KEKs durante migration —
   intenta decrypt con la vigente primero, si falla con la nueva.
   *(Implementación pendiente — Phase 2 v1.0.5; mientras tanto se hace cold
   migration descrita en 2.3.)*

4. **Run migration script** (pendiente — ver 2.3 cold path).

5. **Swap atómico** post-migration:
   ```bash
   sed -i.bak \
     -e 's/^CHANNEX_CREDENTIALS_KEK=/CHANNEX_CREDENTIALS_KEK_LEGACY=/' \
     -e 's/^CHANNEX_CREDENTIALS_KEK_NEW=/CHANNEX_CREDENTIALS_KEK=/' \
     apps/api/.env
   ```

6. **Reiniciar** + validar con Channel.findFirst({settingsEncrypted: {not: null}})
   que `crypto.decrypt()` funciona.

7. Después de 7 días sin issues → borrar `CHANNEX_CREDENTIALS_KEK_LEGACY`.

### 2.3 Cold migration path (v1.0.0 actual)

Mientras `ChannelCredentialsCryptoService` no soporta dual-KEK (pendiente
Phase 2), la rotación es cold:

1. **Pause provisioning** — setear `channexPushEnabled=false` en todos los
   wizard activations en curso (decisión owner; el endpoint de retry se
   bloquea durante el window).

2. **Script de migration** (a ejecutar manualmente, no automatizado v1.0.0):
   ```typescript
   // apps/api/prisma/scripts/rotate-kek.ts (a crear pre-rotation)
   import { PrismaClient } from '@prisma/client'
   import { ChannelCredentialsCryptoService } from '...'
   const prisma = new PrismaClient()

   const oldKek = process.env.CHANNEX_CREDENTIALS_KEK_LEGACY!
   const newKek = process.env.CHANNEX_CREDENTIALS_KEK!

   const oldCrypto = new ChannelCredentialsCryptoService({ get: () => oldKek } as any)
   const newCrypto = new ChannelCredentialsCryptoService({ get: () => newKek } as any)

   const channels = await prisma.channel.findMany({
     where: { settingsEncrypted: { not: null } },
   })
   for (const ch of channels) {
     const plain = oldCrypto.decrypt(ch.settingsEncrypted!)
     const reencrypted = newCrypto.encrypt(plain)
     await prisma.channel.update({
       where: { id: ch.id },
       data: { settingsEncrypted: reencrypted },
     })
     console.log(`rotated ${ch.id} ${ch.type}`)
   }
   ```

3. **Swap atómico** del .env + reiniciar.

4. **Smoke test** — intentar `gateway.updateChannel()` con un channel migrated
   para validar que las credentials se siguen aplicando en Channex.

### 2.4 Caso emergencia (KEK comprometida)

Si la KEK se leakeó **Y** un atacante tiene acceso a la BD (cuando uno solo
no es exploit suficiente — KEK sin DB no descifra nada; DB sin KEK tampoco):

1. **Bloquear acceso a la BD** (rotar credenciales DB primero, luego KEK).

2. **Asumir worst-case**: todas las credentials OTA de todos los clientes
   están comprometidas. Acción del cliente:
   - Cliente debe rotar credentials en cada OTA extranet (Booking change
     password, Expedia revoke EQC, etc.).
   - Después, el consultor abre `/nova/billing/channex` → "Completar
     credenciales" para cada channel con las nuevas creds.

3. Ejecuta los pasos 1-6 de 2.2 con urgencia + paranoia.

4. **GDPR Art. 33 breach notification** a los Orgs afectados dentro de 72h.

---

## 3. Audit trail

Toda rotación queda en:

- **AuditLog** (BD permanente, append-only). Acción `CHANNEX_CREDENTIAL_ROTATED`
  con `payload.kind = 'api_key' | 'kek'` + `actorRealId` del operator.
- **Channex audit_log** (su extranet) por la actividad de la nueva key.
- **Git** para los `.env.example` snapshots (NUNCA commitear el `.env` real).

---

## 4. Pre-checks pre-rotation

Antes de cualquier rotación, ejecuta este checklist:

- [ ] ¿Tienes la old key backed up en password manager (1Password / Bitwarden)?
- [ ] ¿Tienes confirmación owner que es OK pausar provisioning durante la ventana?
- [ ] ¿Confirmaste con on-call que NO hay wizard activations en curso?
  ```sql
  SELECT id, name, created_at
  FROM "Organization"
  WHERE "activatedAt" > NOW() - INTERVAL '10 minutes'
    AND "activatedAt" IS NOT NULL;
  ```
- [ ] ¿Hay backup verified de la BD < 1h? (paranoia justified)
  ```bash
  pg_dump -Fc -f /backup/pre-rotation-$(date +%s).dump $DATABASE_URL
  ```
- [ ] ¿Tienes acceso a Prisma Studio / DB cliente para validation post-rotation?

---

## 5. Cuándo NO rotar

- **Channex bloqueando requests** (5xx persistente del lado de ellos) — primero
  resolver con su support, NO rotes pensando que es problema de auth.
- **Cliente piloto en activate live** — espera a que termine la sesión del
  consultor.
- **Sin ventana de mantenimiento disponible** — la rotación de la API key
  necesita ~5 min sin provisioning; la KEK necesita ~15-30 min sin acceso
  a channels existentes.

---

## 6. Referencias

- Arquitectura: [docs/architecture/channex-provisioning-flow.md](../architecture/channex-provisioning-flow.md)
- Multi-tenant: [docs/vision/11-multi-tenant-architecture.md](../vision/11-multi-tenant-architecture.md)
- Plan sprint: [docs/sprints/CHANNEX-AUTO-PROVISION-plan.md](../sprints/CHANNEX-AUTO-PROVISION-plan.md)
- Channex API auth: https://docs.channex.io/application-documentation/api-key-access
- AES-256-GCM standard: NIST SP 800-38D (FIPS 140-2 approved)

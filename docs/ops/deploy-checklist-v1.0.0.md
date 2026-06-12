# Checklist de Deploy a Producción — Zenix v1.0.0 (piloto)

> Despliegue del **piloto single-property** (Hotel Monica Tulum). Alcance MVP:
> PMS core + housekeeping + booking engine (`PAY_AT_HOTEL`) + facturación manual.
> Infra Fase 1 (§73): **Vercel (web) + Render (API) + Neon (Postgres) + R2 (storage)**.
>
> **Leyenda:** 👤 = sólo el owner puede hacerlo (cuentas/secrets/dominios/pagos) ·
> 🤖 = Claude puede hacerlo/ayudar (código/config/scripts/comandos/verificación).

---

## 0. División de responsabilidades

| Claude (🤖) hace | El owner (👤) hace |
|------------------|--------------------|
| Configs (render.yaml, vercel.json), scripts de build/start, env.example, smoke-tests, comandos de migración, verificación, docs, fixes de código | Crear cuentas (Neon/Render/Vercel/Cloudflare), **pegar secrets** en los dashboards, conectar dominios DNS, métodos de pago, OAuth, generar/guardar las keys productivas |

**Regla de seguridad:** Claude **nunca** pega secrets en dashboards ni crea cuentas. Claude puede **generar** valores aleatorios (JWT_SECRET, KEK) y mostrarlos en el chat para que **tú** los pegues; nunca se commitean.

---

## 1. Pre-deploy — código (🤖 hecho / verificar)

- [x] **Fix `start` script** → `node dist/apps/api/src/main` (antes apuntaba a `dist/main` inexistente → habría crasheado en prod).
- [x] `db:migrate:deploy` script existe (`prisma migrate deploy`).
- [x] `.env.example` actualizado con TODOS los vars reales (KEK, ALLOWED_ORIGINS, BANXICO_TOKEN, NOVA_BASE_URL, RESEND_BILLING_FROM).
- [x] CORS abierto para `/api/v1/public/*` (booking engine cross-origin).
- [ ] 🤖 **Smoke test local del build de prod:** `cd apps/api && npm run build && node dist/apps/api/src/main` → debe imprimir "API running". (verificar antes de desplegar)
- [ ] 🤖 Crear `render.yaml` (blueprint API) + `vercel.json` (web) — pendiente, lo genero cuando confirmes proveedores.

---

## 2. Inventario de variables de entorno (prod)

### API (Render) — requeridas

| Var | Cómo obtenerla | Quién |
|-----|----------------|-------|
| `DATABASE_URL` | Connection string de Neon (con `?sslmode=require`) | 👤 |
| `JWT_SECRET` | `openssl rand -base64 32` (NUEVO, no reusar dev) | 🤖 genero / 👤 pego |
| `JWT_EXPIRES_IN` | `24h` | 🤖 |
| `NODE_ENV` | `production` | 🤖 |
| `PORT` | `3000` (Render lo inyecta; respetar `process.env.PORT`) | 🤖 |
| `ALLOWED_ORIGINS` | `https://app.zenix.com,https://nova.zenix.com` | 👤 (según dominios) |
| `APP_BASE_URL` | URL del PMS cliente (Vercel) | 👤 |
| `NOVA_BASE_URL` | URL de Nova | 👤 |
| `CHANNEX_CREDENTIALS_KEK` | `openssl rand -base64 32` (32 bytes) | 🤖 genero / 👤 pego |
| `CHANNEX_API_KEY` / `CHANNEX_BASE_URL` | Channex (acceso que ya gestionas) | 👤 |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Dashboard Stripe — **ROTAR las que se pegaron en chat** | 👤 |
| `RESEND_API_KEY` / `RESEND_FROM_ADDRESS` / `RESEND_BILLING_FROM` | Resend (dominio verificado + DKIM) | 👤 |
| `BANXICO_TOKEN` | https://www.banxico.org.mx/SieAPIRest (gratis) | 👤 |
| `GOOGLE_PLACES_API_KEY` | Google Cloud (Compset; opcional para piloto) | 👤 |
| `EXPO_ACCESS_TOKEN` | Expo (push notifications móvil) | 👤 |

Opcionales/feature-flag (vacío = feature off, sin romper): `PREDICTHQ_TOKEN`, `NEWSDATA_API_KEY`, `WHATSAPP_API_KEY`, `CLOUDBEDS_WEBHOOK_SECRET`. **NO setear** los `CHANNEX_SANDBOX_*` en prod.

### Web (Vercel)
| Var | Valor |
|-----|-------|
| `VITE_API_URL` | URL pública de la API en Render (ej. `https://zenix-api.onrender.com`) |

> 🔴 **Acción de seguridad inmediata:** rotar las keys de Stripe (`rk_test_`/`sk_test_`/`rk_live_`) que se pegaron en chat durante validación (§199) **antes** de cualquier uso en prod.

---

## 3. Provisionar infraestructura (👤 con guía 🤖)

1. **Neon (Postgres)** 👤
   - Crear proyecto + base `zenix_prod`. Copiar `DATABASE_URL` (pooled + `sslmode=require`).
   - Habilitar **backups/branching** (Neon los trae; confirmar retención).
2. **Render (API)** 👤
   - New Web Service desde el repo, branch `main`.
   - Build: `npm install && npm --workspace @zenix/shared run build && npm --workspace @zenix/api run build`
   - Start: `npm --workspace @zenix/api run start:prod`
   - Pegar env vars (sección 2). Health check path: `/api` (o el que definamos).
   - 🤖 te doy el `render.yaml` exacto al confirmar.
3. **Vercel (web)** 👤
   - Import repo, root `apps/web`, framework Vite.
   - Build: `vite build` · Output: `dist`. Setear `VITE_API_URL`.
4. **Cloudflare R2** 👤 (storage de imágenes; diferible si el piloto no sube fotos masivas — hoy data-URI base64, §MAINT-11).

---

## 4. Migraciones + seed (🤖 comandos / 👤 ejecuta o me autorizas)

- [ ] `DATABASE_URL=<prod> npx prisma migrate deploy` (aplica TODAS las migraciones a la BD prod limpia).
- [ ] **NO correr el `seed.ts` de dev en prod** (crea Hotel Tulum demo). Para el piloto real: el onboarding del hotel se hace por el **Wizard Zenix Activate** (Nova), o un seed mínimo de producción dedicado. 🤖 puedo escribir un `seed.prod.ts` mínimo (1 org + 1 legal entity + el hotel real + el ORG_OWNER) si lo prefieres a usar el wizard.
- [ ] Verificar migraciones aplicadas: `npx prisma migrate status`.

---

## 5. Smoke tests post-deploy (🤖)

- [ ] API viva: `curl https://<api>/api/v1/public/properties/<slug>` (404 esperado si aún no hay hotel; 200 con datos si ya).
- [ ] Login del ORG_OWNER real → entra al dashboard.
- [ ] Crear una reserva de prueba en el calendario → aparece (SSE).
- [ ] Booking engine: `curl` availability + POST reserva por slug → 201.
- [ ] Email: disparar un setup link / precheckin → llega (no spam, DKIM ok).
- [ ] Swagger: `https://<api>/api/docs` carga.
- 🤖 puedo escribir un `scripts/smoke-prod.sh` que corra todo esto contra la URL prod.

---

## 6. DNS / dominios (👤)

- `app.zenix.com` → Vercel (PMS cliente).
- `nova.zenix.com` → Vercel (Nova) o misma app con routing.
- `api.zenix.com` → Render (API). Actualizar `VITE_API_URL` + `ALLOWED_ORIGINS`.
- `book.zenix.com` → **opcional** (hosted page del booking engine, B5.1). Si el hotel usa su propio sitio headless, no es necesario.

---

## 7. Backups, observabilidad y rollback (👤+🤖)

- [ ] **Backups** Neon activos + **probar un restore** una vez (§76: "verificados mensualmente").
- [ ] **Monitoreo:** uptime (Render health check), errores (Sentry/logs), alerta de caída. 🤖 puedo integrar Sentry.
- [ ] **Rollback:** Render permite redeploy del commit anterior. Migraciones: tener documentado el `down` o un plan (Prisma no auto-genera down → 🤖 documento el rollback por migración crítica).
- [ ] **Logs:** confirmar que no se loguean secrets (KEK/credenciales — ya §192 `describeCredentials` audit-safe).

---

## 8. Puerta de go-live (gates del análisis MVP)

NO lanzar hasta que TODOS estén ✅:
- [ ] Secrets rotados + env prod completo y verificado.
- [ ] `migrate deploy` corrido + smoke tests verdes.
- [ ] Backups probados + monitoreo básico activo.
- [ ] Email DKIM verificado.
- [ ] **Acuerdo escrito con el hotel** sobre los gaps de alcance: (a) **pago en recepción** (sin prepago online aún), (b) **facturación CFDI manual** (fuera de Zenix hasta v1.0.2). 🤖 puedo redactar este doc de alcance.
- [ ] Channex: cert + acceso CRS (gestión owner, ya contemplado).

---

## Estado actual
- Código: ✅ en `main` (v1.0.0 + booking engine). Fixes de deploy en branch `chore/deploy-prep`.
- Infra: ⏳ por provisionar.
- Próximo paso sugerido: confirmar proveedores → 🤖 genero `render.yaml` + `vercel.json` + `smoke-prod.sh` → 👤 creas cuentas y pegas secrets (te genero los valores aleatorios).

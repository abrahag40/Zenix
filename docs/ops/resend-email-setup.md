# Configurar envío de emails (Resend) — runbook

> **Para qué.** Zenix envía emails transaccionales por **Resend**: el *setup link* del
> wizard (para que el dueño del hotel active su cuenta), el welcome, el reset de
> contraseña y los recordatorios de cobro. **Sin esto los emails quedan en modo
> stub** — no fallan (la app bootea fail-soft), pero **no salen**.
>
> **Mitigación mientras tanto:** el wizard SIEMPRE muestra el setup link en pantalla
> (caja copiable). Se lo pasas al dueño por WhatsApp. Con Resend configurado, sale
> solo por email.
>
> **División de responsabilidades:** los pasos 👤 los hace el owner (crear cuenta,
> DNS, pegar la API key). El código ya está listo (🤖). Claude no pega secrets.

## Variables que usa el código

| Variable | Qué es | Ejemplo |
|----------|--------|---------|
| `RESEND_API_KEY` | API key de Resend | `re_xxxxxxxxxxxx` |
| `RESEND_FROM_ADDRESS` | Remitente (dominio verificado) | `Zenix <noreply@zenix.app>` |
| `RESEND_BILLING_FROM` | Remitente de cobros (opcional; si falta usa el anterior) | `Zenix Facturación <billing@zenix.app>` |

Sin `RESEND_API_KEY` → modo stub (sin envío). Las tres están en `render.yaml` como `sync:false` (se pegan en el dashboard, nunca en el repo).

## Pasos

### 1. 👤 Crear cuenta Resend
- Entra a https://resend.com y crea una cuenta (free tier: 3,000 emails/mes, 100/día — suficiente para el piloto).

### 2. 👤 Verificar tu dominio (DNS) — **crítico para no caer en spam**
- En Resend → **Domains** → **Add Domain** → escribe tu dominio (ej. `zenix.app` o el del hotel).
- Resend te da **3 registros DNS** (SPF + DKIM + DMARC). Cópialos en tu proveedor de DNS (Cloudflare, Namecheap, etc.).
- Espera la verificación (minutos a ~1h). El dominio debe quedar **Verified** antes de enviar.
- ⚠️ Sin dominio verificado, Resend solo deja enviar desde `onboarding@resend.dev` (pruebas) — no usarlo en producción.

### 3. 👤 Crear la API key
- Resend → **API Keys** → **Create API Key** → permiso **Sending access** → copia el `re_…`.

### 4. 👤 Pegar las variables en Render
- Render → tu servicio `zenix-api` → **Environment** → agrega/edita:
  - `RESEND_API_KEY` = el `re_…` del paso 3
  - `RESEND_FROM_ADDRESS` = `Zenix <noreply@TU-DOMINIO-VERIFICADO>`
  - `RESEND_BILLING_FROM` = `Zenix Facturación <billing@TU-DOMINIO-VERIFICADO>` (opcional)
- Guarda → Render redespliega solo.

### 5. 🤖/👤 Verificar que funciona
- **Opción A (wizard):** entra a Nova → Wizard → Step 8 → corre el check **"Envío de correos"**. Si Resend está bien, pasa a verde (en vez de warning).
- **Opción B (onboardear un hotel real):** al activar, el dueño recibe el setup link por email. Si llega (revisa también spam la primera vez), está OK.

## Notas
- **El setup link no depende del email para existir** — el wizard lo devuelve en pantalla siempre (§182 D-NOVA-24). El email es comodidad, no bloqueante.
- Free tier de Resend = 100 emails/día. Para varios hoteles activos + recordatorios, evaluar el plan de pago cuando el volumen lo pida.
- El remitente debe ser del **dominio verificado**. Usar un Gmail/dominio ajeno = rechazo o spam.

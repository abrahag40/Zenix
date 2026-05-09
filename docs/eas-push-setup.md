---
Audiencia: Desarrollo / DevOps
Última actualización: 2026-05-07
---

# Setup de Push Notifications con EAS (cuando contrates Apple Developer)

Este documento describe los pasos para activar push notifications remotas en producción una vez que tengas la cuenta de Apple Developer ($99 USD/año) y configures EAS Build.

El código del proyecto ya está preparado — solo faltan acciones administrativas y configuración.

## Por qué esto no funciona en Expo Go iOS

Desde Expo SDK 53 (octubre 2024), Apple ya no permite que apps sin App ID propio reciban push notifications remotas. Expo Go iOS solo soporta notificaciones locales (programadas desde la propia app).

- **Local notifications:** funcionan en Expo Go iOS (la `AlarmHost` las dispara cuando llega evento SSE en foreground o transición background→foreground)
- **Remote push (servidor → device):** solo funciona en development build / production build vía EAS

Android Expo Go SÍ soporta remote push — útil para testing intermedio sin EAS.

## Estado actual del código (ya commiteado)

- `apps/mobile/app.json` — permisos Android (`USE_FULL_SCREEN_INTENT`, `POST_NOTIFICATIONS`, `VIBRATE`, etc.) y `infoPlist.UIBackgroundModes: ['remote-notification']` ya declarados
- `apps/mobile/src/notifications.ts` — channel Android `task-alarm` con `importance: MAX`, `bypassDnd: true`, `lockscreenVisibility: PUBLIC`. Soporta override del projectId vía `EXPO_PUBLIC_EAS_PROJECT_ID` env var
- `apps/api/src/notifications/push.service.ts` — usa `expo-server-sdk` para enviar a Expo Push API. Solo necesita tokens registrados
- `apps/api/src/pms/guest-stays/guest-stays.service.ts` — `checkout()` y `earlyCheckout()` envían push tier 2/2.5 al asignado

## Pasos para activar

### 1. Cuenta Apple Developer ($99 USD / año)

1. Ir a `developer.apple.com` y suscribirte al Apple Developer Program
2. Esperar aprobación (24-48 horas típicamente)
3. Crear App ID con bundle identifier `com.zenix.pms` (debe coincidir con `app.json.ios.bundleIdentifier`)
4. Habilitar capability "Push Notifications" en el App ID
5. (Opcional, para alarma con bypass DnD) Solicitar Critical Alerts entitlement vía `developer.apple.com/contact` — Apple revisa caso por caso (1-2 semanas)

### 2. Cuenta Expo (gratis)

```bash
npm install -g eas-cli
eas login
```

### 3. Inicializar EAS en el proyecto

```bash
cd apps/mobile
eas init
```

Esto escribe automáticamente el `projectId` en `app.json.extra.eas.projectId`. Verificar que el campo dejó de estar vacío:

```bash
cat app.json | jq '.expo.extra.eas.projectId'
# debe imprimir un UUID, no ""
```

### 4. Configurar credentials

```bash
eas credentials
```

Selecciona iOS → Push Notifications → Set up Push Notifications. EAS generará el push key y lo subirá automáticamente a Expo's push service.

### 5. Crear development build (instalable en device físico)

```bash
eas build --profile development --platform ios
```

Esto genera un `.ipa` que se instala vía TestFlight o link directo. El build incluye `expo-dev-client` — funciona como Expo Go pero CON push notifications.

### 6. Para Android (sin Apple Developer requerido)

```bash
eas build --profile development --platform android
```

Genera APK instalable. Push funciona inmediatamente — Android no requiere developer account aparte para testing.

### 7. Verificar registro de tokens

Una vez instalado el development build y logueado el housekeeper:

```sql
-- En la BD del API:
SELECT id, "staffId", platform, active, "lastSeenAt", LEFT(token, 30) AS token_preview
FROM push_tokens
ORDER BY "lastSeenAt" DESC
LIMIT 5;
```

Debe haber al menos 1 fila por device autenticado. Si no aparece, revisar logs de la app:

```bash
npx expo start --dev-client
# En la app, ir a "Mi día" y mirar consola para "[push] Skipping..." o errores
```

## Critical Alerts (alarma estilo despertador en iOS)

**Por qué requiere entitlement separado:**
Apple bloquea por default que apps de terceros bypass DnD o silenciador. Las "Critical Alerts" están reservadas para apps médicas, de seguridad personal, o casos donde un mensaje no puede esperar.

Para Zenix housekeeping, el caso de uso "habitación lista para limpiar" puede no calificar — Apple revisa caso por caso. Si Apple aprueba:

```json
// app.json
{
  "expo": {
    "ios": {
      "entitlements": {
        "com.apple.developer.usernotifications.critical-alerts": true
      }
    }
  }
}
```

Y desde el backend `PushService.sendToStaff()`, agregar `interruption-level: 'critical'` al payload (ya soportado por `expo-server-sdk` SDK 4+).

**Sin Critical Alerts** (caso default): el usuario recibe heads-up notification con sonido si el teléfono está en modo normal. Si está en silencio o DnD, solo banner silencioso. Igual a WhatsApp/Slack.

## Android — alarma overlay tipo despertador (ya funciona)

Android no requiere entitlement adicional. Con `USE_FULL_SCREEN_INTENT` declarado en `app.json` (ya hecho), el SO permite que el AlarmOverlay se presente sobre la lock screen como una alarma de despertador.

Cuando llega push con `priority: 'high'` y `data.alarm: true`, AlarmHost muestra `AlarmOverlay` full-screen en `<Modal presentationStyle="fullScreen" />`. Si el device está bloqueado, Android lanza la activity sobre el lock screen automáticamente gracias al permiso `USE_FULL_SCREEN_INTENT`.

## Testing post-EAS

| Escenario | iOS Critical | iOS Standard | Android |
|-----------|--------------|--------------|---------|
| App en foreground | ✅ AlarmOverlay + sonido | ✅ AlarmOverlay + sonido | ✅ AlarmOverlay + sonido |
| App en background | ✅ Banner + sonido | ✅ Banner + sonido | ✅ Banner + sonido |
| Pantalla bloqueada, modo normal | ✅ Notif lock screen + sonido | ✅ Notif lock screen + sonido | ✅ Full-screen overlay |
| Pantalla bloqueada, DnD | ✅ Notif lock screen + sonido | ⚠️ Solo si user permitió | ✅ bypassDnd:true overrides |
| Modo silencio (mute) | ✅ Suena (Critical bypass) | ❌ Silenciada | ✅ Suena (alarma channel) |

## Rollout recomendado

1. **Sprint actual:** desarrollo con local notifications (foreground SSE → AlarmHost)
2. **Cuando contrates Apple Developer:** ejecutar pasos 1-5 arriba, hacer EAS build dev, validar push remoto en iOS
3. **Production release:** `eas build --profile production` + subir a App Store + Google Play
4. **Critical Alerts (opcional):** solicitar entitlement a Apple, agregar al app.json, redeploy

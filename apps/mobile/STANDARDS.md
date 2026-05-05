# Mobile Engineering Standards — baseline para nuevos proyectos

> Documento de referencia para futuros proyectos React Native + Expo desarrollados con Claude Code.
> Captura las decisiones, patterns y gotchas aprendidas durante el desarrollo de Zenix mobile.
> Última actualización: 2026-04-30 — Sprint 8I.

---

## 1. Stack base obligatorio

| Capa | Elección | Razón |
|---|---|---|
| Runtime | **Expo SDK 54+** (managed workflow) | OTA updates, ecosystem maduro, sin Xcode/Android Studio para dev |
| Navegación | **expo-router v6+** (file-based) | Routing declarativo, tipo Next.js, deep-linking nativo |
| Animaciones | **react-native-reanimated v4** + `react-native-worklets` | UI thread, 60fps consistente, sintaxis declarativa similar a SwiftUI |
| Gestos | **react-native-gesture-handler v2** | Drag/swipe nativos, requerido por Reanimated |
| Estado servidor | **Zustand** + persist | Para sesión de auth y datos críticos cross-screen |
| API | **fetch nativo** + AbortController + retry | Sin axios — bundle slim, control total |
| Estado fetch | **TanStack Query v5** (cuando se necesite) | Cache, refetch, optimistic updates |
| Iconos | **react-native-svg** + componentes inline | Sin vector-icons libs — bundle slim, vectores nítidos |
| Haptics | **expo-haptics** | Feedback táctil estándar Apple HIG |
| Audio | **expo-audio** (no expo-av — deprecated SDK 53+) | Reemplazo oficial |
| Push | **expo-notifications** + EAS projectId | Standalone builds; en Expo Go solo local |
| Storage | **expo-secure-store** (tokens) + **AsyncStorage** (preferencias) | Tokens cifrados, preferencias claras |
| Net status | **@react-native-community/netinfo** | Connectivity para sync offline |

### Versiones a clavar en monorepos

```json
"overrides": {
  "expo": "~54.0.0",
  "react": "19.1.0",
  "react-native": "0.81.5",
  "expo-modules-core": "~3.0.30",
  "react-native-safe-area-context": "~5.6.0",
  "react-native-screens": "~4.16.0",
  "semver": "^7.7.4"
}
```

`semver: ^7` es **crítico** porque Reanimated v4 lo necesita y npm tiende a hoistear v6.

---

## 2. Estructura de carpetas (recomendada)

```
apps/mobile/
├── app/                         # expo-router file-based routes
│   ├── _layout.tsx              # Root: ErrorBoundary + GestureHandler + SafeArea
│   ├── index.tsx                # Router gate (redirect según auth)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx
│   └── (app)/
│       ├── _layout.tsx          # Bottom Tabs layout
│       ├── index.tsx            # Tab 1: Dashboard / home
│       ├── trabajo.tsx          # Tab 2: área operativa principal
│       ├── notificaciones.tsx   # Tab 3: feed
│       ├── yo.tsx               # Tab 4: perfil + settings
│       └── task/[id].tsx        # detail screens (hidden from tabs)
│
├── src/
│   ├── api/
│   │   └── client.ts            # fetch wrapper con timeout/retry/typed errors
│   ├── design/                  # design system tokens
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   ├── motion.ts            # Reanimated springs / easings
│   │   └── icons.tsx            # SVG icons inline
│   ├── features/
│   │   ├── auth/                # demo users, login helpers
│   │   ├── errors/              # ErrorBoundary, ErrorScreen, globalHandler
│   │   ├── loader/              # BrandLoader
│   │   ├── navigation/          # custom TabBar
│   │   └── notifications/       # mock data, helpers, types
│   ├── store/
│   │   ├── auth.ts              # Zustand + persist
│   │   └── ...
│   ├── notifications.ts         # push registration + listeners
│   ├── syncManager.ts           # offline sync queue
│   └── ...
├── assets/                       # icons, splash
├── app.json                      # Expo config
├── babel.config.js               # Reanimated/Worklets plugin LAST
├── metro.config.js               # Monorepo workspace config
├── tsconfig.json
├── package.json
├── .env                          # EXPO_PUBLIC_* vars (vacío por default)
└── STANDARDS.md                  # este archivo
```

### Reglas de directorio
- `app/` solo contiene **rutas** y layouts. Lógica reusable va en `src/`.
- `src/features/<dominio>/` agrupa toda la lógica de un dominio (UI + state + types).
- `src/design/` es el design system — cualquier componente nuevo importa tokens de aquí.
- Componentes con >300 líneas → split en `<Componente>.tsx` + `<Componente>.styles.ts` (futuro).

---

## 3. Configuración crítica

### `babel.config.js`

```js
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Worklets plugin MUST stay last (Reanimated v4 requirement)
      'react-native-worklets/plugin',
    ],
  }
}
```

### `metro.config.js` (para monorepos npm/yarn workspace)

```js
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = config
```

**No usar `disableHierarchicalLookup: true`** salvo que Reanimated/peer-deps lo permitan — bloquea resolución de dependencias profundas.

### `app.json` esenciales

```json
{
  "expo": {
    "name": "TuApp",
    "slug": "tu-app",
    "scheme": "tuapp",
    "userInterfaceStyle": "automatic",
    "splash": { "backgroundColor": "#0B1020" },
    "ios": { "bundleIdentifier": "com.empresa.tuapp" },
    "android": { "package": "com.empresa.tuapp" },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      ["expo-notifications", { "icon": "./assets/notification-icon.png", "color": "#10B981" }],
      "expo-audio"
    ],
    "experiments": { "typedRoutes": true }
  }
}
```

---

## 4. Patterns no negociables

### 4.1 Auto-detección de IP del dev server

Cuando el desarrollador cambia de WiFi, la IP del Mac cambia. Hardcodear en `.env` rompe el dev. **Solución**: derivar la IP del manifest de Expo.

```ts
const hostUri = Constants.expoGoConfig?.debuggerHost ?? Constants.expoConfig?.hostUri
const host = hostUri?.split(':')[0]
if (host?.match(/^\d+\.\d+\.\d+\.\d+$/)) {
  return `http://${host}:3000`  // misma máquina que Metro = el Mac dev
}
```

Ver `src/api/client.ts` para implementación completa con fallbacks.

### 4.2 Error handling de 4 capas

| Capa | Componente | Catch |
|---|---|---|
| Render | `ErrorBoundary` (class) | excepciones en render tree |
| Async | `globalErrorHandler` | unhandledRejection + ErrorUtils |
| Network | `api/client.ts` | timeouts + retries + typed errors |
| Branded fallback | `ErrorScreen` | mensajes amigables + recovery action |

Justificación: [React docs error boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) — los boundaries no atrapan async ni event handlers; los otros 3 layers cubren los gaps.

### 4.3 Push notifications con Expo Go

`getExpoPushTokenAsync()` requiere `projectId` que solo existe en builds standalone (EAS build). En Expo Go falla con "No projectId found". **Solución**: detectar y saltar.

```ts
const IS_EXPO_GO = Constants.appOwnership === 'expo'
const EAS_PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId

if (IS_EXPO_GO && !EAS_PROJECT_ID) {
  // skip — push no funciona en Expo Go sin proyecto EAS
  return
}
```

### 4.4 Reanimated v4 worklets

- Plugin en babel: `'react-native-worklets/plugin'` (LAST)
- Import: `'react-native-reanimated'` (NO `'react-native-worklets'` directo)
- Sintaxis SwiftUI-aligned:
  - `useSharedValue(initial)` ≈ `@State private var`
  - `useAnimatedStyle(() => ({ ... }))` ≈ `.animation(.spring, value: state)`
  - `withSpring(target, { damping, stiffness, mass })` ≈ `.spring(response:, dampingFraction:)`
  - `withRepeat(..., -1, true)` ≈ `.repeatForever(autoreverses: true)`

Tokens en `src/design/motion.ts` — usar siempre `MOTION.spring.standard`, nunca números mágicos.

### 4.5 Bottom Tab Navigation custom

`expo-router/Tabs` con `tabBar={(props) => <CustomBar {...props} />}` permite branding completo manteniendo el flow de navegación nativo.

Reglas:
- 3-5 tabs (Apple HIG / NN/g)
- Touch target 44×44pt mínimo
- Active state: indicator pill + color emerald + ícono filled
- Haptic `selectionAsync` al tap
- Notification badges: rojo + count o solo dot

---

## 5. Design system mínimo

### Color (semánticos)

```ts
brand:    '#10B981'  // emerald — acción / disponibilidad
warning:  '#F59E0B'  // amber  — advertencia no bloqueante
urgent:   '#EF4444'  // red    — escasez / urgencia / destructivo
canvas:   '#0B1020'  // dark-first base (Apple HIG 2024)
```

### Tipografía

System font stack (San Francisco iOS / Roboto Android). Sin web fonts custom = boot rápido + zero FOUT.

### Motion

```ts
spring.standard: { damping: 18, stiffness: 180, mass: 1 }
spring.snappy:   { damping: 14, stiffness: 260, mass: 0.8 }   // tap feedback
spring.gentle:   { damping: 22, stiffness: 90,  mass: 1.2 }   // settle
duration.fast:    180   // exits
duration.standard: 320  // entrances
```

---

## 6. Decisiones UX/UI con citación

| Decisión | Citación |
|---|---|
| Bottom tabs (no drawer) | NN/g 2018: drawer reduce uso de features 30% vs visible nav |
| 3-5 tabs máximo | Apple HIG "Tab Bars"; Hick's Law |
| Touch target 44×44 | Apple HIG "Layout Guidelines" |
| Stroke icons (no filled) | Material 3 + SF Symbols default |
| Haptic en tap crítico | Apple HIG "Playing Haptics" |
| Dark canvas | Apple HIG 2024 — apps default a system theme |
| Spring physics | SwiftUI default — feels native cross-platform |
| Empty states con valor | Apple HIG: "Communicate value, not absence" |
| Confirmación destructiva | Apple HIG "Destructive Actions" |
| Error boundary at root | React docs: "Without one, error unmounts entire tree" |
| Timeouts en fetch | Sin timeout = request hang forever en mobile networks |
| Retry con exp. backoff | Stripe SDK pattern: 3 retries 250/500/1000ms |
| Sólo retry idempotent (GET) | POST/PATCH pueden tener side effects |

---

## 7. Gotchas comunes

### 7.1 Cambio de IP en monorepo workspace
**Síntoma**: "Opening project... timed out" tras cambiar de red.
**Causa**: IP del Mac cambió, app/.env todavía apunta a la vieja.
**Solución**: usar auto-detección desde manifest (§4.1).

### 7.2 Bundle Metro 404 "Unable to resolve ./index"
**Síntoma**: `curl localhost:8081/index.bundle` da 404 con resolveError.
**Causa**: en monorepo, Metro busca el entry desde el workspace root.
**Solución**: crear `metro.config.js` con `projectRoot = __dirname` (§3).

### 7.3 React 19 + Native peer dep error
**Síntoma**: `npm install` falla con ERESOLVE sobre `@types/react`.
**Causa**: peer dep mismatch entre React 18 (web app) y React 19 (mobile).
**Solución**: actualizar `apps/mobile/package.json` `"@types/react": "~19.1.10"`.

### 7.4 Reanimated v4 — semver missing
**Síntoma**: bundle 500 "Unable to resolve module semver/functions/satisfies".
**Causa**: Reanimated declara semver@^7, npm hoistea v6 desde otra dep.
**Solución**: `overrides.semver: ^7.7.4` en root `package.json` + reinstall.

### 7.5 Expo Go push notifications
**Síntoma**: "No projectId found" durante login.
**Causa**: Expo Go no tiene EAS projectId.
**Solución**: guard con `Constants.appOwnership === 'expo'` (§4.3).

### 7.6 expo-notifications SDK 54 breaking change
**Síntoma**: TS error `shouldShowAlert` no asignable a `NotificationBehavior`.
**Causa**: SDK 54 reemplazó `shouldShowAlert` con `shouldShowBanner` + `shouldShowList`.
**Solución**: usar los nuevos campos.

### 7.7 metro.config.js + disableHierarchicalLookup
**Síntoma**: bundle hang silencioso (no responde, no error).
**Causa**: `disableHierarchicalLookup: true` bloquea resolución de transitive deps de Reanimated.
**Solución**: omitir esa opción o probar primero sin ella.

### 7.8 Metro manifest stale después de cambio de WiFi
**Síntoma**: `Could not connect to development server` con URL apuntando a IP antigua, aunque Metro reportee 200 OK.
**Causa**: el proceso Metro heredó la IP del momento de arranque. Cambiar de red cambia la IP del Mac pero el manifest sigue embebiendo la IP vieja.
**Solución**: matar procesos Metro completamente + restart con `--clear` y `REACT_NATIVE_PACKAGER_HOSTNAME` actualizado:
```bash
pkill -9 -f "expo start"
lsof -ti :8081 | xargs kill -9
NEW_IP=$(ipconfig getifaddr en0)
REACT_NATIVE_PACKAGER_HOSTNAME=$NEW_IP npx expo start --lan --clear
```
**NOTA**: la auto-detección de IP en `api/client.ts` (§4.1) NO te salva de esto — esa lógica usa la IP del manifest, así que si el manifest tiene IP vieja, el API client también la usa. El manifest debe ser correcto first.

### 7.9 Expo Go cachea URL del QR escaneado
**Síntoma**: re-escanear nuevo QR no funciona — sigue intentando IP vieja.
**Causa**: Expo Go mantiene la conexión al último dev server hasta que se desconecta explícitamente.
**Solución**: en Expo Go, shake el celular → tap "Disconnect" → escanear el nuevo QR. O force-quit Expo Go y abrir de nuevo con el QR fresco.

---

## 8. Dev workflow

### Iniciar dev (desde monorepo root)
```bash
# Terminal 1: API
cd apps/api && npx nodemon --watch src --ext ts --exec "ts-node -r tsconfig-paths/register src/main.ts"

# Terminal 2: Mobile (LAN para Expo Go en celular físico)
cd apps/mobile && REACT_NATIVE_PACKAGER_HOSTNAME=$(ipconfig getifaddr en0) npx expo start --lan
```

### Testing en celular físico
1. Instala **Expo Go** desde App Store / Play Store
2. Asegura que celular y Mac estén en **la misma red WiFi**
3. Escanea el QR con la cámara (iOS) o la app Expo Go (Android)
4. La app se carga vía LAN — primer bundle ~30-60s, luego hot reload <2s

### Cambio de red WiFi
Con la auto-detección activa (§4.1), no hay que tocar nada. Si por alguna razón no funciona:
```bash
ipconfig getifaddr en0    # ver IP actual
# reiniciar Metro con la nueva IP
REACT_NATIVE_PACKAGER_HOSTNAME=<NEW_IP> npx expo start --lan
```

### Verificación pre-PR
```bash
npx tsc --noEmit          # type check
npx expo-doctor           # SDK health (debe ser 17/17 passed)
```

---

## 9. Checklist para nuevos proyectos

Cuando arranques un proyecto nuevo con Claude Code:

- [ ] Crear app con `npx create-expo-app` SDK más reciente
- [ ] Migrar a monorepo (apps/mobile, packages/shared)
- [ ] Crear `metro.config.js` (§3)
- [ ] Crear `babel.config.js` con worklets plugin LAST (§3)
- [ ] Configurar `overrides` en root package.json para deduplicar (§1)
- [ ] Crear estructura de carpetas (§2)
- [ ] Setup design system (`src/design/colors.ts` + `motion.ts` + `typography.ts`)
- [ ] ErrorBoundary + ErrorScreen + globalErrorHandler (§4.2)
- [ ] api/client.ts con timeout/retry/typed errors (§4.2)
- [ ] Auto-detección de IP (§4.1)
- [ ] Guard de Expo Go en push notifications (§4.3)
- [ ] Custom TabBar branded (si app es multi-screen)
- [ ] Login con BrandLoader (consistencia visual)
- [ ] Tests con jest-expo (mínimo: smoke test que renderice login)
- [ ] Documentar credenciales demo en README (con guards `__DEV__`)
- [ ] Verificar `expo-doctor` pasa 17/17 antes de cualquier feature
- [ ] CI: `tsc --noEmit` + `eslint` en pre-merge

---

## 10. Referencias canónicas

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) — UX iOS
- [Material Design 3](https://m3.material.io/) — UX Android
- [Nielsen Norman Group](https://www.nngroup.com/) — usability research
- [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/quickref/) — accesibilidad
- [Expo Documentation](https://docs.expo.dev/) — official SDK
- [React Native Docs](https://reactnative.dev/docs/getting-started) — runtime
- [Reanimated Documentation](https://docs.swmansion.com/react-native-reanimated/) — animaciones
- [Expo Monorepos guide](https://docs.expo.dev/guides/monorepos/) — workspace config

---

> Este documento se actualiza con cada sprint que descubre un nuevo gotcha o pattern. Si haces algo no trivial, agrégalo aquí — el siguiente proyecto te lo agradecerá.

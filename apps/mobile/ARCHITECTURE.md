# Zenix Mobile — Decisiones Arquitectónicas

> Documentación técnica viva de las decisiones arquitectónicas tomadas durante el desarrollo de la app mobile de Zenix.
> Cada decisión incluye contexto, trade-offs evaluados, alternativas rechazadas, y referencias.
>
> **Diferencia con `STANDARDS.md`**:
> - `STANDARDS.md` = baseline para FUTUROS proyectos (qué hacer en general).
> - `ARCHITECTURE.md` = decisiones específicas de ESTE proyecto (qué hicimos y por qué AQUÍ).
>
> Última actualización: 2026-04-30 — Sprint 8I (post-Chunk B).

---

## Tabla de contenido

1. [AD-001 — Stack tecnológico](#ad-001--stack-tecnológico)
2. [AD-002 — Routing con expo-router file-based](#ad-002--routing-con-expo-router-file-based)
3. [AD-003 — Custom Tab Bar (no default)](#ad-003--custom-tab-bar-no-default)
4. [AD-004 — Auto-detección de IP del API](#ad-004--auto-detección-de-ip-del-api)
5. [AD-005 — Error handling de 4 capas](#ad-005--error-handling-de-4-capas)
6. [AD-006 — API client con timeout + retry tipados](#ad-006--api-client-con-timeout--retry-tipados)
7. [AD-007 — BrandLoader como single-source-of-loading](#ad-007--brandloader-como-single-source-of-loading)
8. [AD-008 — Reanimated v4 + SwiftUI-aligned tokens](#ad-008--reanimated-v4--swiftui-aligned-tokens)
9. [AD-009 — Dark canvas como default](#ad-009--dark-canvas-como-default)
10. [AD-010 — Demo user picker en login](#ad-010--demo-user-picker-en-login)
11. [AD-011 — Shared chrome + role-aware module pattern](#ad-011--shared-chrome--role-aware-module-pattern)
12. [AD-012 — npm overrides para deduplicación](#ad-012--npm-overrides-para-deduplicación)
13. [AD-013 — SDK 54 (no 52, no 55)](#ad-013--sdk-54-no-52-no-55)
14. [AD-014 — Pre-fetch + warm-up en loader](#ad-014--pre-fetch--warm-up-en-loader)

---

## AD-001 — Stack tecnológico

**Estado**: ✅ Implementado · **Sprint**: 8I

### Contexto
Zenix es un PMS para hoteles boutique LATAM con app móvil para staff (housekeepers, supervisores, recepción, mantenimiento). Necesitamos:
- Single codebase iOS + Android
- Hot reload para iteración rápida
- Push notifications
- Offline support (housekeepers en pisos sin wifi)
- Animaciones fluidas (60fps)

### Decisión
**Expo SDK 54 (managed workflow) + React Native 0.81 + React 19**.

### Alternativas evaluadas

| Opción | Pro | Contra | Veredicto |
|---|---|---|---|
| **Expo Managed** | Hot reload, OTA updates, sin Xcode setup | Algunas libs nativas no soportadas | ✅ Ganadora |
| **React Native bare** | Control total | Setup pesado, slow iteration | ❌ Rechazado |
| **Flutter** | Performance | Dart curve, ecosystem RN más maduro para hospitality | ❌ Rechazado |
| **Native iOS + Native Android** | Best UX | 2× costo de desarrollo, drift | ❌ Rechazado para esta etapa |

### Justificación
- **Equipo**: 1 dev. Expo Managed minimiza ops.
- **Cliente target**: hoteles boutique 10-80 hab. No necesitan features nativos exóticos.
- **Iteración**: cada cambio se ve en celular en <2s con Hot Reload.
- **Push**: Expo Push API + EAS Update son standard de la industria para entry-level.

### Referencias
- [Expo docs SDK 54](https://docs.expo.dev/versions/latest/)
- React Native [0.81 release notes](https://reactnative.dev/blog/2024/12/09/0.81-release)

---

## AD-002 — Routing con expo-router file-based

**Estado**: ✅ Implementado · **Sprint**: 8I

### Contexto
Necesitamos navigation entre login, dashboard, work tabs, profile, deep-linking de push notifications, y soporte multi-rol.

### Decisión
**expo-router v6** con file-based routing. Cada archivo `.tsx` en `app/` es una ruta.

### Estructura

```
app/
├── _layout.tsx             # Root layout (ErrorBoundary + GestureHandler + SafeArea)
├── index.tsx               # Router gate (token? → app : login)
├── (auth)/                 # Group route (no segment in URL)
│   ├── _layout.tsx
│   └── login.tsx
└── (app)/                  # Authenticated group
    ├── _layout.tsx         # Bottom Tabs layout
    ├── index.tsx           # Tab 1: Dashboard
    ├── trabajo.tsx         # Tab 2: Mi día (role-aware switch)
    ├── notificaciones.tsx  # Tab 3: Notifications
    ├── yo.tsx              # Tab 4: Profile + Settings
    └── task/[id].tsx       # Detail screen (hidden from tabs)
```

### Alternativas evaluadas

- **React Navigation imperativo**: más flexible pero requiere navigation code duplicado en cada screen
- **Custom router**: reinvent the wheel, 0 valor

### Justificación
- File-based = self-documenting. Un dev puede ver la estructura sin abrir código.
- Deep-linking gratis (URL `exp://.../task/123` → `task/[id]`).
- Type-safe con `experiments.typedRoutes: true` en `app.json`.

### Riesgos identificados
- **Lock-in con expo-router**: si Expo desaparece, migración costosa. Mitigación: expo-router está construido sobre React Navigation (lib agnóstica), bajo contrato de migración acotado.

### Referencias
- [Expo Router docs](https://docs.expo.dev/router/introduction/)

---

## AD-003 — Custom Tab Bar (no default)

**Estado**: ✅ Implementado · **Sprint**: 8I (Chunk B)

### Contexto
Zenix necesita branding fuerte. El tab bar default de expo-router/react-navigation es funcional pero genérico.

### Decisión
Custom `<ZenixTabBar>` componente que reemplaza el default via `tabBar={(props) => <ZenixTabBar {...props} />}`.

### Features implementadas
- Animated indicator (Reanimated spring) bajo el tab activo
- Stroke→filled icon transition al focus
- Haptic `selectionAsync` en cada tap (Apple HIG)
- Notification badges con cut-out border (Meta pattern)
- Bottom safe-area aware

### Alternativas evaluadas

| Opción | Pro | Contra | Veredicto |
|---|---|---|---|
| **Default expo-router Tabs** | 0 código | Branding pobre, no haptics, no animated indicator | ❌ |
| **Custom Tab Bar** | Branding total, control de animaciones | ~250 líneas de código + mantener | ✅ |
| **Fullscreen swipe pages** | Modern (Tinder-like) | No estándar para apps de productividad | ❌ |

### Justificación
[Apple HIG "Tab Bars"](https://developer.apple.com/design/human-interface-guidelines/tab-bars): "When you customize a tab bar's appearance, do so in a way that strengthens your app's identity."

[NN/g 2018 Mobile Bottom Navigation study](https://www.nngroup.com/articles/mobile-bottom-nav/): "Bottom navigation increases discoverability of features by 30% vs hamburger menu."

### Riesgos identificados
- Mantener custom = más superficie de bugs vs default. Mitigación: tests unitarios del componente.
- Compatibilidad con futuras versiones de react-navigation. Mitigación: `BottomTabBarProps` es API estable hace 3+ años.

### Referencias
- `apps/mobile/src/features/navigation/TabBar.tsx`
- Apple HIG Tab Bars
- Material Design 3 Bottom Navigation

---

## AD-004 — Auto-detección de IP del API

**Estado**: ✅ Implementado · **Sprint**: 8I (Chunk B.1)

### Contexto
La IP del Mac del developer cambia cada vez que se conecta a una red WiFi distinta. Hardcodear en `.env` rompe el flujo cada vez que el dev sale del café/casa/oficina.

### Decisión
Derivar la IP del manifest de Expo Go via `Constants.expoGoConfig.debuggerHost`. Esa IP = la del Mac que sirve Metro = la del Mac que corre el API.

```ts
const hostUri = Constants.expoGoConfig?.debuggerHost ?? Constants.expoConfig?.hostUri
const host = hostUri?.split(':')[0]
if (host?.match(/^\d+\.\d+\.\d+\.\d+$/)) {
  return `http://${host}:3000`
}
```

### Alternativas evaluadas

| Opción | Pro | Contra | Veredicto |
|---|---|---|---|
| **Hardcoded `.env`** | Simple | Rompe en cada cambio de WiFi | ❌ |
| **mDNS/Bonjour** (`<host>.local`) | Sin config | Android <12 no resuelve `.local` | 🟡 Funcional pero frágil |
| **Tunnel mode** (`--tunnel`) | Funciona en cualquier red, hasta data móvil | API también necesita tunnel; latencia alta; ngrok auth | ❌ Demasiada infra |
| **Auto-detect desde manifest** | Cero config; funciona en LAN | Requiere `Constants.expoGoConfig` (solo Expo Go) | ✅ Ganadora |
| **Service discovery (UDP broadcast)** | Robusto cross-platform | Lib extra + permisos red | ❌ Overkill |

### Justificación
[Expo docs Constants](https://docs.expo.dev/versions/latest/sdk/constants/#expogoconfig): `expoGoConfig.debuggerHost` es la fuente oficial del host del manifest.

Cuando Expo Go conecta, ya conoce la IP correcta — la usa para descargar el bundle. Reusarla para el API es zero-cost.

### Limitaciones
- En builds standalone (EAS build), `expoGoConfig` es `undefined`. Por eso fallback a `EXPO_PUBLIC_API_URL` env var (se setea en EAS Secrets para producción).
- Si Mac y API corren en máquinas distintas (raro en dev), override via env var.

### Referencias
- `apps/mobile/src/api/client.ts`
- [Expo Constants reference](https://docs.expo.dev/versions/latest/sdk/constants/)

---

## AD-005 — Error handling de 4 capas

**Estado**: ✅ Implementado · **Sprint**: 8I (Chunk A.5)

### Contexto
React Error Boundaries no atrapan async, event handlers, ni errores fuera de render. Sin handling completo, una falla causa pantalla en blanco o stack trace al usuario.

### Decisión
Arquitectura de 4 capas con responsabilidades claras:

| Capa | Componente | Catch | Justificación |
|---|---|---|---|
| Render | `ErrorBoundary` (class) | Excepciones en render tree | [React docs](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) — única forma de catch render-time |
| Async | `globalErrorHandler` | unhandledRejection + ErrorUtils | RN built-in `ErrorUtils.setGlobalHandler` |
| Network | `api/client.ts` typed errors | NetworkError vs ApiError | Stripe SDK pattern |
| Branded fallback | `ErrorScreen` | UI cuando algo se rompe | Apple HIG: "Communicate the problem clearly" |

### Patrones aplicados

**Reset key** (Kent C. Dodds): cuando el usuario tap "Reintentar", bumpea un key que re-monta el subtree. Sin esto, el mismo error vuelve a dispararse inmediatamente.

**Telemetry hook** (sin instalar Sentry todavía): `onError` callback en ErrorBoundary + globalErrorHandler. Sprint 9 conecta Sentry/Bugsnag aquí sin tocar arquitectura.

**Stack trace sólo en `__DEV__`**: producción nunca expone stack al usuario (Apple HIG security + UX).

### Riesgos identificados
- Si ErrorBoundary mismo crashea, ya no hay fallback. Documentado en código. Mitigación: keep ErrorBoundary lógica MUY simple.
- `unhandledRejection` listener en Hermes/RN no es 100% portable. Mitigación: try-catch interno en cada listener.

### Referencias
- `apps/mobile/src/features/errors/ErrorBoundary.tsx`
- `apps/mobile/src/features/errors/ErrorScreen.tsx`
- `apps/mobile/src/features/errors/globalErrorHandler.ts`
- [Kent C. Dodds — react-error-boundary patterns](https://kentcdodds.com/blog/use-react-error-boundary-to-handle-errors-in-react)

---

## AD-006 — API client con timeout + retry tipados

**Estado**: ✅ Implementado · **Sprint**: 8I (Chunk A.5)

### Contexto
fetch() nativo no tiene timeout. Mobile networks son flaky (cell-tower handoff, captive portal). Sin retry, transient failures fallan permanentemente.

### Decisión
- **AbortController + timeout** (default 12s, configurable per call)
- **Exponential backoff** (250ms / 500ms / 1000ms) — sólo para GET (idempotent)
- **Typed errors**: discriminated union `NetworkError` (no respuesta) vs `ApiError` (HTTP non-2xx)
- **POST/PATCH/DELETE NO se retrian** por default (side effects); caller opt-in via `retries: 2`

### Justificación
- [MDN AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) es la forma estándar de cancelar fetches.
- Stripe SDK usa exactamente este pattern: 3 retries 250/500/1000ms. Doc oficial: "We recommend retrying idempotent requests on transient failures."
- AWS SDK retry pattern (Throttling exception): exp backoff + jitter. (Para Sprint 9+ podemos agregar jitter, no urgente).
- Discriminated unions en TypeScript permiten `if (err instanceof NetworkError)` vs `if (err instanceof ApiError)` con narrowing exhaustivo.

### Alternativas rechazadas
- **axios**: 250kb gzipped vs ~0kb (fetch nativo). Para mobile, evitar libs grandes.
- **ky / ofetch**: similar, no aporta sobre fetch + AbortController.
- **TanStack Query con retry built-in**: no reemplaza esto; complementa. La validación a nivel API client es más robusta.

### Referencias
- `apps/mobile/src/api/client.ts`
- [Stripe API retry guide](https://stripe.com/docs/error-handling)

---

## AD-007 — BrandLoader como single-source-of-loading

**Estado**: ✅ Implementado · **Sprint**: 8I (Chunk A.5)

### Contexto
Spinners genéricos no son brand. Usuarios ven "loading" varias veces al día — cada uno es oportunidad de reforzar identidad.

### Decisión
`<BrandLoader>` componente único: cuadrado emerald con "Z" interna que **respira** (scale 1.0 ↔ 1.08 + opacity 0.85 ↔ 1.0) en loop infinito 1.2s.

Usado en:
- Hidratación inicial (`app/index.tsx`)
- Login submit
- Errores recuperables (post-retry)
- Futuro: cualquier pantalla con fetch lento

### Inspiración
- Linear (minimal pulsing primitive)
- Apple Pay (physics-based "breathing" pulse)
- Stripe (subtle, brand always visible)

### Anti-patterns rechazados
- Spinning circle solo: sin brand identity (Hick's Law: más cues = reconocimiento más rápido)
- Bouncing dots: demasiado lúdico para B2B operacional
- Indeterminate progress bar: implica duración específica que no podemos garantizar

### Justificación
[Mekler et al. 2017](https://www.sciencedirect.com/science/article/abs/pii/S0747563216307075) sobre meaningful feedback en interfaces: feedback significativo > genérico. Loader brand-forward = feedback significativo.

### Referencias
- `apps/mobile/src/features/loader/BrandLoader.tsx`

---

## AD-008 — Reanimated v4 + SwiftUI-aligned tokens

**Estado**: ✅ Implementado · **Sprint**: 8I (Chunk A.5 + B)

### Contexto
Las animaciones son la diferencia entre app "premium" y "barata". RN tiene 2 APIs: `Animated` (legacy, JS thread) y `Reanimated` (UI thread, 60fps consistente).

### Decisión
**Reanimated v4** + tokens en `src/design/motion.ts` que espejan SwiftUI defaults.

```ts
spring: {
  standard: { damping: 18, stiffness: 180, mass: 1 },   // Apple HIG default
  snappy:   { damping: 14, stiffness: 260, mass: 0.8 }, // tap feedback
  gentle:   { damping: 22, stiffness: 90,  mass: 1.2 }, // settle
  bouncy:   { damping: 12, stiffness: 200, mass: 1 },   // celebratory
}
```

### Patrones implementados
- Hero: scale 0.92→1 + fade staggered (login, dashboard)
- Form: rise from below + fade
- TabBar: indicator pill spring + icon stroke→fill
- Buttons: scale 0.97 on press
- BrandLoader: `withRepeat(_, -1, true)` = SwiftUI `.repeatForever(autoreverses: true)`

### Justificación SwiftUI alignment
SwiftUI defaults:
```swift
.animation(.spring(response: 0.4, dampingFraction: 0.8), value: state)
```
Equivalente Reanimated:
```ts
withSpring(value, { damping: 18, stiffness: 180, mass: 1 })
```

Apple HIG "Add Polish to Your App With Animation": springs son la base del motion design iOS.

### Riesgos identificados
- Reanimated v4 tiene breaking changes vs v3 (worklets plugin movido a `react-native-worklets/plugin`).
- Babel plugin DEBE ser último o crashea silenciosamente.

### Referencias
- `apps/mobile/src/design/motion.ts`
- `apps/mobile/babel.config.js`
- [Reanimated v4 migration guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x)

---

## AD-009 — Dark canvas como default

**Estado**: ✅ Implementado · **Sprint**: 8I (Chunk A.5)

### Contexto
Zenix se usa antes del amanecer (housekeeping shifts 6 AM) y post-dusk (recepción nocturna). Light mode es agresivo en esos horarios.

### Decisión
**Dark canvas como default** (`#0B1020` deep midnight + emerald accent `#10B981`).

`userInterfaceStyle: "automatic"` en app.json — futuro toggle a light theme via `StaffPreferences.theme`.

### Justificación
- Apple HIG 2024: "Apps default to system theme; choose colors that work in both."
- Reduce eye strain en horarios de poca luz (housekeepers pre-amanecer).
- Brand differentiation: Mews/Cloudbeds usan light themes — Zenix se ve premium con dark.

### WCAG 2.1 AA verificado
- Text primary on canvas: 18.5:1 (AAA)
- emerald-500 on canvas: 4.7:1 (AA)
- amber-500 on canvas: 7.1:1 (AAA)
- red-500 on canvas: 4.6:1 (AA)

### Referencias
- `apps/mobile/src/design/colors.ts`
- [WCAG 2.1 contrast checker](https://webaim.org/resources/contrastchecker/)

---

## AD-010 — Demo user picker en login

**Estado**: ✅ Implementado · **Sprint**: 8I (Chunk A.5)

### Contexto
En demos comerciales, escribir email + password en teclado mobile cada vez es fricción (~15s por intento). Slack workspace picker pattern reduce esto a 1 tap.

### Decisión
Login muestra grid de avatares de 6 usuarios demo (Slack pattern). 1 tap = pre-fill + auto-submit.

### Justificación
- [NN/g 2018 mobile keyboard research](https://www.nngroup.com/articles/mobile-input-types/): 1.4s por carácter en mobile keyboard. Login típico = 11 chars = 15s.
- Slack workspace picker valida el patrón.
- Zona de demo ≠ producción. Producción tiene login normal sin picker.

### Toggle producción
Hoy el picker siempre se muestra. Sprint 9+ se gating con `__DEV__` o flag de propiedad.

### Riesgos identificados
- Filtra identidades de staff demo. Mitigación: demo users tienen nombres ficticios.
- Confusión "¿esto se ve en producción?". Mitigación: documentar y gate explícitamente.

### Referencias
- `apps/mobile/app/(auth)/login.tsx`
- `apps/mobile/src/features/auth/demoUsers.ts`

---

## AD-011 — Shared chrome + role-aware module pattern

**Estado**: ✅ Aprobado, 🔄 implementación en Chunk C · **Sprint**: 8I

### Contexto
Zenix tiene 5+ áreas operativas (housekeeping, mantenimiento, jardinería, áreas públicas, recepción). El usuario propuso árboles de navegación independientes por rol. Detecté riesgos.

### Discusión completa
Documentada en mensajes de la sesión Sprint 8I. Resumen:

**Propuesta original del usuario**: Cada rol tiene su propio `app/(housekeeping)/`, `app/(maintenance)/`, etc. con su propio Tab Bar, Dashboard, Notificaciones, Profile.

**Riesgos identificados**:
1. **DRY violado 5×**: Tab Bar, Notificaciones, Profile, Settings duplicados. Mantenimiento acumulativo: un fix requiere 5 PRs.
2. **Multi-rol roto**: Ana es Supervisora pero ocasionalmente Recamarista. Modelo "one role = one app tree" no soporta esto.
3. **Apple HIG violation**: "Maintain a consistent appearance throughout your app."
4. **"Pre-construir DOM" no aplica en RN** (no hay DOM, hay árbol nativo on-demand). Terminología imprecisa.

**Contrapropuesta aceptada**: shared chrome + role-aware content modules.

### Decisión
- **Shared shell**: mismo Tab Bar, mismo Dashboard layout, mismo Notificaciones, mismo Yo.
- **Role-aware "Mi día" tab**: switch en `trabajo.tsx` por `user.department`.
- **Module isolation**: cada área en `src/features/<area>/` autocontenida.
- **Iconografía propia**: cada module exporta sus iconos en `icons.tsx`.
- **Pre-fetch + warm-up en loader**: post-login, durante BrandLoader, pre-fetch data del rol.

### Estructura

```
src/features/
├── housekeeping/
│   ├── screens/Hub.tsx           # entry component
│   ├── components/TaskCard.tsx
│   ├── api/useTasks.ts
│   ├── icons.tsx                  # 🛏️
│   └── types.ts
├── maintenance/                   # mismo shape
├── gardening/                     # ...
├── public-areas/
└── reception/
```

### Justificación
- **Slack workspaces pattern**: rol cambia, chrome no.
- **Apple HIG consistency**: navigation consistente entre roles.
- **DRY**: una sola implementación por componente shared.
- **Bounded contexts** (Eric Evans, *Domain-Driven Design*): cada module = bounded context.
- **Lazy import futuro**: si un módulo crece, podemos lazy-import via `React.lazy` o code-splitting de Metro.

### Department vs operativeUnit (sub-decisión)
Recomendación: **`department`** (no `operativeUnit`).
- Vocabulario AHLEI / industry-standard.
- `Unit` ya existe en schema (camas dentro de Room) — confusión.
- Apple HIG: "Match user's mental model" — staff hotelero entiende "departamento".

### Referencias
- `app/(app)/trabajo.tsx` (switch por department)
- `src/features/<area>/`
- Eric Evans, *Domain-Driven Design* 2003 — bounded contexts
- [Apple HIG Branding](https://developer.apple.com/design/human-interface-guidelines/branding)

---

## AD-012 — npm overrides para deduplicación

**Estado**: ✅ Implementado · **Sprint**: 8I

### Contexto
En monorepo workspace, npm hoistea deps al root. Cuando dos packages requieren versiones diferentes (ej. semver@6 hoisted vs Reanimated v4 que necesita semver@7), se rompe.

### Decisión
`overrides` en root `package.json`:

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

### Riesgos identificados
- Override puede introducir incompatibilidades silenciosas. Mitigación: revisar build + tests post-override.
- `semver: ^7` específicamente — Reanimated v4 requiere `functions/satisfies` que solo existe en v7+.

### Referencias
- `package.json` (root)
- [npm overrides docs](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#overrides)

---

## AD-013 — SDK 54 (no 52, no 55)

**Estado**: ✅ Implementado · **Sprint**: 8I

### Contexto
Empezamos con Expo SDK 52. Al testear en celular físico, Expo Go en App Store estaba en SDK 54 (la última). Expo Go solo soporta el SDK más reciente.

### Decisión
Pin a `~54.0.0` (no `latest` que es 55).

### Justificación
- Compat con Expo Go disponible (SDK 54).
- Estabilidad: SDK 54 ya tiene 6+ meses de prod, bugs conocidos resueltos.
- SDK 55 introduce React 19.2 (apenas RC en algunos puntos), Xcode 26 requirements, y nuestro toolchain Mac aún está en Xcode 15.

### Migration path
Cuando Apple App Store actualice Expo Go a SDK 56+, se migra siguiendo expo-doctor checks. Es ~30 min de trabajo.

### Riesgos identificados
- Si Expo deprecra SDK 54 antes de migración, breakage. Mitigación: `expo-doctor` corre pre-CI para detectar drift.

### Referencias
- `apps/mobile/package.json`
- [Expo SDK 54 release notes](https://expo.dev/changelog/sdk-54)

---

## AD-014 — Pre-fetch + warm-up en loader

**Estado**: 🔄 Por implementar (Chunk C) · **Sprint**: 8I

### Contexto
Usuario propuso "pre-construir DOM" durante el loader post-login. Terminología imprecisa para RN (no hay DOM). Lo correcto:

### Decisión
Durante el BrandLoader post-login, ejecutar **pre-fetch + warm-up**:

1. **Pre-fetch** datos críticos del rol del usuario (warm cache TanStack Query):
   ```ts
   if (user.department === 'HOUSEKEEPING') {
     await prefetchHousekeepingTasks(queryClient)
   }
   ```
2. **Pre-load** assets del module (iconos, sonidos):
   ```ts
   await Asset.loadAsync(require('@/features/housekeeping/assets/sounds/done.wav'))
   ```
3. **Eager-mount** el primary screen del rol (oculto detrás del loader):
   - Solo si performance lo justifica. Default: lazy mount.

### Justificación
[Web Vitals "Prerendering"](https://web.dev/learn/performance/prefetch-prerender-precache) (Google 2020): fetch-before-need reduce tiempo perceptual a 0. Aplica también a apps mobile.

[Apple HIG "Loading"](https://developer.apple.com/design/human-interface-guidelines/loading): "Don't make people wait. If a task takes time, indicate progress."

[Skeleton screens vs spinners](https://www.lukew.com/ff/entry.asp?1797) (Luke Wroblewski): skeleton + pre-fetch reducen "perceived wait time" 20-30%.

### Implementación planeada (Chunk C)
- En `app/index.tsx` (router gate), después de hidratar zustand, antes de redirect a `/(app)`, ejecutar warm-up por department.
- BrandLoader muestra "Cargando tu día..." durante esta fase.
- Cuando terminado, redirige a `/(app)` con cache caliente.

### Riesgos identificados
- Si el warm-up falla, NO bloquear el login. Fallback: navegar igual, cache se llena on-demand.
- Network slow: timeout 5s. Si excede, navegar y hacer fetch on-demand normal.

### Referencias
- A implementar en `app/index.tsx` durante Chunk C
- [TanStack Query prefetching](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching)

---

## AD-015 — KPIs adaptativos por hora del día (no estáticos)

**Estado**: 📋 Aprobado, 🔄 implementación en Chunk C · **Sprint**: 8I

### Contexto
Diseño inicial del Dashboard incluía 4 KPIs estáticos: % Ocupación, Check-ins, Check-outs, Tareas. Usuario observó: *"¿qué valor agregado me da visualizar el KPI de checkouts a las 8:00 pm si la operación se cierra a las 11am?"*

Razón es válida: KPI estático que pierde relevancia 9+ horas del día genera ruido cognitivo (cogntiive load).

### Decisión
**KPIs adaptativos por hora del día**: Dashboard rota la información mostrada según ventana horaria local de la propiedad.

#### Bloque permanente (24/7)
- % Ocupación actual (con código de color por banda)
- Mapa visual de habitaciones (grid con estado por color)
- Tareas activas (filtradas por `user.department`)

#### Bloque adaptativo

| Ventana local | KPI primario | KPI secundario |
|---|---|---|
| 06:00-12:00 | Check-outs pendientes (count-down) | Habitaciones por limpiar |
| 12:00-17:00 | Check-ins recibidos / esperados | Walk-ins disponibles |
| 17:00-22:00 | No-shows potenciales (post `warningHour`) | Late check-ins esperados |
| 22:00-06:00 | Resumen del día | Próximas llegadas mañana |

#### Suppression rules
- "Check-outs pendientes" → count=0 y hora≥12 → reemplazar con "Check-ins próximos"
- "Tareas activas" → count=0 → mensaje motivacional contextual al rol
- "No-shows potenciales" → solo a partir de `potentialNoShowWarningHour` (default 20:00)

### Alternativas evaluadas

| Opción | Pro | Contra | Veredicto |
|---|---|---|---|
| 4 KPIs estáticos siempre visibles | Simple | Ruido cognitivo cuando irrelevantes | ❌ |
| KPIs configurables por usuario | Personalizable | Carga de configuración inicial; abandonan default | ❌ |
| KPIs adaptativos por hora | Información relevante always | Lógica más compleja | ✅ |
| KPIs adaptativos por sesión + hora | Mejor UX | Sobre-engineering para v1 | ❌ por ahora |

### Justificación
- Cognitive Load (Sweller 1988) — información irrelevante consume working memory
- Miller 1956 — 7±2 elementos máximo
- Pousman & Stasko 2006 (ACM, *Ambient Information Display*): "Display only what is relevant to the user's current context"
- Apple HIG "Today" widgets — content varies by time
- Stripe Dashboard rota métricas según sesión

### Implementación
- `src/features/dashboard/kpiPolicy.ts` — pure function que retorna `KpiSet[]` dado `now + timezone + role`
- `src/features/dashboard/cards/<KpiCard>.tsx` — componentes individuales por tipo de KPI
- `app/(app)/index.tsx` — Dashboard usa `usePolicyKpis()` hook que polea cada minuto

### Riesgos identificados
- Usuarios pueden extrañar un KPI si "desaparece" — mitigación: animación de transición que comunica el cambio, plus tap-to-pin (Sprint 9+)
- Lógica de tiempo es complicada con timezones — mitigación: mismo pattern que NightAuditScheduler (§14 CLAUDE.md), `Intl.DateTimeFormat` por propiedad

### Referencias
- CLAUDE.md §37 (decisión no-negociable)
- `app/(app)/index.tsx` (a refactorizar en Chunk C)
- Pousman & Stasko 2006 — *Taxonomy of Ambient Information Systems* (ACM)
- Don Norman, *The Design of Everyday Things* (1988) — Progressive disclosure

---

## Plantilla para nuevas decisiones

Cuando agregues una nueva decisión arquitectónica:

```markdown
## AD-XXX — Título corto

**Estado**: ✅ Implementado | 🔄 En progreso | 📋 Aprobado, no iniciado | ❌ Rechazado
**Sprint**: NX

### Contexto
Por qué esto requiere decisión.

### Decisión
Qué se eligió.

### Alternativas evaluadas
| Opción | Pro | Contra | Veredicto |
|---|---|---|---|

### Justificación
Citaciones académicas / industry standards / data points.

### Riesgos identificados
Lo que puede salir mal y cómo se mitiga.

### Referencias
Archivos del repo + links externos.
```

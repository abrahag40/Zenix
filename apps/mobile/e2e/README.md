# E2E Tests — Detox setup

Pending setup explícito (NO incluido en repo todavía):

```bash
# Una vez por workspace
cd apps/mobile
npm i -D detox detox-cli @types/jest

# iOS
npx pod-install
detox init -r jest

# Crear .detoxrc.js apuntando a Expo dev build
```

`.detoxrc.js` reference config para Expo SDK 54:

```js
module.exports = {
  testRunner: { args: { config: 'e2e/jest.config.js' } },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/Zenix.app',
      build: 'expo run:ios --no-bundler',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'expo run:android --no-bundler',
    },
  },
  devices: {
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 15' } },
    emulator: { type: 'android.emulator', device: { avdName: 'Pixel_7_API_34' } },
  },
  configurations: {
    'ios.sim.debug': { device: 'simulator', app: 'ios.debug' },
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
  },
}
```

## Run

```bash
# 1. Backend + seed
cd apps/api && npm run dev &
cd apps/api && npm run seed

# 2. Build mobile + test
cd apps/mobile
detox build -c ios.sim.debug
detox test -c ios.sim.debug
```

## What's tested

Smoke flow `learning.e2e.ts`:
- Login `s@z.co` → Tab Aprende aparece (DLC seeded ACTIVE)
- Catálogo → Course detail → Inscribirme
- Lesson HTML5 + quiz inline
- Lesson AUDIO con expo-audio play/pause
- Mini-player Spotify-style persiste en tab Inicio
- Examen full-screen submit

## Out of scope Fase 1.2 (Fase 1.5 QA-α extiende)

- DLC scope per-property (caso 4 hoteles selectivo)
- Offline mode airplane
- Push notifications LEARNING_REMINDER deep-link
- Certificate verify pública sin auth
- Examen FAILED + retake-wait gates

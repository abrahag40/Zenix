---
paths:
  - "apps/web/**"
---

# Reglas del frontend (`apps/web/` — React)

- **Estado de navegación → parámetros de URL.** Efímero → `useState`. **De servidor → React
  Query, y NUNCA duplicado en `useState`.**
- **Auth → Zustand** (token JWT).
- **`useSSE` registra TODOS los eventos nombrados de `ALL_SSE_TYPES`.** No usar `'message'`
  genérico.
- **Prohibido renderizar UI a medida cuando existe un primitivo canónico.** Antes de escribir un
  `<Button>` crudo o un `<Modal>` crudo, buscar `DialogActions`, `ConfirmDialog`, `StyledInput`,
  `StyledSelect`, `CountryCombobox`, `PhoneFieldWithCountry`, `DocumentPhotoCapture`.
  Para confirmar, `ConfirmDialog` + `useDiscardConfirm` — **nunca `window.confirm`**.

## 🔴 Lo que la auditoría encontró — 2026-09-22

- **Cero *error boundaries* en toda la web**, mientras el móvil sí los tiene. Una excepción de
  render deja **pantalla blanca delante de un huésped**, sin mensaje ni salida.
- **661 usos de colores por debajo de AA** (`text-slate-400` a 2,56:1 sobre blanco, 425 usos;
  `text-gray-400` 169; `text-slate-300` 52; `text-gray-300` 15). WCAG 1.4.3 pide 4,5:1.
- 🔴 **El CI no mira este código.** `apps/web` no tiene script `test`, turbo lo salta entero, y el
  workflow nunca corre `build` —que es donde vive `tsc --noEmit`—. Son **76 010 líneas que entran
  a `main` sin que nada las revise**. Y `react-hooks/rules-of-hooks` está **apagado** en el
  `.eslintrc.json`, que es justo la regla que habría evitado el fallo documentado en
  `ReservationDetailPage.tsx:1621`.

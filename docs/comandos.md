# Comandos

> Salió del `CLAUDE.md` el 2026-09-23, verbatim.

## Commands

### Setup inicial

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cd apps/api
npx prisma migrate dev
npx ts-node -r tsconfig-paths/register prisma/seed.ts
```

### Desarrollo

```bash
# API
cd apps/api && npx nest start --watch
# Web
cd apps/web && npx vite
# Mobile
cd apps/mobile && npx expo start
```

### Tests

```bash
cd apps/api && npx jest
npx jest --testPathPattern="checkouts.service.spec" --verbose
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

### Base de datos

```bash
cd apps/api && npx ts-node -r tsconfig-paths/register prisma/seed.ts  # reset
npx prisma migrate dev --name nombre_de_la_migracion
npx prisma studio
```

### Credenciales de seed (todas con password `123456`)

| Email | Rol | Propiedad |
|-------|-----|-----------|
| `s@z.co`  | SUPERVISOR   | Tulum  |
| `r@z.co`  | RECEPTIONIST | Tulum  |
| `m@z.co`  | HOUSEKEEPER  | Tulum  |
| `p@z.co`  | HOUSEKEEPER  | Tulum  |
| `rc@z.co` | RECEPTIONIST | Cancún |
| `l@z.co`  | HOUSEKEEPER  | Cancún |

---


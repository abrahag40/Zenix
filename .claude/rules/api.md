---
paths:
  - "apps/api/**"
---

# Reglas del backend (`apps/api/` — NestJS)

```typescript
@Get(':id')
@Roles(SystemRole.SUPERVISOR)
async findOne(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {}
```

- **Servicios:** toda la lógica de negocio. Los controllers son envoltorios delgados.
- **DTOs:** validados con class-validator, en el subdirectorio `dto/`.
- **Errores:** `throw NotFoundException | ConflictException | ForbiddenException`.
- **Logs:** `this.logger.debug/log/warn/error` — el Logger de NestJS, **nunca `console.log`**.
- **SSE:** emitir con cabecera `event: <type>\n` explícita, no sólo `data:`.

## 🔴 Lo que la auditoría de los nueve sombreros encontró — 2026-09-22

**Multi-inquilino: todo `where` incluye `organizationId` y `propertyId` cuando aplica.** Y esto
no es una convención de estilo: **hoy es la ÚNICA defensa**. Medido: **338 de 373 rutas no llevan
decorador de inquilino** —cobertura del 9,4 %—, no hay RLS, ni extensión de Prisma, ni repositorio
base, ni regla de lint. AWS lo describe con estas palabras: *«sin RLS, a menudo la única opción es
confiar en que los desarrolladores implementen las comprobaciones correctas en cada sentencia
SQL»*. **Se encontraron dos fugas reales** (`discrepancies`, `compset`).

**Advisory locks de inventario: SIEMPRE la familia `walk-in:<roomId>`.** El motor público toma hoy
una clave de otra familia, así que **la web y el mostrador no se serializan entre sí** — el único
camino abierto a internet es el que puede vender dos veces la misma cama. La regla ya estaba
escrita en `docs/sprints/OVERBOOKING-HARDENING-plan.md:11` y se incumplió.

**Un guard que falla ABIERTO es peor que ninguno.** El único guard de inquilino del producto
permite el paso cuando `organizationId` es cadena vacía, y el esquema deja que lo sea.

Detalle y plan: [`docs/vision/17-puertos-abiertos-y-plan-piloto.md`](../../docs/vision/17-puertos-abiertos-y-plan-piloto.md).

# `conserje/` — lo que el conserje conversacional puede preguntar

Las herramientas del **conserje conversacional** del sitio del hotel: un chatbot que consulta
disponibilidad y precio contra Zenix **en vivo** para no ofrecer noches ocupadas.

🔴 **Aquí todavía no hay ningún modelo de lenguaje, y es deliberado.** Primero existe y se prueba
lo que el conserje podrá preguntar; el conserje llega después, cuando ya no puede inventarse la
respuesta. Es lo que permite verificar la garantía anti-overbooking **sin que haya en la sala nada
capaz de mentir**.

Decisión de arquitectura: [ADR-0011 del sitio de Azucar](https://github.com/abrahag40/azucarWebSite/blob/main/docs/decisiones/ADR-0011-conserje-conversacional.md).

## Por qué vive dentro de `public-booking/` y no en un módulo propio

La **decisión 10** de `CLAUDE.md`: los módulos son *bounded contexts* y se comunican por eventos,
**nunca importando servicios entre ellos**. Un módulo `concierge` aparte tendría que inyectar
`PublicBookingService`, o sea romperla en su primera línea.

Y mirándolo bien, el módulo aparte era el error de partida: el conserje **no es otro contexto, es
otra superficie del mismo** —vender la habitación al huésped—. Igual que `pago/`, `holds/` y
`rate-envelope/`, que ya viven aquí por la misma razón.

## Qué hay

| Archivo | Qué es |
|---|---|
| `herramientas.ts` | **Núcleo puro.** Contratos, sello de procedencia y traductores. Sin red, sin Prisma, sin modelo |
| `herramientas.spec.ts` | Sus 23 pruebas. Corren sin base de datos |
| `conserje-herramientas.service.ts` | El cableado a `PublicBookingService` y `PublicReservationsService` |

## Las tres reglas que este directorio existe para cumplir

1. **Sin procedencia no hay afirmación.** Toda respuesta sale sellada con la herramienta, el
   instante y un `llamadaId`. Una frase del conserje sobre inventario o precio que no pueda citar
   uno de estos es, por definición, inventada.
2. **El conteo no entra al contexto.** El motor devuelve `availableRooms: 3`; al modelo le llega
   `hay: true`. **Lo que el modelo no ve no lo puede decir** — y es más barato y más fiable que
   pedirle en el prompt que se calle.
3. **Sin respaldo fiscal, «consultar».** Si `pricing.firm` es falso no se aproxima ningún número.
   La ausencia de dato se muestra como ausencia.

## Lo que esta capa **no** es

**No es la garantía.** Lo que devuelve es un *consejo*, igual que el calendario del sitio. La
garantía dura sigue siendo el advisory lock de `createReservation`, que desde la auditoría del
2026-09-22 ya toma la misma familia de claves (`walk-in:<roomId>`) que recepción y que Channex.

Consecuencia para quien construya el conserje encima: **un 409 al final no es un fallo, es el
sistema funcionando.** Se responde ofreciendo alternativas reales, nunca con una pantalla de error.

## 🔴 Dos cosas encontradas al construir esto, y no resueltas aquí

### 1 · La API pública devuelve «Reserva confirmada»

`createReservationBySlug` responde hoy con:

```
message: 'Reserva confirmada. El pago se realiza al llegar al hotel.'
```

Esa frase es exactamente la que el CI del sitio de Azucar **prohíbe y falla el build**: una reserva
sólo es firme cuando está pagada, y el cobro todavía no existe. Lo grave no es la frase, es el
camino: **el guardián de Azucar mira su propio build, no las respuestas de Zenix**, así que la
frase entra por la API, se pinta en el sitio, y el CI sigue en verde porque no está mirando ahí.

Esta capa lo cierra para el conserje —construye objetos nuevos campo por campo y `paraElModelo()`
**lanza** si detecta la frase, en vez de limpiarla en silencio—. **Lo que no arregla es la API**,
que sigue devolviéndosela a cualquier otro consumidor. Cambiar eso es un cambio de contrato público
y necesita su propia historia.

### 2 · `estado_de_reserva` está en el catálogo y sin implementar

`getReservation()` exige una `VerifiedApiKey` y el conserje corre dentro de Zenix, sin llave. Hace
falta un lector *first-party* por slug, que es alcance nuevo.

No se disimula: está en `PENDIENTES` con su motivo, y **una prueba exige que lo implementado sea
exactamente el catálogo menos esa lista**. Añadir una herramienta sin implementarla y sin anotarla
pone la suite en rojo — «falta una» es un dato, no un olvido.

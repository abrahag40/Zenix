/**
 * Leer un secreto del entorno **sin los espacios que nadie ve**.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 ESTO NACE DE UNA TARDE PERDIDA, no de una buena práctica.
 *
 * El 2026-09-24 el webhook de Stripe rechazaba TODOS los eventos con
 *
 *     No signatures found matching the expected signature for payload.
 *     Are you passing the raw request body you received from Stripe?
 *
 * Ese mensaje acusa al **cuerpo** de la petición, y ahí se fue el rato: se
 * revisó el `rawBody`, el orden de los *body parsers*, el prefijo global, el
 * `compression`. Todo estaba bien.
 *
 * El secreto guardado en el panel llevaba **un salto de línea al final**. Venía
 * de un archivo `.env` que terminaba en `\n`, como termina cualquier archivo de
 * texto bien formado. El panel lo mostraba idéntico al bueno —los puntos de
 * una contraseña oculta no tienen forma de enseñar un `\n`— y el botón de
 * copiar lo devolvía ya recortado, así que **comparar a mano daba «iguales»**.
 *
 * Se aisló firmando la misma carga con seis variantes del secreto y viendo
 * cuál aceptaba el servidor: sólo `secreto + "\n"` dio 200.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ RECORTAR ES CORRECTO Y NO UN PARCHE
 *
 * Ningún secreto de ningún proveedor —Stripe, Resend, Cloudflare, Twilio—
 * lleva espacios significativos: son tokens de alfabeto restringido. Así que
 * recortar no puede romper un valor legítimo, y sí salva de un fallo que es
 * **invisible en toda la cadena**: no se ve en el panel, no se ve al copiar y
 * el error que produce señala a otro sitio.
 *
 * Es *fail-safe defaults* de Saltzer & Schroeder aplicado a la configuración:
 * cuando el dato de entrada admite una forma obviamente equivocada, lo correcto
 * es normalizarla, no confiar en que quien la escribe no se equivoque. El
 * antipatrón evitado se llama *configuration drift silencioso*.
 */

/**
 * Devuelve la variable recortada, o `undefined` si no existe o quedó vacía.
 *
 * Que una variable con sólo espacios devuelva `undefined` es deliberado: vale
 * lo mismo que no estar, y quien la lee ya sabe tratar el `undefined`.
 */
export function secretoDeEntorno(nombre: string): string | undefined {
  const crudo = process.env[nombre]
  if (crudo === undefined) return undefined
  const limpio = crudo.trim()
  return limpio === '' ? undefined : limpio
}

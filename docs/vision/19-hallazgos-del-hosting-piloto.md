# 19 · Lo que el hosting del piloto dijo cuando se le preguntó

> **Estado:** medido el 2026-09-23 por SSH contra el hosting compartido real del
> hotel piloto. No es una suposición sobre «hostings tipo HostGator»: son las
> respuestas de uno.
>
> 🔴 **Sin datos del cliente.** Ni dominio, ni usuario, ni rutas. Este repositorio
> es público. Lo que importa aquí son las propiedades del entorno, no de quién es.

Este documento existe porque el plan [18](18-conexion-website-hotel.md) diseñó el
conector **suponiendo** cómo se comporta un hosting compartido. Suponer el entorno
de ejecución es la forma barata de descubrir en producción que no era así. Una hora
de reconocimiento desechable contestó cinco preguntas, y **dos de las respuestas
cambian el diseño**.

## Lo que se preguntó, y qué contestó

| # | Pregunta | Respuesta medida | Qué implica |
|---|---|---|---|
| 1 | ¿Qué PHP, y con qué recortes? | **PHP 8.3.33**, `disable_functions` **vacío**, `open_basedir` **sin restricción** | `hash_hmac`, `hash_equals`, `random_bytes`, `tempnam` y `rename` están los cinco. El receptor firmado es viable sin dependencias |
| 2 | ¿Se puede escribir fuera del docroot? | **Sí** | El secreto compartido no tiene que vivir bajo la web |
| 3 | ¿`rename()` es atómico? | **Sólo si el temporal es vecino del destino** | 🔴 ver abajo |
| 4 | ¿Un `.json` en el docroot se lee desde internet? | **Sí: HTTP 200, `application/json`** | 🔴 ver abajo |
| 5 | ¿Hay cron? | **Sí, con 7 entradas ya en uso** | Existe plan B si el *push* no llega: que el hotel jale |

## 🔴 Hallazgo 1 — el temporal NO puede vivir en `/tmp`

Los números de dispositivo lo dicen sin ambigüedad: el directorio del usuario y el
docroot comparten dispositivo, y **`/tmp` está en otro**.

```
2096  ~/public_html
2096  ~/
2050  /tmp
```

`rename(2)` es atómico **sólo dentro del mismo sistema de archivos**. Entre
dispositivos distintos no falla: degrada silenciosamente a copiar y borrar — y
durante esa copia el archivo existe **a medias**. Un visitante que cargue la página
en ese instante ve una tarifa truncada, o ninguna.

> El escenario es raro y por eso es peligroso: no aparece en pruebas, aparece
> cuando hay tráfico. **El temporal se escribe al lado del destino final**, nunca
> en `/tmp`, y el conector debe verificarlo en la instalación en vez de confiar.

## 🔴 Hallazgo 2 — el sobre no puede aterrizar en el docroot

Se colocó un `.json` con contenido inocuo y nombre aleatorio, se pidió por HTTPS y
se borró. Contestó **200** con `Content-Type: application/json`. El `.htaccess` del
sitio —12 KB, con reglas heredadas de su vida anterior en WordPress— niega
`.bak`, `.log`, `.orig`, `.save` y `.swp`, pero **no niega `.json`**.

Es decir: el sobre de tarifas depositado en el docroot sería **público**. Eso expone
el calendario de tarifas completo del hotel a cualquiera que adivine la ruta — y un
calendario de tarifas es exactamente lo que un competidor quiere.

Como el hallazgo 2 del punto anterior ya demostró que **sí se puede escribir fuera
del docroot**, la corrección es gratis y no depende de `.htaccess`:

> **El sobre vive fuera del docroot. El PHP lo lee desde allí.** Defender con una
> regla de `.htaccess` sería poner la seguridad en un archivo que el propio hotel
> puede editar, y que un cambio de servidor puede dejar de honrar. *Antipatrón
> evitado: seguridad por configuración reversible cuando existe seguridad por
> ubicación.*

## Lo que esto corrige del plan 18

- §5 decía «escritura atómica con `rename()`». Sigue siendo cierto, **con la
  condición de vecindad** que antes no estaba escrita.
- §5 ponía los dos archivos en el docroot. **El sobre sale**; los dos `.php` se
  quedan, que para eso son ejecutables y no legibles.
- §6 del modelo de amenazas gana una fila confirmada por medición, no supuesta:
  *«el sobre es legible desde internet»* — **cierto por omisión**, y ya corregido
  por diseño.

## Lo que sigue sin saberse

- Si el hosting tiene **límite de procesos** que tumbe el receptor bajo ráfaga.
- Si el proveedor **rota la versión de PHP** sin avisar: 8.3 hoy no garantiza 8.3
  en seis meses, y el receptor debe declarar su versión mínima y fallar claro.
- Nada de esto se probó en **otro** proveedor. Es una muestra de uno; sirve para
  diseñar, no para prometer que GoDaddy u Hostinger se comportan igual. **La skill
  de conexión (C6) tiene que medir esto en cada instalación**, no asumirlo.

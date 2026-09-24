# 26 · Atacando nuestra propia defensa de contracargos

> Abraham, 2026-09-25: *«Ponte del lado del atacante o estafador e intenta burlar o romper tu
> propia solución.»*

Este documento es el resultado. **Encontró un fallo serio en lo que yo mismo había construido el
día anterior**, y otros cuatro que estaban sin cerrar.

---

## 🔴 A1 · La huella sellaba la URL de la firma, no la firma

**Severidad: alta. Estaba en producción del código, sin desplegar. Arreglado.**

`huellaDe(documento, firmaUrl)` calculaba SHA-256 sobre el texto de la URL. Demostrado:

```
huella con la firma legítima : 577ce41db9fd449b5a73213a
huella tras cambiar el PNG   : 577ce41db9fd449b5a73213a   ← idéntica
```

Cualquiera con acceso al almacén —incluido el propio hotel— podía **sustituir la imagen de la firma
después de sellada** y `verificar()` seguiría diciendo «íntegra». Una carta de registro que se
puede alterar sin dejar rastro no vale nada como evidencia: es justo lo contrario de lo que se
construyó.

**Arreglo:** la huella se calcula sobre el **SHA-256 de los bytes** de la imagen. Y sellar sin ese
hash ahora se rechaza — aceptar una imagen sin sellarla sería el mismo fallo con otra cara.

**Lección:** *firmar el puntero no es firmar el contenido.* Es el mismo error que confundir la URL
de un documento con el documento.

---

## ⚠️ A2 · La misma firma copiada a otra estancia

**Severidad: media. Mitigado con detección, no con bloqueo.**

Nada impedía subir el mismo garabato a dos cartas distintas. El fraude es obvio: copiar la firma de
un huésped que sí firmó a la estancia de otro que no.

**Mitigación:** el hash de la imagen se indexa y, al sellar, se avisa si ya existe en otra estancia.
**No se bloquea a propósito**: dos estancias del mismo huésped firman casi igual, y un falso
positivo en recepción con el huésped delante es caro. Se detecta y se deja dicho.

---

## 🔴 A3 · El código corto de la tableta: enumeración

**Severidad: alta si se diseña mal. Cerrado por diseño.**

Un código de seis caracteres que devuelve los datos de una reserva es una invitación a probarlos
todos y leer los datos de otros huéspedes.

**La defensa NO es que el código sea largo.** Es:

1. La ruta exige **sesión de personal** y está acotada a **su** propiedad.
2. **Límite de intentos** por sesión.
3. Un **carácter de control** que rechaza el código mal formado **antes de tocar la base**: probar
   a lo bruto cuesta 29 veces más porque 28 de cada 29 intentos ni se consultan.

El tamaño sólo evita el acierto fortuito: 29⁵ ≈ 20 millones de cuerpos posibles.

---

## 🔴 A4 · El error de tecleo que hace firmar al huésped equivocado

**Severidad: alta, y es la que nadie ve venir. Cerrada.**

Peor que no encontrar la reserva: el recepcionista teclea mal, sale **otra**, y le hace firmar el
contrato de otro. Eso no es un fallo técnico, es un documento firmado por quien no debía.

**Dos defensas, medidas:**

| Error humano | Atrapado |
|---|---|
| Sustituir un carácter | **> 95 %** |
| Intercambiar dos contiguos | **> 90 %** |

Y el alfabeto excluye `0 O 1 I L U`, que son los que se confunden leyendo de una pantalla. Los
pesos del carácter de control son **crecientes** precisamente para que una transposición cambie la
suma: con pesos iguales no la cambiaría y ese error pasaría entero.

---

## ⚠️ A5 · Borrar la carta y volver a firmarla

**Severidad: media. Sin cerrar del todo — se declara.**

`sellar()` no sobrescribe, pero nada impide **borrar la fila y crear otra**. Quien tenga acceso de
escritura a la base puede rehacer una carta con fecha nueva.

**Lo que hay hoy:** el aviso en el registro cuando se intenta sobrescribir.

**Lo que falta, y es la respuesta real:** la **constancia NOM-151**. Una vez que un prestador
acreditado sella la huella con su reloj y su serial, la fecha deja de depender de nuestra base. Sin
constancia, la fecha la pone nuestro servidor — y el hotel controla su servidor.

🔴 **Esta es la razón técnica para contratar el PSC, y no la había dicho antes.**

---

## ⚠️ A6 · El reloj del servidor

**Severidad: media. Misma respuesta que A5.**

`firmadoEn: new Date()` es la hora del servidor. En una disputa donde se discuta *cuándo* se firmó,
esa fecha es nuestra palabra. El sello de tiempo **RFC 3161** de la NOM-151 la convierte en la
palabra de un tercero acreditado.

---

## ✅ Lo que resistió el ataque

- **Manipular el importe.** No hay parámetro de importe en ninguna capa; el DTO lo rechaza con 400
  y hay pruebas que lo afirman sobre la firma real.
- **Cambiar la cuenta destino.** Sale de la configuración de la propiedad, nunca del navegador.
- **Falsificar el webhook.** Firma verificada; se probó que un cuerpo sin firma válida se rechaza.
- **Reordenar el JSON para romper la huella.** Canonicalización por claves ordenadas, con prueba.
- **Leer el número de identificación completo en el expediente.** Se trunca a los últimos cuatro.

---

## Resumen para quien decide

| | Estado |
|---|---|
| A1 · huella de la URL | 🔴 **arreglado** |
| A2 · firma reutilizada | ⚠️ detectado y avisado |
| A3 · enumeración | 🔴 cerrado por diseño |
| A4 · tecleo → huésped equivocado | 🔴 cerrado y medido |
| A5 · borrar y rehacer | ⚠️ **abierto** → lo cierra la NOM-151 |
| A6 · reloj del servidor | ⚠️ **abierto** → lo cierra la NOM-151 |

**Dos de los seis siguen abiertos, y los dos los cierra la misma cosa: la constancia NOM-151.**
Antes decía que era un gasto para más adelante. Después de este análisis, es lo que separa «nuestra
palabra» de «la palabra de un tercero acreditado».

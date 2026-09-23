# 20 · Criterios de decisión de Zenix

> **Para qué sirve este documento.** Para que una decisión de diseño no dependa
> de quién la tome ni de qué día sea. Cada criterio trae **el estándar que lo
> respalda** y **la prueba que lo hace cumplir** — porque un criterio sin
> guardián ejecutable es una intención, y las intenciones no sobreviven a un
> sprint con prisa.
>
> Nació de un defecto concreto, y conviene no olvidarlo: el sistema aplicaba
> **ISH 6 % a un hotel** cuando su ley dice 5 %, resolvía la jurisdicción
> comparando **el nombre de la ciudad** contra once cadenas, y le daba **IVA
> 16 % a Chetumal**, que está en región fronteriza y paga 8 %. Tres defectos de
> la misma familia: **una cifra normativa metida en el código sin decir de dónde
> salía, sin vigencia y sin jurisdicción.**

---

## Los diez criterios

### C-1 · Ninguna cifra normativa se embarca sin procedencia

Toda tasa, plazo o umbral que venga de una ley lleva **cita del artículo, URL de
la fuente primaria y fecha de verificación**. Un blog no es fuente. Tres blogs
que coinciden tampoco: se copian entre ellos, y la convergencia mide popularidad
de una lectura, no exactitud.

- **Estándar:** *architecture fitness function* — Ford, Parsons & Kua,
  *Building Evolutionary Architectures*. Lo que no se puede verificar solo, no
  se puede proteger.
- **Guardián:** `tax-catalog.spec.ts` rechaza una regla sin `legalBasis`,
  `sourceUrl` (https) y `verifiedOn`.

### C-2 · Fallar cerrado: un dato ausente se declara, nunca se sustituye

Si falta la tasa de un estado, el sistema **no publica un total**. Devuelve
`configured: false` con la nota de qué falta. Publicar «IVA 16 % porque es
México» esconde que en región fronteriza es 8 %.

> **Un número ausente se nota y se pregunta. Un número inventado se publica y
> nadie se entera hasta que un huésped saca la calculadora.**

- **Antipatrón:** *silent fallback*. Degradar está bien; degradar sin decirlo
  convierte un problema de configuración en un error de cobro.
- **Guardián:** el catálogo marca `estado: 'SIN_VERIFICAR'` y la respuesta del
  puerto público expone `taxesVerified` para que el sitio lo muestre.

### C-3 · Toda cifra normativa tiene vigencia

Una tasa no es un número: es **un número con fecha**. El estímulo de IVA
fronterizo se prorrogó **sólo hasta el 31-dic-2026**; las leyes de ingresos
estatales se reforman cada diciembre. Las reglas llevan `validFrom`/`validUntil`
y se resuelven **con la fecha de la estancia**, no con la de hoy.

- **Guardián:** prueba de que el 1-ene-2027 el mismo hotel vuelve al 16 % sin
  que nadie toque nada.

### C-4 · El dinero es aritmética entera

Importes en **centavos enteros**, tasas en **puntos base**. Ningún flotante en
el camino del dinero, y el residuo del redondeo se asigna **explícitamente**.

- **Estándar:** patrón *Money* — Fowler, *Patterns of Enterprise Application
  Architecture*.
- **Medición que lo motivó:** con flotantes y `.toFixed(2)` por renglón,
  **31.1 %** de los 4 990 001 totales entre \$100 y \$50 000 no sumaban lo
  cobrado.
- **Guardián:** barrido exhaustivo en `tax-calculator.spec.ts`.

### C-5 · La ley es código; la configuración del cliente es dato

El **catálogo normativo** vive en el repositorio: da `git blame`, revisión por
PR y guardián en CI. La **elección de régimen de cada propiedad** vive en la
base de datos, porque la cambia el cliente.

> Tenerlo al revés —tasas en una tabla que cualquiera con credencial edita a las
> 3 a.m., y configuración de cliente incrustada en el código— es el error común.

### C-6 · Un contrato público se congela con un *snapshot*

Todo lo que consume un sistema externo —el sitio del hotel, una OTA— tiene una
prueba que fija **la forma exacta** de la respuesta. Cambiarla deja de ser
accidental: hay que aceptarlo a mano.

- **Estándar:** *consumer-driven contracts* (Pact) y versionado por fecha al
  estilo Stripe. *Tolerant Reader* para el consumidor.
- **Prueba de mordida:** renombrar un campo lo caza el compilador; **cambiar un
  valor** —reintroducir el ISH al 6 %— lo caza el snapshot.

### C-7 · Lo que la industria ya resolvió no se reinventa

Antes de diseñar, se busca el estándar del sector y se adopta su vocabulario.
Tres que ya mordieron en este producto:

| Estándar | Qué obliga aquí |
|---|---|
| **CFDI 4.0 — Complemento de Impuestos Locales** | El ISH **no** va en el nodo federal `Impuestos`. Si el modelo no separa `FEDERAL` de `LOCAL` y `TRASLADO` de `RETENCIÓN` desde hoy, facturar exige migrar |
| **USALI** (*Uniform System of Accounts for the Lodging Industry*) | Los impuestos cobrados al huésped **no son ingreso**: son un pasivo con la autoridad. Contarlos como ingreso infla el RevPAR y descuadra al contador |
| **ISO/IEC 25010** | El paraguas de calidad del método de nueve sombreros: corrección funcional, seguridad, mantenibilidad |

Y el norte de dominio son **CHDM** y **CRME** ([`norte-crme-chdm`](../../../zahardev-plugins/zahardev-hotel/docs/norte-crme-chdm.md)):
lo que ahí se llama *distribución*, *paridad* o *desplazamiento* se llama igual
en el código.

### C-8 · Se ordena por costo de equivocarse ÷ velocidad de enterarse

Se construye primero lo barato de corregir y rápido de verificar; al final, lo
que sólo se puede probar contra un entorno real. **Dependencia** e
**incertidumbre** son cosas distintas: la dependencia se resuelve con orden
topológico; la incertidumbre, con un *spike* desechable, no reordenando el plan.

- **Estándar:** *walking skeleton* (Cockburn) para el esqueleto; *spike* (XP)
  para la incógnita.
- **Aplicación real:** la skill de conexión es lo último — máxima dependencia,
  mínima retroalimentación, y cada iteración cuesta una sesión con credenciales.

### C-9 · Todo guardián se prueba mordiendo

Un guardián que nunca se vio fallar es decoración. Se rompe el invariante a
propósito, se comprueba que el guardián lo caza, y se restaura.

- **Ejemplo:** el guardián de las 200 líneas tenía un desfase de uno; lo
  encontró la prueba de mordida, no la lectura.

### C-10 · Multi-inquilino y multi-jurisdicción desde el esquema

Ningún supuesto de «un hotel», «un estado» ni «un país» entra al modelo. La
jurisdicción se expresa con **ISO 3166-2**, no con el nombre de la ciudad: hay
nueve municipios llamados «Morelos» y el municipio decide la tasa federal.

---

## Cómo se sube un estado al catálogo

El procedimiento es lo que hace esto escalable a los 32 estados. **No se salta
ningún paso, y el último es el que cuenta.**

1. Localizar el **texto compilado vigente** en el congreso del estado — no el
   primero que ofrezca el buscador: el de Quintana Roo que sale primero es de
   2017 y dice 3 % cuando el vigente dice 5 %.
2. Leer el artículo de la **tasa** y el de la **base**. Casi siempre son dos, y
   la base suele excluir alimentos y otros servicios: eso hace que IVA e ISH
   tengan **bases distintas**.
3. Leer los **supuestos**: qué tipos de establecimiento hay y si alguno tributa
   distinto. En Quintana Roo la diferencia 5 %/6 % es por **tipo de
   establecimiento**, no por canal de venta — tres fuentes especializadas decían
   lo contrario.
4. Leer el **régimen de plataformas**: quién retiene, en qué plazo y con qué
   constancia. No cambia el importe; cambia quién lo entera.
5. Registrar la entrada con **vigencia** y **procedencia**, y cambiar el estado
   a `VERIFICADO`.
6. **Prueba de mordida:** una prueba que fije el total de esa jurisdicción para
   un importe conocido, y comprobar que falla si se altera la tasa.

**Estado hoy: 1 de 32 verificado.** Quintana Roo. La Ciudad de México se intentó
y **se rechazó**: el art. 164 de su Código Fiscal dice 3 % y la propia ficha de
esa fuente apunta a una reforma que lo habría movido a 3.5 %. Queda anotada la
contradicción, no una cifra.

---

## Lo que estos criterios todavía NO cubren

- **El DSA** y los derechos municipales en general. El motor sabe expresarlos
  (cuota por persona y noche sobre la UMA); falta leer leyes de hacienda
  municipales, que son cientos.
- **Fuera de México.** El catálogo es nacional; los diez países de `FiscalRegime`
  son una tabla **sin un solo consumidor en el código**.
- **La contabilización USALI.** Hoy el impuesto se calcula y se muestra; que se
  registre como pasivo y no como ingreso llega con la persistencia fiscal (M4).
- **Retención por plataforma.** Se sabe **quién** debe retener; no se concilia
  todavía contra las constancias que la ley obliga a expedir.

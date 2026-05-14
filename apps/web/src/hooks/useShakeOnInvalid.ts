/**
 * useShakeOnInvalid — primitiva del estándar §60 D19 CLAUDE.md.
 *
 * Patrón Meta/Apple/Stripe/Linear: el botón de submit SIEMPRE está habilitado.
 * Al click, si los inputs son inválidos, el contenedor del campo se sacude +
 * se muestra mensaje inline. NUNCA `disabled={value.length < N}` para validar
 * input — eso es anti-pattern (NN/g 2018, 32% abandono).
 *
 * Uso:
 *   const { shakeClass, trigger } = useShakeOnInvalid()
 *   function onSubmit() {
 *     if (value.trim().length < 5) {
 *       setError('Mínimo 5 caracteres')
 *       trigger()
 *       return
 *     }
 *     setError(null)
 *     mutate(value)
 *   }
 *   // En el JSX (pseudocode — ver implementaciones reales en componentes):
 *   //   div className={shakeClass} → textarea + error inline
 *   //   button onClick={onSubmit} SIN disabled
 *
 * El shake aplica la animación `animate-shake` de Tailwind (definida en
 * `tailwind.config.js`). El hook usa un counter como key implícita para que
 * cada `trigger()` reinicie la animación aunque el contenedor no remonte.
 */
import { useCallback, useState } from 'react'

export function useShakeOnInvalid() {
  const [shakeKey, setShakeKey] = useState(0)

  const trigger = useCallback(() => {
    setShakeKey((k) => k + 1)
  }, [])

  // `key` cambia en cada trigger → React desmonta/remonta el wrapper →
  // la animación CSS se reinicia desde 0. Sin esto, la 2ª invocación no
  // reproduciría el shake (la animación ya terminó).
  const shakeClass = shakeKey > 0 ? 'animate-shake' : ''

  return { shakeClass, shakeKey, trigger }
}

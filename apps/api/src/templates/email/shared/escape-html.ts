/**
 * Escape HTML para prevenir inyección en templates de email.
 * Versión simplificada — solo los 5 caracteres relevantes en contexto HTML.
 */
export function escapeHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return c
    }
  })
}

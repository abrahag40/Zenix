/**
 * Public exports del shared email kit.
 *
 * Uso desde templates:
 *   import { renderLayout, renderButton, renderInfoBox, EMAIL_TOKENS } from '../shared'
 */
export { EMAIL_TOKENS, type EmailTokens } from './tokens'
export { escapeHtml } from './escape-html'
export { renderLayout, type RenderLayoutInput } from './layout'
export {
  renderButton,
  renderInfoBox,
  renderKvRow,
  renderTotalRow,
  renderHeading,
  renderDivider,
  renderCodeBlock,
} from './components'

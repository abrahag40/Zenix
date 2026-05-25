/**
 * NovaWizardPage — Wizard Zenix Activate entry point.
 *
 * Dispatches a step components según currentStep del wizard store.
 * Sin NovaShell — el wizard tiene su propio layout focus mode.
 */
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useNovaStore } from '../../store/nova'
import { useWizardStore } from '../../store/wizard'
import { StepCustomerAccount } from '../components/wizard/StepCustomerAccount'
import { StepBrand } from '../components/wizard/StepBrand'
import { StepLegalEntity } from '../components/wizard/StepLegalEntity'
import { StepProperties } from '../components/wizard/StepProperties'
import { StepPlaceholder } from '../components/wizard/StepPlaceholder'

export function NovaWizardPage() {
  const navigate = useNavigate()
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const currentStep = useWizardStore((s) => s.currentStep)

  useEffect(() => {
    if (!actingOrgId) {
      navigate('/nova/clientes', { replace: true })
    }
  }, [actingOrgId, navigate])

  if (!actingOrgId) return null

  switch (currentStep) {
    case 'customer-account':
      return <StepCustomerAccount />
    case 'brand':
      return <StepBrand />
    case 'legal-entity':
      return <StepLegalEntity />
    case 'properties':
      return <StepProperties />
    case 'inventory':
      return (
        <StepPlaceholder
          title="Inventory templates"
          description="Selecciona el template de inventario (Hostal/Boutique/Cabañas/Business) o customiza. Day 15 wirea esto."
        />
      )
    case 'staff':
      return (
        <StepPlaceholder
          title="Staff inicial"
          description="Captura el Org Owner del cliente (email + nombre). Recibe credenciales al activar (Step 8). Day 15."
        />
      )
    case 'integrations':
      return (
        <StepPlaceholder
          title="Integrations health-checks"
          description="4 checks obligatorios: Channex ping + Stripe $1 + PAC sandbox + SMTP. Day 15 wirea endpoints backend."
        />
      )
    case 'activation':
      return (
        <StepPlaceholder
          title="Activación"
          description="Generación del Activation Report PDF + envío de setup link 72h al Org Owner. Day 15."
        />
      )
    default:
      return <StepCustomerAccount />
  }
}

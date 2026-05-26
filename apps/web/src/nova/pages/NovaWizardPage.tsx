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
import { StepInventory } from '../components/wizard/StepInventory'
import { StepStaff } from '../components/wizard/StepStaff'
import { StepIntegrations } from '../components/wizard/StepIntegrations'
import { StepActivation } from '../components/wizard/StepActivation'

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
      return <StepInventory />
    case 'staff':
      return <StepStaff />
    case 'integrations':
      return <StepIntegrations />
    case 'activation':
      return <StepActivation />
    default:
      return <StepCustomerAccount />
  }
}

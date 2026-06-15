import type { ReactNode } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

/**
 * Shell Radix reusable para los diálogos de Caja (§116 — primitives, no contenedor
 * manual). DRY: Root/Portal/Overlay/Content + stripe + título; el caller pasa el
 * body + el footer `DialogActions`. Sin animación (decisión 2026-05-17).
 */
export function CashDialogShell({
  open,
  onOpenChange,
  title,
  subtitle,
  maxW = 'max-w-md',
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: ReactNode
  maxW?: string
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-zenix-modal="true"
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        />
        <DialogPrimitive.Content
          data-zenix-modal="true"
          className={cn(
            'fixed left-1/2 top-1/2 z-[80] -translate-x-1/2 -translate-y-1/2',
            'w-[calc(100%-2rem)] bg-white rounded-2xl shadow-2xl overflow-hidden',
            'flex flex-col max-h-[calc(100vh-2rem)]',
            maxW,
          )}
        >
          <div className="h-1 shrink-0 bg-emerald-500/80" />
          <div className="px-5 pt-5 pb-3 shrink-0">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-slate-900 leading-tight">
              {title}
            </DialogPrimitive.Title>
            {subtitle ? (
              <DialogPrimitive.Description className="text-[13px] text-slate-600 mt-1 leading-relaxed">
                {subtitle}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <div className="px-5 pb-4 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

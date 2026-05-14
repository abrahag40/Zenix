/**
 * useMaintenanceTickets.ts — Sprint Mx-1B-W1
 *
 * Hook centralizado de la lista + mutations para el módulo de mantenimiento.
 * SSE invalida queries automáticamente cuando llega cualquier evento
 * `maintenance:ticket:*` — el supervisor ve cambios en tiempo real sin refresh.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type {
  AddMaintenanceCommentInput,
  AddMaintenancePhotoInput,
  ApproveMaintenanceTicketInput,
  AssignMaintenanceTicketInput,
  CreateMaintenanceTicketInput,
  MaintenanceTicketDetailDto,
  MaintenanceTicketDto,
  MaintenanceTicketListQuery,
  RejectMaintenanceTicketInput,
  ReopenMaintenanceTicketInput,
  ResolveMaintenanceTicketInput,
  SseEvent,
  VerifyMaintenanceTicketInput,
} from '@zenix/shared'
import { useSSE } from '../../../hooks/useSSE'
import { maintenanceApi } from '../api/maintenance.api'

const KEY_LIST = 'maintenance-tickets'
const KEY_ONE = 'maintenance-ticket'
const KEY_QUEUE = 'maintenance-queue'
const KEY_TEMPLATES = 'maintenance-recurrence-templates'

/**
 * Suscripción SSE → invalidación de queries de mantenimiento.
 *
 * IMPORTANTE — llamar este hook UNA SOLA VEZ por página (en MaintenancePage).
 * NUNCA dentro de useMaintenanceTickets ni en componentes hijos. Cada `useSSE`
 * abre una EventSource y Chrome solo permite 6 conexiones HTTP/1.1 por host;
 * múltiples instancias saturan el pool y dejan otros endpoints (/api/rooms,
 * /api/staff) en cola eterna (Sprint Mx-1B-W1 bug detectado en E2E testing).
 */
export function useMaintenanceSSE() {
  const qc = useQueryClient()
  useSSE((event: SseEvent) => {
    if (typeof event.type === 'string' && event.type.startsWith('maintenance:ticket:')) {
      void qc.invalidateQueries({ queryKey: [KEY_LIST] })
      void qc.invalidateQueries({ queryKey: [KEY_QUEUE] })
      const data = event.data as { id?: string; ticketId?: string } | undefined
      const id = data?.id ?? data?.ticketId
      if (id) void qc.invalidateQueries({ queryKey: [KEY_ONE, id] })
    }
  })
}

/** Lista filtrada de tickets. Combinar con useMaintenanceSSE() en la página. */
export function useMaintenanceTickets(query: MaintenanceTicketListQuery = {}) {
  return useQuery<MaintenanceTicketDto[]>({
    queryKey: [KEY_LIST, query],
    queryFn: () => maintenanceApi.list(query),
    staleTime: 30_000,
  })
}

/** Detalle completo de un ticket (fotos, comentarios, log audit). */
export function useMaintenanceTicket(id: string | null) {
  return useQuery<MaintenanceTicketDetailDto>({
    queryKey: [KEY_ONE, id],
    queryFn: () => maintenanceApi.getOne(id!),
    enabled: !!id,
    staleTime: 10_000,
  })
}

/** Cola: tickets OPEN sin asignar — para vista del técnico. */
export function useMaintenanceQueue() {
  return useQuery<MaintenanceTicketDto[]>({
    queryKey: [KEY_QUEUE],
    queryFn: () => maintenanceApi.getQueue(),
    staleTime: 30_000,
  })
}

/** Catálogo de templates preventivos (read-only en Mx-1; cron en Mx-2). */
export function useRecurrenceTemplates() {
  return useQuery({
    queryKey: [KEY_TEMPLATES],
    queryFn: () => maintenanceApi.recurrenceTemplates(),
    staleTime: 5 * 60_000,
  })
}

// ─── Mutations con UX feedback (§33: toast con razón específica) ───────────

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: [KEY_LIST] })
  void qc.invalidateQueries({ queryKey: [KEY_QUEUE] })
  void qc.invalidateQueries({ queryKey: [KEY_ONE] })
}

export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateMaintenanceTicketInput) => maintenanceApi.create(dto),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Ticket creado')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useApproveTicket(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: ApproveMaintenanceTicketInput) => maintenanceApi.approve(id, dto),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Ticket aprobado')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRejectTicket(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: RejectMaintenanceTicketInput) => maintenanceApi.reject(id, dto),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Ticket rechazado')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useClaimTicket(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => maintenanceApi.claim(id),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Tomaste el ticket')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAssignTicket(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: AssignMaintenanceTicketInput) => maintenanceApi.assign(id, dto),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Asignado')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useStartTicket(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => maintenanceApi.start(id),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Trabajo iniciado')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useResolveTicket(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: ResolveMaintenanceTicketInput) => maintenanceApi.resolve(id, dto),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Ticket resuelto — esperando verificación')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useVerifyTicket(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: VerifyMaintenanceTicketInput) => maintenanceApi.verify(id, dto),
    onSuccess: (_, vars) => {
      invalidateAll(qc)
      toast.success(
        vars.approved === false
          ? 'Calidad rechazada · el ticket regresa al técnico'
          : 'Verificado — habitación regresa a venta',
      )
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useCloseTicket(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => maintenanceApi.close(id),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Ticket cerrado')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useReopenTicket(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: ReopenMaintenanceTicketInput) => maintenanceApi.reopen(id, dto),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Ticket reabierto')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddComment(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: AddMaintenanceCommentInput) => maintenanceApi.addComment(id, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [KEY_ONE, id] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddPhoto(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: AddMaintenancePhotoInput) => maintenanceApi.addPhoto(id, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [KEY_ONE, id] })
      toast.success('Foto añadida')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeletePhoto(ticketId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (photoId: string) => maintenanceApi.deletePhoto(ticketId, photoId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [KEY_ONE, ticketId] })
      toast.success('Foto eliminada')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

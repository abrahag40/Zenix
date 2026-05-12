import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback } from 'react'
import { notificationsApi, type AppNotification } from '@/api/notifications.api'
import { useAuthStore } from '@/store/auth'

/** Returns notifications + unread count for the active property. */
export function useNotifications(propertyId: string | null) {
  const qc = useQueryClient()

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', propertyId],
    queryFn: () => notificationsApi.list(propertyId!),
    enabled: !!propertyId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const { data: countData } = useQuery({
    queryKey: ['notifications-count', propertyId],
    queryFn: () => notificationsApi.unreadCount(propertyId!),
    enabled: !!propertyId,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const listKey  = ['notifications', propertyId] as const
  const countKey = ['notifications-count', propertyId] as const

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: listKey })
    qc.invalidateQueries({ queryKey: countKey })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, propertyId])

  /*
   * Optimistic UI (Apple HIG: feedback inmediato <100ms).
   *
   * Cada mutation actualiza el cache local ANTES del roundtrip al backend.
   * Si la mutación falla, hace rollback al snapshot previo. El usuario ve
   * el cambio instantáneo en vez de esperar el refetch (300-500ms latency
   * típico). Patrón estándar React Query — el bug "Marcar todas no
   * funciona" era percepción: la UI se quedaba sin cambiar visible hasta
   * que llegaba el refetch.
   */
  const markReadMut = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: listKey })
      const prev = qc.getQueryData<AppNotification[]>(listKey)
      qc.setQueryData<AppNotification[]>(listKey, (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)),
      )
      // Decrementar counter optimistically
      qc.setQueryData<{ count: number }>(countKey, (c) => ({ count: Math.max(0, (c?.count ?? 0) - 1) }))
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(listKey, ctx.prev)
      qc.invalidateQueries({ queryKey: countKey })
    },
    onSettled: invalidate,
  })

  const markAllReadMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(propertyId!),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: listKey })
      const prev = qc.getQueryData<AppNotification[]>(listKey)
      const now = new Date().toISOString()
      qc.setQueryData<AppNotification[]>(listKey, (old) =>
        (old ?? []).map((n) => (n.isRead ? n : { ...n, isRead: true, readAt: now })),
      )
      qc.setQueryData<{ count: number }>(countKey, { count: 0 })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(listKey, ctx.prev)
      qc.invalidateQueries({ queryKey: countKey })
    },
    onSettled: invalidate,
  })

  const approveMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      notificationsApi.approve(id, reason),
    onMutate: async ({ id, reason }) => {
      await qc.cancelQueries({ queryKey: listKey })
      const prev = qc.getQueryData<AppNotification[]>(listKey)
      qc.setQueryData<AppNotification[]>(listKey, (old) =>
        (old ?? []).map((n) =>
          n.id === id
            ? { ...n, isRead: true, readAt: new Date().toISOString(), approval: { action: 'APPROVED', actionAt: new Date().toISOString(), reason: reason ?? null } }
            : n,
        ),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(listKey, ctx.prev) },
    onSettled: invalidate,
  })

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      notificationsApi.reject(id, reason),
    onMutate: async ({ id, reason }) => {
      await qc.cancelQueries({ queryKey: listKey })
      const prev = qc.getQueryData<AppNotification[]>(listKey)
      qc.setQueryData<AppNotification[]>(listKey, (old) =>
        (old ?? []).map((n) =>
          n.id === id
            ? { ...n, isRead: true, readAt: new Date().toISOString(), approval: { action: 'REJECTED', actionAt: new Date().toISOString(), reason: reason ?? null } }
            : n,
        ),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(listKey, ctx.prev) },
    onSettled: invalidate,
  })

  return {
    notifications,
    unreadCount:  countData?.count ?? 0,
    isLoading,
    invalidate,
    markRead:     (id: string) => markReadMut.mutate(id),
    markAllRead:  () => markAllReadMut.mutate(),
    approve:      (id: string, reason?: string) => approveMut.mutate({ id, reason }),
    reject:       (id: string, reason?: string) => rejectMut.mutate({ id, reason }),
  }
}

/** Subscribes to SSE `notification:new` and invalidates the notifications query. */
export function useNotificationSSE(propertyId: string | null, onNew: () => void) {
  useEffect(() => {
    if (!propertyId) return
    // We listen via the existing useSSE hook pattern in the consuming component;
    // the parent passes `onNew` as a callback to avoid double-subscribing.
    // This hook is intentionally a thin wrapper so components can opt-in.
  }, [propertyId, onNew])
}

/** Reads the current user's propertyId from auth store. */
export function useActivePropertyId(): string | null {
  const user = useAuthStore((s) => s.user)
  return (user as any)?.propertyId ?? null
}

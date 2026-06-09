import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { NotificationsService } from '../notifications/notifications.service'

/**
 * Bridges EventEmitter2 events from PMS modules (guest-stays, room-readiness)
 * to the SSE stream so the web dashboard updates in real time.
 */
@Injectable()
export class PmsSseListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('room.ready')
  onRoomReady(payload: { roomId: string; propertyId: string }) {
    this.notifications.emit(payload.propertyId, 'room:ready', {
      roomId: payload.roomId,
      newStatus: 'AVAILABLE',
    })
  }

  @OnEvent('checkout.confirmed')
  onCheckoutConfirmed(payload: {
    roomId: string
    propertyId: string
    guestName?: string
  }) {
    this.notifications.emit(payload.propertyId, 'checkout:confirmed', {
      roomId: payload.roomId,
      guestName: payload.guestName,
      newStatus: 'CHECKING_OUT',
    })
  }

  @OnEvent('checkin.completed')
  onCheckinCompleted(payload: {
    roomId: string
    propertyId: string
    guestName?: string
  }) {
    this.notifications.emit(payload.propertyId, 'checkin:completed', {
      roomId: payload.roomId,
      guestName: payload.guestName,
      newStatus: 'OCCUPIED',
    })
  }

  @OnEvent('room.moved')
  onRoomMoved(payload: {
    fromRoomId: string
    toRoomId: string
    propertyId: string
  }) {
    this.notifications.emit(payload.propertyId, 'room:moved', {
      fromRoomId: payload.fromRoomId,
      toRoomId: payload.toRoomId,
    })
  }

  @OnEvent('checkout.early')
  onEarlyCheckout(payload: {
    roomId: string
    propertyId: string
    stayId: string
    guestName?: string
    freedFrom: string
    freedTo: string
  }) {
    this.notifications.emit(payload.propertyId, 'checkout:early', {
      roomId: payload.roomId,
      stayId: payload.stayId,
      guestName: payload.guestName,
      freedFrom: payload.freedFrom,
      freedTo: payload.freedTo,
      newStatus: 'CHECKING_OUT',
    })
  }

  @OnEvent('task.rescheduled')
  onTaskRescheduled(payload: {
    propertyId: string
    stayId: string
    roomId: string
    roomNumber: string
    newCheckoutTime: string
    affectedTaskIds: string[]
  }) {
    this.notifications.emit(payload.propertyId, 'task:rescheduled', {
      stayId: payload.stayId,
      roomId: payload.roomId,
      roomNumber: payload.roomNumber,
      newCheckoutTime: payload.newCheckoutTime,
      affectedTaskIds: payload.affectedTaskIds,
    })
  }

  @OnEvent('checkin.confirmed')
  onCheckinConfirmed(payload: {
    stayId: string
    roomId: string
    propertyId: string
    guestName?: string
  }) {
    this.notifications.emit(payload.propertyId, 'checkin:confirmed', {
      stayId:    payload.stayId,
      roomId:    payload.roomId,
      guestName: payload.guestName,
    })
  }

  @OnEvent('soft-lock.acquired')
  onSoftLockAcquired(payload: { roomId: string; userName: string; propertyId: string }) {
    this.notifications.emit(payload.propertyId, 'soft:lock:acquired', {
      roomId: payload.roomId,
      lockedByName: payload.userName,
      expiresAt: new Date(Date.now() + 90_000).toISOString(),
    })
  }

  @OnEvent('soft-lock.released')
  onSoftLockReleased(payload: { roomId: string; propertyId: string }) {
    this.notifications.emit(payload.propertyId, 'soft:lock:released', {
      roomId: payload.roomId,
    })
  }

  // Sprint EDIT-RESERVATION — concurrent edit awareness.
  // Cualquier cliente con BookingDetailSheet abierto en la misma stay debe
  // recibir un banner "datos cambiaron" cuando otra sesión escribe.
  // El listener client-side filtra por stayId + ignora propio actorId.
  @OnEvent('stay.updated')
  onStayUpdated(payload: {
    stayId: string
    propertyId: string
    orgId: string
    changedFields: string[]
    actorId: string
  }) {
    this.notifications.emit(payload.propertyId, 'stay:updated', {
      stayId:        payload.stayId,
      changedFields: payload.changedFields,
      actorId:       payload.actorId,
    })
  }

  @OnEvent('stay.note.created')
  onStayNoteCreated(payload: {
    stayId: string
    propertyId: string
    noteId: string
    actorId: string
  }) {
    this.notifications.emit(payload.propertyId, 'stay:note:created', {
      stayId:  payload.stayId,
      noteId:  payload.noteId,
      actorId: payload.actorId,
    })
  }

  @OnEvent('stay.note.updated')
  onStayNoteUpdated(payload: {
    stayId: string
    propertyId: string
    noteId: string
    actorId: string
  }) {
    this.notifications.emit(payload.propertyId, 'stay:note:updated', {
      stayId:  payload.stayId,
      noteId:  payload.noteId,
      actorId: payload.actorId,
    })
  }

  // QA-08 (2026-06-09) — cancel/restore MANUAL (no-OTA) debe propagar por SSE
  // para que el dashboard mobile + calendarios de otros clientes se refresquen
  // en tiempo real (antes solo el cliente que canceló veía el cambio; el resto
  // esperaba el poll de 60s). Las cancelaciones OTA ya emiten channex:stay:*.
  @OnEvent('stay.cancelled')
  onStayCancelled(payload: {
    stayId: string
    propertyId: string
    roomId: string
    guestName?: string
    initiator?: string
  }) {
    this.notifications.emit(payload.propertyId, 'stay:cancelled', {
      stayId:    payload.stayId,
      roomId:    payload.roomId,
      guestName: payload.guestName,
      initiator: payload.initiator,
    })
  }

  @OnEvent('stay.restored')
  onStayRestored(payload: {
    stayId: string
    propertyId: string
    roomId: string
    guestName?: string
  }) {
    this.notifications.emit(payload.propertyId, 'stay:restored', {
      stayId:    payload.stayId,
      roomId:    payload.roomId,
      guestName: payload.guestName,
    })
  }
}

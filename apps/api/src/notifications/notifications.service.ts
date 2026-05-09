import { Injectable, Logger } from '@nestjs/common'
import { Response } from 'express'
import { SseEvent, SseEventType } from '@zenix/shared'

interface SseClient {
  propertyId: string
  res: Response
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)
  private readonly clients = new Set<SseClient>()

  addClient(propertyId: string, res: Response) {
    const client: SseClient = { propertyId, res }
    this.clients.add(client)

    res.on('close', () => {
      this.clients.delete(client)
      this.logger.debug(`SSE client disconnected (property: ${propertyId}). Total: ${this.clients.size}`)
    })

    this.logger.debug(`SSE client connected (property: ${propertyId}). Total: ${this.clients.size}`)
  }

  emit<T>(propertyId: string, type: SseEventType, data: T) {
    const event: SseEvent<T> = { type, data }
    // Formato SSE estándar W3C: incluir `event: <type>` ANTES de `data:`.
    // Sin esto, el cliente dispatch como 'message' genérico, lo cual rompe
    // listeners nombrados (web useSSE ALL_SSE_TYPES, mobile useSSE idem).
    // Antes solo escribíamos `data:` → web funcionaba por fallback 'message'
    // pero mobile no recibía el evento de manera reconocible.
    const payload = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`

    let delivered = 0
    for (const client of this.clients) {
      if (client.propertyId === propertyId) {
        try {
          client.res.write(payload)
          delivered++
        } catch {
          this.clients.delete(client)
        }
      }
    }
    this.logger.debug(`SSE emit ${type} → property ${propertyId}: ${delivered}/${this.clients.size} clients`)
  }
}

/**
 * ActivationReportService — Day 19.
 *
 * Genera el "Activation Report" como HTML imprimible. Pattern SAP Activate
 * "Realize Phase Sign-off Report" — handoff document formal del consultor
 * al cliente con toda la configuración inicial.
 *
 * Por qué HTML en lugar de PDF (Puppeteer):
 *   · Chromium ~300MB en el server = costoso para v1.0.0 piloto
 *   · Browser nativo Cmd+P / Ctrl+P → "Save as PDF" funciona perfecto
 *   · Print stylesheet @media print en el HTML controla el output PDF
 *   · ADR-0001 reservó Puppeteer para SIGN-DLC donde firma digital
 *     necesita hash determinista — caso de uso distinto
 *   · v1.0.1+ podemos agregar Puppeteer si owner valida el ROI
 *
 * Surface: GET /v1/nova/wizard/activation-report/:organizationId
 *   · Solo NovaTiers PLATFORM/PARTNER_ADMIN/PARTNER_MEMBER
 *   · Devuelve text/html (no JSON) — content-type específico
 *   · Cliente final (Org Owner) puede abrirlo si tiene el link directo,
 *     pero no aparece en su menú Nova (Nova es consultor-only).
 *
 * Email del activation también incluye link al report (Day 19 wiring).
 */
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { PropertyType } from '@prisma/client'

export interface ActivationReportData {
  organizationId: string
  organizationName: string
  organizationSlug: string
  countryCode: string
  timezone: string
  activatedAt: Date
  isActive: boolean
  brand: { name: string; logoUrl: string | null } | null
  legalEntity: {
    name: string
    taxId: string
    countryCode: string
    baseCurrency: string
    pacAdapter: string | null
    pacConfigured: boolean
  } | null
  properties: Array<{
    id: string
    name: string
    type: PropertyType
    city: string | null
    timezone: string
  }>
  orgOwner: {
    name: string
    email: string
    isActive: boolean
    setupTokenPending: boolean
  } | null
}

@Injectable()
export class ActivationReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getReportData(organizationId: string): Promise<ActivationReportData> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        brand: true,
        legalEntities: {
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
        properties: {
          select: {
            id: true,
            name: true,
            type: true,
            city: true,
            settings: { select: { timezone: true } },
          },
        },
        users: {
          where: { systemRole: 'ORG_OWNER' },
          take: 1,
          select: {
            firstName: true,
            lastName: true,
            email: true,
            isActive: true,
            setupTokenHash: true,
            setupTokenConsumedAt: true,
          },
        },
      },
    })

    if (!org) {
      throw new NotFoundException(`Organization ${organizationId} no encontrada.`)
    }

    const le = org.legalEntities[0] ?? null
    const owner = org.users[0] ?? null

    return {
      organizationId: org.id,
      organizationName: org.name,
      organizationSlug: org.slug,
      countryCode: org.countryCode,
      timezone: org.timezone,
      activatedAt: org.createdAt,
      isActive: org.isActive,
      brand: org.brand
        ? { name: org.brand.name, logoUrl: org.brand.logoUrl }
        : null,
      legalEntity: le
        ? {
            name: le.name,
            taxId: le.taxId,
            countryCode: le.countryCode,
            baseCurrency: le.baseCurrency,
            pacAdapter:
              (le.pacCredentials as Record<string, unknown> | null)?.adapter as string | null ?? null,
            pacConfigured:
              !(le.pacCredentials as Record<string, unknown> | null)?.pendingConfiguration,
          }
        : null,
      properties: org.properties.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        city: p.city,
        timezone: p.settings?.timezone ?? 'America/Cancun',
      })),
      orgOwner: owner
        ? {
            name: `${owner.firstName} ${owner.lastName}`.trim(),
            email: owner.email,
            isActive: owner.isActive,
            setupTokenPending: !!owner.setupTokenHash && !owner.setupTokenConsumedAt,
          }
        : null,
    }
  }

  renderHtml(data: ActivationReportData): string {
    return renderReportHtml(data)
  }
}

// ─── HTML template ────────────────────────────────────────────────────

function renderReportHtml(d: ActivationReportData): string {
  const fmtDate = (dt: Date) =>
    new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: d.timezone,
    }).format(dt)

  const statusBadge = d.isActive
    ? '<span style="display:inline-block;padding:4px 10px;border-radius:12px;background:#d1fae5;color:#065f46;font-size:11px;font-weight:600;">ACTIVE</span>'
    : '<span style="display:inline-block;padding:4px 10px;border-radius:12px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:600;">PENDING_OWNER_ACTIVATION</span>'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activation Report · ${escapeHtml(d.organizationName)} · Zenix</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif;
      color: #0f172a; margin: 0; background: #fff;
      font-size: 13px; line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 760px; margin: 0 auto; padding: 32px 28px; }
    .hero {
      background: linear-gradient(135deg, #10b981 0%, #047857 100%);
      color: #fff; padding: 32px 28px; border-radius: 14px;
      margin-bottom: 28px;
    }
    .hero h1 { margin: 0 0 6px; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; }
    .hero .sub { font-size: 13px; opacity: 0.9; }
    .meta-row { display: flex; gap: 16px; margin-top: 18px; flex-wrap: wrap; }
    .meta-item { background: rgba(255,255,255,0.12); padding: 6px 12px; border-radius: 8px; font-size: 12px; }
    .meta-item strong { display:block; font-size:10px; opacity:0.8; text-transform:uppercase; letter-spacing:0.05em; margin-bottom: 2px; }
    h2 {
      font-size: 14px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.06em; color: #64748b;
      margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;
    }
    .kv { display:grid; grid-template-columns: 180px 1fr; gap: 6px 16px; margin: 0 0 8px; }
    .k { font-size: 12px; color: #64748b; }
    .v { font-size: 13px; color: #0f172a; }
    .v.mono { font-family: 'SF Mono', Consolas, monospace; font-size: 12px; }
    .v.muted { color: #94a3b8; }
    .card {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 14px 16px; margin: 8px 0;
    }
    .card .title { font-weight: 600; color: #0f172a; font-size: 13px; }
    .card .sub { color: #64748b; font-size: 12px; margin-top: 2px; }
    .card .row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .pill {
      display:inline-block;padding:2px 8px;border-radius:8px;
      font-size:11px;font-weight:500;
    }
    .pill-emerald { background:#d1fae5;color:#065f46; }
    .pill-amber   { background:#fef3c7;color:#92400e; }
    .pill-slate   { background:#f1f5f9;color:#475569; }
    .footer {
      margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;
      font-size: 11px; color: #94a3b8; text-align: center;
    }
    .signature-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 32px;
      margin-top: 36px;
    }
    .signature-block { border-top: 1px solid #cbd5e1; padding-top: 8px; text-align: center; }
    .signature-block .role { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }
    .signature-block .name { font-size: 12px; color: #0f172a; margin-top: 4px; }
    @media print {
      body { background: #fff; }
      .container { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- Print hint (hidden when printing) -->
    <div class="no-print" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 14px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div style="font-size:12px;color:#1e40af;">
        <strong>Activation Report</strong> — Imprime este documento como PDF con Cmd+P / Ctrl+P · Guarda en el expediente del cliente.
      </div>
      <button onclick="window.print()" style="padding:6px 14px;background:#1e40af;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">Imprimir PDF</button>
    </div>

    <!-- Hero -->
    <div class="hero">
      <h1>${escapeHtml(d.organizationName)}</h1>
      <div class="sub">Activation Report · Zenix Activate Wizard</div>
      <div class="meta-row">
        <div class="meta-item">
          <strong>Activated</strong>${fmtDate(d.activatedAt)}
        </div>
        <div class="meta-item">
          <strong>Status</strong>${d.isActive ? 'ACTIVE' : 'PENDING_OWNER_ACTIVATION'}
        </div>
        <div class="meta-item">
          <strong>Country</strong>${escapeHtml(d.countryCode)}
        </div>
        <div class="meta-item">
          <strong>Properties</strong>${d.properties.length}
        </div>
      </div>
    </div>

    <!-- Cliente -->
    <h2>Cliente</h2>
    <div class="kv">
      <div class="k">Razón comercial</div>
      <div class="v"><strong>${escapeHtml(d.organizationName)}</strong></div>
      <div class="k">Slug Zenix</div>
      <div class="v mono">${escapeHtml(d.organizationSlug)}</div>
      <div class="k">Organization ID</div>
      <div class="v mono">${escapeHtml(d.organizationId)}</div>
      <div class="k">Timezone</div>
      <div class="v mono">${escapeHtml(d.timezone)}</div>
      <div class="k">Status operativo</div>
      <div class="v">${statusBadge}</div>
    </div>

    ${
      d.brand
        ? `
    <h2>Brand</h2>
    <div class="kv">
      <div class="k">Nombre marca</div>
      <div class="v">${escapeHtml(d.brand.name)}</div>
      <div class="k">Logo URL</div>
      <div class="v mono ${d.brand.logoUrl ? '' : 'muted'}">${d.brand.logoUrl ? escapeHtml(d.brand.logoUrl) : 'No configurado'}</div>
    </div>`
        : `
    <h2>Brand</h2>
    <div class="card">
      <div class="sub">Sin marca paraguas configurada — Organization opera como hotel independiente. Puede agregarse después en /nova/settings/brand.</div>
    </div>`
    }

    ${
      d.legalEntity
        ? `
    <h2>Legal Entity (fiscal)</h2>
    <div class="kv">
      <div class="k">Razón social</div>
      <div class="v"><strong>${escapeHtml(d.legalEntity.name)}</strong></div>
      <div class="k">Tax ID</div>
      <div class="v mono">${escapeHtml(d.legalEntity.taxId)}</div>
      <div class="k">País fiscal</div>
      <div class="v mono">${escapeHtml(d.legalEntity.countryCode)}</div>
      <div class="k">Currency base</div>
      <div class="v mono">${escapeHtml(d.legalEntity.baseCurrency)}</div>
      <div class="k">PAC adapter</div>
      <div class="v">
        <span class="mono">${escapeHtml(d.legalEntity.pacAdapter || 'No asignado')}</span>
        ${
          d.legalEntity.pacConfigured
            ? '<span class="pill pill-emerald" style="margin-left:8px;">Configurado</span>'
            : '<span class="pill pill-amber" style="margin-left:8px;">Pending — el cliente configurará credentials</span>'
        }
      </div>
    </div>`
        : ''
    }

    <h2>Properties · ${d.properties.length}</h2>
    ${d.properties
      .map(
        (p) => `
    <div class="card">
      <div class="row">
        <div>
          <div class="title">${escapeHtml(p.name)}</div>
          <div class="sub">${escapeHtml(p.city || '—')} · ${escapeHtml(p.timezone)}</div>
        </div>
        <div><span class="pill pill-slate">${escapeHtml(p.type)}</span></div>
      </div>
    </div>`,
      )
      .join('')}

    ${
      d.orgOwner
        ? `
    <h2>Org Owner (administrador del cliente)</h2>
    <div class="kv">
      <div class="k">Nombre</div>
      <div class="v">${escapeHtml(d.orgOwner.name)}</div>
      <div class="k">Email corporativo</div>
      <div class="v mono">${escapeHtml(d.orgOwner.email)}</div>
      <div class="k">Estado</div>
      <div class="v">${
        d.orgOwner.isActive
          ? '<span class="pill pill-emerald">Active</span>'
          : d.orgOwner.setupTokenPending
            ? '<span class="pill pill-amber">Setup link pendiente — el cliente debe activar en 72h</span>'
            : '<span class="pill pill-slate">Inactive</span>'
      }</div>
    </div>`
        : ''
    }

    <!-- Firmas -->
    <div class="signature-row">
      <div class="signature-block">
        <div class="role">Consultor / Partner Member</div>
        <div class="name">_______________________________</div>
      </div>
      <div class="signature-block">
        <div class="role">Org Owner del cliente</div>
        <div class="name">${escapeHtml(d.orgOwner?.name || '_______________________________')}</div>
      </div>
    </div>

    <div class="footer">
      Documento generado automáticamente por Zenix Activate Wizard · Pattern SAP Activate "Realize Phase Sign-off Report"<br>
      © Zenix PMS · zenix.com · soporte@zenix.com
    </div>

  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  if (!s) return ''
  return String(s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return c
    }
  })
}

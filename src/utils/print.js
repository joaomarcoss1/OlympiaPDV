import { money, dateTime, pad, formatAddress, maskPhone } from './format'
import { methodLabel, PAYMENT_METHODS } from '../store/model'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function pageCss(width) {
  const thermal = width !== 'A4'
  const contentWidth = width === '58mm' ? '48mm' : '72mm'
  return `
    @page { size: ${thermal ? `${width} auto` : 'A4'}; margin: ${thermal ? '2mm' : '14mm'}; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ${thermal ? "'Courier New', ui-monospace, monospace" : "Inter, Arial, sans-serif"}; color: #000; font-size: ${thermal ? (width === '58mm' ? '10px' : '11.5px') : '12.5px'}; line-height: 1.35; }
    .doc { width: ${thermal ? contentWidth : '100%'}; margin: 0 auto; }
    .center { text-align: center; }
    .right { text-align: right; }
    .logo { max-width: ${thermal ? '60%' : '160px'}; max-height: 70px; filter: grayscale(1); display: block; margin: 0 auto 4px; }
    .store { font-weight: 800; font-size: 1.25em; letter-spacing: .04em; text-transform: uppercase; }
    .muted { color: #333; font-size: .92em; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .title { font-weight: 800; font-size: 1.15em; margin: 4px 0; letter-spacing: .03em; }
    .item { margin-bottom: 4px; }
    .item-name { font-weight: 700; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .total { font-weight: 800; font-size: 1.3em; }
    .box { border: 1px solid #000; padding: 6px; margin-top: 6px; }
    .big { font-size: 1.15em; font-weight: 800; }
    .cut { page-break-after: always; break-after: page; height: 1px; }
    ${thermal ? '' : '.doc { max-width: 720px; } .item { padding: 6px 0; border-bottom: 1px solid #ddd; }'}
  `
}

function header(settings) {
  return `
    <div class="center">
      ${settings.logo ? `<img class="logo" src="${settings.logo}" alt="" />` : ''}
      <div class="store">${esc(settings.storeName)}</div>
    </div>
    <div>
      ${settings.legalName ? `<div class="muted">${esc(settings.legalName)}</div>` : ''}
      ${settings.cnpj ? `<div class="muted">CNPJ ${esc(settings.cnpj)}</div>` : ''}
      ${settings.address ? `<div class="muted">${esc(settings.address)}</div>` : ''}
      ${[settings.phone, settings.instagram].filter(Boolean).length ? `<div class="muted">${esc([settings.phone, settings.instagram].filter(Boolean).join(' · '))}</div>` : ''}
    </div>`
}

function deliveryBlock(sale) {
  const d = sale.delivery
  if (!d) return ''
  return `
    <div class="box">
      <div class="big">ENTREGA</div>
      <div><b>Destinatário:</b> ${esc(d.recipient)}</div>
      ${d.phone ? `<div><b>Telefone:</b> ${esc(maskPhone(d.phone))}</div>` : ''}
      <div><b>Endereço:</b> ${esc(formatAddress(d.address))}</div>
      ${d.address?.reference ? `<div><b>Referência:</b> ${esc(d.address.reference)}</div>` : ''}
      ${d.scheduled ? `<div><b>Previsão:</b> ${esc(d.scheduled)}</div>` : ''}
      ${d.notes ? `<div><b>Obs.:</b> ${esc(d.notes)}</div>` : ''}
    </div>`
}

export function receiptHtml(sale, db) {
  const { settings } = db
  const seller = db.users.find((u) => u.id === sale.userId)
  const items = sale.items
    .map(
      (i) => `
      <div class="item">
        <div class="item-name">${esc(i.name)}</div>
        <div class="muted">${esc([i.variantLabel, i.sku].filter(Boolean).join(' · '))}</div>
        <div class="row"><span>${i.qty} x ${money(i.price)}</span><span>${money(i.total)}</span></div>
      </div>`,
    )
    .join('')
  const payments = sale.payments
    .map((p) => `<div class="row"><span>${esc(methodLabel(p.method))}${p.installments > 1 ? ` (${p.installments}x)` : ''}</span><span>${money(p.received || p.amount)}</span></div>`)
    .join('')
  return `
    <div class="doc">
      ${header(settings)}
      <hr />
      <div class="center title">PEDIDO Nº ${pad(sale.number)}</div>
      ${sale.status === 'cancelada' ? '<div class="center big">*** VENDA CANCELADA ***</div>' : ''}
      <div class="row"><span>${dateTime(sale.date)}</span><span>Vend.: ${esc(seller?.name || '-')}</span></div>
      ${sale.customerName ? `<div>Cliente: ${esc(sale.customerName)}${sale.customerPhone ? ` · ${esc(maskPhone(sale.customerPhone))}` : ''}</div>` : ''}
      <hr />
      ${items}
      <hr />
      <div class="row"><span>Subtotal (${sale.items.reduce((s, i) => s + i.qty, 0)} itens)</span><span>${money(sale.subtotal)}</span></div>
      ${sale.discount?.amount ? `<div class="row"><span>Desconto${sale.discount.type === '%' ? ` (${sale.discount.value}%)` : ''}</span><span>- ${money(sale.discount.amount)}</span></div>` : ''}
      ${sale.paymentDiscount?.amount ? `<div class="row"><span>Desc. forma de pagamento (${sale.paymentDiscount.percent}%)</span><span>- ${money(sale.paymentDiscount.amount)}</span></div>` : ''}
      ${sale.deliveryFee ? `<div class="row"><span>Taxa de entrega</span><span>${money(sale.deliveryFee)}</span></div>` : ''}
      <div class="row total"><span>TOTAL</span><span>${money(sale.total)}</span></div>
      <hr />
      ${payments}
      ${sale.change ? `<div class="row"><b>Troco</b><b>${money(sale.change)}</b></div>` : ''}
      ${deliveryBlock(sale)}
      ${sale.notes ? `<div style="margin-top:6px"><b>Obs.:</b> ${esc(sale.notes)}</div>` : ''}
      <hr />
      ${settings.receiptFooter ? `<div class="center">${esc(settings.receiptFooter)}</div>` : ''}
      <div class="center muted" style="margin-top:4px">Documento sem valor fiscal</div>
    </div>`
}

export function deliverySlipHtml(sale, db) {
  const items = sale.items.map((i) => `<div>${i.qty}x ${esc(i.name)} <span class="muted">${esc(i.variantLabel)}</span></div>`).join('')
  const pendingPay = sale.payments.length ? `Pago: ${sale.payments.map((p) => methodLabel(p.method)).join(' + ')}` : ''
  return `
    <div class="doc">
      <div class="center store">${esc(db.settings.storeName)}</div>
      <div class="center title">VIA DE ENTREGA · PEDIDO ${pad(sale.number)}</div>
      <div class="center muted">${dateTime(sale.date)}</div>
      ${deliveryBlock(sale)}
      <hr />
      ${items}
      <hr />
      <div class="row total"><span>TOTAL</span><span>${money(sale.total)}</span></div>
      <div class="muted">${esc(pendingPay)}</div>
      <div style="margin-top:22px;border-top:1px solid #000;padding-top:2px" class="center muted">Assinatura do recebedor</div>
    </div>`
}

export function cashReportHtml(summary, db) {
  const s = summary.session
  const user = (id) => db.users.find((u) => u.id === id)?.name || '-'
  const rows = PAYMENT_METHODS.map((m) => `<div class="row"><span>${m.short}</span><span>${money(summary.byMethod[m.id] || 0)}</span></div>`).join('')
  const moves = summary.moves
    .filter((m) => m.type === 'suprimento' || m.type === 'sangria' || m.type === 'estorno')
    .map((m) => `<div class="row"><span>${m.type === 'suprimento' ? '+' : '-'} ${esc(m.description || m.type)} (${methodLabel(m.method)})</span><span>${money(m.amount)}</span></div>`)
    .join('')
  const closed = s.status === 'fechado'
  return `
    <div class="doc">
      ${header(db.settings)}
      <hr />
      <div class="center title">${closed ? 'FECHAMENTO DE CAIXA' : 'RESUMO DE CAIXA (PARCIAL)'}</div>
      <div>Abertura: ${dateTime(s.openedAt)} · ${esc(user(s.openedBy))}</div>
      ${closed ? `<div>Fechamento: ${dateTime(s.closedAt)} · ${esc(user(s.closedBy))}</div>` : ''}
      <hr />
      <div class="row"><span>Fundo de troco</span><span>${money(s.openingAmount)}</span></div>
      <div class="row"><span>Vendas (${summary.salesCount})</span><span>${money(summary.salesTotal)}</span></div>
      <hr />
      <b>Por forma de pagamento</b>
      ${rows}
      <hr />
      <div class="row"><span>Entradas (suprimentos)</span><span>${money(summary.suprimentos)}</span></div>
      <div class="row"><span>Retiradas (sangrias)</span><span>${money(summary.sangrias)}</span></div>
      <div class="row"><span>Estornos</span><span>${money(summary.estornos)}</span></div>
      ${moves ? `<hr />${moves}` : ''}
      <hr />
      <div class="row big"><span>Dinheiro esperado</span><span>${money(summary.expectedCash)}</span></div>
      ${closed ? `<div class="row"><span>Dinheiro contado</span><span>${money(s.countedCash)}</span></div>
      <div class="row big"><span>Diferença</span><span>${money(s.difference)}</span></div>` : ''}
      ${s.closingNotes ? `<div style="margin-top:6px"><b>Obs.:</b> ${esc(s.closingNotes)}</div>` : ''}
      <div style="margin-top:28px;border-top:1px solid #000;padding-top:2px" class="center muted">Assinatura do responsável</div>
    </div>`
}

// Imprime HTML em um iframe oculto (não troca de página nem abre pop-up).
export function printHtml(body, width = '80mm', title = 'Olympia PDV') {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  doc.open()
  doc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${pageCss(width)}</style></head><body>${body}</body></html>`)
  doc.close()
  const go = () => {
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    setTimeout(() => iframe.remove(), 1500)
  }
  const imgs = Array.from(doc.images)
  if (!imgs.length) setTimeout(go, 50)
  else Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r })))).then(go)
}

export function printSale(sale, db, { withDeliveryCopy } = {}) {
  const width = db.settings.receiptWidth
  let body = receiptHtml(sale, db)
  const copy = withDeliveryCopy ?? db.settings.printDeliveryCopy
  if (sale.delivery && copy) body += `<div class="cut"></div>${deliverySlipHtml(sale, db)}`
  printHtml(body, width, `Pedido ${pad(sale.number)}`)
}

export function printDeliverySlip(sale, db) {
  printHtml(deliverySlipHtml(sale, db), db.settings.receiptWidth, `Entrega ${pad(sale.number)}`)
}

export function printCashReport(summary, db) {
  printHtml(cashReportHtml(summary, db), db.settings.receiptWidth, 'Caixa')
}

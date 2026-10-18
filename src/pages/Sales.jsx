import { useMemo, useState } from 'react'
import { Receipt, Printer, Truck, Ban, Download, PencilLine } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { can, cancelSale, methodLabel, openSession, variantLabel, DELIVERY_STATUS, PAYMENT_METHODS } from '../store/model'
import { PageHeader, SearchInput, Empty, Modal, Badge, Segmented, Field, Switch, Stat } from '../components/ui'
import { money, normalize, dateTime, pad, startOfDay, addDays, isoDateInput, formatAddress, maskPhone } from '../utils/format'
import { printSale, printDeliverySlip } from '../utils/print'

const PERIODS = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: 'custom', label: 'Período' },
]

export default function Sales() {
  const { db } = useStore()
  const [period, setPeriod] = useState('hoje')
  const [from, setFrom] = useState(isoDateInput(addDays(new Date(), -30)))
  const [to, setTo] = useState(isoDateInput())
  const [q, setQ] = useState('')
  const [seller, setSeller] = useState('')
  const [method, setMethod] = useState('')
  const [kind, setKind] = useState('')
  const [viewing, setViewing] = useState(null)
  const users = useMemo(() => Object.fromEntries(db.users.map((u) => [u.id, u.name])), [db.users])

  const list = useMemo(() => {
    let start, end
    if (period === 'custom') {
      start = new Date(`${from}T00:00:00`)
      end = new Date(`${to}T23:59:59`)
    } else {
      start = period === 'hoje' ? startOfDay() : startOfDay(addDays(new Date(), -Number(period) + 1))
      end = new Date(8640000000000000)
    }
    const t = normalize(q)
    return db.sales
      .filter((s) => {
        const d = new Date(s.date)
        if (d < start || d > end) return false
        if (seller && s.userId !== seller) return false
        if (method && !s.payments.some((p) => p.method === method)) return false
        if (kind === 'entrega' && !s.delivery) return false
        if (kind === 'pendente' && !(s.delivery && s.delivery.status !== 'entregue' && s.status === 'concluida')) return false
        if (kind === 'cancelada' && s.status !== 'cancelada') return false
        if (t && !normalize(`${s.number} ${pad(s.number)} ${s.customerName} ${s.items.map((i) => i.name).join(' ')}`).includes(t)) return false
        return true
      })
      .slice()
      .reverse()
  }, [db.sales, period, from, to, q, seller, method, kind])

  const done = list.filter((s) => s.status === 'concluida')
  const total = done.reduce((a, s) => a + s.total, 0)

  function exportCsv() {
    const header = ['Pedido', 'Data', 'Cliente', 'Vendedor', 'Itens', 'Subtotal', 'Desconto', 'Entrega', 'Total', 'Pagamentos', 'Status']
    const rows = list.map((s) => [
      pad(s.number), dateTime(s.date), s.customerName, users[s.userId] || '', s.items.map((i) => `${i.qty}x ${i.name} ${i.variantLabel}`).join(' | '),
      s.subtotal, s.discount.amount, s.deliveryFee, s.total, s.payments.map((p) => `${methodLabel(p.method)} ${p.amount}`).join(' + '), s.status,
    ])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vendas-olympia-${isoDateInput()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="page">
      <PageHeader
        title="Vendas"
        subtitle="Todos os pedidos ficam salvos aqui automaticamente."
        actions={<button className="btn btn-outline" onClick={exportCsv} disabled={!list.length}><Download size={18} /> Exportar planilha</button>}
      />
      <div className="filters">
        <Segmented size="sm" value={period} onChange={setPeriod} options={PERIODS} />
        {period === 'custom' && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
      </div>
      <div className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Nº do pedido, cliente ou produto" />
        <select value={seller} onChange={(e) => setSeller(e.target.value)}>
          <option value="">Todos os vendedores</option>
          {db.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Todas as formas</option>
          {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.short}</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todas</option>
          <option value="entrega">Só entregas</option>
          <option value="pendente">Entregas pendentes</option>
          <option value="cancelada">Canceladas</option>
        </select>
      </div>
      <div className="stats">
        <Stat label="Vendas no período" value={done.length} />
        <Stat label="Faturamento" value={money(total)} />
        <Stat label="Ticket médio" value={money(done.length ? total / done.length : 0)} />
        <Stat label="Peças vendidas" value={done.reduce((a, s) => a + s.items.reduce((b, i) => b + i.qty, 0), 0)} />
      </div>

      {list.length === 0 ? (
        <Empty icon={<Receipt size={28} />} title="Nenhuma venda no período" />
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr><th>Pedido</th><th>Data</th><th className="hide-sm">Cliente</th><th className="hide-md">Vendedor</th><th className="hide-md">Pagamento</th><th className="num">Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className={`row-click ${s.status !== 'concluida' ? 'row-muted' : ''}`} onClick={() => setViewing(s.id)}>
                  <td><strong>#{pad(s.number)}</strong></td>
                  <td className="nowrap">{dateTime(s.date)}</td>
                  <td className="hide-sm">{s.customerName || <span className="muted">Consumidor</span>}</td>
                  <td className="hide-md">{users[s.userId]}</td>
                  <td className="hide-md">{s.payments.map((p) => methodLabel(p.method)).join(' + ')}</td>
                  <td className="num"><strong>{money(s.total)}</strong></td>
                  <td>
                    {s.status === 'cancelada' ? (
                      <Badge tone="danger">Cancelada</Badge>
                    ) : s.status === 'editada' ? (
                      <Badge tone="neutral">Editada (substituída)</Badge>
                    ) : s.delivery ? (
                      <Badge tone={s.delivery.status === 'entregue' ? 'success' : s.delivery.status === 'em_rota' ? 'info' : 'warn'}>
                        <Truck size={12} /> {DELIVERY_STATUS.find((d) => d.id === s.delivery.status)?.label}
                      </Badge>
                    ) : (
                      <Badge tone="success">Concluída</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewing && <SaleDetail id={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

export function SaleDetail({ id, onClose }) {
  const { db, update, user, toast } = useStore()
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [refund, setRefund] = useState(true)
  const sale = db.sales.find((s) => s.id === id)
  if (!sale) return null
  const seller = db.users.find((u) => u.id === sale.userId)
  const session = openSession(db)

  function setDeliveryStatus(status) {
    update((d) => { d.sales.find((s) => s.id === id).delivery.status = status })
  }

  // Leva a venda para o PDV; ao concluir, a venda original é desfeita e substituída (mesmo número).
  function startEdit() {
    if (!session) return toast('Abra o caixa para editar a venda.', 'error')
    const items = sale.items.map((i) => {
      const p = db.products.find((x) => x.id === i.productId)
      const v = p?.variants.find((x) => x.id === i.variantId)
      return { ...i, colorHex: p?.colors.find((c) => c.name === v?.color)?.hex, image: p?.image || null, variantLabel: v ? variantLabel(v) : i.variantLabel }
    })
    const returned = {}
    for (const i of sale.items) returned[i.variantId] = (returned[i.variantId] || 0) + i.qty
    const customer = sale.customerId ? { id: sale.customerId, name: sale.customerName, phone: sale.customerPhone } : null
    const cart = {
      items,
      customer,
      discount: sale.discount.type === '%' ? { type: '%', value: sale.discount.value } : { type: 'R$', value: sale.discount.amount },
      deliveryOn: !!sale.delivery,
      delivery: sale.delivery ? { ...sale.delivery } : { recipient: '', phone: '', address: { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '', reference: '' }, fee: 0, scheduled: '', notes: '' },
      editing: { saleId: sale.id, number: sale.number, returned },
    }
    try { localStorage.setItem('olympia-pdv-cart', JSON.stringify(cart)) } catch { /* sem acesso */ }
    window.location.hash = '/pdv'
  }

  function confirmCancel() {
    try {
      update((d) => cancelSale(d, { saleId: id, userId: user.id, reason, refund: refund && !!session }))
      toast('Venda cancelada e estoque devolvido.')
      setCancelling(false)
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  return (
    <Modal
      title={`Pedido #${pad(sale.number)}`}
      subtitle={`${dateTime(sale.date)} · vendedor: ${seller?.name || '—'}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {sale.status === 'concluida' && can(user, 'sales.cancel') && (
            <>
              <button className="btn btn-ghost btn-danger-text" onClick={() => setCancelling(true)}><Ban size={16} /> Cancelar venda</button>
              <button className="btn btn-outline" onClick={startEdit}><PencilLine size={16} /> Editar venda</button>
            </>
          )}
          <span className="spacer" />
          {sale.delivery && <button className="btn btn-outline" onClick={() => printDeliverySlip(sale, db)}><Truck size={16} /> Via de entrega</button>}
          <button className="btn btn-primary" onClick={() => printSale(sale, db, { withDeliveryCopy: false })}><Printer size={16} /> Reimprimir</button>
        </>
      }
    >
      {sale.status === 'cancelada' && (
        <div className="alert alert-danger">
          Cancelada em {dateTime(sale.cancelledAt)} por {db.users.find((u) => u.id === sale.cancelledBy)?.name}. {sale.cancelReason && `Motivo: ${sale.cancelReason}`}
        </div>
      )}
      {sale.status === 'editada' && (
        <div className="alert alert-info">
          Venda editada em {dateTime(sale.editedAt)} por {db.users.find((u) => u.id === sale.editedBy)?.name}. A versão atual tem o mesmo número.
        </div>
      )}
      {sale.editedFrom && <div className="alert alert-info">Esta venda foi corrigida pelo administrador.</div>}
      {sale.customerName && <p><b>Cliente:</b> {sale.customerName} {sale.customerPhone && `· ${maskPhone(sale.customerPhone)}`}</p>}
      <div className="card table-card flat">
        <table className="table">
          <thead><tr><th>Item</th><th className="num">Qtd.</th><th className="num">Unit.</th><th className="num">Total</th></tr></thead>
          <tbody>
            {sale.items.map((i, k) => (
              <tr key={k}>
                <td><strong>{i.name}</strong> <span className="muted small">{i.variantLabel} · {i.sku}</span></td>
                <td className="num">{i.qty}</td>
                <td className="num">{money(i.price)}</td>
                <td className="num">{money(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="totals totals-inline">
        <div><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
        {sale.discount.amount > 0 && <div className="t-discount"><span>Desconto {sale.discount.type === '%' ? `(${sale.discount.value}%)` : ''}{sale.authorizedBy ? ` · autorizado por ${db.users.find((u) => u.id === sale.authorizedBy)?.name}` : ''}</span><span>− {money(sale.discount.amount)}</span></div>}
        {sale.paymentDiscount?.amount > 0 && <div className="t-discount"><span>Desconto pela forma de pagamento ({sale.paymentDiscount.percent}%)</span><span>− {money(sale.paymentDiscount.amount)}</span></div>}
        {sale.deliveryFee > 0 && <div><span>Entrega</span><span>{money(sale.deliveryFee)}</span></div>}
        <div className="t-total"><span>Total</span><span>{money(sale.total)}</span></div>
        {sale.payments.map((p, k) => (
          <div key={k}><span>{methodLabel(p.method)}{p.brand ? ` ${p.brand}` : ''}{p.installments > 1 ? ` (${p.installments}x)` : ''}</span><span>{money(p.amount)}</span></div>
        ))}
        {can(user, 'settings') && sale.fees > 0 && <div className="muted"><span>Taxas da maquininha</span><span>− {money(sale.fees)} (líquido {money(sale.total - sale.fees)})</span></div>}
        {sale.change > 0 && <div><span>Troco</span><span>{money(sale.change)}</span></div>}
      </div>
      {sale.notes && <p><b>Obs.:</b> {sale.notes}</p>}
      {sale.delivery && (
        <div className="delivery-summary">
          <h3 className="section-title"><Truck size={18} /> Entrega</h3>
          <p><b>{sale.delivery.recipient}</b> {sale.delivery.phone && `· ${maskPhone(sale.delivery.phone)}`}</p>
          <p>{formatAddress(sale.delivery.address)}{sale.delivery.address?.reference && ` · Ref.: ${sale.delivery.address.reference}`}</p>
          {sale.delivery.scheduled && <p className="muted">Previsão: {sale.delivery.scheduled}</p>}
          {sale.delivery.notes && <p className="muted">Obs.: {sale.delivery.notes}</p>}
          {sale.status === 'concluida' && (
            <Segmented size="sm" value={sale.delivery.status} onChange={setDeliveryStatus} options={DELIVERY_STATUS.map((d) => ({ value: d.id, label: d.label }))} />
          )}
        </div>
      )}
      {cancelling && (
        <Modal
          title={`Cancelar pedido #${pad(sale.number)}?`}
          size="sm"
          onClose={() => setCancelling(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setCancelling(false)}>Voltar</button>
              <button className="btn btn-danger" onClick={confirmCancel}>Cancelar venda</button>
            </>
          }
        >
          <p>As peças voltam para o estoque.</p>
          <Field label="Motivo">
            <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="Ex.: cliente desistiu" />
          </Field>
          {session ? (
            <Switch checked={refund} onChange={setRefund} label="Devolver o valor ao cliente" description="Registra o estorno no caixa aberto, por forma de pagamento." />
          ) : (
            <p className="muted small">Nenhum caixa aberto: o estorno financeiro não será lançado.</p>
          )}
        </Modal>
      )}
    </Modal>
  )
}

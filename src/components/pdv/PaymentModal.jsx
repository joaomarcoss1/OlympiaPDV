import { useMemo, useRef, useState } from 'react'
import { Banknote, QrCode, CreditCard, Wallet, Ticket, Trash2, Plus, BadgePercent } from 'lucide-react'
import { Modal, MoneyInput, Field } from '../ui'
import { PAYMENT_METHODS, methodLabel, cardFeeKey } from '../../store/model'
import { money, round2 } from '../../utils/format'

const ICONS = { dinheiro: Banknote, pix: QrCode, credito: CreditCard, debito: Wallet, vale: Ticket }
const isCard = (m) => m === 'credito' || m === 'debito'

// Melhor desconto automático cujas formas cobrem TODAS as formas usadas na venda.
function bestRule(rules, methods) {
  if (!methods.length) return null
  return rules.filter((r) => methods.every((m) => r.methods.includes(m))).sort((a, b) => b.percent - a.percent)[0] || null
}

// Pagamento com uma ou várias formas combinadas. Troco só em dinheiro.
// total: valor da venda; discountBase: parte sobre a qual incide o desconto por forma de pagamento (sem entrega).
export default function PaymentModal({ total, discountBase, settings, onClose, onConfirm }) {
  const methods = PAYMENT_METHODS.filter((m) => settings.enabledMethods.includes(m.id))
  const brands = settings.cardBrands?.length ? settings.cardBrands : ['Cartão']
  const rules = (settings.paymentDiscounts || []).filter((r) => r.active && r.percent > 0 && r.methods.length)
  const [payments, setPayments] = useState([])
  const [method, setMethod] = useState(methods[0]?.id || 'dinheiro')
  const [brand, setBrand] = useState(brands[0])
  const [amount, setAmount] = useState(null)
  const [installments, setInstallments] = useState(1)
  const [notes, setNotes] = useState('')
  const amountRef = useRef(null)

  const paid = round2(payments.reduce((s, p) => s + p.amount, 0))
  const used = [...new Set(payments.map((p) => p.method))]
  // Primeiro supõe que a forma selecionada também será usada; se já está quitado, considera só as usadas.
  let rule = bestRule(rules, [...new Set([...used, method])])
  let effTotal = round2(total - (rule ? (discountBase * rule.percent) / 100 : 0))
  if (paid + 0.001 >= effTotal && payments.length) {
    rule = bestRule(rules, used)
    effTotal = round2(total - (rule ? (discountBase * rule.percent) / 100 : 0))
  }
  const ruleAmount = round2(total - effTotal)
  const remaining = round2(Math.max(0, effTotal - paid))
  const value = amount ?? remaining
  const change = round2(payments.reduce((s, p) => s + (p.change || 0), 0))

  const feeFor = (m, b, n) => (isCard(m) ? Number(settings.cardFees?.[cardFeeKey(b, m, n)]) || 0 : 0)

  function buildPayment(m, v) {
    v = round2(v)
    if (v <= 0 || remaining <= 0) return null
    const applied = Math.min(v, remaining)
    const p = { method: m, amount: applied }
    if (m === 'dinheiro') {
      p.received = v
      if (v > remaining) p.change = round2(v - remaining)
    }
    if (isCard(m)) {
      p.brand = brand
      if (m === 'credito') p.installments = installments
      p.feePercent = feeFor(m, brand, installments)
      p.fee = round2((applied * p.feePercent) / 100)
    }
    return p
  }

  function addPayment() {
    const p = buildPayment(method, value)
    if (!p) return
    setPayments([...payments, p])
    setAmount(null)
    setInstallments(1)
    setTimeout(() => amountRef.current?.querySelector('input')?.focus(), 0)
  }

  function selectMethod(id) {
    setMethod(id)
    setAmount(null)
    setInstallments(1)
    setTimeout(() => amountRef.current?.querySelector('input')?.focus(), 0)
  }

  const pending = useMemo(() => (remaining > 0 ? buildPayment(method, value) : null), [remaining, method, value, installments, brand]) // eslint-disable-line react-hooks/exhaustive-deps
  const finalPayments = pending ? [...payments, pending] : payments
  const finalPaid = round2(finalPayments.reduce((s, p) => s + p.amount, 0))
  const finalRule = bestRule(rules, [...new Set(finalPayments.map((p) => p.method))])
  const finalTotal = round2(total - (finalRule ? (discountBase * finalRule.percent) / 100 : 0))
  const canConfirm = finalPayments.length > 0 && finalPaid + 0.001 >= finalTotal
  const finalChange = round2(finalPayments.reduce((s, p) => s + (p.change || 0), 0))
  const curFee = isCard(method) ? feeFor(method, brand, installments) : 0

  function confirm() {
    if (!canConfirm) return
    const discount = finalRule ? { percent: finalRule.percent, amount: round2(total - finalTotal) } : null
    onConfirm(finalPayments, notes, discount)
  }

  const quickCash = [...new Set([remaining, Math.ceil(remaining / 10) * 10, Math.ceil(remaining / 50) * 50, Math.ceil(remaining / 100) * 100])].filter((v) => v >= remaining && v > 0).slice(0, 4)

  return (
    <Modal
      title="Pagamento"
      onClose={onClose}
      size="lg"
      className="pay-modal"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Voltar</button>
          <button className="btn btn-primary btn-lg" onClick={confirm} disabled={!canConfirm}>
            Concluir venda {finalChange > 0 ? `· troco ${money(finalChange)}` : ''}
          </button>
        </>
      }
    >
      <div className="pay-summary">
        <div>
          <span>Total</span>
          <strong>{money(effTotal)}</strong>
          {ruleAmount > 0 && <s className="muted small">{money(total)}</s>}
        </div>
        <div>
          <span>Pago</span>
          <strong>{money(paid)}</strong>
        </div>
        <div className={remaining > 0 ? 'pay-remaining' : 'pay-ok'}>
          <span>{remaining > 0 ? 'Falta' : change > 0 ? 'Troco' : 'Quitado'}</span>
          <strong>{money(remaining > 0 ? remaining : change)}</strong>
        </div>
      </div>
      {ruleAmount > 0 && (
        <div className="pay-rule">
          <BadgePercent size={18} /> Desconto de {rule.percent}% pagando com {rule.methods.map(methodLabel).join(' / ')}: −{money(ruleAmount)}
        </div>
      )}

      {remaining > 0 && (
        <>
          <div className="pay-methods">
            {methods.map((m) => {
              const Icon = ICONS[m.id]
              return (
                <button key={m.id} type="button" className={`pay-method ${method === m.id ? 'active' : ''}`} onClick={() => selectMethod(m.id)}>
                  <Icon size={22} />
                  <span>{m.short}</span>
                </button>
              )
            })}
          </div>
          {isCard(method) && (
            <div className="option-row">
              <span className="muted small">Bandeira:</span>
              {brands.map((b) => (
                <button key={b} type="button" className={`chip chip-sm ${brand === b ? 'active' : ''}`} onClick={() => setBrand(b)}>{b}</button>
              ))}
            </div>
          )}
          <div className="pay-entry">
            <Field label={method === 'dinheiro' ? 'Valor recebido' : `Valor no ${methodLabel(method)}`}>
              <div ref={amountRef}>
                <MoneyInput value={value} onChange={setAmount} autoFocus className="input-lg" onEnter={() => (pending && round2(pending.amount) >= remaining ? confirm() : addPayment())} />
              </div>
            </Field>
            {method === 'credito' && (
              <Field label="Parcelas">
                <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="input-lg">
                  {Array.from({ length: settings.maxInstallments || 1 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}x de {money(Math.min(value || remaining, remaining) / n)}</option>
                  ))}
                </select>
              </Field>
            )}
            <button type="button" className="btn btn-outline btn-lg pay-add" onClick={addPayment} disabled={!value}>
              <Plus size={18} /> Dividir
            </button>
          </div>
          {isCard(method) && curFee > 0 && (
            <p className="muted small">
              Taxa da maquininha {brand}{method === 'credito' ? ` ${installments}x` : ''}: {curFee}% (−{money((Math.min(value || 0, remaining) * curFee) / 100)}). No caixa entra {money(Math.min(value || 0, remaining) * (1 - curFee / 100))}.
            </p>
          )}
          {method === 'dinheiro' && quickCash.length > 1 && (
            <div className="quick-cash">
              {quickCash.map((v) => (
                <button key={v} type="button" className="chip" onClick={() => setAmount(v)}>{money(v)}</button>
              ))}
            </div>
          )}
          <p className="muted small">Para pagar com mais de uma forma, digite o valor parcial e toque em <b>Dividir</b>.</p>
        </>
      )}

      {payments.length > 0 && (
        <div className="pay-list">
          {payments.map((p, i) => (
            <div key={i} className="pay-line">
              <span>
                <b>{methodLabel(p.method)}</b>
                {p.brand && <span className="muted"> · {p.brand}</span>}
                {p.installments > 1 && <span className="muted"> · {p.installments}x</span>}
                {p.fee > 0 && <span className="muted"> · taxa {money(p.fee)}</span>}
                {p.change > 0 && <span className="muted"> · recebido {money(p.received)}, troco {money(p.change)}</span>}
              </span>
              <span className="pay-line-right">
                <strong>{money(p.amount)}</strong>
                <button className="icon-btn" onClick={() => setPayments(payments.filter((_, j) => j !== i))} aria-label="Remover pagamento"><Trash2 size={16} /></button>
              </span>
            </div>
          ))}
        </div>
      )}

      <Field label="Observação da venda (opcional)" className="mt">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Aparece no cupom" />
      </Field>
    </Modal>
  )
}

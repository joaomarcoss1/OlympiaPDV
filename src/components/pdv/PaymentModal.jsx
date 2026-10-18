import { useMemo, useRef, useState } from 'react'
import { Banknote, QrCode, CreditCard, Wallet, Ticket, Trash2, Plus } from 'lucide-react'
import { Modal, MoneyInput, Field } from '../ui'
import { PAYMENT_METHODS, methodLabel } from '../../store/model'
import { money, round2 } from '../../utils/format'

const ICONS = { dinheiro: Banknote, pix: QrCode, credito: CreditCard, debito: Wallet, vale: Ticket }

// Pagamento com uma ou várias formas combinadas. Troco só em dinheiro.
export default function PaymentModal({ total, settings, onClose, onConfirm }) {
  const methods = PAYMENT_METHODS.filter((m) => settings.enabledMethods.includes(m.id))
  const [payments, setPayments] = useState([])
  const [method, setMethod] = useState(methods[0]?.id || 'dinheiro')
  const [amount, setAmount] = useState(total)
  const [installments, setInstallments] = useState(1)
  const [notes, setNotes] = useState('')
  const amountRef = useRef(null)

  const paid = round2(payments.reduce((s, p) => s + p.amount, 0))
  const remaining = round2(Math.max(0, total - paid))
  const change = round2(payments.reduce((s, p) => s + (p.change || 0), 0))

  function buildPayment(m, value) {
    const v = round2(value)
    if (v <= 0 || remaining <= 0) return null
    if (v > remaining) {
      if (m !== 'dinheiro') return { method: m, amount: remaining, installments: m === 'credito' ? installments : undefined }
      return { method: m, amount: remaining, received: v, change: round2(v - remaining) }
    }
    return { method: m, amount: v, installments: m === 'credito' ? installments : undefined, received: m === 'dinheiro' ? v : undefined }
  }

  function addPayment() {
    const p = buildPayment(method, amount)
    if (!p) return
    const next = [...payments, p]
    setPayments(next)
    const left = round2(total - next.reduce((s, x) => s + x.amount, 0))
    setAmount(Math.max(0, left))
    setInstallments(1)
    if (left > 0) amountRef.current?.querySelector('input')?.focus()
  }

  function selectMethod(id) {
    setMethod(id)
    setAmount(remaining)
    setInstallments(1)
    setTimeout(() => amountRef.current?.querySelector('input')?.focus(), 0)
  }

  // Concluir: se ainda falta e o valor digitado cobre, adiciona automaticamente.
  const pending = useMemo(() => (remaining > 0 ? buildPayment(method, amount) : null), [remaining, method, amount, installments]) // eslint-disable-line react-hooks/exhaustive-deps
  const finalPayments = pending ? [...payments, pending] : payments
  const finalPaid = round2(finalPayments.reduce((s, p) => s + p.amount, 0))
  const canConfirm = finalPaid + 0.001 >= total
  const finalChange = round2(finalPayments.reduce((s, p) => s + (p.change || 0), 0))

  function confirm() {
    if (!canConfirm) return
    onConfirm(finalPayments, notes)
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
          <strong>{money(total)}</strong>
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
          <div className="pay-entry">
            <Field label={method === 'dinheiro' ? 'Valor recebido' : `Valor no ${methodLabel(method)}`}>
              <div ref={amountRef}>
                <MoneyInput value={amount} onChange={setAmount} autoFocus className="input-lg" onEnter={() => (pending && round2(pending.amount) >= remaining ? confirm() : addPayment())} />
              </div>
            </Field>
            {method === 'credito' && (
              <Field label="Parcelas">
                <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="input-lg">
                  {Array.from({ length: settings.maxInstallments || 1 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}x de {money(Math.min(amount || remaining, remaining) / n)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <button type="button" className="btn btn-outline btn-lg pay-add" onClick={addPayment} disabled={!amount}>
              <Plus size={18} /> Dividir
            </button>
          </div>
          {method === 'dinheiro' && quickCash.length > 1 && (
            <div className="quick-cash">
              {quickCash.map((v) => (
                <button key={v} type="button" className="chip" onClick={() => setAmount(v)}>
                  {money(v)}
                </button>
              ))}
            </div>
          )}
          <p className="muted small">
            Para pagar com mais de uma forma, digite o valor parcial e toque em <b>Dividir</b>. Depois escolha a próxima forma.
          </p>
        </>
      )}

      {payments.length > 0 && (
        <div className="pay-list">
          {payments.map((p, i) => (
            <div key={i} className="pay-line">
              <span>
                <b>{methodLabel(p.method)}</b>
                {p.installments > 1 && <span className="muted"> · {p.installments}x</span>}
                {p.change > 0 && <span className="muted"> · recebido {money(p.received)}, troco {money(p.change)}</span>}
              </span>
              <span className="pay-line-right">
                <strong>{money(p.amount)}</strong>
                <button className="icon-btn" onClick={() => setPayments(payments.filter((_, j) => j !== i))} aria-label="Remover pagamento">
                  <Trash2 size={16} />
                </button>
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

import { useState } from 'react'
import { Lock, Unlock, ArrowDownCircle, ArrowUpCircle, Printer, Banknote, QrCode, CreditCard, Wallet, Ticket } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { can, openSession, sessionSummary, closeCash, PAYMENT_METHODS, methodLabel } from '../store/model'
import { PageHeader, Stat, Modal, Field, MoneyInput, Badge, Empty } from '../components/ui'
import { OpenCashModal, CashMoveModal } from '../components/CashModals'
import { money, dateTime, timeOnly } from '../utils/format'
import { printCashReport } from '../utils/print'

const ICONS = { dinheiro: Banknote, pix: QrCode, credito: CreditCard, debito: Wallet, vale: Ticket }
const MOVE_LABEL = { venda: 'Venda', suprimento: 'Entrada', sangria: 'Retirada', estorno: 'Estorno' }

export default function Cash() {
  const { db, user } = useStore()
  const session = openSession(db)
  const [opening, setOpening] = useState(false)
  const [moveType, setMoveType] = useState(null)
  const [closing, setClosing] = useState(false)
  const [viewing, setViewing] = useState(null)
  const users = Object.fromEntries(db.users.map((u) => [u.id, u.name]))
  const history = db.cashSessions.filter((s) => s.status === 'fechado').slice().reverse()
  const visibleHistory = can(user, 'settings') ? history : history.slice(0, 5)

  return (
    <div className="page">
      <PageHeader
        title="Caixa"
        subtitle={session ? `Aberto às ${timeOnly(session.openedAt)} de ${dateTime(session.openedAt).slice(0, 10)} por ${users[session.openedBy]}` : 'Abertura, entradas, retiradas e fechamento.'}
        actions={
          session && (
            <>
              <button className="btn btn-outline" onClick={() => setMoveType('suprimento')}><ArrowDownCircle size={18} /> Entrada</button>
              <button className="btn btn-outline" onClick={() => setMoveType('sangria')}><ArrowUpCircle size={18} /> Retirada</button>
              <button className="btn btn-dark" onClick={() => setClosing(true)}><Lock size={18} /> Fechar caixa</button>
            </>
          )
        }
      />

      {session ? (
        <OpenSessionView sessionId={session.id} users={users} />
      ) : (
        <div className="card pad cash-closed">
          <div className="cash-closed-icon"><Lock size={30} /></div>
          <div>
            <h2>Caixa fechado</h2>
            <p className="muted">Abra o caixa informando o fundo de troco para começar a vender.</p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={() => setOpening(true)}><Unlock size={18} /> Abrir caixa</button>
        </div>
      )}

      <h3 className="section-title">Caixas anteriores</h3>
      {visibleHistory.length === 0 ? (
        <Empty title="Nenhum fechamento ainda" />
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead><tr><th>Abertura</th><th className="hide-sm">Fechamento</th><th className="hide-md">Operador</th><th className="num">Vendas</th><th className="num">Diferença</th></tr></thead>
            <tbody>
              {visibleHistory.map((s) => (
                <tr key={s.id} className="row-click" onClick={() => setViewing(s.id)}>
                  <td className="nowrap">{dateTime(s.openedAt)}</td>
                  <td className="hide-sm nowrap">{dateTime(s.closedAt)}</td>
                  <td className="hide-md">{users[s.closedBy]}</td>
                  <td className="num">{money(s.salesTotal)}</td>
                  <td className="num">
                    {Math.abs(s.difference) < 0.01 ? <Badge tone="success">OK</Badge> : <Badge tone={s.difference > 0 ? 'info' : 'danger'}>{s.difference > 0 ? '+' : ''}{money(s.difference)}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {opening && <OpenCashModal onClose={() => setOpening(false)} />}
      {moveType && <CashMoveModal type={moveType} onClose={() => setMoveType(null)} />}
      {closing && session && <CloseCashModal sessionId={session.id} onClose={() => setClosing(false)} />}
      {viewing && <SessionModal sessionId={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function MethodBreakdown({ summary }) {
  const { db } = useStore()
  const max = Math.max(1, ...Object.values(summary.byMethod))
  return (
    <div className="method-grid">
      {PAYMENT_METHODS.filter((m) => db.settings.enabledMethods.includes(m.id) || summary.byMethod[m.id]).map((m) => {
        const Icon = ICONS[m.id]
        const v = summary.byMethod[m.id] || 0
        return (
          <div key={m.id} className="method-card">
            <div className="method-top"><Icon size={18} /> {m.short}</div>
            <strong>{money(v)}</strong>
            <div className="bar"><span style={{ width: `${(Math.max(0, v) / max) * 100}%` }} /></div>
          </div>
        )
      })}
    </div>
  )
}

function OpenSessionView({ sessionId, users }) {
  const { db } = useStore()
  const summary = sessionSummary(db, sessionId)
  const moves = summary.moves.slice().reverse()
  return (
    <>
      <div className="stats">
        <Stat label="Fundo de troco" value={money(summary.session.openingAmount)} />
        <Stat label={`Vendas (${summary.salesCount})`} value={money(summary.salesTotal)} />
        <Stat label="Entradas / retiradas" value={`${money(summary.suprimentos)} / ${money(summary.sangrias)}`} />
        <Stat label="Dinheiro na gaveta" value={money(summary.expectedCash)} tone="gold" hint="Valor esperado agora" />
      </div>
      <div className="row-between">
        <h3 className="section-title">Por forma de pagamento</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => printCashReport(summary, db)}><Printer size={16} /> Imprimir parcial</button>
      </div>
      <MethodBreakdown summary={summary} />
      <h3 className="section-title">Movimentações deste caixa</h3>
      {moves.length === 0 ? (
        <Empty title="Nenhuma movimentação ainda" />
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead><tr><th>Hora</th><th>Tipo</th><th className="hide-sm">Descrição</th><th>Forma</th><th className="num">Valor</th><th className="hide-md">Usuário</th></tr></thead>
            <tbody>
              {moves.map((m) => {
                const neg = m.type === 'sangria' || m.type === 'estorno'
                return (
                  <tr key={m.id}>
                    <td>{timeOnly(m.date)}</td>
                    <td><Badge tone={m.type === 'venda' ? 'neutral' : neg ? 'danger' : 'success'}>{MOVE_LABEL[m.type]}</Badge></td>
                    <td className="hide-sm muted">{m.description}</td>
                    <td>{methodLabel(m.method)}</td>
                    <td className={`num ${neg ? 'neg' : ''}`}>{neg ? '− ' : ''}{money(m.amount)}</td>
                    <td className="hide-md muted">{users[m.userId]}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function CloseCashModal({ sessionId, onClose }) {
  const { db, update, user, toast } = useStore()
  const summary = sessionSummary(db, sessionId)
  const [counted, setCounted] = useState(0)
  const [notes, setNotes] = useState('')
  const [print, setPrint] = useState(true)
  const diff = counted - summary.expectedCash

  function confirm() {
    let closedDb
    update((d) => {
      closeCash(d, { sessionId, countedCash: counted, userId: user.id, notes })
      closedDb = d
    })
    if (print) printCashReport(sessionSummary(closedDb, sessionId), closedDb)
    toast('Caixa fechado.')
    onClose()
  }

  return (
    <Modal
      title="Fechar caixa"
      subtitle="Conte o dinheiro da gaveta e informe o valor."
      size="md"
      onClose={onClose}
      footer={
        <>
          <label className="check"><input type="checkbox" checked={print} onChange={(e) => setPrint(e.target.checked)} /> Imprimir relatório</label>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-dark" onClick={confirm}><Lock size={16} /> Fechar caixa</button>
        </>
      }
    >
      <MethodBreakdown summary={summary} />
      <div className="totals totals-inline mt">
        <div><span>Fundo de troco</span><span>{money(summary.session.openingAmount)}</span></div>
        <div><span>+ Vendas em dinheiro (líquido)</span><span>{money(summary.byMethod.dinheiro)}</span></div>
        <div><span>+ Entradas</span><span>{money(summary.suprimentos)}</span></div>
        <div><span>− Retiradas</span><span>{money(summary.sangrias)}</span></div>
        <div className="t-total"><span>Dinheiro esperado</span><span>{money(summary.expectedCash)}</span></div>
      </div>
      <Field label="Dinheiro contado na gaveta">
        <MoneyInput value={counted} onChange={setCounted} autoFocus className="input-lg" />
      </Field>
      <div className={`diff ${Math.abs(diff) < 0.01 ? 'ok' : diff > 0 ? 'over' : 'under'}`}>
        {Math.abs(diff) < 0.01 ? 'Caixa batendo certinho ✓' : diff > 0 ? `Sobrando ${money(diff)}` : `Faltando ${money(-diff)}`}
      </div>
      <Field label="Observações do fechamento">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  )
}

function SessionModal({ sessionId, onClose }) {
  const { db } = useStore()
  const summary = sessionSummary(db, sessionId)
  const s = summary.session
  const users = Object.fromEntries(db.users.map((u) => [u.id, u.name]))
  return (
    <Modal
      title={`Caixa de ${dateTime(s.openedAt)}`}
      subtitle={`Aberto por ${users[s.openedBy]} · fechado por ${users[s.closedBy]} em ${dateTime(s.closedAt)}`}
      onClose={onClose}
      size="md"
      footer={<button className="btn btn-primary" onClick={() => printCashReport(summary, db)}><Printer size={16} /> Imprimir relatório</button>}
    >
      <MethodBreakdown summary={summary} />
      <div className="totals totals-inline mt">
        <div><span>Fundo de troco</span><span>{money(s.openingAmount)}</span></div>
        <div><span>Vendas ({summary.salesCount})</span><span>{money(summary.salesTotal)}</span></div>
        <div><span>Entradas</span><span>{money(summary.suprimentos)}</span></div>
        <div><span>Retiradas</span><span>{money(summary.sangrias)}</span></div>
        <div><span>Estornos</span><span>{money(summary.estornos)}</span></div>
        <div><span>Dinheiro esperado</span><span>{money(s.expectedCash)}</span></div>
        <div><span>Dinheiro contado</span><span>{money(s.countedCash)}</span></div>
        <div className="t-total"><span>Diferença</span><span>{money(s.difference)}</span></div>
      </div>
      {s.closingNotes && <p><b>Obs.:</b> {s.closingNotes}</p>}
    </Modal>
  )
}

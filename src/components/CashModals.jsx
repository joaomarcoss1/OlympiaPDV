import { useState } from 'react'
import { Modal, Field, MoneyInput, Segmented } from './ui'
import { useStore } from '../store/StoreContext'
import { openCash, addCashMove, openSession, PAYMENT_METHODS, hashPassword } from '../store/model'

export function OpenCashModal({ onClose, onOpened }) {
  const { update, user, toast } = useStore()
  const [amount, setAmount] = useState(0)
  const [notes, setNotes] = useState('')
  function confirm() {
    update((d) => openCash(d, { amount, userId: user.id, notes }))
    toast('Caixa aberto. Boas vendas!')
    onOpened?.()
    onClose()
  }
  return (
    <Modal
      title="Abrir caixa"
      subtitle="Informe o valor em dinheiro que está na gaveta (fundo de troco)."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirm}>Abrir caixa</button>
        </>
      }
    >
      <Field label="Fundo de troco">
        <MoneyInput value={amount} onChange={setAmount} autoFocus onEnter={confirm} className="input-lg" />
      </Field>
      <Field label="Observação (opcional)">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  )
}

export function CashMoveModal({ type, onClose }) {
  const { db, update, user, toast } = useStore()
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState('dinheiro')
  const [description, setDescription] = useState('')
  const isIn = type === 'suprimento'
  const enabled = PAYMENT_METHODS.filter((m) => db.settings.enabledMethods.includes(m.id))
  function confirm() {
    if (amount <= 0) return
    const session = openSession(db)
    if (!session) return
    update((d) => addCashMove(d, { sessionId: session.id, type, method, amount, description: description || (isIn ? 'Suprimento' : 'Sangria'), userId: user.id }))
    toast(isIn ? 'Entrada registrada.' : 'Retirada registrada.')
    onClose()
  }
  return (
    <Modal
      title={isIn ? 'Entrada no caixa (suprimento)' : 'Retirada do caixa (sangria)'}
      subtitle={isIn ? 'Ex.: reforço de troco, aporte do dono.' : 'Ex.: pagamento de fornecedor, depósito, vale.'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className={`btn ${isIn ? 'btn-primary' : 'btn-dark'}`} onClick={confirm} disabled={amount <= 0}>
            Registrar {isIn ? 'entrada' : 'retirada'}
          </button>
        </>
      }
    >
      <Field label="Valor">
        <MoneyInput value={amount} onChange={setAmount} autoFocus onEnter={confirm} className="input-lg" />
      </Field>
      <Field label="Forma">
        <Segmented size="sm" value={method} onChange={setMethod} options={enabled.map((m) => ({ value: m.id, label: m.short }))} />
      </Field>
      <Field label="Motivo / descrição">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isIn ? 'Reforço de troco' : 'Pagamento motoboy'} />
      </Field>
    </Modal>
  )
}

// Pede usuário/senha de um administrador para liberar uma ação (ex.: desconto acima do limite).
export function AdminAuthModal({ reason, onClose, onAuthorized }) {
  const { db } = useStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  async function confirm() {
    const admin = db.users.find((u) => u.active && u.role === 'admin' && u.username === username.trim().toLowerCase())
    if (!admin || admin.passwordHash !== (await hashPassword(password))) return setError('Credenciais de administrador inválidas.')
    onAuthorized(admin)
  }
  return (
    <Modal
      title="Autorização do administrador"
      subtitle={reason}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirm}>Autorizar</button>
        </>
      }
    >
      <Field label="Usuário do administrador">
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoCapitalize="none" />
      </Field>
      <Field label="Senha">
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirm()} />
      </Field>
      {error && <div className="alert alert-danger">{error}</div>}
    </Modal>
  )
}

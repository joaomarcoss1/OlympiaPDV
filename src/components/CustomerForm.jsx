import { useState } from 'react'
import { Modal, Field } from './ui'
import AddressFields, { emptyAddress } from './AddressFields'
import { useStore } from '../store/StoreContext'
import { uid, nowIso } from '../store/model'
import { maskCpf, maskPhone, onlyDigits } from '../utils/format'

export default function CustomerForm({ customer, initialName = '', onClose, onSaved }) {
  const { db, update, toast } = useStore()
  const [form, setForm] = useState(
    () => customer || { name: initialName, phone: '', cpf: '', email: '', birth: '', address: emptyAddress(), notes: '' },
  )
  const [error, setError] = useState('')
  const set = (k, mask) => (e) => setForm((f) => ({ ...f, [k]: mask ? mask(e.target.value) : e.target.value }))

  function save() {
    if (!form.name.trim()) return setError('Informe o nome do cliente.')
    const cpf = onlyDigits(form.cpf)
    if (cpf && db.customers.some((c) => c.id !== customer?.id && onlyDigits(c.cpf) === cpf)) return setError('Já existe um cliente com este CPF.')
    const saved = update((d) => {
      if (customer) {
        const c = d.customers.find((x) => x.id === customer.id)
        Object.assign(c, form, { name: form.name.trim(), updatedAt: nowIso() })
        return c
      }
      const c = { ...form, name: form.name.trim(), id: uid(), createdAt: nowIso() }
      d.customers.push(c)
      return c
    })
    toast(customer ? 'Cliente atualizado.' : 'Cliente cadastrado.')
    onSaved?.(saved)
    onClose()
  }

  return (
    <Modal
      title={customer ? 'Editar cliente' : 'Novo cliente'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Salvar cliente</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nome completo *" className="col-span-2">
          <input value={form.name} onChange={set('name')} autoFocus />
        </Field>
        <Field label="Telefone / WhatsApp">
          <input value={form.phone} onChange={set('phone', maskPhone)} inputMode="tel" placeholder="(00) 00000-0000" />
        </Field>
        <Field label="CPF">
          <input value={form.cpf} onChange={set('cpf', maskCpf)} inputMode="numeric" />
        </Field>
        <Field label="E-mail">
          <input type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Aniversário">
          <input type="date" value={form.birth} onChange={set('birth')} />
        </Field>
      </div>
      <h3 className="section-title">Endereço</h3>
      <AddressFields value={form.address} onChange={(address) => setForm((f) => ({ ...f, address }))} />
      <Field label="Observações" className="mt">
        <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Preferências, numeração que costuma usar…" />
      </Field>
      {error && <div className="alert alert-danger">{error}</div>}
    </Modal>
  )
}

import { useMemo, useState } from 'react'
import { Plus, Users, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { can } from '../store/model'
import { PageHeader, SearchInput, Empty, Modal, Stat, Badge, confirmDialog } from '../components/ui'
import CustomerForm from '../components/CustomerForm'
import { money, normalize, onlyDigits, maskPhone, dateOnly, formatAddress, initials, pad } from '../utils/format'

export default function Customers() {
  const { db } = useStore()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null) // {} novo | {customer}
  const [viewing, setViewing] = useState(null)

  const stats = useMemo(() => {
    const map = {}
    for (const s of db.sales) {
      if (s.status !== 'concluida' || !s.customerId) continue
      const m = (map[s.customerId] ||= { count: 0, total: 0, last: null })
      m.count++
      m.total += s.total
      if (!m.last || s.date > m.last) m.last = s.date
    }
    return map
  }, [db.sales])

  const list = useMemo(() => {
    const t = normalize(q)
    const d = onlyDigits(q)
    return db.customers
      .filter((c) => !t || normalize(c.name).includes(t) || (d.length >= 3 && (onlyDigits(c.phone).includes(d) || onlyDigits(c.cpf).includes(d))))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [db.customers, q])

  return (
    <div className="page">
      <PageHeader
        title="Clientes"
        subtitle={`${db.customers.length} cadastrados`}
        actions={<button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={18} /> Novo cliente</button>}
      />
      <div className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Nome, telefone ou CPF" />
      </div>
      {list.length === 0 ? (
        <Empty icon={<Users size={28} />} title="Nenhum cliente encontrado" action={<button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={18} /> Cadastrar cliente</button>} />
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr><th>Cliente</th><th className="hide-sm">Telefone</th><th className="hide-md">Bairro / cidade</th><th className="num">Compras</th><th className="num hide-sm">Total gasto</th><th className="hide-md">Última compra</th></tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const s = stats[c.id]
                return (
                  <tr key={c.id} className="row-click" onClick={() => setViewing(c.id)}>
                    <td><div className="cell-product"><span className="avatar avatar-sm">{initials(c.name)}</span><strong>{c.name}</strong></div></td>
                    <td className="hide-sm">{maskPhone(c.phone) || '—'}</td>
                    <td className="hide-md muted">{[c.address?.district, c.address?.city].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="num">{s?.count || 0}</td>
                    <td className="num hide-sm">{money(s?.total || 0)}</td>
                    <td className="hide-md muted">{s?.last ? dateOnly(s.last) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <CustomerForm customer={editing.customer} onClose={() => setEditing(null)} />}
      {viewing && !editing && (
        <CustomerDetail id={viewing} stats={stats[viewing]} onClose={() => setViewing(null)} onEdit={(customer) => setEditing({ customer })} />
      )}
    </div>
  )
}

function CustomerDetail({ id, stats, onClose, onEdit }) {
  const { db, update, user, toast } = useStore()
  const c = db.customers.find((x) => x.id === id)
  if (!c) return null
  const sales = db.sales.filter((s) => s.customerId === id).slice().reverse()
  const wa = onlyDigits(c.phone)

  async function remove() {
    if (sales.length) return toast('Cliente com vendas não pode ser excluído.', 'error')
    if (!(await confirmDialog({ title: 'Excluir cliente?', message: `${c.name} será excluído.`, confirmLabel: 'Excluir', danger: true }))) return
    update((d) => { d.customers = d.customers.filter((x) => x.id !== id) })
    onClose()
  }

  return (
    <Modal
      title={c.name}
      subtitle={[maskPhone(c.phone), c.email, c.cpf && `CPF ${c.cpf}`].filter(Boolean).join(' · ')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {can(user, 'settings') && <button className="btn btn-ghost btn-danger-text" onClick={remove}><Trash2 size={16} /> Excluir</button>}
          <span className="spacer" />
          {wa && <a className="btn btn-outline" href={`https://wa.me/55${wa}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> WhatsApp</a>}
          <button className="btn btn-primary" onClick={() => onEdit(c)}><Pencil size={16} /> Editar</button>
        </>
      }
    >
      <div className="stats stats-3">
        <Stat label="Compras" value={stats?.count || 0} />
        <Stat label="Total gasto" value={money(stats?.total || 0)} />
        <Stat label="Ticket médio" value={money(stats?.count ? stats.total / stats.count : 0)} />
      </div>
      {formatAddress(c.address) && <p><b>Endereço:</b> {formatAddress(c.address)}</p>}
      {c.birth && <p><b>Aniversário:</b> {dateOnly(c.birth + 'T12:00:00')}</p>}
      {c.notes && <p><b>Obs.:</b> {c.notes}</p>}
      <h3 className="section-title">Histórico de compras</h3>
      {sales.length === 0 ? (
        <p className="muted">Ainda não comprou.</p>
      ) : (
        <div className="mini-list">
          {sales.map((s) => (
            <div key={s.id} className="mini-row">
              <span><b>#{pad(s.number)}</b> <span className="muted">{dateOnly(s.date)}</span></span>
              <span className="muted small grow">{s.items.map((i) => `${i.qty}x ${i.name} (${i.variantLabel})`).join(', ')}</span>
              {s.status === 'cancelada' ? <Badge tone="danger">Cancelada</Badge> : <strong>{money(s.total)}</strong>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

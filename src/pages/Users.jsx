import { useState } from 'react'
import { Plus, Pencil, ShieldCheck, User } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { uid, nowIso, hashPassword } from '../store/model'
import { PageHeader, Modal, Field, Badge, Segmented, Switch } from '../components/ui'
import { initials, dateOnly } from '../utils/format'

const ROLE_INFO = {
  admin: 'Acesso total: produtos, estoque, cancelamentos, usuários, configurações e relatórios.',
  vendedor: 'Vende no PDV, cadastra clientes, opera o caixa (abrir, entradas/retiradas, fechar) e consulta estoque. Desconto limitado.',
}

export default function UsersPage() {
  const { db } = useStore()
  const [editing, setEditing] = useState(null)
  const sold = (id) => db.sales.filter((s) => s.userId === id && s.status === 'concluida').length

  return (
    <div className="page">
      <PageHeader
        title="Usuários"
        subtitle="Quem pode acessar o sistema e o que cada um pode fazer."
        actions={<button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={18} /> Novo usuário</button>}
      />
      <div className="user-grid">
        {db.users.map((u) => (
          <button key={u.id} className={`card pad user-tile ${!u.active ? 'inactive' : ''}`} onClick={() => setEditing({ user: u })}>
            <span className={`avatar avatar-lg ${u.role === 'admin' ? 'avatar-gold' : ''}`}>{initials(u.name)}</span>
            <div className="grow">
              <strong>{u.name}</strong>
              <span className="muted small">@{u.username} · desde {dateOnly(u.createdAt)}</span>
              <div className="tile-badges">
                <Badge tone={u.role === 'admin' ? 'gold' : 'neutral'}>{u.role === 'admin' ? 'Administrador' : 'Vendedor'}</Badge>
                {!u.active && <Badge tone="danger">Inativo</Badge>}
                <span className="muted small">{sold(u.id)} vendas</span>
              </div>
            </div>
            <Pencil size={16} className="muted" />
          </button>
        ))}
      </div>
      <div className="card pad mt role-help">
        <p><ShieldCheck size={16} /> <b>Administrador:</b> {ROLE_INFO.admin}</p>
        <p><User size={16} /> <b>Vendedor:</b> {ROLE_INFO.vendedor}</p>
      </div>
      {editing && <UserForm user={editing.user} onClose={() => setEditing(null)} />}
    </div>
  )
}

function UserForm({ user, onClose }) {
  const { db, update, user: me, toast } = useStore()
  const [form, setForm] = useState({ name: user?.name || '', username: user?.username || '', role: user?.role || 'vendedor', active: user ? user.active : true, password: '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const activeAdmins = db.users.filter((u) => u.role === 'admin' && u.active)

  async function save() {
    const username = form.username.trim().toLowerCase()
    if (!form.name.trim() || !username) return setError('Preencha nome e usuário.')
    if (db.users.some((u) => u.username === username && u.id !== user?.id)) return setError('Este usuário já existe.')
    if (!user && form.password.length < 4) return setError('Defina uma senha com pelo menos 4 caracteres.')
    if (user && form.password && form.password.length < 4) return setError('A nova senha precisa de pelo menos 4 caracteres.')
    const losingAdmin = user?.role === 'admin' && (form.role !== 'admin' || !form.active)
    if (losingAdmin && activeAdmins.length <= 1) return setError('É preciso ter pelo menos um administrador ativo.')
    if (user?.id === me.id && !form.active) return setError('Você não pode desativar o próprio usuário.')
    const passwordHash = form.password ? await hashPassword(form.password) : null
    update((d) => {
      if (user) {
        const u = d.users.find((x) => x.id === user.id)
        Object.assign(u, { name: form.name.trim(), username, role: form.role, active: form.active })
        if (passwordHash) u.passwordHash = passwordHash
      } else {
        d.users.push({ id: uid(), name: form.name.trim(), username, role: form.role, active: form.active, passwordHash, createdAt: nowIso() })
      }
    })
    toast(user ? 'Usuário atualizado.' : 'Usuário criado.')
    onClose()
  }

  return (
    <Modal
      title={user ? 'Editar usuário' : 'Novo usuário'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Salvar</button>
        </>
      }
    >
      <Field label="Nome">
        <input value={form.name} onChange={set('name')} autoFocus />
      </Field>
      <Field label="Usuário de acesso">
        <input value={form.username} onChange={set('username')} autoCapitalize="none" />
      </Field>
      <Field label={user ? 'Nova senha (deixe vazio para manter)' : 'Senha'}>
        <input type="password" value={form.password} onChange={set('password')} />
      </Field>
      <Field label="Função" hint={ROLE_INFO[form.role]}>
        <Segmented value={form.role} onChange={(role) => setForm((f) => ({ ...f, role }))} options={[{ value: 'vendedor', label: 'Vendedor' }, { value: 'admin', label: 'Administrador' }]} />
      </Field>
      <Switch checked={form.active} onChange={(active) => setForm((f) => ({ ...f, active }))} label="Usuário ativo" description="Usuários inativos não conseguem entrar." />
      {error && <div className="alert alert-danger">{error}</div>}
    </Modal>
  )
}

import { useState } from 'react'
import { useStore } from '../store/StoreContext'
import { emptyDb, hashPassword, seedCatalog, uid, nowIso } from '../store/model'
import { Logo } from '../components/Logo'
import { Field, Switch } from '../components/ui'

// Primeira execução: cria a loja e o administrador.
export default function Setup() {
  const { replaceDb, login } = useStore()
  const [form, setForm] = useState({ storeName: 'Olympia Body Fitness', name: '', username: 'admin', password: '', confirm: '', sample: true })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.username.trim()) return setError('Preencha seu nome e o usuário.')
    if (form.password.length < 4) return setError('A senha precisa de pelo menos 4 caracteres.')
    if (form.password !== form.confirm) return setError('As senhas não conferem.')
    const db = emptyDb()
    db.settings.storeName = form.storeName.trim() || db.settings.storeName
    const admin = {
      id: uid(),
      name: form.name.trim(),
      username: form.username.trim().toLowerCase(),
      passwordHash: await hashPassword(form.password),
      role: 'admin',
      active: true,
      createdAt: nowIso(),
    }
    db.users.push(admin)
    if (form.sample) seedCatalog(db, admin.id)
    replaceDb(db)
    login(admin.id)
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <Logo />
        <h1>Bem-vindo ao Olympia PDV</h1>
        <p>Vendas, estoque por tamanho e cor, clientes, entregas e fluxo de caixa — tudo em um só lugar.</p>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h2>Configuração inicial</h2>
        <p className="muted">Leva menos de um minuto. Você poderá mudar tudo depois em Configurações.</p>
        <Field label="Nome da loja">
          <input value={form.storeName} onChange={set('storeName')} />
        </Field>
        <Field label="Seu nome (administrador)">
          <input value={form.name} onChange={set('name')} autoFocus placeholder="Ex.: Ana Souza" />
        </Field>
        <Field label="Usuário de acesso">
          <input value={form.username} onChange={set('username')} autoCapitalize="none" />
        </Field>
        <div className="grid-2">
          <Field label="Senha">
            <input type="password" value={form.password} onChange={set('password')} />
          </Field>
          <Field label="Confirmar senha">
            <input type="password" value={form.confirm} onChange={set('confirm')} />
          </Field>
        </div>
        <Switch
          checked={form.sample}
          onChange={(v) => setForm((f) => ({ ...f, sample: v }))}
          label="Carregar produtos de exemplo"
          description="Categorias, marcas e alguns produtos para você testar. Dá para apagar depois."
        />
        {error && <div className="alert alert-danger">{error}</div>}
        <button className="btn btn-primary btn-lg btn-block">Começar a usar</button>
      </form>
    </div>
  )
}

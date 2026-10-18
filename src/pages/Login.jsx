import { useState } from 'react'
import { useStore } from '../store/StoreContext'
import { hashPassword } from '../store/model'
import { Logo } from '../components/Logo'
import { Field } from '../components/ui'
import { initials } from '../utils/format'

export default function Login() {
  const { db, login } = useStore()
  const users = db.users.filter((u) => u.active)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    const u = users.find((x) => x.username === username.trim().toLowerCase())
    if (!u || u.passwordHash !== (await hashPassword(password))) {
      setError('Usuário ou senha incorretos.')
      return
    }
    login(u.id)
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <Logo />
        <h1>{db.settings.storeName}</h1>
        <p>Entre com seu usuário para abrir o PDV.</p>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h2>Entrar</h2>
        {users.length <= 8 && (
          <div className="user-pick">
            {users.map((u) => (
              <button type="button" key={u.id} className={`user-pick-item ${username === u.username ? 'active' : ''}`} onClick={() => { setUsername(u.username); setError('') }}>
                <span className="avatar">{initials(u.name)}</span>
                <span>{u.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        )}
        <Field label="Usuário">
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoFocus={!username} />
        </Field>
        <Field label="Senha">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={!!username} key={username} />
        </Field>
        {error && <div className="alert alert-danger">{error}</div>}
        <button className="btn btn-primary btn-lg btn-block">Entrar</button>
      </form>
    </div>
  )
}

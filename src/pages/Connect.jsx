import { useState } from 'react'
import { Cloud } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { getClient, readConfig, saveConfig, keyFromEnv } from '../store/cloud'
import { Logo } from '../components/Logo'
import { Field, Segmented } from '../components/ui'

// Liga este aparelho à conta da loja no Supabase (feito uma vez por aparelho).
export default function Connect() {
  const { phase, start, disconnect } = useStore()
  const cfg = readConfig()
  const [key, setKey] = useState(cfg.key)
  const [url, setUrl] = useState(cfg.url)
  const [mode, setMode] = useState('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const needKey = phase === 'config' || (!keyFromEnv() && !cfg.key)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (needKey) {
      if (!key.trim().startsWith('sb_publishable_') && !key.trim().startsWith('eyJ')) return setError('Cole a chave “publishable” (ou “anon”) do projeto.')
      saveConfig({ url: url.trim(), key: key.trim() })
    }
    const sb = getClient()
    if (!email.trim() || password.length < 6) return setError('Informe o e-mail e uma senha com pelo menos 6 caracteres.')
    setBusy(true)
    const fn = mode === 'entrar' ? sb.auth.signInWithPassword : sb.auth.signUp
    const { data, error: err } = await fn.call(sb.auth, { email: email.trim(), password })
    setBusy(false)
    if (err) {
      const msg = err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.'
        : /fetch/i.test(err.message) ? 'Não foi possível falar com o Supabase. Confira a internet, o endereço e a chave.'
        : err.message
      return setError(msg)
    }
    if (!data.session) return setInfo('Conta criada. Abra o e-mail de confirmação e depois entre aqui.')
    start()
  }

  if (phase === 'denied') {
    return (
      <div className="auth">
        <div className="auth-brand"><Logo /><h1>Conta sem acesso</h1></div>
        <div className="auth-card">
          <h2>Esta conta não tem acesso à loja</h2>
          <p className="muted">Peça para quem administra a loja liberar seu e-mail em Configurações → Nuvem, ou entre com a conta da loja.</p>
          <button className="btn btn-primary btn-lg btn-block" onClick={disconnect}>Entrar com outra conta</button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <Logo />
        <h1>Conectar este aparelho</h1>
        <p>Os dados da loja ficam salvos na nuvem e aparecem em todos os caixas. Faça isso uma vez em cada computador ou celular.</p>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h2><Cloud size={20} /> Conta da loja</h2>
        <p className="muted">Use o e-mail da loja. Na primeira vez, toque em “Criar conta”: a primeira conta vira a dona dos dados.</p>
        {needKey && (
          <>
            <Field label="Endereço do Supabase">
              <input value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <Field label="Chave pública (publishable / anon)" hint="Supabase → Project Settings → API Keys">
              <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sb_publishable_…" autoCapitalize="none" />
            </Field>
          </>
        )}
        <Segmented value={mode} onChange={setMode} options={[{ value: 'entrar', label: 'Entrar' }, { value: 'criar', label: 'Criar conta' }]} />
        <Field label="E-mail" className="mt">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </Field>
        <Field label="Senha">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'} />
        </Field>
        {error && <div className="alert alert-danger">{error}</div>}
        {info && <div className="alert alert-info">{info}</div>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Conectando…' : mode === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
      </form>
    </div>
  )
}

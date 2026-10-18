import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { loadData, saveData, clearData } from './persist'
import { SCHEMA_VERSION, emptyDb, uid } from './model'
import { getClient, createSync, fetchAll, recordsToDb, dbToRecords, nextSaleNumber, counterAtLeast } from './cloud'

const StoreContext = createContext(null)
const SESSION_KEY = 'olympia-pdv-user'
const CACHE_KEY = 'cloud-cache'
const CLIENT_KEY = 'olympia-pdv-client'

function migrate(data) {
  // Garante que chaves novas existam em bancos criados por versões anteriores.
  const base = emptyDb()
  const merged = { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } }
  merged.version = SCHEMA_VERSION
  return merged
}

function clientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY)
    if (!id) localStorage.setItem(CLIENT_KEY, (id = uid()))
    return id
  } catch {
    return uid()
  }
}

// Aplica registros recebidos de outro caixa ao db em memória.
function applyRemote(db, rows) {
  const next = { ...db }
  for (const r of rows) {
    if (r.collection === 'settings') {
      if (!r.deleted) next.settings = { ...next.settings, ...r.data }
      continue
    }
    const list = next[r.collection]
    if (!Array.isArray(list)) continue
    const i = list.findIndex((x) => x.id === r.id)
    const copy = list.slice()
    if (r.deleted) {
      if (i >= 0) copy.splice(i, 1)
    } else if (i >= 0) copy[i] = r.data
    else copy.push(r.data)
    next[r.collection] = copy
  }
  return next
}

// phase: 'boot' | 'config' (falta a chave do Supabase) | 'auth' (entrar com a conta da loja)
//        | 'denied' (conta sem acesso) | 'ready'
export function StoreProvider({ children }) {
  const [phase, setPhase] = useState('boot')
  const [db, setDb] = useState(null)
  const [account, setAccount] = useState(null)
  const [sync, setSync] = useState({ pending: 0, flushing: false, online: navigator.onLine })
  const [userId, setUserId] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) } catch { return null }
  })
  const [toasts, setToasts] = useState([])
  const dbRef = useRef(null)
  const syncRef = useRef(null)
  const cacheTimer = useRef(null)
  const queueRef = useRef({ keys: [], stocks: {} })

  const toast = useCallback((message, kind = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  // Cópia local para abrir rápido e continuar vendendo sem internet.
  const cache = useCallback(() => {
    clearTimeout(cacheTimer.current)
    cacheTimer.current = setTimeout(() => {
      saveData({ db: dbRef.current, queue: queueRef.current.keys, stocks: queueRef.current.stocks }, CACHE_KEY).catch(() => {})
    }, 400)
  }, [])

  const setCurrent = useCallback((value) => {
    dbRef.current = value
    setDb(value)
  }, [])

  const start = useCallback(async () => {
    const sb = getClient()
    if (!sb) return setPhase('config')
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return setPhase('auth')
    setAccount(session.user)

    const cached = await loadData(CACHE_KEY)
    let rows = null
    try {
      const { data: member, error } = await sb.rpc('pdv_claim')
      if (error) throw error
      if (!member) return setPhase('denied')
      rows = await fetchAll()
    } catch (err) {
      if (!cached?.db) {
        toast(navigator.onLine ? `Não foi possível conectar ao Supabase: ${err.message}` : 'Sem internet e sem dados salvos neste aparelho.', 'error')
        return setPhase('auth')
      }
    }

    syncRef.current?.stop()
    const engine = createSync({
      clientId: clientId(),
      onStatus: setSync,
      persistQueue: (keys, stocks) => {
        queueRef.current = { keys, stocks }
        cache()
      },
      onRemote: (remote) => {
        if (!dbRef.current) return
        setCurrent(applyRemote(dbRef.current, remote))
        cache()
      },
    })
    engine.setDbGetter(() => dbRef.current)
    syncRef.current = engine

    let value
    if (rows) {
      value = rows.some((r) => !r.deleted) ? migrate(recordsToDb(rows, emptyDb())) : null
      // Alterações feitas sem internet que ainda não subiram: valem as locais.
      const pending = cached?.queue || []
      if (pending.length && cached?.db) {
        const local = dbToRecords(cached.db)
        const overlay = pending.map((k) => {
          const i = k.indexOf('|')
          const data = local.get(k)
          return { collection: k.slice(0, i), id: k.slice(i + 1), data, deleted: data === undefined }
        })
        value = migrate(applyRemote(value || emptyDb(), overlay))
      }
      engine.load(rows, value || emptyDb())
      engine.restoreQueue(pending, cached?.stocks)
    } else {
      value = migrate(cached.db)
      engine.load([], value)
      engine.restoreQueue(cached.queue, cached.stocks)
      toast('Sem conexão: usando os dados salvos neste aparelho.', 'error')
    }
    setCurrent(value)
    engine.subscribe()
    engine.flushNow()
    setPhase('ready')
  }, [cache, setCurrent, toast])

  useEffect(() => {
    start()
    return () => syncRef.current?.stop()
  }, [start])

  // update(fn): fn recebe um rascunho mutável; retorna o que fn retornar.
  // Se fn lançar erro, nada é alterado.
  const update = useCallback((fn) => {
    const draft = structuredClone(dbRef.current)
    const result = fn(draft)
    setCurrent(draft)
    syncRef.current?.track(draft)
    cache()
    return result
  }, [cache, setCurrent])

  const replaceDb = useCallback((value) => {
    const next = value ? migrate(value) : null
    setCurrent(next)
    syncRef.current?.markAll(next)
    cache()
    const max = Math.max(0, ...(next?.sales || []).map((s) => s.number))
    if (max) counterAtLeast('sale', max).catch(() => {})
  }, [cache, setCurrent])

  // Número do pedido único entre todos os caixas (sem internet, usa o contador local).
  const reserveSaleNumber = useCallback(async () => {
    try {
      const localMax = Math.max(0, ...dbRef.current.sales.map((s) => s.number))
      let n = await nextSaleNumber()
      if (n <= localMax) {
        await counterAtLeast('sale', localMax)
        n = await nextSaleNumber()
      }
      return n
    } catch {
      return undefined
    }
  }, [])

  const login = useCallback((id) => {
    setUserId(id)
    try { sessionStorage.setItem(SESSION_KEY, id) } catch { /* modo privado */ }
  }, [])
  const logout = useCallback(() => {
    setUserId(null)
    try { sessionStorage.removeItem(SESSION_KEY) } catch { /* modo privado */ }
  }, [])

  // Desliga este aparelho da conta da loja (os dados continuam no Supabase).
  const disconnect = useCallback(async () => {
    if (syncRef.current?.pending()) {
      toast('Ainda há alterações para enviar. Conecte à internet e aguarde.', 'error')
      return
    }
    syncRef.current?.stop()
    syncRef.current = null
    await getClient()?.auth.signOut()
    await clearData(CACHE_KEY)
    logout()
    setCurrent(null)
    setAccount(null)
    setPhase('auth')
  }, [logout, setCurrent, toast])

  const user = useMemo(() => db?.users.find((u) => u.id === userId && u.active) || null, [db, userId])

  const value = useMemo(
    () => ({ phase, start, account, sync, db, ready: phase === 'ready', update, replaceDb, reserveSaleNumber, user, login, logout, disconnect, toast, toasts }),
    [phase, start, account, sync, db, update, replaceDb, reserveSaleNumber, user, login, logout, disconnect, toast, toasts],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = () => useContext(StoreContext)

// Sincronização com o Supabase.
// Cada item (produto, venda, cliente…) vira uma linha em pdv_records. O app continua
// trabalhando sobre o objeto `db` em memória; aqui ficam o envio das alterações
// (com fila para quando a internet cair) e o recebimento em tempo real dos outros caixas.
import { createClient } from '@supabase/supabase-js'

export const DEFAULT_URL = 'https://xnfjaguuovecgbfyxglb.supabase.co'
const CONFIG_KEY = 'olympia-pdv-cloud'
export const COLLECTIONS = ['users', 'categories', 'brands', 'products', 'stockMoves', 'customers', 'sales', 'cashSessions', 'cashMoves']
const SETTINGS_KEY = 'settings|main'

export function readConfig() {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') } catch { /* sem acesso */ }
  return {
    url: import.meta.env.VITE_SUPABASE_URL || saved.url || DEFAULT_URL,
    key: import.meta.env.VITE_SUPABASE_ANON_KEY || saved.key || '',
  }
}
export function saveConfig(cfg) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)) } catch { /* sem acesso */ }
}
export const keyFromEnv = () => !!import.meta.env.VITE_SUPABASE_ANON_KEY

let client = null
let clientKey = ''
export function getClient() {
  const { url, key } = readConfig()
  if (!key) return null
  if (!client || clientKey !== url + key) {
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
    clientKey = url + key
  }
  return client
}

// ---------------------------------------------------------------------------
// Conversão db <-> registros
// ---------------------------------------------------------------------------
export function dbToRecords(db) {
  const out = new Map()
  if (!db) return out
  for (const c of COLLECTIONS) for (const item of db[c] || []) out.set(`${c}|${item.id}`, item)
  out.set(SETTINGS_KEY, db.settings)
  return out
}

export function recordsToDb(rows, base) {
  const db = { ...base, settings: { ...base.settings } }
  for (const c of COLLECTIONS) db[c] = []
  for (const r of rows) {
    if (r.deleted) continue
    if (r.collection === 'settings') db.settings = { ...base.settings, ...r.data }
    else if (db[r.collection]) db[r.collection].push(r.data)
  }
  // Mantém a ordem cronológica das listas que dependem dela.
  for (const c of ['stockMoves', 'sales', 'cashSessions', 'cashMoves']) db[c].sort((a, b) => String(a.date || a.openedAt).localeCompare(String(b.date || b.openedAt)))
  return db
}

const splitKey = (k) => {
  const i = k.indexOf('|')
  return [k.slice(0, i), k.slice(i + 1)]
}

const stockMap = (product) => Object.fromEntries((product?.variants || []).map((v) => [v.id, v.stock || 0]))

// ---------------------------------------------------------------------------
// Motor de sincronização
// ---------------------------------------------------------------------------
export function createSync({ clientId, onRemote, onStatus, persistQueue, client: sb = getClient() }) {
  let current = new Map() // chave -> JSON do registro como está no app
  let server = new Map() // chave -> JSON do registro como está no servidor
  let serverStock = new Map() // productId -> { variantId: estoque no servidor }
  const dirty = new Map() // chave -> versão
  let version = 0
  let flushing = false
  let timer = null
  let channel = null
  let getDb = () => null

  const status = () => onStatus({ pending: dirty.size, flushing, online: navigator.onLine })

  function remember(map, key, value) {
    if (value === undefined) map.delete(key)
    else map.set(key, JSON.stringify(value))
  }

  function load(rows, db) {
    server = new Map()
    serverStock = new Map()
    for (const r of rows) {
      const key = `${r.collection}|${r.id}`
      if (r.deleted) continue
      server.set(key, JSON.stringify(r.data))
      if (r.collection === 'products') serverStock.set(r.id, stockMap(r.data))
    }
    current = new Map([...dbToRecords(db)].map(([k, v]) => [k, JSON.stringify(v)]))
  }

  // Compara o db novo com o anterior e marca o que mudou.
  function track(db) {
    const next = dbToRecords(db)
    for (const [k, v] of next) {
      const s = JSON.stringify(v)
      if (current.get(k) !== s) {
        current.set(k, s)
        dirty.set(k, ++version)
      }
    }
    for (const k of [...current.keys()]) {
      if (!next.has(k)) {
        current.delete(k)
        dirty.set(k, ++version)
      }
    }
    persistQueue([...dirty.keys()], Object.fromEntries([...serverStock].map(([k, v]) => [k, v])))
    schedule()
  }

  function restoreQueue(keys, stocks) {
    for (const k of keys || []) dirty.set(k, ++version)
    for (const [k, v] of Object.entries(stocks || {})) if (!serverStock.has(k)) serverStock.set(k, v)
  }

  function schedule(delay = 300) {
    clearTimeout(timer)
    timer = setTimeout(flush, delay)
    status()
  }

  async function flush() {
    if (flushing || !dirty.size) return status()
    if (!navigator.onLine) return status()
    flushing = true
    status()
    const db = getDb()
    const records = dbToRecords(db)
    const batch = [...dirty.entries()]
    try {
      const upserts = []
      const deletes = []
      const products = []
      for (const [key, ver] of batch) {
        const [collection, id] = splitKey(key)
        const data = records.get(key)
        if (data === undefined) deletes.push({ key, ver, collection, id })
        else if (collection === 'products') products.push({ key, ver, id, data })
        else upserts.push({ key, ver, row: { collection, id, data, deleted: false, client_id: clientId, updated_at: new Date().toISOString() } })
      }
      for (let i = 0; i < upserts.length; i += 200) {
        const chunk = upserts.slice(i, i + 200)
        const { error } = await sb.from('pdv_records').upsert(chunk.map((u) => u.row))
        if (error) throw error
        for (const u of chunk) done(u.key, u.ver, u.row.data)
      }
      for (const d of deletes) {
        const { error } = await sb.from('pdv_records').upsert({ collection: d.collection, id: d.id, data: {}, deleted: true, client_id: clientId, updated_at: new Date().toISOString() })
        if (error) throw error
        done(d.key, d.ver, undefined)
      }
      for (const p of products) {
        const base = serverStock.get(p.id) || {}
        const deltas = {}
        for (const v of p.data.variants || []) if (v.id in base) deltas[v.id] = (v.stock || 0) - base[v.id]
        const { data: merged, error } = await sb.rpc('pdv_save_product', { p_id: p.id, p_data: p.data, p_deltas: deltas, p_client: clientId })
        if (error) throw error
        serverStock.set(p.id, stockMap(merged))
        done(p.key, p.ver, merged)
        // Outro caixa vendeu no meio tempo: traz o saldo somado de volta para a tela.
        if (JSON.stringify(merged) !== JSON.stringify(p.data) && dirty.get(p.key) === undefined) {
          current.set(p.key, JSON.stringify(merged))
          onRemote([{ collection: 'products', id: p.id, data: merged, deleted: false }])
        }
      }
    } catch (err) {
      console.warn('[olympia] falha ao sincronizar', err)
      flushing = false
      status()
      schedule(5000)
      return
    }
    flushing = false
    persistQueue([...dirty.keys()], Object.fromEntries(serverStock))
    status()
    if (dirty.size) schedule(50)
  }

  function done(key, ver, data) {
    if (dirty.get(key) === ver) dirty.delete(key)
    remember(server, key, data)
  }

  function subscribe() {
    channel = sb
      .channel('pdv_records')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pdv_records' }, (payload) => {
        const r = payload.new
        if (!r || r.client_id === clientId) return
        const key = `${r.collection}|${r.id}`
        remember(server, key, r.deleted ? undefined : r.data)
        if (r.collection === 'products' && !r.deleted) serverStock.set(r.id, stockMap(r.data))
        if (dirty.has(key)) return // alteração local pendente vence; produtos somam estoque no envio
        remember(current, key, r.deleted ? undefined : r.data)
        onRemote([r])
      })
      .subscribe()
  }

  const onOnline = () => schedule(0)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', status)

  return {
    load,
    track,
    restoreQueue,
    subscribe,
    flushNow: () => schedule(0),
    setDbGetter: (fn) => { getDb = fn },
    markAll(db) {
      // Substituição completa (configuração inicial, restauração de backup, apagar tudo).
      const next = dbToRecords(db)
      for (const k of new Set([...server.keys(), ...current.keys()])) if (!next.has(k)) dirty.set(k, ++version)
      current = new Map()
      for (const [k, v] of next) {
        current.set(k, JSON.stringify(v))
        dirty.set(k, ++version)
      }
      persistQueue([...dirty.keys()], Object.fromEntries(serverStock))
      schedule(0)
    },
    pending: () => dirty.size,
    stop() {
      clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', status)
      if (channel) sb.removeChannel(channel)
    },
  }
}

// Baixa todos os registros (paginado).
export async function fetchAll() {
  const sb = getClient()
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('pdv_records').select('collection,id,data,deleted').range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

export async function nextSaleNumber() {
  const { data, error } = await getClient().rpc('pdv_next', { p_name: 'sale' })
  if (error) throw error
  return Number(data)
}

export async function counterAtLeast(name, value) {
  await getClient().rpc('pdv_counter_at_least', { p_name: name, p_value: value })
}

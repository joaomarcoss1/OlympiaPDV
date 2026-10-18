// Persistência local: IndexedDB (sem limite prático de tamanho, comporta fotos)
// com fallback para localStorage quando o IndexedDB não estiver disponível.

const DB_NAME = 'olympia-pdv'
const STORE = 'kv'
const LS_KEY = 'olympia-pdv-db'

function openIdb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no-idb'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

let idbPromise = null
function idb() {
  if (!idbPromise) idbPromise = openIdb().catch(() => null)
  return idbPromise
}

export async function loadData(KEY = 'db') {
  const db = await idb()
  if (db) {
    const value = await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
    if (value) return value
  }
  try {
    const raw = localStorage.getItem(`${LS_KEY}-${KEY}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function saveData(data, KEY = 'db') {
  const db = await idb()
  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(data, KEY)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    return
  }
  localStorage.setItem(`${LS_KEY}-${KEY}`, JSON.stringify(data))
}

export async function clearData(KEY = 'db') {
  const db = await idb()
  if (db) {
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = resolve
      tx.onerror = resolve
    })
  }
  try { localStorage.removeItem(`${LS_KEY}-${KEY}`) } catch { /* sem acesso */ }
}

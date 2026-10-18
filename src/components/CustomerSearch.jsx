import { useMemo, useState } from 'react'
import { UserPlus, UserSearch } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { normalize, onlyDigits, maskPhone } from '../utils/format'
import CustomerForm from './CustomerForm'

// Busca de cliente com autocompletar + atalho para cadastrar na hora.
export default function CustomerSearch({ onSelect, placeholder = 'Buscar cliente (nome, telefone ou CPF)' }) {
  const { db } = useStore()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const results = useMemo(() => {
    const t = normalize(q.trim())
    if (!t) return []
    const digits = onlyDigits(q)
    return db.customers
      .filter((c) => normalize(c.name).includes(t) || (digits.length >= 3 && (onlyDigits(c.phone).includes(digits) || onlyDigits(c.cpf).includes(digits))))
      .slice(0, 6)
  }, [q, db.customers])

  function pick(c) {
    onSelect(c)
    setQ('')
    setOpen(false)
  }

  return (
    <div className="combo">
      <div className="search">
        <UserSearch size={18} />
        <input
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => e.key === 'Enter' && results[0] && pick(results[0])}
        />
      </div>
      {open && q.trim() && (
        <div className="combo-list">
          {results.map((c) => (
            <button type="button" key={c.id} className="combo-item" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
              <strong>{c.name}</strong>
              <span className="muted">{[maskPhone(c.phone), c.address?.district].filter(Boolean).join(' · ') || 'sem telefone'}</span>
            </button>
          ))}
          <button type="button" className="combo-item combo-new" onMouseDown={(e) => e.preventDefault()} onClick={() => setCreating(true)}>
            <UserPlus size={16} /> Cadastrar “{q.trim()}”
          </button>
        </div>
      )}
      {creating && <CustomerForm initialName={q.trim()} onClose={() => setCreating(false)} onSaved={pick} />}
    </div>
  )
}

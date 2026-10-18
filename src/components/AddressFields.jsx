import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Field } from './ui'
import { lookupCep } from '../utils/cep'
import { maskCep } from '../utils/format'

export const emptyAddress = () => ({ cep: '', street: '', number: '', complement: '', district: '', city: '', state: '', reference: '' })

// Bloco de endereço com preenchimento automático pelo CEP.
export default function AddressFields({ value, onChange }) {
  const [loading, setLoading] = useState(false)
  const a = value || emptyAddress()
  const set = (k) => (e) => onChange({ ...a, [k]: e.target.value })

  async function onCep(e) {
    const cep = maskCep(e.target.value)
    const next = { ...a, cep }
    onChange(next)
    if (cep.replace(/\D/g, '').length === 8) {
      setLoading(true)
      const found = await lookupCep(cep)
      setLoading(false)
      if (found) onChange({ ...next, ...Object.fromEntries(Object.entries(found).filter(([, v]) => v)) })
    }
  }

  return (
    <div className="address-grid">
      <Field label="CEP" className="col-cep" hint={loading ? 'Buscando endereço…' : 'Preenche o endereço sozinho'}>
        <div className="input-affix">
          <input value={a.cep} onChange={onCep} inputMode="numeric" placeholder="00000-000" />
          {loading && <span className="affix"><Loader2 size={16} className="spin" /></span>}
        </div>
      </Field>
      <Field label="Rua / avenida" className="col-street">
        <input value={a.street} onChange={set('street')} />
      </Field>
      <Field label="Número" className="col-number">
        <input value={a.number} onChange={set('number')} />
      </Field>
      <Field label="Complemento" className="col-half">
        <input value={a.complement} onChange={set('complement')} placeholder="Apto, bloco…" />
      </Field>
      <Field label="Bairro" className="col-half">
        <input value={a.district} onChange={set('district')} />
      </Field>
      <Field label="Cidade" className="col-city">
        <input value={a.city} onChange={set('city')} />
      </Field>
      <Field label="UF" className="col-uf">
        <input value={a.state} onChange={(e) => onChange({ ...a, state: e.target.value.toUpperCase().slice(0, 2) })} />
      </Field>
      <Field label="Ponto de referência" className="col-full">
        <input value={a.reference} onChange={set('reference')} />
      </Field>
    </div>
  )
}

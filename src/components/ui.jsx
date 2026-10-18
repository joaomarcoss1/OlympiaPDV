import { useEffect, useId, useRef, useState } from 'react'
import { X, Search, ImageOff } from 'lucide-react'
import { decimal, parseMoney, initials } from '../utils/format'
import { useStore } from '../store/StoreContext'

const modalStack = []

export function Modal({ title, subtitle, onClose, children, footer, size = 'md', className = '' }) {
  const id = useId()
  useEffect(() => {
    modalStack.push(id)
    document.body.classList.add('modal-open')
    return () => {
      modalStack.splice(modalStack.indexOf(id), 1)
      if (!modalStack.length) document.body.classList.remove('modal-open')
    }
  }, [id])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && modalStack[modalStack.length - 1] === id && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal modal-${size} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <X size={20} />
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

// Campo de valor em R$: aceita vírgula, formata ao sair do campo.
export function MoneyInput({ value, onChange, prefix = 'R$', autoFocus, placeholder = '0,00', className = '', onEnter, ...rest }) {
  const [text, setText] = useState(value ? decimal(value) : '')
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value ? decimal(value) : '')
  }, [value])
  return (
    <div className={`input-affix ${className}`}>
      {prefix && <span className="affix">{prefix}</span>}
      <input
        {...rest}
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onFocus={(e) => {
          focused.current = true
          e.target.select()
        }}
        onBlur={() => {
          focused.current = false
          setText(value ? decimal(value) : '')
        }}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseMoney(e.target.value))
        }}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
    </div>
  )
}

export function Stepper({ value, onChange, min = 0, max = Infinity, small }) {
  return (
    <div className={`stepper ${small ? 'stepper-sm' : ''}`}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Diminuir">−</button>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, '') || '0', 10)
          onChange(Math.min(max, Math.max(min, n)))
        }}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Aumentar">+</button>
    </div>
  )
}

export function Switch({ checked, onChange, label, description }) {
  const id = useId()
  return (
    <label className="switch-row" htmlFor={id}>
      <span>
        <span className="switch-label">{label}</span>
        {description && <span className="field-hint">{description}</span>}
      </span>
      <span className={`switch ${checked ? 'on' : ''}`}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="knob" />
      </span>
    </label>
  )
}

export function Segmented({ options, value, onChange, size }) {
  return (
    <div className={`segmented ${size === 'sm' ? 'segmented-sm' : ''}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label}
          {o.count != null && <span className="seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', autoFocus, inputRef, onKeyDown, className = '' }) {
  return (
    <div className={`search ${className}`}>
      <Search size={18} />
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown} />
      {value && (
        <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Limpar busca">
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Empty({ icon, title, children, action }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Thumb({ src, name, size = 44 }) {
  return (
    <div className="thumb" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" /> : name ? <span>{initials(name)}</span> : <ImageOff size={16} />}
    </div>
  )
}

export function ColorDot({ hex, size = 14 }) {
  return <span className="color-dot" style={{ background: hex || '#ccc', width: size, height: size }} />
}

export function Stat({ label, value, hint, icon, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

// Confirmação dentro do sistema: await confirmDialog({ title, message, confirmLabel, danger, typeToConfirm })
let pushConfirm = null
export function confirmDialog(options) {
  return new Promise((resolve) => (pushConfirm ? pushConfirm({ ...options, resolve }) : resolve(false)))
}

export function ConfirmHost() {
  const [req, setReq] = useState(null)
  const [typed, setTyped] = useState('')
  useEffect(() => {
    pushConfirm = (r) => {
      setTyped('')
      setReq(r)
    }
    return () => { pushConfirm = null }
  }, [])
  if (!req) return null
  const close = (value) => {
    req.resolve(value)
    setReq(null)
  }
  const ok = !req.typeToConfirm || typed.trim().toUpperCase() === req.typeToConfirm
  return (
    <Modal
      title={req.title || 'Confirmar'}
      size="sm"
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => close(false)}>Voltar</button>
          <button className={`btn ${req.danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ok} onClick={() => close(true)} autoFocus={!req.typeToConfirm}>
            {req.confirmLabel || 'Confirmar'}
          </button>
        </>
      }
    >
      {req.message && <p>{req.message}</p>}
      {req.typeToConfirm && (
        <Field label={`Digite ${req.typeToConfirm} para confirmar`}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && ok && close(true)} />
        </Field>
      )}
    </Modal>
  )
}

export function Toasts() {
  const { toasts } = useStore()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>
      ))}
    </div>
  )
}

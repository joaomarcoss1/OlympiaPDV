import { useEffect, useMemo, useState } from 'react'
import { Modal, Stepper, Thumb, ColorDot } from '../ui'
import { money } from '../../utils/format'

// Grade cor × tamanho mostrando o estoque; clique escolhe, Enter adiciona.
export default function VariantPicker({ product, brandName, inCart, allowNegative, onAdd, onClose }) {
  const available = (v) => (v.stock || 0) - (inCart[v.id] || 0)
  const firstAvailable = product.variants.find((v) => allowNegative || available(v) > 0)
  const [selected, setSelected] = useState(firstAvailable?.id || null)
  const [qty, setQty] = useState(1)

  const variant = product.variants.find((v) => v.id === selected)
  const max = variant ? (allowNegative ? 999 : Math.max(0, available(variant))) : 0

  const grid = useMemo(
    () => product.colors.map((c) => ({ color: c, cells: product.sizes.map((s) => product.variants.find((v) => v.color === c.name && v.size === s)) })),
    [product],
  )

  function add() {
    if (!variant || qty < 1 || qty > max) return
    onAdd(variant, qty)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault()
        add()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <Modal
      title={product.name}
      subtitle={[brandName, product.sku].filter(Boolean).join(' · ')}
      onClose={onClose}
      size="md"
      footer={
        <>
          <div className="picker-total">
            {variant ? (
              <>
                <span className="muted">{variant.color}{variant.size !== 'U' ? ` · ${variant.size}` : ''}</span>
                <strong>{money(product.price * qty)}</strong>
              </>
            ) : (
              <span className="muted">Escolha cor e tamanho</span>
            )}
          </div>
          <Stepper value={qty} onChange={setQty} min={1} max={Math.max(1, max)} />
          <button className="btn btn-primary btn-lg" onClick={add} disabled={!variant || max < 1}>
            Adicionar
          </button>
        </>
      }
    >
      <div className="picker-head">
        <Thumb src={product.image} name={product.name} size={64} />
        <div>
          <div className="picker-price">{money(product.price)}</div>
          <div className="muted small">Clique no tamanho desejado. O número mostra quantas peças há em estoque.</div>
        </div>
      </div>
      <div className="matrix-wrap">
        <table className="matrix matrix-pick">
          <thead>
            <tr>
              <th />
              {product.sizes.map((s) => (
                <th key={s}>{s === 'U' ? 'Único' : s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map(({ color, cells }) => (
              <tr key={color.name}>
                <th>
                  <span className="color-cell">
                    <ColorDot hex={color.hex} /> {color.name}
                  </span>
                </th>
                {cells.map((v, i) => {
                  if (!v) return <td key={i} />
                  const left = available(v)
                  const disabled = !allowNegative && left <= 0
                  return (
                    <td key={v.id}>
                      <button
                        type="button"
                        className={`pick-cell ${selected === v.id ? 'selected' : ''} ${disabled ? 'out' : ''} ${left > 0 && left <= 2 ? 'low' : ''}`}
                        disabled={disabled}
                        onClick={() => {
                          setSelected(v.id)
                          setQty(1)
                        }}
                        onDoubleClick={() => !disabled && onAdd(v, 1)}
                      >
                        <span className="pick-size">{v.size === 'U' ? 'Único' : v.size}</span>
                        <span className="pick-stock">{disabled ? 'esgotado' : `${left} un`}</span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

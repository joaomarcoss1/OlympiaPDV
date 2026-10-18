import { ColorDot } from './ui'

export const cellKey = (color, size) => `${color}|${size}`

// Grade cor × tamanho com quantidades editáveis.
// values: { "Preto|M": 3 }  ·  hints: quantidades atuais exibidas em cada célula (opcional)
export default function VariantMatrix({ sizes, colors, values, onChange, hints, readOnly, signedLabel, labels = { size: 'Tam.', color: 'Cor' } }) {
  const get = (c, s) => values[cellKey(c, s)] ?? 0
  const set = (c, s, raw) => {
    const clean = raw.replace(/\D/g, '')
    const n = clean === '' ? 0 : parseInt(clean, 10)
    onChange({ ...values, [cellKey(c, s)]: n })
  }
  const rowTotal = (c) => sizes.reduce((t, s) => t + get(c.name, s), 0)
  const colTotal = (s) => colors.reduce((t, c) => t + get(c.name, s), 0)
  const total = colors.reduce((t, c) => t + rowTotal(c), 0)

  const fillRow = (c, n) => onChange({ ...values, ...Object.fromEntries(sizes.map((s) => [cellKey(c.name, s), n])) })
  const fillCol = (s, n) => onChange({ ...values, ...Object.fromEntries(colors.map((c) => [cellKey(c.name, s), n])) })

  if (!sizes.length || !colors.length) {
    return <div className="matrix-empty">Escolha pelo menos um tamanho e uma cor para montar a grade.</div>
  }

  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th className="matrix-corner">{labels.color} \ {labels.size}</th>
            {sizes.map((s) => (
              <th key={s}>
                {readOnly ? (
                  s === 'U' ? 'Único' : s
                ) : (
                  <button type="button" className="matrix-head-btn" title="Copiar o 1º valor desta coluna para todas as cores" onClick={() => fillCol(s, get(colors[0].name, s))}>
                    {s === 'U' ? 'Único' : s}
                  </button>
                )}
              </th>
            ))}
            <th className="matrix-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {colors.map((c) => (
            <tr key={c.name}>
              <th>
                {readOnly ? (
                  <span className="color-cell">{c.hex && <ColorDot hex={c.hex} />} {c.name}</span>
                ) : (
                  <button type="button" className="matrix-head-btn color-cell" title="Copiar o 1º valor desta linha para todos os tamanhos" onClick={() => fillRow(c, get(c.name, sizes[0]))}>
                    {c.hex && <ColorDot hex={c.hex} />} {c.name}
                  </button>
                )}
              </th>
              {sizes.map((s) => {
                const v = get(c.name, s)
                const hint = hints?.[cellKey(c.name, s)]
                return (
                  <td key={s}>
                    {readOnly ? (
                      <span className={`matrix-ro ${v <= 0 ? 'zero' : ''}`}>{v}</span>
                    ) : (
                      <div className="matrix-cell">
                        <input inputMode="numeric" value={v === 0 ? '' : v} placeholder="0" onChange={(e) => set(c.name, s, e.target.value)} onFocus={(e) => e.target.select()} aria-label={`${c.name} ${s}`} />
                        {hint != null && <span className="matrix-hint">atual {hint}</span>}
                      </div>
                    )}
                  </td>
                )
              })}
              <td className="matrix-total">{rowTotal(c)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>{signedLabel || 'Total'}</th>
            {sizes.map((s) => (
              <td key={s} className="matrix-total">{colTotal(s)}</td>
            ))}
            <td className="matrix-total matrix-grand">{total}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

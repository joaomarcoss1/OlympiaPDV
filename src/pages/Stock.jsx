import { useMemo, useState } from 'react'
import { PackagePlus, PackageMinus, ClipboardCheck, Boxes, History, ChevronRight } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { can, applyStock, STOCK_MOVE_TYPES, lowStockLimit, productStock, productLabels } from '../store/model'
import { PageHeader, SearchInput, Segmented, Badge, Empty, Modal, Field, Thumb, ColorDot, Stat } from '../components/ui'
import VariantMatrix, { cellKey } from '../components/VariantMatrix'
import { money, normalize, dateTime } from '../utils/format'

const MOVE_CONFIG = {
  entrada: { title: 'Entrada de mercadoria', verb: 'Registrar entrada', reasons: ['Compra de fornecedor', 'Devolução de cliente', 'Transferência', 'Outro'], help: 'Digite quantas peças estão ENTRANDO em cada tamanho/cor.' },
  saida: { title: 'Saída de mercadoria', verb: 'Registrar saída', reasons: ['Defeito / avaria', 'Perda / furto', 'Uso interno', 'Brinde / marketing', 'Devolução ao fornecedor', 'Outro'], help: 'Digite quantas peças estão SAINDO em cada tamanho/cor.' },
  ajuste: { title: 'Ajuste de inventário', verb: 'Salvar contagem', reasons: ['Inventário / contagem', 'Correção de cadastro', 'Outro'], help: 'Digite a quantidade REAL contada. O sistema calcula a diferença.' },
}

export default function Stock() {
  const { db, user } = useStore()
  const canEdit = can(user, 'stock.edit')
  const [tab, setTab] = useState('posicao')
  const [moving, setMoving] = useState(null)

  const totalUnits = db.products.filter((p) => p.active).reduce((s, p) => s + p.variants.reduce((a, v) => a + Math.max(0, v.stock), 0), 0)
  const costValue = db.products.filter((p) => p.active).reduce((s, p) => s + p.variants.reduce((a, v) => a + Math.max(0, v.stock) * (p.cost || 0), 0), 0)
  const saleValue = db.products.filter((p) => p.active).reduce((s, p) => s + p.variants.reduce((a, v) => a + Math.max(0, v.stock) * p.price, 0), 0)
  const lowCount = db.products.filter((p) => p.active).reduce((s, p) => s + p.variants.filter((v) => v.stock <= lowStockLimit(p, db.settings)).length, 0)

  return (
    <div className="page">
      <PageHeader
        title="Estoque"
        subtitle="Posição por tamanho e cor, entradas, saídas e histórico."
        actions={
          canEdit && (
            <>
              <button className="btn btn-primary" onClick={() => setMoving('entrada')}><PackagePlus size={18} /> Entrada</button>
              <button className="btn btn-outline" onClick={() => setMoving('saida')}><PackageMinus size={18} /> Saída</button>
              <button className="btn btn-outline" onClick={() => setMoving('ajuste')}><ClipboardCheck size={18} /> Inventário</button>
            </>
          )
        }
      />
      <div className="stats">
        <Stat label="Peças em estoque" value={totalUnits} />
        <Stat label="Variações com estoque baixo" value={lowCount} tone={lowCount ? 'warn' : undefined} hint="conforme o mínimo de cada produto" />
        {canEdit && <Stat label="Valor em estoque (custo)" value={money(costValue)} />}
        <Stat label="Valor em estoque (venda)" value={money(saleValue)} />
      </div>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'posicao', label: 'Posição atual', icon: <Boxes size={16} /> },
          { value: 'historico', label: 'Movimentações', icon: <History size={16} /> },
        ]}
      />
      {tab === 'posicao' ? <Position /> : <Moves />}
      {moving && <StockMoveModal type={moving} onClose={() => setMoving(null)} />}
    </div>
  )
}

function Position() {
  const { db } = useStore()
  const [q, setQ] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [open, setOpen] = useState(null)
  const rows = useMemo(() => {
    const t = normalize(q)
    return db.products
      .filter((p) => p.active)
      .map((p) => {
        const limit = lowStockLimit(p, db.settings)
        return { p, total: productStock(p), low: p.variants.filter((v) => v.stock <= limit).length, limit }
      })
      .filter((r) => (!onlyLow || r.low > 0) && (!t || normalize(`${r.p.name} ${r.p.sku} ${r.p.variants.map((v) => `${v.sku} ${v.color} ${v.size}`).join(' ')}`).includes(t)))
      .sort((a, b) => a.p.name.localeCompare(b.p.name))
  }, [db.products, db.settings, q, onlyLow])

  return (
    <>
      <div className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Produto, cor, tamanho ou código" />
        <Segmented size="sm" value={onlyLow ? 'low' : 'all'} onChange={(v) => setOnlyLow(v === 'low')} options={[{ value: 'all', label: 'Todos' }, { value: 'low', label: 'Com estoque baixo' }]} />
      </div>
      {rows.length === 0 ? (
        <Empty icon={<Boxes size={28} />} title="Nada encontrado" />
      ) : (
        <div className="card stock-groups">
          {rows.map(({ p, total, low, limit }) => {
            const isOpen = open === p.id
            return (
              <div key={p.id} className={`stock-group ${isOpen ? 'open' : ''}`}>
                <button type="button" className="stock-group-head" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
                  <ChevronRight size={18} className="chev" />
                  <Thumb src={p.image} name={p.name} size={36} />
                  <span className="grow">
                    <strong>{p.name}</strong>
                    <span className="muted small"> {p.sku}{p.simple ? '' : ` · ${p.variants.length} variações`}</span>
                  </span>
                  {low > 0 && <Badge tone="warn">{low} {low === 1 ? 'baixa' : 'baixas'}</Badge>}
                  <Badge tone={total <= 0 ? 'danger' : 'neutral'}>{total} em estoque</Badge>
                </button>
                {isOpen && (
                  <div className="stock-group-body">
                    {p.simple ? (
                      <p>Quantidade: <strong>{total}</strong> · aviso com {limit} un ou menos</p>
                    ) : (
                      <VariantMatrix
                        sizes={p.sizes}
                        colors={p.colors}
                        labels={productLabels(p)}
                        values={Object.fromEntries(p.variants.map((v) => [cellKey(v.color, v.size), v.stock || 0]))}
                        onChange={() => {}}
                        readOnly
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function Moves() {
  const { db } = useStore()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const users = useMemo(() => Object.fromEntries(db.users.map((u) => [u.id, u.name])), [db.users])
  const rows = useMemo(() => {
    const t = normalize(q)
    return db.stockMoves
      .filter((m) => (!type || m.type === type) && (!t || normalize(`${m.productName} ${m.variantLabel} ${m.reason}`).includes(t)))
      .slice()
      .reverse()
      .slice(0, 400)
  }, [db.stockMoves, q, type])
  return (
    <>
      <div className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Produto ou motivo" />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos os tipos</option>
          {Object.entries(STOCK_MOVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty icon={<History size={28} />} title="Sem movimentações" />
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr><th>Data</th><th>Tipo</th><th>Produto</th><th className="num">Qtd.</th><th className="num hide-sm">Saldo</th><th className="hide-md">Motivo</th><th className="hide-md">Usuário</th></tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="nowrap">{dateTime(m.date)}</td>
                  <td><Badge tone={m.qty > 0 ? 'success' : m.type === 'venda' ? 'neutral' : 'danger'}>{STOCK_MOVE_TYPES[m.type]}</Badge></td>
                  <td><strong>{m.productName}</strong> <span className="muted small">{m.variantLabel}</span></td>
                  <td className={`num ${m.qty > 0 ? 'pos' : 'neg'}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                  <td className="num hide-sm muted">{m.before} → {m.after}</td>
                  <td className="hide-md muted">{m.reason}</td>
                  <td className="hide-md muted">{users[m.userId] || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function StockMoveModal({ type, onClose }) {
  const { db, update, user, toast } = useStore()
  const cfg = MOVE_CONFIG[type]
  const [productId, setProductId] = useState(null)
  const [q, setQ] = useState('')
  const [values, setValues] = useState({})
  const [reason, setReason] = useState(cfg.reasons[0])
  const [notes, setNotes] = useState('')
  const product = db.products.find((p) => p.id === productId)
  const hints = product ? Object.fromEntries(product.variants.map((v) => [cellKey(v.color, v.size), v.stock])) : {}

  const results = useMemo(() => {
    const t = normalize(q)
    return db.products.filter((p) => p.active && (!t || normalize(`${p.name} ${p.sku}`).includes(t))).slice(0, 8)
  }, [db.products, q])

  function choose(p) {
    setProductId(p.id)
    setValues(type === 'ajuste' ? Object.fromEntries(p.variants.map((v) => [cellKey(v.color, v.size), v.stock])) : {})
  }

  function save() {
    if (!product) return
    const entries = product.variants
      .map((v) => {
        const n = values[cellKey(v.color, v.size)]
        if (type === 'ajuste') return n === undefined ? null : { variantId: v.id, qty: n }
        return n ? { variantId: v.id, qty: type === 'saida' ? -n : n } : null
      })
      .filter(Boolean)
    if (!entries.length) return toast('Informe ao menos uma quantidade.', 'error')
    update((d) => applyStock(d, product.id, entries, type, [reason, notes].filter(Boolean).join(' — '), user.id))
    toast('Estoque atualizado.')
    onClose()
  }

  return (
    <Modal
      title={cfg.title}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!product}>{cfg.verb}</button>
        </>
      }
    >
      {!product ? (
        <>
          <SearchInput value={q} onChange={setQ} placeholder="Qual produto?" autoFocus />
          <div className="pick-list">
            {results.map((p) => (
              <button key={p.id} className="pick-list-item" onClick={() => choose(p)}>
                <Thumb src={p.image} name={p.name} size={36} />
                <span><strong>{p.name}</strong><span className="muted small"> {p.sku}</span></span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="picked">
            <Thumb src={product.image} name={product.name} size={40} />
            <strong>{product.name}</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setProductId(null)}>Trocar produto</button>
          </div>
          <p className="muted small">{cfg.help}</p>
          <VariantMatrix sizes={product.sizes} colors={product.colors} labels={productLabels(product)} values={values} onChange={setValues} hints={type === 'ajuste' ? undefined : hints} />
          <div className="form-grid mt">
            <Field label="Motivo">
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {cfg.reasons.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Observação / fornecedor / nota">
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </>
      )}
    </Modal>
  )
}

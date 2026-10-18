import { useMemo, useState } from 'react'
import { Plus, Copy, Pencil, Shirt, Eye } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { can, productStock } from '../store/model'
import { PageHeader, SearchInput, Thumb, Badge, Empty, ColorDot, Modal } from '../components/ui'
import ProductForm from '../components/ProductForm'
import VariantMatrix, { cellKey } from '../components/VariantMatrix'
import { money, normalize } from '../utils/format'

export default function Products() {
  const { db, user } = useStore()
  const canEdit = can(user, 'products.edit')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [brand, setBrand] = useState('')
  const [status, setStatus] = useState('ativos')
  const [editing, setEditing] = useState(null) // { product?, duplicateOf? }
  const [viewing, setViewing] = useState(null)

  const brands = useMemo(() => Object.fromEntries(db.brands.map((b) => [b.id, b.name])), [db.brands])
  const cats = useMemo(() => Object.fromEntries(db.categories.map((c) => [c.id, c.name])), [db.categories])
  const low = db.settings.lowStockThreshold

  const list = useMemo(() => {
    const t = normalize(q)
    return db.products
      .filter((p) => (status === 'ativos' ? p.active : status === 'inativos' ? !p.active : true))
      .filter((p) => !cat || p.categoryId === cat || p.subcategoryId === cat)
      .filter((p) => !brand || p.brandId === brand)
      .filter((p) => !t || normalize([p.name, p.sku, brands[p.brandId], ...p.variants.map((v) => v.sku)].join(' ')).includes(t))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [db.products, q, cat, brand, status, brands])

  return (
    <div className="page">
      <PageHeader
        title="Produtos"
        subtitle={`${db.products.filter((p) => p.active).length} produtos ativos`}
        actions={
          canEdit && (
            <button className="btn btn-primary" onClick={() => setEditing({})}>
              <Plus size={18} /> Novo produto
            </button>
          )
        }
      />
      <div className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome, marca ou código" />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {db.categories.filter((c) => !c.parentId).map((c) => (
            <optgroup key={c.id} label={c.name}>
              <option value={c.id}>{c.name} (todas)</option>
              {db.categories.filter((s) => s.parentId === c.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">Todas as marcas</option>
          {db.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      {list.length === 0 ? (
        <Empty
          icon={<Shirt size={28} />}
          title="Nenhum produto por aqui"
          action={canEdit && <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={18} /> Cadastrar produto</button>}
        >
          Cadastre um modelo e já monte a grade de tamanhos e cores.
        </Empty>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="hide-sm">Marca</th>
                <th className="hide-md">Categoria</th>
                <th className="hide-md">Grade</th>
                {canEdit && <th className="num hide-sm">Custo</th>}
                <th className="num">Preço</th>
                <th className="num">Estoque</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const stock = productStock(p)
                const lowCount = p.variants.filter((v) => v.stock <= low).length
                return (
                  <tr key={p.id} className="row-click" onClick={() => (canEdit ? setEditing({ product: p }) : setViewing(p))}>
                    <td>
                      <div className="cell-product">
                        <Thumb src={p.image} name={p.name} />
                        <div>
                          <strong>{p.name}</strong>
                          <span className="muted small">{p.sku}{!p.active && ' · inativo'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="hide-sm">{brands[p.brandId] || '—'}</td>
                    <td className="hide-md">
                      {cats[p.categoryId] || '—'}
                      {p.subcategoryId && <span className="muted"> › {cats[p.subcategoryId]}</span>}
                    </td>
                    <td className="hide-md">
                      <span className="grade-summary">
                        <span className="dots">{p.colors.slice(0, 5).map((c) => <ColorDot key={c.name} hex={c.hex} size={11} />)}</span>
                        <span className="muted small">{p.sizes.join(' ')}</span>
                      </span>
                    </td>
                    {canEdit && <td className="num hide-sm muted">{p.cost ? money(p.cost) : '—'}</td>}
                    <td className="num"><strong>{money(p.price)}</strong></td>
                    <td className="num">
                      {stock <= 0 ? <Badge tone="danger">Esgotado</Badge> : lowCount > 0 ? <Badge tone="warn">{stock} · {lowCount} baixo</Badge> : <Badge tone="success">{stock}</Badge>}
                    </td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" title="Ver grade de estoque" onClick={() => setViewing(p)}><Eye size={17} /></button>
                      {canEdit && (
                        <>
                          <button className="icon-btn" title="Duplicar (mesma grade)" onClick={() => setEditing({ duplicateOf: p })}><Copy size={17} /></button>
                          <button className="icon-btn" title="Editar" onClick={() => setEditing({ product: p })}><Pencil size={17} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <ProductForm product={editing.product} duplicateOf={editing.duplicateOf} onClose={() => setEditing(null)} />}
      {viewing && <StockGridModal product={db.products.find((p) => p.id === viewing.id)} brand={brands[viewing.brandId]} onClose={() => setViewing(null)} />}
    </div>
  )
}

export function StockGridModal({ product, brand, onClose }) {
  const values = Object.fromEntries(product.variants.map((v) => [cellKey(v.color, v.size), v.stock || 0]))
  return (
    <Modal title={product.name} subtitle={[brand, product.sku, money(product.price)].filter(Boolean).join(' · ')} onClose={onClose} size="md">
      <VariantMatrix sizes={product.sizes} colors={product.colors} values={values} onChange={() => {}} readOnly />
    </Modal>
  )
}

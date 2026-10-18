import { useMemo, useRef, useState } from 'react'
import { ImagePlus, Plus, X, Trash2 } from 'lucide-react'
import { Modal, Field, MoneyInput, ColorDot, Switch, confirmDialog } from './ui'
import VariantMatrix, { cellKey } from './VariantMatrix'
import { useStore } from '../store/StoreContext'
import { SIZE_PRESETS, COLOR_PRESETS, createProduct, buildVariants, applyStock, uid, nowIso } from '../store/model'
import { resizeImage } from '../utils/image'
import { money, round2 as r2 } from '../utils/format'

// Cadastro de 1 modelo com toda a grade (tamanhos × cores × quantidades).
export default function ProductForm({ product, duplicateOf, onClose }) {
  const { db, update, user, toast } = useStore()
  const source = product || duplicateOf
  const [form, setForm] = useState(() => ({
    name: source ? (duplicateOf ? `${source.name} (cópia)` : source.name) : '',
    brandId: source?.brandId || '',
    categoryId: source?.categoryId || '',
    subcategoryId: source?.subcategoryId || '',
    price: source?.price || 0,
    cost: source?.cost || 0,
    sku: product?.sku || '',
    barcode: product?.barcode || '',
    description: source?.description || '',
    image: source?.image || null,
    active: product ? product.active : true,
  }))
  const [sizes, setSizes] = useState(source?.sizes || ['P', 'M', 'G'])
  const [colors, setColors] = useState(source?.colors || [COLOR_PRESETS[0]])
  const [qty, setQty] = useState(() =>
    product ? Object.fromEntries(product.variants.map((v) => [cellKey(v.color, v.size), v.stock || 0])) : {},
  )
  const [newSize, setNewSize] = useState('')
  const [newColor, setNewColor] = useState({ name: '', hex: '#C9A23A' })
  const [newBrand, setNewBrand] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const topCats = db.categories.filter((c) => !c.parentId)
  const subCats = db.categories.filter((c) => c.parentId && c.parentId === form.categoryId)
  const margin = form.price > 0 && form.cost > 0 ? ((form.price - form.cost) / form.price) * 100 : null

  const toggleSize = (s) => setSizes((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]))
  const applyPreset = (name) => setSizes(SIZE_PRESETS[name])
  const addSize = () => {
    const s = newSize.trim().toUpperCase()
    if (s && !sizes.includes(s)) setSizes([...sizes, s])
    setNewSize('')
  }
  const toggleColor = (c) => setColors((list) => (list.some((x) => x.name === c.name) ? list.filter((x) => x.name !== c.name) : [...list, c]))
  const addColor = () => {
    const name = newColor.name.trim()
    if (!name || colors.some((c) => c.name.toLowerCase() === name.toLowerCase())) return
    setColors([...colors, { name: name[0].toUpperCase() + name.slice(1), hex: newColor.hex }])
    setNewColor({ name: '', hex: newColor.hex })
  }
  const customColors = useMemo(() => colors.filter((c) => !COLOR_PRESETS.some((p) => p.name === c.name)), [colors])

  async function onImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const image = await resizeImage(file)
      setForm((f) => ({ ...f, image }))
    } catch {
      toast('Não foi possível ler a imagem.', 'error')
    }
    e.target.value = ''
  }

  function save() {
    if (!form.name.trim()) return setError('Informe o nome do produto.')
    if (form.price <= 0) return setError('Informe o preço de venda.')
    if (!sizes.length || !colors.length) return setError('Escolha pelo menos um tamanho e uma cor.')
    const skuTaken = form.sku.trim() && db.products.some((p) => p.id !== product?.id && p.sku.toUpperCase() === form.sku.trim().toUpperCase())
    if (skuTaken) return setError('Já existe um produto com este código.')

    let brandId = form.brandId
    update((d) => {
      if (newBrand?.trim()) {
        const existing = d.brands.find((b) => b.name.toLowerCase() === newBrand.trim().toLowerCase())
        brandId = existing?.id || uid()
        if (!existing) d.brands.push({ id: brandId, name: newBrand.trim() })
      }
      const data = { ...form, brandId: brandId || null, name: form.name.trim(), price: r2(form.price), cost: r2(form.cost) }
      if (!product) {
        const p = createProduct(d, { ...data, sizes, colors })
        p.active = form.active
        const entries = p.variants.map((v) => ({ variantId: v.id, qty: qty[cellKey(v.color, v.size)] || 0 }))
        applyStock(d, p.id, entries, 'inicial', 'Estoque inicial no cadastro', user.id)
        return
      }
      const p = d.products.find((x) => x.id === product.id)
      Object.assign(p, data, { sku: data.sku.trim() || p.sku, updatedAt: nowIso() })
      // Variações removidas: zera o estoque antes (fica registrado no histórico).
      const removed = p.variants.filter((v) => !sizes.includes(v.size) || !colors.some((c) => c.name === v.color))
      applyStock(d, p.id, removed.map((v) => ({ variantId: v.id, qty: 0 })), 'ajuste', 'Variação removida do cadastro', user.id)
      p.sizes = sizes
      p.colors = colors
      p.variants = buildVariants(p, sizes, colors)
      const entries = p.variants.map((v) => ({ variantId: v.id, qty: qty[cellKey(v.color, v.size)] || 0 }))
      applyStock(d, p.id, entries, 'ajuste', 'Ajuste no cadastro do produto', user.id)
    })
    toast(product ? 'Produto atualizado.' : 'Produto cadastrado.')
    onClose()
  }

  async function remove() {
    const sold = db.sales.some((s) => s.items.some((i) => i.productId === product.id))
    if (sold) {
      const ok = await confirmDialog({ title: 'Desativar produto?', message: 'Este produto já tem vendas. Ele será desativado: some do PDV, mas continua no histórico.', confirmLabel: 'Desativar' })
      if (!ok) return
      update((d) => { d.products.find((x) => x.id === product.id).active = false })
      toast('Produto desativado.')
    } else {
      const ok = await confirmDialog({ title: 'Excluir produto?', message: `“${product.name}” será excluído definitivamente.`, confirmLabel: 'Excluir', danger: true })
      if (!ok) return
      update((d) => {
        d.products = d.products.filter((x) => x.id !== product.id)
      })
      toast('Produto excluído.')
    }
    onClose()
  }

  return (
    <Modal
      title={product ? 'Editar produto' : 'Novo produto'}
      subtitle="Cadastre o modelo uma vez e monte toda a grade de tamanhos e cores."
      onClose={onClose}
      size="xl"
      footer={
        <>
          {product && (
            <button className="btn btn-ghost btn-danger-text" onClick={remove}>
              <Trash2 size={16} /> Excluir
            </button>
          )}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Salvar produto</button>
        </>
      }
    >
      <div className="product-form">
        <div className="pf-photo">
          <button type="button" className="photo-drop" onClick={() => fileRef.current?.click()}>
            {form.image ? <img src={form.image} alt="" /> : (<><ImagePlus size={28} /><span>Adicionar foto</span></>)}
          </button>
          {form.image && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, image: null }))}>
              Remover foto
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onImage} />
        </div>

        <div className="form-grid pf-fields">
          <Field label="Nome do produto *" className="col-span-2">
            <input value={form.name} onChange={set('name')} autoFocus placeholder="Ex.: Legging Fusô Power" />
          </Field>
          <Field label="Marca">
            {newBrand !== null ? (
              <div className="inline-input">
                <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="Nome da nova marca" autoFocus />
                <button type="button" className="icon-btn" onClick={() => setNewBrand(null)} aria-label="Cancelar nova marca"><X size={16} /></button>
              </div>
            ) : (
              <select value={form.brandId} onChange={(e) => (e.target.value === '__new' ? setNewBrand('') : set('brandId')(e))}>
                <option value="">Sem marca</option>
                {db.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                <option value="__new">+ Nova marca…</option>
              </select>
            )}
          </Field>
          <Field label="Código (SKU)" hint={product ? undefined : 'Deixe vazio para gerar automático'}>
            <input value={form.sku} onChange={set('sku')} placeholder="Automático" />
          </Field>
          <Field label="Categoria">
            <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value, subcategoryId: '' }))}>
              <option value="">Sem categoria</option>
              {topCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Subcategoria">
            <select value={form.subcategoryId} onChange={set('subcategoryId')} disabled={!subCats.length}>
              <option value="">{subCats.length ? 'Selecione' : '—'}</option>
              {subCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Preço de venda *">
            <MoneyInput value={form.price} onChange={(price) => setForm((f) => ({ ...f, price }))} />
          </Field>
          <Field label="Custo" hint={margin != null ? `Margem: ${margin.toFixed(0)}% · lucro ${money(form.price - form.cost)}` : 'Opcional — usado nos relatórios'}>
            <MoneyInput value={form.cost} onChange={(cost) => setForm((f) => ({ ...f, cost }))} />
          </Field>
          <Field label="Código de barras (opcional)">
            <input value={form.barcode} onChange={set('barcode')} />
          </Field>
          <Field label="Descrição (opcional)">
            <input value={form.description} onChange={set('description')} placeholder="Tecido, modelagem…" />
          </Field>
        </div>
      </div>

      <h3 className="section-title">1. Tamanhos</h3>
      <div className="option-row">
        <span className="muted small">Atalhos:</span>
        {Object.keys(SIZE_PRESETS).map((name) => (
          <button key={name} type="button" className="chip chip-sm" onClick={() => applyPreset(name)}>
            {name} ({SIZE_PRESETS[name].join(' ')})
          </button>
        ))}
      </div>
      <div className="option-row">
        {[...new Set([...SIZE_PRESETS.Letras, ...sizes])].map((s) => (
          <button key={s} type="button" className={`chip ${sizes.includes(s) ? 'active' : ''}`} onClick={() => toggleSize(s)}>
            {s === 'U' ? 'Único' : s}
          </button>
        ))}
        <div className="inline-add">
          <input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="Outro (ex.: 38)" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSize())} />
          <button type="button" className="icon-btn" onClick={addSize} aria-label="Adicionar tamanho"><Plus size={16} /></button>
        </div>
      </div>

      <h3 className="section-title">2. Cores</h3>
      <div className="option-row">
        {[...COLOR_PRESETS, ...customColors].map((c) => {
          const on = colors.some((x) => x.name === c.name)
          return (
            <button key={c.name} type="button" className={`chip ${on ? 'active' : ''}`} onClick={() => toggleColor(c)}>
              <ColorDot hex={c.hex} size={12} /> {c.name}
            </button>
          )
        })}
        <div className="inline-add">
          <input type="color" value={newColor.hex} onChange={(e) => setNewColor((n) => ({ ...n, hex: e.target.value }))} aria-label="Cor" />
          <input value={newColor.name} onChange={(e) => setNewColor((n) => ({ ...n, name: e.target.value }))} placeholder="Nova cor (ex.: Pink)" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addColor())} />
          <button type="button" className="icon-btn" onClick={addColor} aria-label="Adicionar cor"><Plus size={16} /></button>
        </div>
      </div>

      <h3 className="section-title">3. Quantidade em estoque por tamanho e cor</h3>
      <p className="muted small">Digite as quantidades. Toque no nome de uma cor ou tamanho para copiar o primeiro valor para a linha/coluna inteira.</p>
      <VariantMatrix sizes={sizes} colors={colors} values={qty} onChange={setQty} />

      <div className="mt">
        <Switch checked={form.active} onChange={(active) => setForm((f) => ({ ...f, active }))} label="Produto ativo" description="Produtos inativos não aparecem no PDV." />
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
    </Modal>
  )
}

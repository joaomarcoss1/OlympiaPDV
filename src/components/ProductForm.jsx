import { useMemo, useRef, useState } from 'react'
import { ImagePlus, Plus, X, Trash2 } from 'lucide-react'
import { Modal, Field, MoneyInput, ColorDot, Switch, confirmDialog } from './ui'
import VariantMatrix, { cellKey } from './VariantMatrix'
import { useStore } from '../store/StoreContext'
import { SIZE_PRESETS, COLOR_PRESETS, createProduct, buildVariants, applyStock, uid, nowIso, isColorLabel, productLabels } from '../store/model'
import { resizeImage } from '../utils/image'
import { money, round2 as r2 } from '../utils/format'

const SINGLE_SIZE = ['U']
const SINGLE_COLOR = [{ name: 'Único' }]

// Select com opção "+ Novo…" que vira um campo de texto.
function CreatableSelect({ value, onChange, options, emptyLabel, newLabel, creating, setCreating, disabled }) {
  if (creating !== null) {
    return (
      <div className="inline-input">
        <input value={creating} onChange={(e) => setCreating(e.target.value)} placeholder={newLabel} autoFocus />
        <button type="button" className="icon-btn" onClick={() => setCreating(null)} aria-label="Cancelar"><X size={16} /></button>
      </div>
    )
  }
  return (
    <select value={value || ''} disabled={disabled} onChange={(e) => (e.target.value === '__new' ? setCreating('') : onChange(e.target.value))}>
      <option value="">{emptyLabel}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      <option value="__new">+ {newLabel}</option>
    </select>
  )
}

// Chips com os valores de uma variação (tamanhos, cores, pesos, sabores…).
function ValuesEditor({ label, values, onChange, colorMode, presets }) {
  const [text, setText] = useState('')
  const [hex, setHex] = useState('#C9A23A')
  const names = values.map((v) => (typeof v === 'string' ? v : v.name))
  const add = () => {
    const name = text.trim()
    if (!name || names.some((n) => n.toLowerCase() === name.toLowerCase())) return setText('')
    onChange([...values, colorMode ? { name: name[0].toUpperCase() + name.slice(1), hex } : name])
    setText('')
  }
  const toggle = (item) => {
    const key = typeof item === 'string' ? item : item.name
    onChange(names.includes(key) ? values.filter((v) => (typeof v === 'string' ? v : v.name) !== key) : [...values, item])
  }
  const shown = colorMode
    ? [...COLOR_PRESETS, ...values.filter((v) => !COLOR_PRESETS.some((p) => p.name === v.name))]
    : [...new Set([...(presets || []), ...values])]
  return (
    <div className="option-row">
      {shown.map((item) => {
        const key = typeof item === 'string' ? item : item.name
        return (
          <button key={key} type="button" className={`chip ${names.includes(key) ? 'active' : ''}`} onClick={() => toggle(item)}>
            {colorMode && <ColorDot hex={item.hex} size={12} />} {key}
          </button>
        )
      })}
      <div className="inline-add">
        {colorMode && <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} aria-label="Cor" />}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Novo(a) ${label.toLowerCase()}`} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
        <button type="button" className="icon-btn" onClick={add} aria-label={`Adicionar ${label}`}><Plus size={16} /></button>
      </div>
    </div>
  )
}

// Cadastro de 1 modelo com todas as variações (ex.: tamanho × cor, peso × sabor) ou produto simples.
export default function ProductForm({ product, duplicateOf, onClose }) {
  const { db, update, user, toast } = useStore()
  const source = product || duplicateOf
  const types = db.productTypes || []
  const defaultType = types.find((t) => t.id === 'type-roupas') || types[0]
  const [form, setForm] = useState(() => ({
    name: source ? (duplicateOf ? `${source.name} (cópia)` : source.name) : '',
    typeId: source ? source.typeId || '' : defaultType?.id || '',
    brandId: source?.brandId || '',
    categoryId: source?.categoryId || '',
    subcategoryId: source?.subcategoryId || '',
    price: source?.price || 0,
    cost: source?.cost || 0,
    sku: product?.sku || '',
    barcode: product?.barcode || '',
    description: source?.description || '',
    image: source?.image || null,
    minStock: source?.minStock ?? '',
    active: product ? product.active : true,
  }))
  const [hasVariations, setHasVariations] = useState(source ? !source.simple : true)
  const [labels, setLabels] = useState(() => (source ? productLabels(source) : { ...(defaultType?.labels || { size: 'Tamanho', color: 'Cor' }) }))
  const [saveLabels, setSaveLabels] = useState(true)
  const [sizes, setSizes] = useState(() => (source && !source.simple ? source.sizes.filter((s) => s !== 'U') : source ? [] : ['P', 'M', 'G']))
  const [colors, setColors] = useState(() => (source && !source.simple ? source.colors.filter((c) => c.name !== 'Único') : source ? [] : [COLOR_PRESETS[0]]))
  const [qty, setQty] = useState(() => (product ? Object.fromEntries(product.variants.map((v) => [cellKey(v.color, v.size), v.stock || 0])) : {}))
  const [simpleQty, setSimpleQty] = useState(() => (product?.simple ? product.variants[0]?.stock || 0 : 0))
  const [newBrand, setNewBrand] = useState(null)
  const [newCat, setNewCat] = useState(null)
  const [newSub, setNewSub] = useState(null)
  const [newType, setNewType] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const topCats = db.categories.filter((c) => !c.parentId)
  const subCats = db.categories.filter((c) => c.parentId && c.parentId === form.categoryId)
  const margin = form.price > 0 && form.cost > 0 ? ((form.price - form.cost) / form.price) * 100 : null
  const sizeMode = labels.size.trim().toLowerCase().startsWith('tam')
  const colorMode = isColorLabel(labels.color)
  const effSizes = sizes.length ? sizes : SINGLE_SIZE
  const effColors = colors.length ? colors.map((c) => (typeof c === 'string' ? { name: c } : c)) : SINGLE_COLOR
  const typeName = types.find((t) => t.id === form.typeId)?.name

  function chooseType(typeId) {
    setForm((f) => ({ ...f, typeId }))
    const t = types.find((x) => x.id === typeId)
    if (!t) return
    const changed = t.labels.size !== labels.size || t.labels.color !== labels.color
    setLabels({ ...t.labels })
    if (changed && !product) {
      setSizes(t.labels.size.toLowerCase().startsWith('tam') ? ['P', 'M', 'G'] : [])
      setColors([])
      setQty({})
    }
  }

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
    if (newType !== null && !newType.trim()) return setError('Digite o nome do novo tipo ou cancele.')
    const skuTaken = form.sku.trim() && db.products.some((p) => p.id !== product?.id && p.sku.toUpperCase() === form.sku.trim().toUpperCase())
    if (skuTaken) return setError('Já existe um produto com este código.')

    const finalSizes = hasVariations ? effSizes : SINGLE_SIZE
    const finalColors = hasVariations ? effColors : SINGLE_COLOR
    const stockFor = (v) => (hasVariations ? qty[cellKey(v.color, v.size)] || 0 : simpleQty)
    const finalLabels = { size: labels.size.trim() || 'Variação 1', color: labels.color.trim() || 'Variação 2' }

    update((d) => {
      const byName = (list, name) => list.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
      let { brandId, categoryId, subcategoryId, typeId } = form
      if (newBrand?.trim()) {
        brandId = byName(d.brands, newBrand)?.id || uid()
        if (!d.brands.some((b) => b.id === brandId)) d.brands.push({ id: brandId, name: newBrand.trim() })
      }
      if (newCat?.trim()) {
        categoryId = byName(d.categories.filter((c) => !c.parentId), newCat)?.id || uid()
        if (!d.categories.some((c) => c.id === categoryId)) d.categories.push({ id: categoryId, name: newCat.trim(), parentId: null })
        subcategoryId = ''
      }
      if (newSub?.trim() && categoryId) {
        subcategoryId = byName(d.categories.filter((c) => c.parentId === categoryId), newSub)?.id || uid()
        if (!d.categories.some((c) => c.id === subcategoryId)) d.categories.push({ id: subcategoryId, name: newSub.trim(), parentId: categoryId })
      }
      if (newType?.trim()) {
        typeId = byName(d.productTypes, newType)?.id || uid()
        if (!d.productTypes.some((t) => t.id === typeId)) d.productTypes.push({ id: typeId, name: newType.trim(), labels: finalLabels })
      }
      // Os nomes das variações viram o padrão do tipo para os próximos cadastros.
      if (hasVariations && saveLabels && typeId) {
        const t = d.productTypes.find((x) => x.id === typeId)
        if (t) t.labels = finalLabels
      }
      const data = {
        ...form,
        brandId: brandId || null,
        categoryId: categoryId || null,
        subcategoryId: subcategoryId || null,
        typeId: typeId || null,
        labels: finalLabels,
        simple: !hasVariations,
        minStock: form.minStock === '' ? null : Number(form.minStock),
        name: form.name.trim(),
        price: r2(form.price),
        cost: r2(form.cost),
      }
      if (!product) {
        const p = createProduct(d, { ...data, sizes: finalSizes, colors: finalColors })
        p.active = form.active
        applyStock(d, p.id, p.variants.map((v) => ({ variantId: v.id, qty: stockFor(v) })), 'inicial', 'Estoque inicial no cadastro', user.id)
        return
      }
      const p = d.products.find((x) => x.id === product.id)
      Object.assign(p, data, { sku: data.sku.trim() || p.sku, updatedAt: nowIso() })
      // Variações removidas: zera o estoque antes (fica registrado no histórico).
      const removed = p.variants.filter((v) => !finalSizes.includes(v.size) || !finalColors.some((c) => c.name === v.color))
      applyStock(d, p.id, removed.map((v) => ({ variantId: v.id, qty: 0 })), 'ajuste', 'Variação removida do cadastro', user.id)
      p.sizes = finalSizes
      p.colors = finalColors
      p.variants = buildVariants(p, finalSizes, finalColors)
      applyStock(d, p.id, p.variants.map((v) => ({ variantId: v.id, qty: stockFor(v) })), 'ajuste', 'Ajuste no cadastro do produto', user.id)
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
      update((d) => { d.products = d.products.filter((x) => x.id !== product.id) })
      toast('Produto excluído.')
    }
    onClose()
  }

  return (
    <Modal
      title={product ? 'Editar produto' : 'Novo produto'}
      subtitle="Escolha o tipo do produto: as variações (tamanho e cor, peso e sabor…) já vêm prontas."
      onClose={onClose}
      size="xl"
      footer={
        <>
          {product && (
            <button className="btn btn-ghost btn-danger-text" onClick={remove}><Trash2 size={16} /> Excluir</button>
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, image: null }))}>Remover foto</button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onImage} />
        </div>

        <div className="form-grid pf-fields">
          <Field label="Nome do produto *" className="col-span-2">
            <input value={form.name} onChange={set('name')} autoFocus placeholder="Ex.: Legging Fusô Power, Barrinha Protein" />
          </Field>
          <Field label="Tipo de produto" hint="Define as variações (ex.: Roupas = tamanho e cor)">
            <CreatableSelect value={form.typeId} onChange={chooseType} options={types} emptyLabel="Sem tipo" newLabel="Novo tipo" creating={newType} setCreating={setNewType} />
          </Field>
          <Field label="Marca">
            <CreatableSelect value={form.brandId} onChange={(brandId) => setForm((f) => ({ ...f, brandId }))} options={db.brands} emptyLabel="Sem marca" newLabel="Nova marca" creating={newBrand} setCreating={setNewBrand} />
          </Field>
          <Field label="Categoria">
            <CreatableSelect value={form.categoryId} onChange={(categoryId) => setForm((f) => ({ ...f, categoryId, subcategoryId: '' }))} options={topCats} emptyLabel="Sem categoria" newLabel="Nova categoria" creating={newCat} setCreating={(v) => { setNewCat(v); setNewSub(null) }} />
          </Field>
          <Field label="Subcategoria">
            <CreatableSelect
              value={form.subcategoryId}
              onChange={(subcategoryId) => setForm((f) => ({ ...f, subcategoryId }))}
              options={newCat !== null ? [] : subCats}
              emptyLabel={form.categoryId || newCat ? 'Sem subcategoria' : 'Escolha a categoria antes'}
              newLabel="Nova subcategoria"
              creating={newSub}
              setCreating={setNewSub}
              disabled={!form.categoryId && !newCat}
            />
          </Field>
          <Field label="Preço de venda *">
            <MoneyInput value={form.price} onChange={(price) => setForm((f) => ({ ...f, price }))} />
          </Field>
          <Field label="Custo" hint={margin != null ? `Margem: ${margin.toFixed(0)}% · lucro ${money(form.price - form.cost)}` : 'Opcional — usado nos relatórios'}>
            <MoneyInput value={form.cost} onChange={(cost) => setForm((f) => ({ ...f, cost }))} />
          </Field>
          <Field label="Código (SKU)" hint={product ? undefined : 'Vazio = automático'}>
            <input value={form.sku} onChange={set('sku')} placeholder="Automático" />
          </Field>
          <Field label="Código de barras">
            <input value={form.barcode} onChange={set('barcode')} />
          </Field>
          <Field label="Avisar estoque baixo com" hint={`Vazio = padrão da loja (${db.settings.lowStockThreshold} un)`}>
            <input inputMode="numeric" value={form.minStock} onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value.replace(/\D/g, '') }))} placeholder={`${db.settings.lowStockThreshold}`} />
          </Field>
          <Field label="Descrição">
            <input value={form.description} onChange={set('description')} placeholder="Tecido, sabor, modelagem…" />
          </Field>
        </div>
      </div>

      <div className="variation-box">
        <Switch
          checked={hasVariations}
          onChange={setHasVariations}
          label="Este produto tem variações"
          description="Ex.: tamanho e cor, peso e sabor. Desligue para produtos únicos (garrafa, barrinha avulsa)."
        />
        {!hasVariations ? (
          <Field label="Quantidade em estoque" className="mt">
            <input inputMode="numeric" value={simpleQty || ''} placeholder="0" onChange={(e) => setSimpleQty(Number(e.target.value.replace(/\D/g, '')) || 0)} style={{ maxWidth: 180 }} />
          </Field>
        ) : (
          <>
            <div className="form-grid mt">
              <Field label="Nome da variação 1">
                <input value={labels.size} onChange={(e) => setLabels((l) => ({ ...l, size: e.target.value }))} placeholder="Tamanho, Peso…" />
              </Field>
              <Field label="Nome da variação 2">
                <input value={labels.color} onChange={(e) => setLabels((l) => ({ ...l, color: e.target.value }))} placeholder="Cor, Sabor…" />
              </Field>
            </div>
            {(form.typeId || newType) && (
              <label className="check">
                <input type="checkbox" checked={saveLabels} onChange={(e) => setSaveLabels(e.target.checked)} />
                Usar estes nomes como padrão para “{newType || typeName}”
              </label>
            )}

            <h3 className="section-title">1. {labels.size || 'Variação 1'}</h3>
            {sizeMode && (
              <div className="option-row">
                <span className="muted small">Atalhos:</span>
                {Object.keys(SIZE_PRESETS).filter((n) => n !== 'Único').map((name) => (
                  <button key={name} type="button" className="chip chip-sm" onClick={() => setSizes(SIZE_PRESETS[name])}>{name} ({SIZE_PRESETS[name].join(' ')})</button>
                ))}
              </div>
            )}
            <ValuesEditor label={labels.size || 'valor'} values={sizes} onChange={setSizes} presets={sizeMode ? SIZE_PRESETS.Letras : []} />

            <h3 className="section-title">2. {labels.color || 'Variação 2'}</h3>
            <ValuesEditor label={labels.color || 'valor'} values={colors} onChange={setColors} colorMode={colorMode} />

            <h3 className="section-title">3. Quantidade em estoque por {(labels.size || 'variação 1').toLowerCase()} e {(labels.color || 'variação 2').toLowerCase()}</h3>
            <p className="muted small">Pode deixar uma das variações vazia (ex.: whey só com sabor). Toque no nome de uma linha ou coluna para repetir o primeiro valor.</p>
            <VariantMatrix sizes={effSizes} colors={effColors} values={qty} onChange={setQty} labels={labels} />
          </>
        )}
      </div>

      <div className="mt">
        <Switch checked={form.active} onChange={(active) => setForm((f) => ({ ...f, active }))} label="Produto ativo" description="Produtos inativos não aparecem no PDV." />
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
    </Modal>
  )
}

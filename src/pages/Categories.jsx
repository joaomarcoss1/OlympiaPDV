import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, CornerDownRight, FolderTree, Tag } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { uid } from '../store/model'
import { PageHeader, confirmDialog } from '../components/ui'

function EditableRow({ name, count, onRename, onDelete, onAddChild, indent }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  return (
    <div className={`tree-row ${indent ? 'tree-child' : ''}`}>
      {indent && <CornerDownRight size={15} className="muted" />}
      {editing ? (
        <form className="inline-input grow" onSubmit={(e) => { e.preventDefault(); if (value.trim()) { onRename(value.trim()); setEditing(false) } }}>
          <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <button className="icon-btn" aria-label="Salvar"><Check size={16} /></button>
          <button type="button" className="icon-btn" onClick={() => { setValue(name); setEditing(false) }} aria-label="Cancelar"><X size={16} /></button>
        </form>
      ) : (
        <>
          <span className={`grow ${indent ? '' : 'tree-name'}`}>{name}</span>
          <span className="muted small">{count} {count === 1 ? 'produto' : 'produtos'}</span>
          {onAddChild && <button className="icon-btn" title="Adicionar subcategoria" onClick={onAddChild}><Plus size={16} /></button>}
          <button className="icon-btn" title="Renomear" onClick={() => setEditing(true)}><Pencil size={15} /></button>
          <button className="icon-btn" title="Excluir" onClick={onDelete}><Trash2 size={15} /></button>
        </>
      )}
    </div>
  )
}

function AddInline({ placeholder, onAdd, autoFocus, onCancel }) {
  const [value, setValue] = useState('')
  return (
    <form className="inline-add block" onSubmit={(e) => { e.preventDefault(); if (value.trim()) { onAdd(value.trim()); setValue('') } }}>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={(e) => e.key === 'Escape' && onCancel?.()} />
      <button className="btn btn-dark btn-sm"><Plus size={16} /> Adicionar</button>
    </form>
  )
}

export default function Categories() {
  const { db, update, toast } = useStore()
  const [addingTo, setAddingTo] = useState(null)
  const tops = db.categories.filter((c) => !c.parentId)
  const countCat = (id) => db.products.filter((p) => p.categoryId === id || p.subcategoryId === id).length
  const countBrand = (id) => db.products.filter((p) => p.brandId === id).length

  const addCat = (name, parentId = null) => update((d) => { d.categories.push({ id: uid(), name, parentId }) })
  const renameCat = (id, name) => update((d) => { d.categories.find((c) => c.id === id).name = name })
  async function deleteCat(c) {
    const n = countCat(c.id)
    const children = db.categories.filter((x) => x.parentId === c.id)
    const msg = `Excluir “${c.name}”${children.length ? ` e suas ${children.length} subcategorias` : ''}?${n ? ` ${n} produto(s) ficarão sem essa categoria.` : ''}`
    if (!(await confirmDialog({ title: 'Excluir categoria?', message: msg, confirmLabel: 'Excluir', danger: true }))) return
    const ids = new Set([c.id, ...children.map((x) => x.id)])
    update((d) => {
      d.categories = d.categories.filter((x) => !ids.has(x.id))
      for (const p of d.products) {
        if (ids.has(p.categoryId)) { p.categoryId = null; p.subcategoryId = null }
        if (ids.has(p.subcategoryId)) p.subcategoryId = null
      }
    })
    toast('Categoria excluída.')
  }

  const addBrand = (name) => {
    if (db.brands.some((b) => b.name.toLowerCase() === name.toLowerCase())) return toast('Essa marca já existe.', 'error')
    update((d) => { d.brands.push({ id: uid(), name }) })
  }
  const renameBrand = (id, name) => update((d) => { d.brands.find((b) => b.id === id).name = name })
  async function deleteBrand(b) {
    const n = countBrand(b.id)
    const ok = await confirmDialog({ title: 'Excluir marca?', message: `Excluir a marca “${b.name}”?${n ? ` ${n} produto(s) ficarão sem marca.` : ''}`, confirmLabel: 'Excluir', danger: true })
    if (!ok) return
    update((d) => {
      d.brands = d.brands.filter((x) => x.id !== b.id)
      for (const p of d.products) if (p.brandId === b.id) p.brandId = null
    })
  }

  return (
    <div className="page">
      <PageHeader title="Categorias e marcas" subtitle="Organize o catálogo para encontrar tudo rápido no PDV." />
      <div className="two-col">
        <section className="card pad">
          <h3 className="card-title"><FolderTree size={18} /> Categorias e subcategorias</h3>
          <AddInline placeholder="Nova categoria (ex.: Feminino)" onAdd={(n) => addCat(n)} />
          <div className="tree">
            {tops.map((c) => (
              <div key={c.id} className="tree-group">
                <EditableRow name={c.name} count={countCat(c.id)} onRename={(n) => renameCat(c.id, n)} onDelete={() => deleteCat(c)} onAddChild={() => setAddingTo(c.id)} />
                {db.categories.filter((s) => s.parentId === c.id).map((s) => (
                  <EditableRow key={s.id} indent name={s.name} count={countCat(s.id)} onRename={(n) => renameCat(s.id, n)} onDelete={() => deleteCat(s)} />
                ))}
                {addingTo === c.id && (
                  <div className="tree-child">
                    <AddInline placeholder={`Subcategoria de ${c.name}`} autoFocus onAdd={(n) => addCat(n, c.id)} onCancel={() => setAddingTo(null)} />
                  </div>
                )}
              </div>
            ))}
            {!tops.length && <p className="muted">Nenhuma categoria ainda.</p>}
          </div>
        </section>
        <section className="card pad">
          <h3 className="card-title"><Tag size={18} /> Marcas</h3>
          <AddInline placeholder="Nova marca" onAdd={addBrand} />
          <div className="tree">
            {db.brands.slice().sort((a, b) => a.name.localeCompare(b.name)).map((b) => (
              <EditableRow key={b.id} name={b.name} count={countBrand(b.id)} onRename={(n) => renameBrand(b.id, n)} onDelete={() => deleteBrand(b)} />
            ))}
            {!db.brands.length && <p className="muted">Nenhuma marca ainda.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}

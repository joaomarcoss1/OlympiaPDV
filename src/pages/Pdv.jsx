import { useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingBag, Trash2, Truck, X, Lock, CheckCircle2, Printer, PackageSearch, ChevronUp, Percent, PencilLine } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { openSession, cartTotals, finalizeSale, productStock, variantLabel, lowStockAfter, lowStockLimit } from '../store/model'
import { SearchInput, Stepper, Thumb, MoneyInput, Segmented, Field, Empty, ColorDot, Modal } from '../components/ui'
import CustomerSearch from '../components/CustomerSearch'
import AddressFields, { emptyAddress } from '../components/AddressFields'
import VariantPicker from '../components/pdv/VariantPicker'
import PaymentModal from '../components/pdv/PaymentModal'
import { OpenCashModal, AdminAuthModal } from '../components/CashModals'
import { money, normalize, maskPhone, pad, formatAddress } from '../utils/format'
import { printSale, printDeliverySlip } from '../utils/print'

const CART_KEY = 'olympia-pdv-cart'
const emptyDelivery = () => ({ recipient: '', phone: '', address: emptyAddress(), fee: 0, scheduled: '', notes: '' })
const emptyCart = () => ({ items: [], customer: null, discount: { type: 'R$', value: 0 }, deliveryOn: false, delivery: emptyDelivery() })

function usePersistentCart() {
  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem(CART_KEY)
      return raw ? { ...emptyCart(), ...JSON.parse(raw) } : emptyCart()
    } catch {
      return emptyCart()
    }
  })
  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch { /* sem acesso */ }
  }, [cart])
  return [cart, setCart]
}

export default function Pdv() {
  const { db, update, user, toast, reserveSaleNumber } = useStore()
  const [cart, setCart] = usePersistentCart()
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState(null)
  const [sub, setSub] = useState(null)
  const [type, setType] = useState(null)
  const [picking, setPicking] = useState(null)
  const [paying, setPaying] = useState(false)
  const [authNeeded, setAuthNeeded] = useState(false)
  const [authorizedBy, setAuthorizedBy] = useState(null)
  const [done, setDone] = useState(null)
  const [openingCash, setOpeningCash] = useState(false)
  const [mobileCart, setMobileCart] = useState(false)
  const searchRef = useRef(null)
  const finishing = useRef(false)

  const session = openSession(db)
  const { settings } = db
  const brands = useMemo(() => Object.fromEntries(db.brands.map((b) => [b.id, b.name])), [db.brands])
  const topCats = db.categories.filter((c) => !c.parentId)
  const usedTypes = (db.productTypes || []).filter((t) => db.products.some((p) => p.active && p.typeId === t.id))
  // Ao editar uma venda, as peças dela voltam ao estoque quando a edição é concluída.
  const returned = cart.editing?.returned || {}

  // Quantidade "ocupada" por variação: o que está no carrinho menos o que a venda editada devolve.
  const inCart = useMemo(() => {
    const m = Object.fromEntries(cart.items.map((i) => [i.variantId, i.qty]))
    for (const [k, v] of Object.entries(cart.editing?.returned || {})) m[k] = (m[k] || 0) - v
    return m
  }, [cart.items, cart.editing])

  const products = useMemo(() => {
    const t = normalize(query.trim())
    return db.products.filter((p) => {
      if (!p.active) return false
      if (type && p.typeId !== type) return false
      if (cat && p.categoryId !== cat) return false
      if (sub && p.subcategoryId !== sub) return false
      if (!t) return true
      const hay = normalize([p.name, p.sku, p.barcode, brands[p.brandId], ...p.variants.map((v) => v.sku)].join(' '))
      return t.split(/\s+/).every((w) => hay.includes(w))
    })
  }, [db.products, query, cat, sub, type, brands])

  const totals = cartTotals(cart.items, cart.discount, cart.deliveryOn ? cart.delivery.fee : 0)

  function addToCart(product, variant, qty) {
    const available = (variant.stock || 0) - (inCart[variant.id] || 0)
    if (!settings.allowNegativeStock && qty > available) {
      toast('Sem estoque suficiente para esta variação.', 'error')
      return
    }
    setCart((c) => {
      const existing = c.items.find((i) => i.variantId === variant.id)
      if (existing) return { ...c, items: c.items.map((i) => (i.variantId === variant.id ? { ...i, qty: i.qty + qty } : i)) }
      const color = product.colors.find((x) => x.name === variant.color)
      return {
        ...c,
        items: [
          ...c.items,
          {
            productId: product.id,
            variantId: variant.id,
            name: product.name,
            brand: brands[product.brandId] || '',
            variantLabel: variantLabel(variant),
            colorHex: color?.hex,
            sku: variant.sku,
            price: product.price,
            qty,
            image: product.image,
          },
        ],
      }
    })
    setPicking(null)
    setQuery('')
    searchRef.current?.focus()
  }

  function openProduct(p) {
    if (p.variants.length === 1) addToCart(p, p.variants[0], 1)
    else setPicking(p)
  }

  // Enter na busca: código exato de variação adiciona direto (leitor de código de barras).
  function onSearchEnter(e) {
    if (e.key !== 'Enter') return
    const t = query.trim().toUpperCase()
    if (!t) return
    for (const p of db.products) {
      const v = p.variants.find((x) => x.sku.toUpperCase() === t || (x.barcode && x.barcode === t))
      if (v && p.active) return addToCart(p, v, 1)
    }
    if (products.length === 1) openProduct(products[0])
  }

  function setQty(variantId, qty) {
    setCart((c) => ({ ...c, items: qty <= 0 ? c.items.filter((i) => i.variantId !== variantId) : c.items.map((i) => (i.variantId === variantId ? { ...i, qty } : i)) }))
  }

  function stockOf(item) {
    const p = db.products.find((x) => x.id === item.productId)
    return (p?.variants.find((v) => v.id === item.variantId)?.stock ?? 0) + (returned[item.variantId] || 0)
  }

  function setCustomer(c) {
    setCart((prev) => {
      const next = { ...prev, customer: c ? { id: c.id, name: c.name, phone: c.phone } : null }
      if (c && prev.deliveryOn && !prev.delivery.recipient) next.delivery = deliveryFromCustomer(c, prev.delivery)
      return next
    })
  }

  function deliveryFromCustomer(c, current) {
    return { ...current, recipient: c.name, phone: c.phone || '', address: { ...emptyAddress(), ...(c.address || {}) } }
  }

  function toggleDelivery(on) {
    setCart((prev) => {
      let delivery = prev.delivery
      if (on && !delivery.recipient && prev.customer) {
        const c = db.customers.find((x) => x.id === prev.customer.id)
        if (c) delivery = deliveryFromCustomer(c, delivery)
      }
      if (on && !delivery.fee && settings.defaultDeliveryFee) delivery = { ...delivery, fee: settings.defaultDeliveryFee }
      return { ...prev, deliveryOn: on, delivery }
    })
  }

  function startPayment() {
    if (!cart.items.length) return
    if (!session) return setOpeningCash(true)
    if (cart.deliveryOn) {
      const d = cart.delivery
      if (!d.recipient.trim() || !d.address.street.trim()) {
        toast('Preencha o destinatário e o endereço da entrega.', 'error')
        setMobileCart(true)
        return
      }
    }
    if (user.role !== 'admin' && totals.discountPercent > settings.sellerMaxDiscount + 0.001 && !authorizedBy) {
      setAuthNeeded(true)
      return
    }
    setPaying(true)
  }

  async function confirmSale(payments, notes, paymentDiscount) {
    if (finishing.current) return
    finishing.current = true
    const number = cart.editing ? undefined : await reserveSaleNumber()
    finishing.current = false
    try {
      const { sale, low } = update((d) => {
        const sale = finalizeSale(d, {
          cart: cart.items,
          discount: cart.discount,
          customer: cart.customer,
          delivery: cart.deliveryOn ? { ...cart.delivery, phone: cart.delivery.phone } : null,
          payments,
          userId: user.id,
          notes,
          authorizedBy: authorizedBy?.id,
          number,
          paymentDiscount,
          replaces: cart.editing?.saleId,
        })
        return { sale, low: lowStockAfter(d, sale.items) }
      })
      setPaying(false)
      setCart(emptyCart())
      setAuthorizedBy(null)
      setMobileCart(false)
      setDone(sale)
      if (settings.autoPrint) setTimeout(() => printSale(sale, db), 250)
      if (low.length) setTimeout(() => toast(`Estoque baixo: ${low.join(', ')}`, 'warn'), 600)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  // Atalhos: F2 finalizar, F4 ou / para buscar.
  useEffect(() => {
    const onKey = (e) => {
      if (document.body.classList.contains('modal-open')) return
      if (e.key === 'F2') {
        e.preventDefault()
        startPayment()
      } else if (e.key === 'F4' || (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="pdv">
      <nav className="pdv-filters" aria-label="Filtros">
        <button className={`filter-item ${!cat && !type ? 'active' : ''}`} onClick={() => { setCat(null); setSub(null); setType(null) }}>Todos os produtos</button>
        {usedTypes.length > 0 && <div className="filter-title">Tipo de produto</div>}
        {usedTypes.map((t) => (
          <button key={t.id} className={`filter-item ${type === t.id ? 'active' : ''}`} onClick={() => setType(type === t.id ? null : t.id)}>{t.name}</button>
        ))}
        {topCats.length > 0 && <div className="filter-title">Categorias</div>}
        {topCats.map((c) => (
          <div key={c.id}>
            <button className={`filter-item ${cat === c.id && !sub ? 'active' : ''}`} onClick={() => { setCat(cat === c.id && !sub ? null : c.id); setSub(null) }}>{c.name}</button>
            {cat === c.id && db.categories.filter((x) => x.parentId === c.id).map((x) => (
              <button key={x.id} className={`filter-item filter-sub ${sub === x.id ? 'active' : ''}`} onClick={() => setSub(sub === x.id ? null : x.id)}>{x.name}</button>
            ))}
          </div>
        ))}
      </nav>
      <section className="pdv-catalog">
        {!session && (
          <div className="banner banner-warn">
            <Lock size={18} />
            <span>O caixa está fechado. Abra o caixa para começar a vender.</span>
            <button className="btn btn-dark btn-sm" onClick={() => setOpeningCash(true)}>Abrir caixa</button>
          </div>
        )}
        <div className="pdv-search">
          <SearchInput
            inputRef={searchRef}
            value={query}
            onChange={setQuery}
            onKeyDown={onSearchEnter}
            autoFocus
            placeholder="Buscar produto, marca ou código… (F4)"
            className="search-lg"
          />
        </div>
        {products.length === 0 ? (
          <Empty icon={<PackageSearch size={28} />} title="Nenhum produto encontrado">
            Tente outro termo ou limpe os filtros.
          </Empty>
        ) : (
          <div className="product-grid">
            {products.map((p) => {
              const stock = productStock(p)
              return (
                <button key={p.id} className={`product-card ${stock <= 0 ? 'is-out' : ''}`} onClick={() => openProduct(p)}>
                  <div className="product-img">
                    {p.image ? <img src={p.image} alt="" /> : <span className="product-initials">{p.name.slice(0, 2).toUpperCase()}</span>}
                    <span className={`stock-pill ${stock <= 0 ? 'out' : stock <= lowStockLimit(p, settings) ? 'low' : ''}`}>{stock <= 0 ? 'Esgotado' : `${stock} un`}</span>
                  </div>
                  <div className="product-info">
                    {brands[p.brandId] && <span className="product-brand">{brands[p.brandId]}</span>}
                    <span className="product-name">{p.name}</span>
                    <div className="product-bottom">
                      <strong>{money(p.price)}</strong>
                      <span className="dots">
                        {p.colors.slice(0, 4).map((c) => <ColorDot key={c.name} hex={c.hex} size={11} />)}
                        {p.colors.length > 4 && <span className="muted small">+{p.colors.length - 4}</span>}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <aside className={`cart ${mobileCart ? 'open' : ''}`}>
        <div className="cart-head">
          <h2>
            <ShoppingBag size={20} /> Venda atual
          </h2>
          <div className="cart-head-actions">
            {cart.items.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setCart(emptyCart()); setAuthorizedBy(null) }}>
                Limpar
              </button>
            )}
            <button className="icon-btn cart-close" onClick={() => setMobileCart(false)} aria-label="Fechar carrinho">
              <X size={20} />
            </button>
          </div>
        </div>
        {cart.editing && (
          <div className="banner banner-warn editing-banner">
            <PencilLine size={16} />
            <span>Editando a venda #{pad(cart.editing.number)}. Ao concluir, ela é substituída.</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setCart(emptyCart())}>Cancelar edição</button>
          </div>
        )}

        <div className="cart-scroll">
          <div className="cart-block">
            {cart.customer ? (
              <div className="customer-chip">
                <div className="avatar avatar-sm">{cart.customer.name[0]}</div>
                <div>
                  <strong>{cart.customer.name}</strong>
                  <span className="muted small">{maskPhone(cart.customer.phone) || 'Cliente'}</span>
                </div>
                <button className="icon-btn" onClick={() => setCustomer(null)} aria-label="Remover cliente">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <CustomerSearch onSelect={setCustomer} placeholder="Cliente (opcional) — buscar ou cadastrar" />
            )}
          </div>

          {cart.items.length === 0 ? (
            <div className="cart-empty">
              <ShoppingBag size={34} />
              <p>Toque em um produto para adicionar.</p>
              <span className="muted small">Atalhos: F4 busca · F2 finaliza</span>
            </div>
          ) : (
            <ul className="cart-items">
              {cart.items.map((i) => (
                <li key={i.variantId} className="cart-item">
                  <Thumb src={i.image} name={i.name} size={42} />
                  <div className="cart-item-info">
                    <strong>{i.name}</strong>
                    <span className="muted small">
                      {i.colorHex && <ColorDot hex={i.colorHex} size={10} />} {i.variantLabel} · {money(i.price)}
                    </span>
                    <div className="cart-item-row">
                      <Stepper small value={i.qty} min={0} max={settings.allowNegativeStock ? 999 : stockOf(i)} onChange={(q) => setQty(i.variantId, q)} />
                      <strong>{money(i.price * i.qty)}</strong>
                    </div>
                  </div>
                  <button className="icon-btn" onClick={() => setQty(i.variantId, 0)} aria-label="Remover item">
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {cart.items.length > 0 && (
            <>
              <div className="cart-block cart-discount">
                <span className="cart-label"><Percent size={16} /> Desconto</span>
                <Segmented
                  size="sm"
                  value={cart.discount.type}
                  onChange={(type) => setCart((c) => ({ ...c, discount: { type, value: 0 } }))}
                  options={[{ value: 'R$', label: 'R$' }, { value: '%', label: '%' }]}
                />
                <MoneyInput
                  prefix={cart.discount.type === '%' ? '%' : 'R$'}
                  value={cart.discount.value}
                  onChange={(value) => {
                    setAuthorizedBy(null)
                    setCart((c) => ({ ...c, discount: { ...c.discount, value } }))
                  }}
                  placeholder="0"
                />
              </div>
              {user.role !== 'admin' && totals.discountPercent > settings.sellerMaxDiscount && (
                <div className="hint-line">Acima de {settings.sellerMaxDiscount}% precisa de autorização do administrador.</div>
              )}

              <div className={`delivery-box ${cart.deliveryOn ? 'on' : ''}`}>
                <button type="button" className="delivery-toggle" onClick={() => toggleDelivery(!cart.deliveryOn)} aria-expanded={cart.deliveryOn}>
                  <Truck size={20} />
                  <span>
                    <strong>É para entrega?</strong>
                    <span className="muted small">{cart.deliveryOn ? 'Preencha os dados abaixo' : 'Toque para adicionar endereço e destinatário'}</span>
                  </span>
                  <span className={`switch ${cart.deliveryOn ? 'on' : ''}`}><span className="knob" /></span>
                </button>
                {cart.deliveryOn && (
                  <DeliveryForm
                    delivery={cart.delivery}
                    onChange={(delivery) => setCart((c) => ({ ...c, delivery }))}
                    onPickCustomer={(c) =>
                      setCart((prev) => ({
                        ...prev,
                        customer: prev.customer || { id: c.id, name: c.name, phone: c.phone },
                        delivery: deliveryFromCustomer(c, prev.delivery),
                      }))
                    }
                  />
                )}
              </div>
            </>
          )}
        </div>

        <div className="cart-foot">
          <div className="totals">
            <div><span>Subtotal · {totals.items} {totals.items === 1 ? 'item' : 'itens'}</span><span>{money(totals.subtotal)}</span></div>
            {totals.discountAmount > 0 && <div className="t-discount"><span>Desconto</span><span>− {money(totals.discountAmount)}</span></div>}
            {totals.deliveryFee > 0 && <div><span>Entrega</span><span>{money(totals.deliveryFee)}</span></div>}
            <div className="t-total"><span>Total</span><span>{money(totals.total)}</span></div>
          </div>
          <button className="btn btn-primary btn-xl btn-block" disabled={!cart.items.length} onClick={startPayment}>
            {session ? 'Finalizar venda' : 'Abrir caixa para vender'} <kbd>F2</kbd>
          </button>
        </div>
      </aside>

      {cart.items.length > 0 && !mobileCart && (
        <button className="cart-fab" onClick={() => setMobileCart(true)}>
          <ShoppingBag size={20} />
          <span>{totals.items} {totals.items === 1 ? 'item' : 'itens'}</span>
          <strong>{money(totals.total)}</strong>
          <ChevronUp size={18} />
        </button>
      )}

      {picking && (
        <VariantPicker
          product={picking}
          brandName={brands[picking.brandId]}
          inCart={inCart}
          allowNegative={settings.allowNegativeStock}
          onAdd={(v, q) => addToCart(picking, v, q)}
          onClose={() => setPicking(null)}
        />
      )}
      {openingCash && <OpenCashModal onClose={() => setOpeningCash(false)} />}
      {authNeeded && (
        <AdminAuthModal
          reason={`Desconto de ${totals.discountPercent.toFixed(1)}% (limite do vendedor: ${settings.sellerMaxDiscount}%).`}
          onClose={() => setAuthNeeded(false)}
          onAuthorized={(admin) => {
            setAuthorizedBy(admin)
            setAuthNeeded(false)
            setPaying(true)
          }}
        />
      )}
      {paying && <PaymentModal total={totals.total} discountBase={totals.total - totals.deliveryFee} settings={settings} onClose={() => setPaying(false)} onConfirm={confirmSale} />}
      {done && <SaleDone sale={done} onClose={() => { setDone(null); setTimeout(() => searchRef.current?.focus(), 0) }} />}
    </div>
  )
}

function DeliveryForm({ delivery, onChange, onPickCustomer }) {
  const set = (k, mask) => (e) => onChange({ ...delivery, [k]: mask ? mask(e.target.value) : e.target.value })
  return (
    <div className="delivery-form">
      <CustomerSearch onSelect={onPickCustomer} placeholder="Buscar cliente cadastrado e preencher" />
      <div className="divider-text">ou preencha</div>
      <div className="form-grid">
        <Field label="Destinatário *" className="col-span-2">
          <input value={delivery.recipient} onChange={set('recipient')} />
        </Field>
        <Field label="Telefone">
          <input value={delivery.phone} onChange={set('phone', maskPhone)} inputMode="tel" />
        </Field>
        <Field label="Taxa de entrega">
          <MoneyInput value={delivery.fee} onChange={(fee) => onChange({ ...delivery, fee })} />
        </Field>
      </div>
      <AddressFields value={delivery.address} onChange={(address) => onChange({ ...delivery, address })} />
      <div className="form-grid">
        <Field label="Previsão / horário">
          <input value={delivery.scheduled} onChange={set('scheduled')} placeholder="Hoje, 15h–18h" />
        </Field>
        <Field label="Obs. para entrega">
          <input value={delivery.notes} onChange={set('notes')} placeholder="Interfone 12…" />
        </Field>
      </div>
    </div>
  )
}

function SaleDone({ sale, onClose }) {
  const { db } = useStore()
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <Modal title="Venda concluída" onClose={onClose} size="sm">
      <div className="done">
        <CheckCircle2 size={56} className="done-icon" />
        <div className="done-number">Pedido nº {pad(sale.number)}</div>
        <div className="done-total">{money(sale.total)}</div>
        {sale.change > 0 && <div className="done-change">Troco: {money(sale.change)}</div>}
        {sale.delivery && <p className="muted small">Entrega para {sale.delivery.recipient} · {formatAddress(sale.delivery.address)}</p>}
        <p className="muted small">Pedido salvo automaticamente no histórico de vendas.</p>
        <div className="done-actions">
          <button className="btn btn-outline" onClick={() => printSale(sale, db, { withDeliveryCopy: false })}>
            <Printer size={18} /> Imprimir cupom
          </button>
          {sale.delivery && (
            <button className="btn btn-outline" onClick={() => printDeliverySlip(sale, db)}>
              <Truck size={18} /> Via de entrega
            </button>
          )}
        </div>
        <button className="btn btn-primary btn-lg btn-block" onClick={onClose} autoFocus>
          Nova venda <kbd>Enter</kbd>
        </button>
      </div>
    </Modal>
  )
}

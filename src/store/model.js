import { round2, normalize } from '../utils/format'

export const SCHEMA_VERSION = 1

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))

export const nowIso = () => new Date().toISOString()

export const PAYMENT_METHODS = [
  { id: 'dinheiro', label: 'Dinheiro', short: 'Dinheiro' },
  { id: 'pix', label: 'PIX', short: 'PIX' },
  { id: 'credito', label: 'Cartão de crédito', short: 'Crédito' },
  { id: 'debito', label: 'Cartão de débito', short: 'Débito' },
  { id: 'vale', label: 'Vale-troca / crédito loja', short: 'Vale' },
]
export const methodLabel = (id) => PAYMENT_METHODS.find((m) => m.id === id)?.short || id

export const SIZE_PRESETS = {
  Letras: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
  Números: ['34', '36', '38', '40', '42', '44', '46'],
  Único: ['U'],
}

export const COLOR_PRESETS = [
  { name: 'Preto', hex: '#111111' },
  { name: 'Branco', hex: '#FFFFFF' },
  { name: 'Cinza', hex: '#9AA0A6' },
  { name: 'Grafite', hex: '#4A4D52' },
  { name: 'Bege', hex: '#D9C3A5' },
  { name: 'Rosa', hex: '#F2A7C3' },
  { name: 'Vermelho', hex: '#D7263D' },
  { name: 'Vinho', hex: '#6E1A2B' },
  { name: 'Azul', hex: '#2F6FED' },
  { name: 'Marinho', hex: '#1B2A4A' },
  { name: 'Verde', hex: '#2E9E6A' },
  { name: 'Militar', hex: '#5B6B3A' },
  { name: 'Lilás', hex: '#B39DDB' },
  { name: 'Dourado', hex: '#C9A23A' },
]

export const DELIVERY_STATUS = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'em_rota', label: 'Saiu p/ entrega' },
  { id: 'entregue', label: 'Entregue' },
]

export const STOCK_MOVE_TYPES = {
  inicial: 'Estoque inicial',
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
  venda: 'Venda',
  cancelamento: 'Cancelamento de venda',
}

// ---------------------------------------------------------------------------
// Permissões
// ---------------------------------------------------------------------------
const SELLER_PERMS = new Set(['dashboard', 'pdv', 'sales', 'customers', 'cash', 'stock.view', 'products.view'])
export function can(user, perm) {
  if (!user) return false
  if (user.role === 'admin') return true
  return SELLER_PERMS.has(perm)
}

// ---------------------------------------------------------------------------
// Senhas
// ---------------------------------------------------------------------------
export async function hashPassword(password) {
  const text = `olympia::${password}`
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `djb2-${h >>> 0}`
}

// ---------------------------------------------------------------------------
// Estrutura inicial
// ---------------------------------------------------------------------------
export function emptyDb() {
  return {
    version: SCHEMA_VERSION,
    createdAt: nowIso(),
    settings: {
      storeName: 'Olympia Body Fitness',
      legalName: '',
      cnpj: '',
      phone: '',
      instagram: '@olympiabodyfitness',
      address: '',
      logo: null,
      receiptFooter: 'Obrigado pela preferência! Trocas em até 30 dias com etiqueta e nota.',
      receiptWidth: '80mm',
      autoPrint: true,
      printDeliveryCopy: true,
      allowNegativeStock: false,
      sellerMaxDiscount: 10,
      lowStockThreshold: 2,
      maxInstallments: 6,
      defaultDeliveryFee: 0,
      enabledMethods: PAYMENT_METHODS.map((m) => m.id),
      nextSaleNumber: 1,
      nextProductCode: 1,
    },
    users: [],
    categories: [],
    brands: [],
    products: [],
    stockMoves: [],
    customers: [],
    sales: [],
    cashSessions: [],
    cashMoves: [],
  }
}

export function seedCatalog(db, userId) {
  const cat = (name, parentId = null) => {
    const c = { id: uid(), name, parentId }
    db.categories.push(c)
    return c
  }
  const fem = cat('Feminino')
  const legg = cat('Leggings', fem.id)
  const tops = cat('Tops', fem.id)
  const shorts = cat('Shorts', fem.id)
  cat('Conjuntos', fem.id)
  const masc = cat('Masculino')
  const camisetas = cat('Camisetas', masc.id)
  cat('Bermudas', masc.id)
  cat('Regatas', masc.id)
  const acess = cat('Acessórios')
  const garrafas = cat('Garrafas', acess.id)
  cat('Meias', acess.id)
  cat('Bonés', acess.id)

  const brand = (name) => {
    const b = { id: uid(), name }
    db.brands.push(b)
    return b
  }
  const olympia = brand('Olympia')
  const alto = brand('Alto Giro')
  const live = brand('Live!')

  const color = (name) => COLOR_PRESETS.find((c) => c.name === name)
  const samples = [
    { name: 'Legging Fusô Power', brandId: olympia.id, categoryId: fem.id, subcategoryId: legg.id, price: 119.9, cost: 52, sizes: ['P', 'M', 'G', 'GG'], colors: ['Preto', 'Marinho', 'Vinho'], qty: 4 },
    { name: 'Top Strappy Gold', brandId: olympia.id, categoryId: fem.id, subcategoryId: tops.id, price: 79.9, cost: 31, sizes: ['P', 'M', 'G'], colors: ['Preto', 'Branco', 'Dourado'], qty: 3 },
    { name: 'Short Saia Fitness', brandId: live.id, categoryId: fem.id, subcategoryId: shorts.id, price: 89.9, cost: 40, sizes: ['P', 'M', 'G'], colors: ['Preto', 'Rosa'], qty: 2 },
    { name: 'Camiseta Dry Fit Olympia', brandId: olympia.id, categoryId: masc.id, subcategoryId: camisetas.id, price: 69.9, cost: 25, sizes: ['P', 'M', 'G', 'GG'], colors: ['Preto', 'Cinza', 'Branco'], qty: 5 },
    { name: 'Legging Cintura Alta Seamless', brandId: alto.id, categoryId: fem.id, subcategoryId: legg.id, price: 149.9, cost: 70, sizes: ['P', 'M', 'G'], colors: ['Grafite', 'Militar', 'Lilás'], qty: 2 },
    { name: 'Garrafa Térmica 750ml', brandId: olympia.id, categoryId: acess.id, subcategoryId: garrafas.id, price: 59.9, cost: 22, sizes: ['U'], colors: ['Preto', 'Dourado'], qty: 8 },
  ]
  for (const s of samples) {
    const product = createProduct(db, {
      name: s.name,
      brandId: s.brandId,
      categoryId: s.categoryId,
      subcategoryId: s.subcategoryId,
      price: s.price,
      cost: s.cost,
      description: '',
      image: null,
      sizes: s.sizes,
      colors: s.colors.map(color),
    })
    const entries = product.variants.map((v, i) => ({ variantId: v.id, qty: Math.max(0, s.qty - (i % 3)) }))
    applyStock(db, product.id, entries, 'inicial', 'Estoque inicial (exemplo)', userId)
  }

  db.customers.push({
    id: uid(),
    name: 'Cliente Exemplo',
    phone: '(11) 99999-0000',
    cpf: '',
    email: '',
    birth: '',
    address: { cep: '01310-100', street: 'Av. Paulista', number: '1000', complement: 'Apto 12', district: 'Bela Vista', city: 'São Paulo', state: 'SP', reference: '' },
    notes: '',
    createdAt: nowIso(),
  })
}

// ---------------------------------------------------------------------------
// Produtos / variações
// ---------------------------------------------------------------------------
const colorCode = (name) => normalize(name).replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase() || 'COR'

export function variantSku(baseSku, color, size) {
  return [baseSku, colorCode(color), size].filter(Boolean).join('-')
}

export function nextProductSku(db) {
  const n = db.settings.nextProductCode || 1
  db.settings.nextProductCode = n + 1
  return `OLY${String(n).padStart(4, '0')}`
}

// Garante uma variação para cada combinação cor × tamanho, preservando estoque das existentes.
export function buildVariants(product, sizes, colors) {
  const existing = product.variants || []
  const result = []
  for (const c of colors) {
    for (const size of sizes) {
      const found = existing.find((v) => v.size === size && v.color === c.name)
      result.push(found ? { ...found, sku: variantSku(product.sku, c.name, size) } : { id: uid(), size, color: c.name, sku: variantSku(product.sku, c.name, size), stock: 0 })
    }
  }
  return result
}

export function createProduct(db, data) {
  const sku = data.sku?.trim() || nextProductSku(db)
  const product = {
    id: uid(),
    sku,
    barcode: data.barcode || '',
    name: data.name.trim(),
    brandId: data.brandId || null,
    categoryId: data.categoryId || null,
    subcategoryId: data.subcategoryId || null,
    price: round2(data.price),
    cost: round2(data.cost),
    description: data.description || '',
    image: data.image || null,
    sizes: data.sizes,
    colors: data.colors,
    variants: [],
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  product.variants = buildVariants(product, data.sizes, data.colors)
  db.products.push(product)
  return product
}

export const productStock = (p) => p.variants.reduce((s, v) => s + (v.stock || 0), 0)

export function findVariant(db, productId, variantId) {
  const product = db.products.find((p) => p.id === productId)
  const variant = product?.variants.find((v) => v.id === variantId)
  return { product, variant }
}

export function variantLabel(v) {
  if (!v) return ''
  return [v.color, v.size !== 'U' ? v.size : null].filter(Boolean).join(' / ')
}

// entries: [{ variantId, qty }] — qty com sinal (positivo entra, negativo sai).
// Para type 'ajuste', qty é a contagem final desejada.
export function applyStock(db, productId, entries, type, reason, userId, extra = {}) {
  const product = db.products.find((p) => p.id === productId)
  if (!product) return
  const date = nowIso()
  for (const e of entries) {
    const v = product.variants.find((x) => x.id === e.variantId)
    if (!v) continue
    const before = v.stock || 0
    const after = type === 'ajuste' ? Math.round(e.qty) : before + Math.round(e.qty)
    const delta = after - before
    if (delta === 0) continue
    v.stock = after
    db.stockMoves.push({
      id: uid(),
      date,
      type,
      productId,
      variantId: v.id,
      productName: product.name,
      variantLabel: variantLabel(v),
      qty: delta,
      before,
      after,
      reason: reason || '',
      userId,
      ...extra,
    })
  }
  product.updatedAt = date
}

// ---------------------------------------------------------------------------
// Caixa
// ---------------------------------------------------------------------------
export const openSession = (db) => db.cashSessions.find((s) => s.status === 'aberto') || null

export function openCash(db, { amount, userId, notes }) {
  if (openSession(db)) throw new Error('Já existe um caixa aberto.')
  const session = { id: uid(), status: 'aberto', openedAt: nowIso(), openedBy: userId, openingAmount: round2(amount), notes: notes || '' }
  db.cashSessions.push(session)
  return session
}

export function addCashMove(db, { sessionId, type, method = 'dinheiro', amount, description, userId, saleId = null }) {
  const move = { id: uid(), sessionId, date: nowIso(), type, method, amount: round2(amount), description: description || '', userId, saleId }
  db.cashMoves.push(move)
  return move
}

export function sessionSummary(db, sessionId) {
  const session = db.cashSessions.find((s) => s.id === sessionId)
  const moves = db.cashMoves.filter((m) => m.sessionId === sessionId)
  const byMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.id, 0]))
  let suprimentos = 0
  let sangrias = 0
  let estornos = 0
  let cashIn = 0
  let cashOut = 0
  for (const m of moves) {
    if (m.type === 'venda') byMethod[m.method] = round2((byMethod[m.method] || 0) + m.amount)
    if (m.type === 'estorno') {
      byMethod[m.method] = round2((byMethod[m.method] || 0) - m.amount)
      estornos += m.amount
    }
    if (m.type === 'suprimento') suprimentos += m.amount
    if (m.type === 'sangria') sangrias += m.amount
    if (m.method === 'dinheiro') {
      if (m.type === 'venda' || m.type === 'suprimento') cashIn += m.amount
      else cashOut += m.amount
    }
  }
  const salesTotal = round2(Object.values(byMethod).reduce((a, b) => a + b, 0))
  const salesCount = db.sales.filter((s) => s.cashSessionId === sessionId && s.status === 'concluida').length
  const expectedCash = round2((session?.openingAmount || 0) + cashIn - cashOut)
  return {
    session,
    moves,
    byMethod,
    suprimentos: round2(suprimentos),
    sangrias: round2(sangrias),
    estornos: round2(estornos),
    salesTotal,
    salesCount,
    expectedCash,
  }
}

export function closeCash(db, { sessionId, countedCash, userId, notes }) {
  const session = db.cashSessions.find((s) => s.id === sessionId)
  if (!session || session.status !== 'aberto') throw new Error('Caixa não está aberto.')
  const summary = sessionSummary(db, sessionId)
  Object.assign(session, {
    status: 'fechado',
    closedAt: nowIso(),
    closedBy: userId,
    countedCash: round2(countedCash),
    expectedCash: summary.expectedCash,
    difference: round2(countedCash - summary.expectedCash),
    byMethod: summary.byMethod,
    salesTotal: summary.salesTotal,
    salesCount: summary.salesCount,
    closingNotes: notes || '',
  })
  return session
}

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------
export function cartTotals(cart, discount, deliveryFee = 0) {
  const subtotal = round2(cart.reduce((s, i) => s + i.price * i.qty, 0))
  const value = Number(discount?.value) || 0
  let discountAmount = discount?.type === '%' ? round2((subtotal * value) / 100) : round2(value)
  discountAmount = Math.min(Math.max(discountAmount, 0), subtotal)
  const discountPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0
  const fee = round2(deliveryFee || 0)
  const total = round2(subtotal - discountAmount + fee)
  return { subtotal, discountAmount, discountPercent, deliveryFee: fee, total, items: cart.reduce((s, i) => s + i.qty, 0) }
}

// number: número reservado no servidor (vários caixas); sem ele, usa o contador local.
export function finalizeSale(db, { cart, discount, customer, delivery, payments, userId, notes, authorizedBy, number: reserved }) {
  const session = openSession(db)
  if (!session) throw new Error('Abra o caixa antes de vender.')
  if (!cart.length) throw new Error('Carrinho vazio.')
  const totals = cartTotals(cart, discount, delivery?.fee)
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0))
  if (paid + 0.001 < totals.total) throw new Error('Pagamento insuficiente.')

  let number = reserved
  if (!number) {
    number = Math.max(db.settings.nextSaleNumber || 1, ...db.sales.map((s) => s.number + 1))
    db.settings.nextSaleNumber = number + 1
  }
  const change = round2(payments.reduce((s, p) => s + (p.change || 0), 0))

  const sale = {
    id: uid(),
    number,
    date: nowIso(),
    userId,
    cashSessionId: session.id,
    customerId: customer?.id || null,
    customerName: customer?.name || '',
    customerPhone: customer?.phone || '',
    items: cart.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      brand: i.brand || '',
      variantLabel: i.variantLabel,
      sku: i.sku,
      qty: i.qty,
      price: round2(i.price),
      total: round2(i.price * i.qty),
    })),
    subtotal: totals.subtotal,
    discount: { type: discount?.type || 'R$', value: Number(discount?.value) || 0, amount: totals.discountAmount },
    deliveryFee: totals.deliveryFee,
    total: totals.total,
    payments: payments.map((p) => ({ method: p.method, amount: round2(p.amount), received: p.received ? round2(p.received) : undefined, change: p.change ? round2(p.change) : undefined, installments: p.installments || undefined })),
    change,
    delivery: delivery ? { ...delivery, status: 'pendente' } : null,
    notes: notes || '',
    authorizedBy: authorizedBy || null,
    status: 'concluida',
  }
  db.sales.push(sale)

  for (const item of sale.items) {
    applyStock(db, item.productId, [{ variantId: item.variantId, qty: -item.qty }], 'venda', `Venda #${number}`, userId, { saleId: sale.id })
  }
  for (const p of sale.payments) {
    addCashMove(db, { sessionId: session.id, type: 'venda', method: p.method, amount: p.amount, description: `Venda #${number}`, userId, saleId: sale.id })
  }
  if (customer?.id) {
    const c = db.customers.find((x) => x.id === customer.id)
    if (c) c.lastPurchaseAt = sale.date
  }
  return sale
}

export function cancelSale(db, { saleId, userId, reason, refund }) {
  const sale = db.sales.find((s) => s.id === saleId)
  if (!sale || sale.status === 'cancelada') throw new Error('Venda não encontrada ou já cancelada.')
  sale.status = 'cancelada'
  sale.cancelledAt = nowIso()
  sale.cancelledBy = userId
  sale.cancelReason = reason || ''
  for (const item of sale.items) {
    applyStock(db, item.productId, [{ variantId: item.variantId, qty: item.qty }], 'cancelamento', `Cancelamento venda #${sale.number}`, userId, { saleId })
  }
  const session = openSession(db)
  if (refund && session) {
    for (const p of sale.payments) {
      addCashMove(db, { sessionId: session.id, type: 'estorno', method: p.method, amount: p.amount, description: `Estorno venda #${sale.number}`, userId, saleId })
    }
    sale.refundedInSession = session.id
  }
  return sale
}

import { useMemo } from 'react'
import { ShoppingCart, TrendingUp, Receipt, Wallet, Truck, AlertTriangle, Trophy } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { openSession, sessionSummary, PAYMENT_METHODS, can } from '../store/model'
import { PageHeader, Stat, Badge, Empty } from '../components/ui'
import { money, startOfDay, addDays, pad, formatAddress } from '../utils/format'

export default function Dashboard() {
  const { db, user } = useStore()
  const session = openSession(db)
  const summary = session ? sessionSummary(db, session.id) : null
  const done = useMemo(() => db.sales.filter((s) => s.status === 'concluida'), [db.sales])

  const today = startOfDay()
  const todaySales = done.filter((s) => new Date(s.date) >= today)
  const todayTotal = todaySales.reduce((a, s) => a + s.total, 0)
  const yesterday = done.filter((s) => { const d = new Date(s.date); return d >= addDays(today, -1) && d < today }).reduce((a, s) => a + s.total, 0)

  const week = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const start = addDays(startOfDay(), -i)
      const end = addDays(start, 1)
      const total = done.filter((s) => { const d = new Date(s.date); return d >= start && d < end }).reduce((a, s) => a + s.total, 0)
      days.push({ label: start.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), total, today: i === 0 })
    }
    return days
  }, [done])
  const weekMax = Math.max(1, ...week.map((d) => d.total))

  const top = useMemo(() => {
    const since = addDays(startOfDay(), -29)
    const map = {}
    for (const s of done) {
      if (new Date(s.date) < since) continue
      for (const i of s.items) {
        const m = (map[i.productId] ||= { name: i.name, qty: 0, total: 0 })
        m.qty += i.qty
        m.total += i.total
      }
    }
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5)
  }, [done])

  const low = useMemo(() => {
    const out = []
    for (const p of db.products) {
      if (!p.active) continue
      for (const v of p.variants) if (v.stock <= db.settings.lowStockThreshold) out.push({ p, v })
    }
    return out.sort((a, b) => a.v.stock - b.v.stock).slice(0, 8)
  }, [db.products, db.settings.lowStockThreshold])

  const deliveries = done.filter((s) => s.delivery && s.delivery.status !== 'entregue').slice(-6).reverse()
  const byMethodToday = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.id, 0]))
  for (const s of todaySales) for (const p of s.payments) byMethodToday[p.method] += p.amount
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const variation = yesterday > 0 ? ((todayTotal - yesterday) / yesterday) * 100 : null

  return (
    <div className="page">
      <PageHeader
        title={`${greet}, ${user.name.split(' ')[0]}!`}
        subtitle={new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={<a className="btn btn-primary btn-lg" href="#/pdv"><ShoppingCart size={18} /> Nova venda</a>}
      />
      <div className="stats">
        <Stat label="Vendido hoje" value={money(todayTotal)} icon={<TrendingUp size={18} />} tone="gold" hint={variation != null ? `${variation >= 0 ? '+' : ''}${variation.toFixed(0)}% vs. ontem` : 'Primeiras vendas do dia'} />
        <Stat label="Vendas hoje" value={todaySales.length} icon={<Receipt size={18} />} hint={`Ticket médio ${money(todaySales.length ? todayTotal / todaySales.length : 0)}`} />
        <Stat label="Caixa" value={session ? 'Aberto' : 'Fechado'} icon={<Wallet size={18} />} hint={summary ? `Gaveta: ${money(summary.expectedCash)}` : 'Abra para vender'} tone={session ? undefined : 'warn'} />
        <Stat label="Entregas pendentes" value={deliveries.length} icon={<Truck size={18} />} />
      </div>

      <div className="dash-grid">
        <section className="card pad">
          <h3 className="card-title">Últimos 7 dias</h3>
          <div className="bars">
            {week.map((d, i) => (
              <div key={i} className={`bar-col ${d.today ? 'today' : ''}`} title={money(d.total)}>
                <span className="bar-value">{d.total ? money(d.total).replace(',00', '') : ''}</span>
                <div className="bar-track"><span style={{ height: `${(d.total / weekMax) * 100}%` }} /></div>
                <span className="bar-label">{d.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card pad">
          <h3 className="card-title">Hoje por forma de pagamento</h3>
          <div className="mini-list">
            {PAYMENT_METHODS.filter((m) => db.settings.enabledMethods.includes(m.id)).map((m) => (
              <div key={m.id} className="mini-row">
                <span className="grow">{m.short}</span>
                <strong>{money(byMethodToday[m.id])}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="card pad">
          <h3 className="card-title"><Trophy size={18} /> Mais vendidos (30 dias)</h3>
          {top.length === 0 ? (
            <p className="muted">Ainda sem vendas.</p>
          ) : (
            <div className="mini-list">
              {top.map((t, i) => (
                <div key={i} className="mini-row">
                  <span className="rank">{i + 1}</span>
                  <span className="grow">{t.name}</span>
                  <span className="muted small">{t.qty} un</span>
                  {can(user, 'settings') && <strong>{money(t.total)}</strong>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card pad">
          <h3 className="card-title"><AlertTriangle size={18} /> Estoque baixo</h3>
          {low.length === 0 ? (
            <p className="muted">Tudo certo com o estoque.</p>
          ) : (
            <div className="mini-list">
              {low.map(({ p, v }) => (
                <div key={v.id} className="mini-row">
                  <span className="grow">{p.name} <span className="muted small">{v.color} · {v.size}</span></span>
                  <Badge tone={v.stock <= 0 ? 'danger' : 'warn'}>{v.stock}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card pad span-2">
          <h3 className="card-title"><Truck size={18} /> Entregas em aberto</h3>
          {deliveries.length === 0 ? (
            <Empty title="Nenhuma entrega pendente" />
          ) : (
            <div className="mini-list">
              {deliveries.map((s) => (
                <a key={s.id} className="mini-row link" href="#/vendas">
                  <b>#{pad(s.number)}</b>
                  <span className="grow">{s.delivery.recipient} <span className="muted small">{formatAddress(s.delivery.address)}</span></span>
                  <Badge tone={s.delivery.status === 'em_rota' ? 'info' : 'warn'}>{s.delivery.status === 'em_rota' ? 'Saiu' : 'Pendente'}</Badge>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

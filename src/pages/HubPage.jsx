import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { Button, cx, formatINR } from '../components/ui';
import BrandName from '../components/BrandName';
import { useRestaurant } from '../context/RestaurantContext';

const PORTALS = [
  {
    to: '/customer?table=1',
    icon: '📱',
    iconClass: 'bg-brand-50 text-brand-600',
    title: 'Customer Table Menu',
    desc: 'Mobile-first QR menu with dish photos, dietary tags, waiter call and round-by-round ordering.',
    features: ['Table 1–8 selector', 'Per-item notes & spice levels', 'Live order tracker'],
    cta: 'Open customer menu',
    variant: 'primary'
  },
  {
    to: '/kds',
    icon: '🍳',
    iconClass: 'bg-violet-50 text-violet-600',
    title: 'Kitchen Display (KDS)',
    desc: 'High-contrast ticket board with audio chimes, elapsed timers and urgency colour coding.',
    features: ['Sound alerts on new tickets', 'Urgency timer (<5m, 15m, late)', 'Per-dish check-offs'],
    cta: 'Launch kitchen KDS',
    variant: 'violet'
  },
  {
    to: '/counter',
    icon: '💵',
    iconClass: 'bg-blue-50 text-blue-600',
    title: 'Counter POS & Billing',
    desc: 'Live floor map, geofence order approvals, discounts, consolidated bills and receipt printing.',
    features: ['Live table occupancy', 'Cash, card and UPI tender', 'Session rotation on reset'],
    cta: 'Open counter POS',
    variant: 'blue'
  },
  {
    to: '/admin',
    icon: '⚙️',
    iconClass: 'bg-emerald-50 text-emerald-600',
    title: 'Admin & Operations',
    desc: 'Sales reports with CSV export, live kitchen and cashier alerts, menu stock control and QR stands.',
    features: ['Sales by table & dish', 'Order turnaround & SLA', 'Printable table tent cards'],
    cta: 'Enter operations hub',
    variant: 'dark'
  }
];

const STEPS = [
  { title: 'Scan & order', desc: "Guests scan the table card, add their name and order from their own phone." },
  { title: 'Counter confirms', desc: 'Every order lands at the counter first. Only accepted orders reach the kitchen.' },
  { title: 'Cook & serve', desc: "The KDS chimes, staff cook and mark it served, and every phone at the table updates live." },
  { title: 'Settle & reset', desc: 'The cashier settles via UPI, cash or card, prints the receipt and rotates the session.' }
];

export default function HubPage() {
  const { isConnected } = useSocket();
  const { tagline } = useRestaurant();
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    activeTablesCount: 0,
    totalTables: 8
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {}
    }
    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-slate-900 text-xl">⚜️</div>
            <div>
              <BrandName upper className="block font-display text-base leading-tight font-extrabold text-slate-900" />
              {tagline && <div className="text-[11px] tracking-widest text-slate-500 uppercase">{tagline}</div>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={cx(
              'hidden items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset sm:inline-flex',
              isConnected ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'
            )}>
              <span className={cx('size-2 rounded-full', isConnected ? 'animate-pulse bg-emerald-500' : 'bg-red-500')} />
              {isConnected ? 'POS engine online' : 'Connecting…'}
            </span>
            <Button as={Link} to="/admin" size="sm">⚙️ Admin</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-40 h-112 bg-radial-[at_50%_0%] from-brand-200/60 via-brand-50/40 to-transparent" />
        <div className="relative mx-auto max-w-3xl px-4 pt-14 pb-10 text-center sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-accent-700 shadow-xs ring-1 ring-brand-200">
            ✨ Complete end-to-end restaurant suite
          </span>
          <h1 className="mt-5 text-4xl font-extrabold text-balance text-slate-900 sm:text-5xl">
            Contactless QR dining &amp; <span className="text-accent-600">real-time POS</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-slate-600 sm:text-lg">
            From the table QR stand to the kitchen screen and the cashier terminal — every order flows live.
          </p>

          <dl className="mx-auto mt-8 grid max-w-lg grid-cols-3 divide-x divide-slate-200 rounded-2xl bg-white py-4 shadow-sm ring-1 ring-slate-200">
            <div className="px-2">
              <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Active tables</dt>
              <dd className="mt-1 font-display text-xl font-bold text-accent-600">{stats.activeTablesCount} / {stats.totalTables}</dd>
            </div>
            <div className="px-2">
              <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Invoices</dt>
              <dd className="mt-1 font-display text-xl font-bold text-slate-900">{stats.totalOrders}</dd>
            </div>
            <div className="px-2">
              <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Revenue</dt>
              <dd className="mt-1 font-display text-xl font-bold text-emerald-600">{formatINR(stats.totalRevenue)}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Portals */}
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PORTALS.map(p => (
            <div key={p.to} className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className={cx('grid size-12 place-items-center rounded-xl text-2xl', p.iconClass)}>{p.icon}</div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{p.desc}</p>
              <ul className="mt-4 mb-5 space-y-1.5 text-sm text-slate-600">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 text-emerald-500">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Button as={Link} to={p.to} variant={p.variant} block className="mt-auto">
                {p.cta} →
              </Button>
            </div>
          ))}
        </div>

        {/* Workflow */}
        <section className="mt-16">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900">How an order flows</h2>
            <p className="mt-1 text-sm text-slate-500">Customer, kitchen, counter and admin — all in real time</p>
          </div>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                <span className="grid size-8 place-items-center rounded-full bg-brand-400 font-display text-sm font-bold text-ink">{i + 1}</span>
                <h4 className="mt-3 font-bold text-slate-900">{s.title}</h4>
                <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}

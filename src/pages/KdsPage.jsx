import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../components/LoginScreen';
import PanelHeader from '../components/PanelHeader';
import { EmptyState, cx } from '../components/ui';
import { useRestaurant } from '../context/RestaurantContext';

// Orders waiting at the counter (or declined) never reach the kitchen board
const KITCHEN_STATUSES = ['new', 'cooking', 'ready', 'served'];

// Served tickets stay visible (for recall) this long, newest first
const SERVED_VISIBLE_MS = 30 * 60 * 1000;
// Food sitting on the pass longer than this turns red
const READY_WAIT_ALERT_SEC = 180;
// A just-arrived ticket flashes "NEW" for this long
const NEW_FLASH_SEC = 60;

const URGENCY = {
  fresh: { ring: 'ring-white/10', header: 'bg-white/3', timer: 'bg-emerald-500/15 text-emerald-300' },
  medium: { ring: 'ring-amber-400/40', header: 'bg-amber-400/10', timer: 'bg-amber-400/20 text-amber-200' },
  late: { ring: 'ring-2 ring-red-500/70', header: 'bg-red-500/15', timer: 'animate-pulse bg-red-500 text-white' }
};

// Notes that must never be missed on the line
// Whole words only, so "minutes" doesn't trip "nut"
const ALLERGY_PATTERN = /\b(allerg\w*|nuts?|peanuts?|tree ?nuts?|gluten|celiac|coeliac|dairy|lactose|milk|eggs?|eggless|shellfish|prawns?|shrimps?|soy|sesame|vegan|jain)\b|\bno (onion|garlic)\b/i;

const kitchenStart = (o) => o.approvedAt || o.createdAt; // when the ticket reached the kitchen
const toSec = (from, now) => Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
const urgencyFor = (sec) => (sec < 300 ? 'fresh' : sec < 900 ? 'medium' : 'late');
const allergyNotes = (o) => [o.notes, ...o.items.map(i => i.notes)].filter(n => n && ALLERGY_PATTERN.test(n));

export default function KdsPage() {
  const { socket, playAlertChime, showToast } = useSocket();
  const { activeStaff, login, logout } = useAuth();
  const { name: restaurantName } = useRestaurant();

  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [orders, setOrders] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showAllDay, setShowAllDay] = useState(true);
  const [showAllServed, setShowAllServed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Clock Ticking
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch orders
  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) setOrders(await res.json());
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (activeStaff.kitchen) {
      loadOrders();
    }
  }, [activeStaff.kitchen, loadOrders]);

  // Keep a kitchen tablet's screen awake while the board is open
  useEffect(() => {
    if (!activeStaff.kitchen || !('wakeLock' in navigator)) return;
    let lock = null;
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request('screen'); } catch (e) {}
    };
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [activeStaff.kitchen]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  // Socket Events
  useEffect(() => {
    if (!socket || !activeStaff.kitchen) return;

    const onNewOrder = (order) => {
      setOrders(prev => [...prev.filter(o => o.id !== order.id), order]);
      if (soundEnabled) playAlertChime('ticket');
      showToast(`New ticket: ${order.tableName} · ${order.customerName}`, 'info');
    };

    const onStatusUpdate = (updatedOrder) => {
      setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    };

    const onTableCleared = ({ tableId }) => {
      setOrders(prev => prev.filter(o => o.tableId !== tableId));
    };

    socket.on('kitchen:new_order', onNewOrder);
    socket.on('order:status_updated', onStatusUpdate);
    socket.on('kitchen:table_cleared', onTableCleared);

    return () => {
      socket.off('kitchen:new_order', onNewOrder);
      socket.off('order:status_updated', onStatusUpdate);
      socket.off('kitchen:table_cleared', onTableCleared);
    };
  }, [socket, activeStaff.kitchen, soundEnabled, playAlertChime, showToast]);

  // Submit Kitchen PIN Login
  const handlePinLogin = async (overridePin) => {
    const p = overridePin || pinInput;
    if (!p) {
      setAuthError('Please enter 4-digit Kitchen PIN');
      return;
    }

    const res = await login('kitchen', '', p);
    if (res.success) {
      setAuthError('');
      setPinInput('');
      showToast(`👨‍🍳 Welcome, ${res.staff.name}!`, 'success');
      loadOrders();
    } else {
      setAuthError(res.error || 'Invalid Kitchen PIN (Default: 2024)');
    }
  };

  // Move a ticket forward (bump) or back one step (recall)
  const updateOrderStatus = async (orderId, nextStatus, { recall = false } = {}) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.order) {
        setOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
        if (recall) showToast(`${orderId} recalled to ${nextStatus}`, 'warning');
      } else {
        showToast(data.message || 'Could not update the ticket', 'warning');
        loadOrders();
      }
    } catch (e) {}
  };

  // Toggle single item cooked strike-through
  const toggleItemCooked = async (orderId, itemId, currentCooked) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, itemCooked: !currentCooked })
      });

      if (res.ok) {
        setOrders(prev => prev.map(o => {
          if (o.id === orderId) {
            return {
              ...o,
              items: o.items.map(it => it.id === itemId ? { ...it, cooked: !currentCooked } : it)
            };
          }
          return o;
        }));
      }
    } catch (e) {}
  };

  const now = currentTime.getTime();
  const board = useMemo(() => {
    const kitchen = orders.filter(o => KITCHEN_STATUSES.includes(o.status));
    const byKitchenStart = (a, b) => new Date(kitchenStart(a)) - new Date(kitchenStart(b));
    const latest = (field) => (a, b) => new Date(b[field] || b.updatedAt || 0) - new Date(a[field] || a.updatedAt || 0);

    // New & Cooking: oldest first (most urgent at the top). Ready & Served: latest first.
    const fresh = kitchen.filter(o => o.status === 'new').sort(byKitchenStart);
    const cooking = kitchen.filter(o => o.status === 'cooking').sort(byKitchenStart);
    const ready = kitchen.filter(o => o.status === 'ready').sort(latest('readyAt'));
    const served = kitchen.filter(o => o.status === 'served').sort(latest('servedAt'));

    // All-day: what still has to be cooked across every open ticket, for batching
    const allDay = new Map();
    [...fresh, ...cooking].forEach(o => o.items.forEach(it => {
      if (!it.cooked) allDay.set(it.name, (allDay.get(it.name) || 0) + it.quantity);
    }));

    return {
      fresh,
      cooking,
      ready,
      served,
      allDay: [...allDay.entries()].sort((a, b) => b[1] - a[1]),
      open: fresh.length + cooking.length + ready.length
    };
  }, [orders]);

  if (!activeStaff.kitchen) {
    return (
      <LoginScreen
        icon="🍳"
        accent="violet"
        title="Kitchen Display"
        subtitle="Enter the 4-digit cook / chef PIN"
        pin={pinInput}
        onPinChange={setPinInput}
        error={authError}
        onSubmit={() => handlePinLogin()}
        submitLabel="Unlock kitchen board"
        demoLabel="PIN 2024"
        onDemo={() => handlePinLogin('2024')}
      />
    );
  }

  const visibleServed = showAllServed
    ? board.served
    : board.served.filter(o => o.servedAt && now - new Date(o.servedAt).getTime() < SERVED_VISIBLE_MS);
  const hiddenServed = board.served.length - visibleServed.length;
  const hasTickets = board.open + board.served.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-kds text-slate-100 lg:h-screen">
      <PanelHeader
        dark
        icon="🍳"
        iconClass="bg-violet-600"
        title="Kitchen Display System"
        subtitle={`${restaurantName || 'Kitchen'} · live prep queue`}
      >
        <span className="rounded-lg bg-white/5 px-3 py-1 font-kds-display text-2xl leading-7 font-bold tabular-nums text-white ring-1 ring-white/10">
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <span className="rounded-lg bg-violet-500/15 px-3 py-1.5 text-sm font-semibold text-violet-200 ring-1 ring-violet-400/30">
          {board.open} open
        </span>
        <HeaderButton active={showAllDay} onClick={() => setShowAllDay(!showAllDay)}>📋 All day</HeaderButton>
        <HeaderButton
          active={soundEnabled}
          onClick={() => {
            setSoundEnabled(!soundEnabled);
            if (!soundEnabled) playAlertChime('ticket');
          }}
        >
          {soundEnabled ? '🔊 Alerts on' : '🔇 Alerts off'}
        </HeaderButton>
        <HeaderButton onClick={toggleFullscreen}>{isFullscreen ? '🗗 Exit full screen' : '⛶ Full screen'}</HeaderButton>
        <HeaderButton onClick={() => logout('kitchen')}>🔒 Lock</HeaderButton>
        <Link to="/" className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-slate-400 hover:bg-white/5 hover:text-white">
          🏠 Hub
        </Link>
      </PanelHeader>

      {/* All-day: totals still to cook, so the line can batch */}
      {showAllDay && board.allDay.length > 0 && (
        <div className="flex items-center gap-3 overflow-x-auto border-b border-white/10 bg-slate-900/80 px-4 py-2.5 scrollbar-none sm:px-6">
          <span className="shrink-0 text-xs font-bold tracking-wider text-slate-400 uppercase">All day</span>
          {board.allDay.map(([name, qty]) => (
            <span key={name} className="shrink-0 rounded-lg bg-white/5 px-2.5 py-1 text-sm ring-1 ring-white/10">
              <span className="font-kds-display text-lg leading-none font-bold text-brand-400 tabular-nums">{qty}×</span> <span className="font-semibold">{name}</span>
            </span>
          ))}
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 lg:min-h-0">
        {!hasTickets ? (
          <EmptyState dark icon="✨" title="Kitchen queue clear">
            Every ticket is cooked and served. Orders confirmed by the counter will chime here instantly.
          </EmptyState>
        ) : (
          <div className="grid gap-5 lg:h-full lg:grid-cols-3">
            <Column title="New" hint="oldest first" dot="bg-sky-400" count={board.fresh.length} empty={board.fresh.length === 0}>
              {board.fresh.map(order => (
                <Ticket key={order.id} order={order} now={now} onToggleItem={toggleItemCooked}>
                  <BumpButton className="bg-amber-500 text-slate-950 hover:bg-amber-400" onClick={() => updateOrderStatus(order.id, 'cooking')}>
                    🔥 Start cooking
                  </BumpButton>
                </Ticket>
              ))}
            </Column>

            <Column title="Cooking" hint="oldest first" dot="bg-amber-400" count={board.cooking.length} empty={board.cooking.length === 0}>
              {board.cooking.map(order => (
                <Ticket key={order.id} order={order} now={now} onToggleItem={toggleItemCooked}>
                  <BumpButton className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" onClick={() => updateOrderStatus(order.id, 'ready')}>
                    ✅ Ready for pickup
                  </BumpButton>
                </Ticket>
              ))}
            </Column>

            <Column title="Ready" hint="latest first" dot="bg-emerald-400" count={board.ready.length} empty={board.ready.length === 0 && board.served.length === 0}>
              {board.ready.map(order => (
                <Ticket key={order.id} order={order} now={now} onToggleItem={toggleItemCooked} readyView>
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <RecallButton onClick={() => updateOrderStatus(order.id, 'cooking', { recall: true })} />
                    <BumpButton className="bg-slate-100 text-slate-900 shadow-white/10 hover:bg-white" onClick={() => updateOrderStatus(order.id, 'served')}>
                      🍽️ Mark as served
                    </BumpButton>
                  </div>
                </Ticket>
              ))}

              {/* Recently served: compact, latest first, recall if bumped by mistake */}
              {(visibleServed.length > 0 || hiddenServed > 0) && (
                <div className="pt-2">
                  <div className="mb-2 flex items-center justify-between text-xs font-bold tracking-wider text-slate-500 uppercase">
                    <span>Recently served ({visibleServed.length})</span>
                    {(hiddenServed > 0 || showAllServed) && (
                      <button type="button" onClick={() => setShowAllServed(!showAllServed)} className="font-semibold text-slate-400 normal-case hover:text-white">
                        {showAllServed ? 'Show last 30 min' : `Show all (+${hiddenServed})`}
                      </button>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {visibleServed.map(order => (
                      <li key={order.id} className="flex items-center gap-3 rounded-xl bg-white/3 px-3 py-2 ring-1 ring-white/5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-300">
                            {order.tableName} <span className="font-normal text-slate-500">· {order.customerName}</span>
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {order.id} · served {order.servedAt ? `${Math.floor(toSec(order.servedAt, now) / 60)}m ago` : ''}
                          </div>
                        </div>
                        <RecallButton small onClick={() => updateOrderStatus(order.id, 'ready', { recall: true })} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Column>
          </div>
        )}
      </main>
    </div>
  );
}

function HeaderButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'h-9 rounded-lg px-3 text-sm font-semibold ring-1 transition',
        active
          ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30 hover:bg-emerald-500/25'
          : 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10'
      )}
    >
      {children}
    </button>
  );
}

function Column({ title, hint, dot, count, empty, children }) {
  return (
    <section className="flex min-w-0 flex-col lg:min-h-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-kds-display text-xl font-bold tracking-wide text-slate-200 uppercase">
          <span className={cx('size-2 rounded-full', dot)} />
          {title}
          <span className="font-kds text-xs font-medium tracking-normal text-slate-400 normal-case">· {hint}</span>
        </h2>
        <span key={count} className="min-w-8 animate-bump rounded-full bg-white/10 px-2.5 py-0.5 text-center font-kds-display text-lg font-bold text-slate-200 tabular-nums">{count}</span>
      </div>
      {/* Each column scrolls on its own so the board never needs a page scroll */}
      <div className="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
        {empty ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-500">Nothing here</div>
        ) : children}
      </div>
    </section>
  );
}

function Ticket({ order, now, onToggleItem, readyView, children }) {
  const sinceKitchen = toSec(kitchenStart(order), now);
  const sinceReady = order.readyAt ? toSec(order.readyAt, now) : 0;
  const u = URGENCY[urgencyFor(sinceKitchen)];
  const waitingTooLong = readyView && sinceReady >= READY_WAIT_ALERT_SEC;
  const isNew = order.status === 'new' && sinceKitchen < NEW_FLASH_SEC;
  const allergies = allergyNotes(order);

  return (
    <article className={cx(
      'overflow-hidden rounded-2xl bg-slate-900 ring-1 animate-ticket-in transition-shadow duration-500',
      readyView ? (waitingTooLong ? 'ring-2 ring-red-500/70' : 'ring-emerald-400/30') : u.ring,
      isNew && 'animate-new-glow'
    )}>
      <div className={cx('flex items-start justify-between gap-3 px-4 py-3', readyView ? 'bg-emerald-500/10' : u.header)}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-kds-display text-[28px] leading-8 font-bold tracking-wide text-white uppercase">{order.tableName}</span>
            {isNew && <span className="animate-pulse rounded bg-sky-400 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-slate-950">NEW</span>}
            {order.recalledAt && <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">RECALLED</span>}
          </div>
          <div className="truncate text-xs text-slate-400">{order.id} · {order.formattedTime} · 👤 {order.customerName}</div>
        </div>
        {readyView ? (
          <span className={cx('rounded-lg px-2.5 py-1 text-right font-kds-display text-2xl leading-6 font-bold tabular-nums transition-colors duration-500', waitingTooLong ? 'animate-pulse bg-red-500 text-white' : 'bg-emerald-500/15 text-emerald-300')}>
            {mmss(sinceReady)}
            <span className="block font-kds text-[10px] font-semibold tracking-wider uppercase opacity-80">waiting</span>
          </span>
        ) : (
          <span className={cx('rounded-lg px-2.5 py-1 font-kds-display text-2xl leading-7 font-bold tabular-nums transition-colors duration-500', u.timer)}>{mmss(sinceKitchen)}</span>
        )}
      </div>

      {allergies.length > 0 && (
        <div className="mx-3 mt-3 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white">
          ⚠️ ALLERGY / DIETARY
          <span className="mt-0.5 block font-medium">{allergies.join(' · ')}</span>
        </div>
      )}
      {order.notes && allergies.indexOf(order.notes) === -1 && (
        <div className="mx-3 mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-200 ring-1 ring-amber-400/20">
          📝 {order.notes}
        </div>
      )}

      <ul className={cx('space-y-1 p-3', readyView && 'opacity-80')}>
        {order.items.map(it => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onToggleItem(order.id, it.id, it.cooked)}
              title="Tap to check off"
              className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
            >
              <span className={cx(
                'mt-1 grid size-6 shrink-0 place-items-center rounded-md text-sm font-bold ring-1 transition-all duration-200',
                it.cooked ? 'bg-emerald-500 text-white ring-emerald-500' : 'text-transparent ring-slate-600'
              )}>✓</span>
              <span className={cx('min-w-9 font-kds-display text-[26px] leading-7 font-bold tabular-nums transition-colors', it.cooked ? 'text-slate-600' : 'text-brand-400')}>{it.quantity}×</span>
              <span className="min-w-0">
                <span className={cx('block text-lg leading-7 font-semibold transition-colors', it.cooked ? 'text-slate-500 line-through decoration-2' : 'text-slate-50')}>{it.name}</span>
                {it.notes && (
                  <span className={cx('block text-sm italic', ALLERGY_PATTERN.test(it.notes) ? 'font-bold text-red-400 not-italic' : 'text-amber-300')}>
                    “{it.notes}”
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t border-white/5 p-3">{children}</div>
    </article>
  );
}

function BumpButton({ className, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={cx('h-14 w-full rounded-xl font-kds-display text-xl font-bold tracking-wide uppercase shadow-lg transition duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]', className)}>
      {children}
    </button>
  );
}

function RecallButton({ onClick, small }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Undo the last bump"
      className={cx(
        'shrink-0 rounded-xl bg-white/5 font-semibold text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white',
        small ? 'h-8 px-3 text-xs' : 'h-14 px-4 text-sm'
      )}
    >
      ↩ Recall
    </button>
  );
}

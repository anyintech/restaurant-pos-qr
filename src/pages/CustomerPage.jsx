import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { Button, Input, Textarea, Field, EmptyState, formatINR, cx } from '../components/ui';
import BrandName from '../components/BrandName';
import { useRestaurant } from '../context/RestaurantContext';

// Every order is confirmed by the counter before it reaches the kitchen
const ORDER_STEPS = ['pending_approval', 'new', 'cooking', 'ready', 'served'];
const BILLABLE_STATUSES = ['new', 'cooking', 'ready', 'served'];
const GST_RATE = 0.05;
const ORDER_STATUS_LABEL = {
  pending_approval: 'Awaiting confirmation',
  rejected: 'Declined',
  new: 'Confirmed',
  cooking: 'Cooking',
  ready: 'Ready',
  served: 'Served'
};

// Per-device identity, kept in localStorage (may be unavailable in private mode — then per page load)
const GUEST_NAME_KEY = 'pos_guest_name';
const DEVICE_ID_KEY = 'pos_device_id';
function readStored(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function writeStored(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
// Browsers can't reveal a phone's own name ("Rahul's iPhone"); the device type is the best we get
function detectDeviceType() {
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return /Mobi/.test(ua) ? 'Phone' : '';
}
const DEVICE_TYPE = detectDeviceType();

function getDeviceId() {
  let id = readStored(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    writeStored(DEVICE_ID_KEY, id);
  }
  return id;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function VegMark({ isVeg }) {
  return (
    <span
      title={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
      className={cx('grid size-3.5 shrink-0 place-items-center rounded-[3px] border-[1.5px]', isVeg ? 'border-emerald-600' : 'border-red-600')}
    >
      <span className={cx('size-1.5 rounded-full', isVeg ? 'bg-emerald-600' : 'bg-red-600')} />
    </span>
  );
}

/** Menu row: words on the left, photo on the right with the ADD control resting on it. */
function DishCard({ item, index, quantity, onAdd, onRemove }) {
  const isSoldOut = item.available === false;
  return (
    <article
      className={cx('flex animate-fade-up gap-4 border-b border-cream-200 py-5', isSoldOut && 'opacity-55')}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <VegMark isVeg={item.isVeg} />
          {item.badge && (
            <span className="text-[11px] font-bold tracking-wider text-accent-600 uppercase">★ {item.badge}</span>
          )}
        </div>
        <h3 className="mt-1.5 text-[17px] leading-snug font-bold text-stone-900">
          {item.name}
          {item.isSpicy && <span className="ml-1.5 text-sm" title="Spicy">🌶️</span>}
        </h3>
        <p className="mt-0.5 text-[15px] font-semibold text-stone-800 tabular-nums">{formatINR(item.price)}</p>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-500">{item.description}</p>
      </div>

      <div className="relative w-32 shrink-0 self-start pb-4 sm:w-36">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-cream-100 shadow-sm">
          <span className="absolute inset-0 grid place-items-center text-3xl opacity-40" aria-hidden>🍽️</span>
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            onLoad={(e) => { e.currentTarget.dataset.loaded = 'true'; }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className="relative size-full scale-105 object-cover opacity-0 transition duration-700 ease-out data-[loaded=true]:scale-100 data-[loaded=true]:opacity-100"
          />
          {isSoldOut && (
            <div className="absolute inset-0 grid place-items-center bg-stone-900/55 text-[11px] font-bold tracking-widest text-white uppercase">
              Sold out
            </div>
          )}
        </div>

        {!isSoldOut && (
          <div className="absolute inset-x-3 bottom-0">
            {quantity > 0 ? (
              <div className="flex h-9 items-center justify-between rounded-lg bg-brand-400 text-ink shadow-lg shadow-brand-500/30">
                <button type="button" onClick={onRemove} aria-label={`Remove one ${item.name}`} className="grid h-full w-9 place-items-center rounded-l-lg text-lg font-bold transition hover:bg-brand-300 active:scale-90">−</button>
                <span key={quantity} className="animate-bump text-sm font-bold tabular-nums">{quantity}</span>
                <button type="button" onClick={onAdd} aria-label={`Add one more ${item.name}`} className="grid h-full w-9 place-items-center rounded-r-lg text-lg font-bold transition hover:bg-brand-300 active:scale-90">+</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onAdd}
                aria-label={`Add ${item.name}`}
                className="h-9 w-full rounded-lg bg-white text-sm font-extrabold tracking-wider text-accent-700 shadow-lg shadow-stone-900/10 ring-1 ring-brand-300 transition hover:bg-brand-50 active:scale-95"
              >
                ADD
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function MenuSkeleton() {
  return (
    <div className="pt-6" aria-hidden>
      <div className="skeleton mb-2 h-7 w-48 rounded-lg" />
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex gap-4 border-b border-cream-200 py-5">
          <div className="flex-1 space-y-2.5">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-5 w-3/4 rounded" />
            <div className="skeleton h-4 w-20 rounded" />
            <div className="skeleton h-3 w-full rounded" />
          </div>
          <div className="skeleton size-32 shrink-0 rounded-2xl sm:size-36" />
        </div>
      ))}
    </div>
  );
}

/** Bottom sheet on phones, right-side drawer on larger screens. */
function Sheet({ title, onClose, footer, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="mt-auto flex max-h-[90vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl animate-slide-up sm:mt-0 sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:animate-slide-in-right"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-stone-200 sm:hidden" aria-hidden />
        <div className="flex items-center justify-between border-b border-cream-200 px-5 py-3.5">
          <h3 className="font-serif text-xl font-semibold tracking-tight">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-stone-400 transition hover:bg-cream-100 hover:text-stone-700">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-cream-200 bg-cream-50 px-5 py-4">{footer}</div>}
      </aside>
    </div>
  );
}

export default function CustomerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tableParam = searchParams.get('table') || '1';
  const sessionParam = searchParams.get('session') || '';
  const tableId = parseInt(tableParam, 10);

  const { socket, showToast, playAlertChime } = useSocket();
  const { name: restaurantName } = useRestaurant();

  const [menu, setMenu] = useState({ categories: [], items: [] });
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [menuError, setMenuError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);

  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  // Who is ordering on this phone — remembered so the guest only types it once
  const [deviceId] = useState(getDeviceId);
  const [customerName, setCustomerName] = useState(() => readStored(GUEST_NAME_KEY));
  const [orderNotes, setOrderNotes] = useState('');

  const [tableInfo, setTableInfo] = useState(null);
  const [activeOrders, setActiveOrders] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Geofence simulation state ('inside' or 'outside')
  const [geofenceSim, setGeofenceSim] = useState('inside');
  const [billRequested, setBillRequested] = useState(false);
  const [isBillOpen, setIsBillOpen] = useState(false);
  const [isRequestingBill, setIsRequestingBill] = useState(false);

  // The dining session this device joined. Pinned on first load so that once the
  // table is settled (token rotated), this phone can't keep ordering onto the next guests' bill.
  const [sessionToken, setSessionToken] = useState(sessionParam);
  // Set when the table is settled / session expires: { invoice } (invoice may be null)
  const [sessionEnded, setSessionEnded] = useState(null);

  // Load Menu & Table Info
  const loadMenu = useCallback(async () => {
    setMenuError(false);
    try {
      const res = await fetch('/api/menu');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMenu(await res.json());
    } catch (e) {
      setMenuError(true);
    } finally {
      setMenuLoaded(true);
    }
  }, []);

  const loadTable = useCallback(async () => {
    try {
      const res = await fetch(`/api/tables/${tableId}`);
      if (res.ok) {
        const data = await res.json();
        setTableInfo(data);
        setActiveOrders(data.activeOrders || []);
        setBillRequested(Boolean(data.billRequestedAt) || data.status === 'bill_requested');
        setSessionToken(t => t || data.sessionToken || '');
      }
    } catch (e) {}
  }, [tableId]);

  // Switching tables starts a fresh session on this device
  useEffect(() => {
    setSessionToken(sessionParam);
    setSessionEnded(null);
  }, [tableId]);

  useEffect(() => {
    loadMenu();
    loadTable();
  }, [loadMenu, loadTable]);

  // Join table room & Socket listeners
  useEffect(() => {
    if (!socket) return;
    socket.emit('join:table', tableId);

    // Every phone at the table hears every order — say whose it is
    const whose = (order) => (order.deviceId && order.deviceId === deviceId ? 'Your' : `${order.customerName}'s`);

    const onAck = (order) => {
      showToast(`${whose(order)} order is confirmed and with the kitchen`, 'success');
      playAlertChime('ticket');
      loadTable();
    };

    const onPending = (order) => {
      showToast(`${whose(order)} order was sent to the counter — it goes to the kitchen once confirmed`, 'info');
      loadTable();
    };

    // The server follows 'approved' with 'acknowledged', which already announces it
    const onApproved = () => {
      loadTable();
    };

    const onRejected = (data) => {
      showToast(`Order ${data.orderId} was declined: ${data.reason}`, 'danger');
      loadTable();
    };

    const onStatus = (order) => {
      const label = (ORDER_STATUS_LABEL[order.status] || order.status).toLowerCase();
      showToast(`${whose(order)} order is ${label}`, order.status === 'ready' ? 'success' : 'info');
      playAlertChime(order.status === 'ready' ? 'ticket' : 'bill');
      loadTable();
    };

    const onBill = () => {
      setBillRequested(true);
    };

    // Cashier settled the table (with or without a bill request from the guest)
    const onReset = (payload) => {
      setSessionEnded({ invoice: payload?.invoice || null });
      setIsBillOpen(false);
      setIsCartOpen(false);
      setActiveOrders([]);
      setBillRequested(false);
      playAlertChime('settle');
    };

    const onMenuUpdate = (newMenu) => {
      setMenu(newMenu);
    };

    socket.on('customer:order_acknowledged', onAck);
    socket.on('customer:order_pending_approval', onPending);
    socket.on('customer:order_approved', onApproved);
    socket.on('customer:order_rejected', onRejected);
    socket.on('customer:status_updated', onStatus);
    socket.on('customer:bill_requested', onBill);
    socket.on('customer:session_reset', onReset);
    socket.on('menu:updated', onMenuUpdate);

    return () => {
      socket.off('customer:order_acknowledged', onAck);
      socket.off('customer:order_pending_approval', onPending);
      socket.off('customer:order_approved', onApproved);
      socket.off('customer:order_rejected', onRejected);
      socket.off('customer:status_updated', onStatus);
      socket.off('customer:bill_requested', onBill);
      socket.off('customer:session_reset', onReset);
      socket.off('menu:updated', onMenuUpdate);
    };
  }, [socket, tableId, deviceId, loadTable, showToast, playAlertChime]);

  // Cart Operations
  const addToCart = (item) => {
    if (item.available === false) {
      showToast('This item is currently sold out (86\'d)', 'warning');
      return;
    }

    setCart(prev => {
      const idx = prev.findIndex(i => i.id === item.id);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      } else {
        return [...prev, { ...item, quantity: 1, notes: '' }];
      }
    });

    setAnnouncement(`${item.name} added to your order`);
  };

  const updateQuantity = (itemId, delta) => {
    setCart(prev => {
      return prev
        .map(i => {
          if (i.id === itemId) {
            const nextQty = i.quantity + delta;
            return nextQty > 0 ? { ...i, quantity: nextQty } : null;
          }
          return i;
        })
        .filter(Boolean);
    });
  };

  const updateItemNotes = (itemId, notes) => {
    setCart(prev => prev.map(i => i.id === itemId ? { ...i, notes } : i));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);
  }, [cart]);

  const cartCount = useMemo(() => {
    return cart.reduce((acc, i) => acc + i.quantity, 0);
  }, [cart]);

  // Submit Order
  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    // Name is optional: blank → the server labels this phone "Guest N · <device type>"
    const name = customerName.trim();
    if (name) writeStored(GUEST_NAME_KEY, name);
    setIsSubmitting(true);

    const payload = {
      tableId,
      items: cart.map(i => ({
        id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        notes: i.notes || ''
      })),
      customerName: name,
      deviceId,
      deviceType: DEVICE_TYPE,
      notes: orderNotes.trim(),
      sessionToken,
      simulation: geofenceSim
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        setCart([]);
        setIsCartOpen(false);
        setOrderNotes('');
        loadTable();
      } else if (data.error === 'session_expired') {
        // Keep the cart so the guest can resend it after starting a new session
        setIsCartOpen(false);
        setSessionEnded({ invoice: null });
      } else {
        showToast(data.message || data.error || 'Failed to place order', 'danger');
      }
    } catch (e) {
      showToast('Could not reach the restaurant. Please try again.', 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Call Waiter & Request Bill
  const callWaiter = async () => {
    try {
      const res = await fetch(`/api/tables/${tableId}/call-waiter`, { method: 'POST' });
      if (res.ok) {
        showToast('Floor waiter notified. Someone will assist you shortly!', 'success');
        playAlertChime('waiter');
      }
    } catch (e) {}
  };

  const requestBill = async () => {
    setIsRequestingBill(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/request-bill`, { method: 'POST' });
      if (res.ok) {
        setBillRequested(true);
        showToast('Bill requested — a staff member will be with you shortly.', 'success');
        playAlertChime('bill');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.message || 'Could not request the bill', 'warning');
      }
    } catch (e) {
      showToast('Could not reach the restaurant. Please try again.', 'danger');
    } finally {
      setIsRequestingBill(false);
    }
  };

  const startNewSession = () => {
    setSessionEnded(null);
    setSessionToken('');
    // Drop an expired ?session= from the URL so a refresh doesn't bring the old session back
    if (sessionParam) setSearchParams({ table: String(tableId) });
    loadTable();
  };

  const orderMore = () => {
    setIsBillOpen(false);
    document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Running bill for this table — only orders the restaurant accepted are charged
  const runningBill = useMemo(() => {
    const billable = activeOrders.filter(o => typeof o === 'object' && BILLABLE_STATUSES.includes(o.status));
    const itemMap = new Map();
    billable.forEach(o => o.items.forEach(it => {
      const prev = itemMap.get(it.name) || { name: it.name, quantity: 0, total: 0 };
      itemMap.set(it.name, { ...prev, quantity: prev.quantity + it.quantity, total: prev.total + it.itemTotal });
    }));
    const subtotal = billable.reduce((acc, o) => acc + o.items.reduce((s, it) => s + it.itemTotal, 0), 0);
    const tax = subtotal * GST_RATE;
    const pending = activeOrders.filter(o => typeof o === 'object' && o.status === 'pending_approval');

    // Split by who ordered; this phone's guest is listed first as "You"
    const guestMap = new Map();
    billable.forEach(o => {
      const isMe = Boolean(o.deviceId) && o.deviceId === deviceId;
      const key = isMe ? '__me__' : o.customerName;
      const guest = guestMap.get(key) || { key, name: o.customerName, isMe, items: [], subtotal: 0 };
      o.items.forEach(it => {
        guest.items.push({ name: it.name, quantity: it.quantity, total: it.itemTotal });
        guest.subtotal += it.itemTotal;
      });
      guestMap.set(key, guest);
    });
    const guests = [...guestMap.values()].sort((a, b) => Number(b.isMe) - Number(a.isMe));

    const billRequestedAt = tableInfo?.billRequestedAt;
    const addedAfterBill = Boolean(billRequestedAt) && billable.some(o => new Date(o.createdAt) > new Date(billRequestedAt));

    return {
      rounds: billable.length,
      guests,
      addedAfterBill,
      items: [...itemMap.values()],
      subtotal,
      tax,
      total: subtotal + tax,
      pendingCount: pending.length,
      allServed: billable.length > 0 && billable.every(o => o.status === 'served')
    };
  }, [activeOrders, deviceId, tableInfo]);

  // What this phone will be called if the guest leaves the name blank (the server decides; this mirrors it)
  const blankNameLabel = useMemo(() => {
    const visit = activeOrders.filter(o => typeof o === 'object');
    const mine = visit.find(o => o.deviceId === deviceId);
    if (mine) return mine.customerName;
    const devices = new Set(visit.map(o => o.deviceId || o.id));
    return `Guest ${devices.size + 1}${DEVICE_TYPE ? ` · ${DEVICE_TYPE}` : ''}`;
  }, [activeOrders, deviceId]);

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return (menu.items || []).filter(item => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const matchQ = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                     (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchVeg = !vegOnly || item.isVeg;
      return matchCat && matchQ && matchVeg;
    });
  }, [menu.items, selectedCategory, searchQuery, vegOnly]);

  // Course sections when browsing everything; a single section for a category or a search
  const isBrowsingAll = selectedCategory === 'all' && !searchQuery.trim();
  const menuSections = isBrowsingAll
    ? menu.categories
        .filter(c => c.id !== 'all')
        .map(c => ({ ...c, items: filteredItems.filter(i => i.category === c.id) }))
        .filter(s => s.items.length > 0)
    : [{
        id: selectedCategory,
        name: searchQuery.trim()
          ? `Results for “${searchQuery.trim()}”`
          : (menu.categories.find(c => c.id === selectedCategory)?.name || 'Menu'),
        items: filteredItems
      }];
  const tableLabel = tableInfo ? tableInfo.name : `Table ${tableId}`;

  return (
    <div className="min-h-screen bg-cream-50 pb-28">
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {/* Demo controls (geofence simulation + table switcher) */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-900 px-4 py-2 text-xs text-stone-300">
        <label className="flex items-center gap-2">
          <span className="font-semibold">📍 Geofence demo</span>
          <select
            value={geofenceSim}
            onChange={(e) => setGeofenceSim(e.target.value)}
            className="rounded-md border-0 bg-stone-800 py-1 pr-7 pl-2 text-xs font-semibold text-white ring-1 ring-stone-700"
          >
            <option value="inside">🟢 Inside restaurant</option>
            <option value="outside">🔴 Outside (1.5 km away)</option>
          </select>
        </label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="font-semibold">Table</span>
            <select
              value={tableId}
              onChange={(e) => setSearchParams({ table: e.target.value })}
              className="rounded-md border-0 bg-stone-800 py-1 pr-7 pl-2 text-xs font-semibold text-white ring-1 ring-stone-700"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                <option key={n} value={n}>Table {n}</option>
              ))}
            </select>
          </label>
          <Link to="/" className="font-semibold hover:text-white">🏠 Hub</Link>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-cream-200 bg-cream-50/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-accent-600 uppercase">
              {greeting()} · {tableLabel}
            </p>
            <h1 className="truncate font-serif text-2xl leading-tight font-semibold tracking-tight text-stone-900">
              <BrandName ampClassName="text-brand-700 italic" />
            </h1>
          </div>

          <div className="flex items-center gap-1">
            <button type="button" onClick={callWaiter} title="Call a waiter" className="grid size-10 place-items-center rounded-full text-lg transition hover:bg-cream-100 active:scale-90">
              🙋
              <span className="sr-only">Call a waiter</span>
            </button>
            <button
              type="button"
              onClick={() => setIsBillOpen(true)}
              title="Your bill"
              className={cx('relative grid size-10 place-items-center rounded-full text-lg transition hover:bg-cream-100 active:scale-90', billRequested && 'bg-brand-100')}
            >
              🧾
              <span className="sr-only">Your bill</span>
              {billRequested && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand-500 ring-2 ring-cream-50" />}
            </button>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              aria-label="View cart"
              className="relative ml-1 grid size-11 place-items-center rounded-full bg-accent-700 text-lg text-white shadow-lg shadow-accent-900/25 transition hover:bg-accent-800 active:scale-90"
            >
              <span key={cartCount} className={cartCount > 0 ? 'animate-bump' : ''}>🛒</span>
              {cartCount > 0 && (
                <span key={`n${cartCount}`} className="absolute -top-1 -right-1 grid min-w-5 animate-bump place-items-center rounded-full bg-brand-400 px-1 text-[11px] font-bold text-ink ring-2 ring-cream-50">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Categories */}
        <nav className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 pb-3 scrollbar-none" aria-label="Menu categories">
          {menu.categories.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => { setSelectedCategory(cat.id); setSearchQuery(''); }}
              aria-pressed={selectedCategory === cat.id}
              className={cx(
                'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all duration-200',
                selectedCategory === cat.id
                  ? 'bg-accent-700 text-white shadow-md shadow-accent-900/20'
                  : 'bg-white text-stone-600 ring-1 ring-cream-200 hover:bg-cream-100 hover:text-stone-900'
              )}
            >
              <span aria-hidden>{cat.icon}</span>{cat.name}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-5xl px-4">
        {/* Bill requested banner */}
        {billRequested && (
          <div className="mt-4 flex animate-fade-up flex-wrap items-center gap-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200">
            <span className="text-2xl" aria-hidden>🧾</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-stone-900">Bill requested</p>
              <p className="text-sm text-stone-600">
                {runningBill.addedAfterBill
                  ? 'Your table added more since asking — staff will bring the updated bill.'
                  : 'A staff member will bring it shortly. Still hungry? You can keep ordering.'}
              </p>
            </div>
            <Button size="sm" onClick={() => setIsBillOpen(true)}>View bill</Button>
          </div>
        )}

        {/* All served: nudge the two natural next steps */}
        {!billRequested && runningBill.allServed && (
          <div className="mt-4 animate-fade-up rounded-2xl bg-linear-to-br from-emerald-50 to-white p-4 ring-1 ring-emerald-200">
            <p className="font-serif text-lg font-semibold text-stone-900">Enjoying your meal?</p>
            <p className="text-sm text-stone-600">Everything you ordered has been served.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button onClick={orderMore}>🍽️ Order more</Button>
              <Button variant="success" onClick={() => setIsBillOpen(true)}>🧾 Get the bill</Button>
            </div>
          </div>
        )}

        {/* Live order tracker */}
        {activeOrders.length > 0 && (
          <section className="mt-4 animate-fade-up rounded-2xl bg-white p-4 shadow-sm shadow-cream-200 ring-1 ring-cream-200">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-stone-900">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
                </span>
                Your table’s orders ({activeOrders.length})
              </h2>
              {runningBill.rounds > 0 && (
                <button type="button" onClick={() => setIsBillOpen(true)} className="text-sm font-semibold text-accent-600 hover:underline">
                  Bill so far {formatINR(runningBill.total)} →
                </button>
              )}
            </div>
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-none">
              {activeOrders.map((ord, idx) => {
                const oId = typeof ord === 'object' ? ord.id : ord;
                const status = typeof ord === 'object' ? ord.status : 'cooking';
                const step = ORDER_STEPS.indexOf(status);
                return (
                  <div key={idx} className={cx('min-w-56 shrink-0 rounded-xl bg-cream-50 p-3 ring-1 ring-cream-200', status === 'rejected' && 'opacity-60')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-stone-900">{oId}</span>
                        {typeof ord === 'object' && (
                          <span className="block truncate text-xs text-stone-500">
                            by {ord.deviceId && ord.deviceId === deviceId ? 'You' : ord.customerName}
                          </span>
                        )}
                      </span>
                      <span className={cx(
                        'text-xs font-semibold',
                        status === 'rejected' ? 'text-red-600' : status === 'pending_approval' ? 'text-amber-600' : 'text-accent-600'
                      )}>
                        {ORDER_STATUS_LABEL[status] || status}
                      </span>
                    </div>
                    {step > -1 && (
                      <div className="mt-2.5 flex gap-1">
                        {ORDER_STEPS.map((s, i) => (
                          <span key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-200">
                            <span className={cx('block h-full rounded-full bg-brand-500 transition-[width] duration-700 ease-out', i <= step ? 'w-full' : 'w-0')} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Search & filter */}
        <div id="menu" className="mt-5 flex scroll-mt-36 gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -transtone-y-1/2 text-stone-400" aria-hidden>🔍</span>
            <input
              type="search"
              placeholder="Search dishes or ingredients"
              aria-label="Search the menu"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-full border-0 bg-white pr-4 pl-10 text-sm text-stone-900 shadow-sm shadow-cream-200 ring-1 ring-cream-200 transition placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setVegOnly(!vegOnly)}
            aria-pressed={vegOnly}
            className={cx(
              'flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 transition',
              vegOnly ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-stone-700 ring-cream-200 hover:bg-cream-100'
            )}
          >
            <span className={cx('grid size-4 place-items-center rounded-[3px] border-2', vegOnly ? 'border-white' : 'border-emerald-600')}>
              <span className={cx('size-1.5 rounded-full', vegOnly ? 'bg-white' : 'bg-emerald-600')} />
            </span>
            Veg
          </button>
        </div>

        {/* Menu */}
        <main className="mt-2">
          {!menuLoaded ? (
            <MenuSkeleton />
          ) : menuError && (menu.items || []).length === 0 ? (
            <div className="text-center">
              <EmptyState icon="📶" title="We couldn’t load the menu">
                Check your connection — or ask a staff member if this keeps happening.
              </EmptyState>
              <Button variant="primary" onClick={() => { setMenuLoaded(false); loadMenu(); }}>Try again</Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState icon="🍽️" title="Nothing matches that">Try another category or search term.</EmptyState>
          ) : (
            menuSections.map(section => (
              <section key={section.id} className="pt-6" aria-labelledby={`sec-${section.id}`}>
                <div className="mb-1 flex items-baseline gap-3">
                  <h2 id={`sec-${section.id}`} className="font-serif text-2xl font-semibold tracking-tight text-stone-900">{section.name}</h2>
                  <span className="text-sm text-stone-500">{section.items.length}</span>
                  <span className="h-px flex-1 bg-cream-200" />
                </div>
                <div className="grid gap-x-8 lg:grid-cols-2">
                  {section.items.map((item, i) => (
                    <DishCard
                      key={item.id}
                      item={item}
                      index={i}
                      quantity={cart.find(c => c.id === item.id)?.quantity || 0}
                      onAdd={() => addToCart(item)}
                      onRemove={() => updateQuantity(item.id, -1)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </main>
      </div>

      {/* Bottom bar: unsent cart takes priority, otherwise the running bill */}
      {cartCount > 0 && !isCartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4 animate-slide-up">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl bg-accent-800 px-5 py-3.5 text-white shadow-2xl shadow-accent-900/30 hover:bg-accent-700"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-brand-400 text-sm font-bold text-ink">{cartCount}</span>
              <span className="text-left">
                <span className="block text-xs text-stone-400">{cartCount === 1 ? '1 item' : `${cartCount} items`} · not sent yet</span>
                <span className="block font-bold">{formatINR(cartTotal)}</span>
              </span>
            </span>
            <span className="font-semibold">View cart →</span>
          </button>
        </div>
      )}
      {cartCount === 0 && runningBill.rounds > 0 && !isBillOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4 animate-slide-up">
          <button
            type="button"
            onClick={() => setIsBillOpen(true)}
            className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3.5 text-stone-900 shadow-2xl shadow-stone-900/15 ring-1 ring-stone-200 hover:bg-stone-50"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-stone-100 text-base">🧾</span>
              <span className="text-left">
                <span className="block text-xs text-stone-500">{billRequested ? 'Bill requested' : 'Your bill so far'}</span>
                <span className="block font-bold tabular-nums">{formatINR(runningBill.total)}</span>
              </span>
            </span>
            <span className="font-semibold text-accent-600">{billRequested ? 'View bill →' : 'View / pay →'}</span>
          </button>
        </div>
      )}

      {/* Cart */}
      {isCartOpen && (
        <Sheet
          title="Your order"
          onClose={() => setIsCartOpen(false)}
          footer={cart.length > 0 && (
            <>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between text-stone-600"><dt>Subtotal</dt><dd className="tabular-nums">{formatINR(cartTotal)}</dd></div>
                <div className="flex justify-between text-stone-600"><dt>GST (5%, est.)</dt><dd className="tabular-nums">{formatINR(cartTotal * GST_RATE)}</dd></div>
                <div className="flex justify-between pt-1 text-lg font-bold text-stone-900"><dt>Total</dt><dd className="tabular-nums">{formatINR(cartTotal * (1 + GST_RATE))}</dd></div>
              </dl>
              {runningBill.rounds > 0 && (
                <p className="mt-2 text-xs text-stone-500">This will be added to your table's bill ({formatINR(runningBill.total)} so far).</p>
              )}
              <Button variant="primary" size="lg" block className="mt-4" onClick={handlePlaceOrder} disabled={isSubmitting}>
                {isSubmitting ? 'Placing order…' : 'Place order →'}
              </Button>
            </>
          )}
        >
          {cart.length === 0 ? (
            <EmptyState icon="🛒" title="Your cart is empty">Tap “+ Add” on any dish to start your order.</EmptyState>
          ) : (
            <>
              <ul className="divide-y divide-stone-100">
                {cart.map(item => (
                  <li key={item.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-stone-900">{item.name}</div>
                        <div className="text-xs text-stone-500">{formatINR(item.price)} each</div>
                      </div>
                      <div className="flex items-center gap-1 rounded-lg ring-1 ring-stone-200">
                        <button type="button" onClick={() => updateQuantity(item.id, -1)} className="grid size-8 place-items-center rounded-l-lg font-bold text-stone-600 hover:bg-stone-100" aria-label="Decrease">−</button>
                        <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                        <button type="button" onClick={() => updateQuantity(item.id, 1)} className="grid size-8 place-items-center rounded-r-lg font-bold text-stone-600 hover:bg-stone-100" aria-label="Increase">+</button>
                      </div>
                      <div className="w-20 text-right font-semibold tabular-nums">{formatINR(item.price * item.quantity)}</div>
                    </div>
                    <Input
                      placeholder="Add a note (e.g. less spicy)"
                      value={item.notes || ''}
                      onChange={(e) => updateItemNotes(item.id, e.target.value)}
                      className="mt-2 py-1.5 text-xs"
                    />
                  </li>
                ))}
              </ul>

              <div className="mt-4 space-y-3">
                <Field
                  label="Your name (optional)"
                  hint={customerName.trim() ? 'Shown to your table and staff.' : `Leave blank to show as “${blankNameLabel}”.`}
                >
                  <Input
                    id="guest-name"
                    placeholder={blankNameLabel}
                    maxLength={40}
                    autoComplete="given-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </Field>
                <Field label="Kitchen instructions">
                  <Textarea rows={2} placeholder="Allergies, preferences…" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
                </Field>
              </div>
            </>
          )}
        </Sheet>
      )}

      {/* Running bill */}
      {isBillOpen && (
        <Sheet
          title="Your bill"
          onClose={() => setIsBillOpen(false)}
          footer={runningBill.rounds > 0 && (
            billRequested ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
                  <p className="font-semibold">✓ Bill requested</p>
                  <p className="mt-0.5">A staff member is on the way. Pay by UPI, card or cash at your table or the counter.</p>
                </div>
                <Button block onClick={orderMore}>🍽️ Order something else</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button size="lg" onClick={orderMore}>🍽️ Order more</Button>
                <Button size="lg" variant="success" onClick={requestBill} disabled={isRequestingBill}>
                  {isRequestingBill ? 'Requesting…' : '🧾 Request bill'}
                </Button>
              </div>
            )
          )}
        >
          {runningBill.rounds === 0 ? (
            <EmptyState icon="🧾" title="Nothing on your bill yet">
              {runningBill.pendingCount > 0
                ? 'Your order is waiting for the counter to confirm it. It will appear here once confirmed.'
                : 'Order from the menu and your bill will build up here.'}
            </EmptyState>
          ) : (
            <>
              <p className="mb-3 text-sm text-stone-500">
                {tableInfo ? tableInfo.name : `Table ${tableId}`} · {runningBill.rounds} {runningBill.rounds === 1 ? 'order' : 'orders'}
              </p>
              <div className="space-y-3">
                {runningBill.guests.map(g => (
                  <section key={g.key} className={cx('overflow-hidden rounded-xl ring-1', g.isMe ? 'ring-accent-200' : 'ring-stone-200')}>
                    <div className={cx('flex items-center justify-between gap-2 px-4 py-2', g.isMe ? 'bg-accent-50' : 'bg-stone-50')}>
                      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-stone-900">
                        <span className={cx('grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white', g.isMe ? 'bg-accent-600' : 'bg-stone-500')}>
                          {(g.name || '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate">{g.isMe ? `You (${g.name})` : g.name}</span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{formatINR(g.subtotal)}</span>
                    </div>
                    <ul className="divide-y divide-stone-100">
                      {g.items.map((it, i) => (
                        <li key={i} className="flex justify-between gap-3 px-4 py-2 text-sm">
                          <span><span className="font-semibold text-stone-500">{it.quantity}×</span> {it.name}</span>
                          <span className="tabular-nums text-stone-600">{formatINR(it.total)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-stone-600"><dt>Subtotal</dt><dd className="tabular-nums">{formatINR(runningBill.subtotal)}</dd></div>
                <div className="flex justify-between text-stone-600"><dt>GST (5%)</dt><dd className="tabular-nums">{formatINR(runningBill.tax)}</dd></div>
                <div className="flex justify-between border-t border-stone-200 pt-2 text-lg font-bold text-stone-900">
                  <dt>Total</dt><dd className="tabular-nums">{formatINR(runningBill.total)}</dd>
                </div>
              </dl>
              {runningBill.pendingCount > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                  {runningBill.pendingCount === 1
                    ? '1 order is waiting for the counter to confirm it and isn’t included yet.'
                    : `${runningBill.pendingCount} orders are waiting for the counter to confirm them and aren’t included yet.`}
                </p>
              )}
              <p className="mt-3 text-xs text-stone-400">Any discounts are applied by the cashier at payment.</p>
            </>
          )}
        </Sheet>
      )}

      {/* Table settled: thank-you screen */}
      {sessionEnded && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-cream-50 animate-fade-in">
          <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
            <div className="grid size-20 place-items-center rounded-full bg-emerald-100 animate-pop-in">
              <svg viewBox="0 0 24 24" className="size-10 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="48" className="animate-draw" />
              </svg>
            </div>
            <h2 className="mt-6 font-serif text-3xl font-semibold tracking-tight text-stone-900">
              {sessionEnded.invoice ? 'Payment received — thank you!' : 'This table has been settled'}
            </h2>
            <p className="mt-2 text-stone-600">
              {sessionEnded.invoice
                ? `We hope you enjoyed your meal${restaurantName ? ` at ${restaurantName}` : ''}.`
                : 'Your previous session has ended. Start a new order to keep going.'}
            </p>

            {sessionEnded.invoice && (
              <div className="mt-6 w-full rounded-2xl bg-white p-5 text-left shadow-xs ring-1 ring-stone-200">
                <div className="flex justify-between text-xs text-stone-500">
                  <span>{sessionEnded.invoice.invoiceId}</span>
                  <span>{sessionEnded.invoice.formattedDate}</span>
                </div>
                <ul className="mt-3 space-y-1 border-y border-dashed border-stone-200 py-3 text-sm">
                  {(sessionEnded.invoice.items || []).map((it, i) => (
                    <li key={i} className="flex justify-between gap-2 text-stone-600">
                      <span>
                        {it.quantity}× {it.name}
                        {it.orderedBy && <span className="block text-xs text-stone-500">{it.orderedBy}</span>}
                      </span>
                      <span className="tabular-nums">{formatINR(it.total)}</span>
                    </li>
                  ))}
                </ul>
                {sessionEnded.invoice.discount > 0 && (
                  <div className="mt-2 flex justify-between text-sm text-emerald-700">
                    <span>Discount</span><span className="tabular-nums">−{formatINR(sessionEnded.invoice.discount)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between font-bold text-stone-900">
                  <span>Paid · {sessionEnded.invoice.paymentMethod}</span>
                  <span className="tabular-nums">{formatINR(sessionEnded.invoice.finalTotal)}</span>
                </div>
              </div>
            )}

            <Button variant="primary" size="lg" block className="mt-6" onClick={startNewSession}>
              {cartCount > 0 ? `Start a new order (${cartCount} in cart)` : 'Start a new order'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

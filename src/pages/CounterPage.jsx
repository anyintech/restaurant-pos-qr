import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../components/LoginScreen';
import PanelHeader from '../components/PanelHeader';
import { Button, Badge, Modal, Input, EmptyState, TableStatusBadge, TABLE_STATUS, formatINR, cx } from '../components/ui';
import BrandName from '../components/BrandName';
import { useRestaurant } from '../context/RestaurantContext';

const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const STATUS_TEXT = { green: 'text-emerald-600', amber: 'text-amber-600', blue: 'text-blue-600', violet: 'text-violet-600', red: 'text-red-600', slate: 'text-slate-600' };
const STATUS_RING = { green: 'ring-slate-200', amber: 'ring-amber-200', blue: 'ring-blue-200', violet: 'ring-violet-200', red: 'ring-2 ring-red-300', slate: 'ring-slate-200' };
const STATUS_BAR = { green: 'bg-emerald-400', amber: 'bg-amber-400', blue: 'bg-blue-500', violet: 'bg-violet-500', red: 'bg-red-500', slate: 'bg-slate-300' };
const BILLABLE_STATUSES = ['new', 'cooking', 'ready', 'served'];
const PAYMENT_METHODS = [
  { id: 'UPI / QR', icon: '📱' },
  { id: 'Cash', icon: '💵' },
  { id: 'Credit Card', icon: '💳' }
];

export default function CounterPage() {
  const { socket, playAlertChime, showToast } = useSocket();
  const { activeStaff, login, logout } = useAuth();
  const { address: restaurantAddress } = useRestaurant();

  const [cashierIdInput, setCashierIdInput] = useState('101');
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [tables, setTables] = useState([]);
  const [tableTabs, setTableTabs] = useState({});
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableBill, setTableBill] = useState(null);
  const [discount, setDiscount] = useState(0);
  const [billView, setBillView] = useState('guest');
  const [paymentMethod, setPaymentMethod] = useState('UPI / QR');

  // Incoming orders waiting for the counter to accept (nothing reaches the kitchen before that).
  // Loaded from the server, so the queue survives a refresh and can hold many orders at once.
  const [pendingOrders, setPendingOrders] = useState([]);
  const [handlingOrderIds, setHandlingOrderIds] = useState([]);

  // Settlement Print Receipt State
  const [settledInvoice, setSettledInvoice] = useState(null);

  // Fetch Tables
  const loadTables = useCallback(async () => {
    try {
      const [tablesRes, ordersRes] = await Promise.all([fetch('/api/tables'), fetch('/api/orders')]);
      if (!tablesRes.ok || !ordersRes.ok) return;
      const tableList = await tablesRes.json();
      const billRequestedAt = Object.fromEntries(tableList.map(t => [t.id, t.billRequestedAt]));

      const orders = await ordersRes.json();
      setPendingOrders(
        orders
          .filter(o => o.status === 'pending_approval')
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      );

      // Running (unpaid) tab per table: accepted orders only, incl. 5% GST
      const tabs = {};
      orders
        .filter(o => BILLABLE_STATUSES.includes(o.status))
        .forEach(o => {
          const tab = tabs[o.tableId] || (tabs[o.tableId] = { total: 0, rounds: 0, addedAfterBill: 0 });
          tab.total += o.items.reduce((s, it) => s + it.itemTotal, 0) * 1.05;
          tab.rounds += 1;
          const requestedAt = billRequestedAt[o.tableId];
          if (requestedAt && new Date(o.createdAt) > new Date(requestedAt)) tab.addedAfterBill += 1;
        });
      setTables(tableList);
      setTableTabs(tabs);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (activeStaff.cashier) {
      loadTables();
    }
  }, [activeStaff.cashier, loadTables]);

  // Socket Listeners
  useEffect(() => {
    if (!socket || !activeStaff.cashier) return;

    const onTableUpdated = () => {
      loadTables();
    };

    const onCounterAlert = (alert) => {
      if (alert.type === 'bill_requested') {
        showToast(`🧾 ${alert.tableName} has requested the bill!`, 'warning');
        playAlertChime('bill');
      } else if (alert.type === 'ordered_after_bill') {
        showToast(`${alert.tableName}: ${alert.customerName} ordered more after the bill was requested — bill updated`, 'warning');
        playAlertChime('warning');
      } else if (alert.type === 'waiter_called') {
        showToast(`🙋‍♂️ Waiter called from ${alert.tableName}`, 'info');
        playAlertChime('waiter');
      }
      loadTables();
    };

    const onApprovalRequired = (data) => {
      showToast(data.message, data.order?.outsideGeofence ? 'danger' : 'info');
      playAlertChime(data.order?.outsideGeofence ? 'warning' : 'ticket');
      loadTables();
    };

    socket.on('counter:table_updated', onTableUpdated);
    socket.on('counter:alert', onCounterAlert);
    socket.on('counter:approval_required', onApprovalRequired);

    return () => {
      socket.off('counter:table_updated', onTableUpdated);
      socket.off('counter:alert', onCounterAlert);
      socket.off('counter:approval_required', onApprovalRequired);
    };
  }, [socket, activeStaff.cashier, loadTables, showToast, playAlertChime]);

  // Cashier Login
  const handleCashierLogin = async (id, pin) => {
    const cid = id || cashierIdInput;
    const p = pin || pinInput;
    if (!cid || !p) {
      setAuthError('Please enter Cashier ID and 4-Digit PIN');
      return;
    }

    const res = await login('cashier', cid, p);
    if (res.success) {
      setAuthError('');
      setPinInput('');
      showToast(`💵 Welcome, ${res.staff.name}!`, 'success');
      loadTables();
    } else {
      setAuthError(res.error || 'Invalid Cashier ID or PIN');
    }
  };

  // Open Table Checkout
  const openTableBill = async (table) => {
    setSelectedTable(table);
    setDiscount(0);
    setPaymentMethod('UPI / QR');

    try {
      const res = await fetch(`/api/tables/${table.id}/bill`);
      if (res.ok) {
        const bill = await res.json();
        setTableBill(bill);
      }
    } catch (e) {}
  };

  // Settle Bill & Reset Table
  const handleSettleBill = async () => {
    if (!selectedTable) return;

    try {
      const res = await fetch(`/api/tables/${selectedTable.id}/pay-and-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod,
          discount: parseFloat(discount) || 0,
          cashierName: activeStaff.cashier?.name || 'Priya Sharma (Cashier #101)',
          cashierId: activeStaff.cashier?.loginId || '101'
        })
      });

      const data = await res.json();
      if (res.ok) {
        setTableBill(null);
        setSelectedTable(null);
        if (data.invoice) {
          setSettledInvoice(data.invoice);
          showToast(`${data.invoice.tableName} settled and cleared for the next guests`, 'success');
          playAlertChime('settle');
        } else {
          showToast('Table cleared', 'info');
        }
        loadTables();
      }
    } catch (e) {}
  };

  // Incoming order handlers: accept → kitchen, or decline
  const handleIncomingOrder = async (order, action) => {
    setHandlingOrderIds(ids => [...ids, order.id]);
    try {
      const res = await fetch(`/api/orders/${order.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'approve'
          ? { cashierName: activeStaff.cashier?.name }
          : { reason: order.outsideGeofence ? 'Order placed from outside the restaurant.' : 'Declined by the counter.' })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(
          action === 'approve' ? `${order.id} (${order.tableName}) sent to the kitchen` : `${order.id} declined`,
          action === 'approve' ? 'success' : 'info'
        );
      } else {
        showToast(data.message || 'Could not update the order', 'warning');
      }
    } catch (e) {
      showToast('Could not reach the server', 'danger');
    } finally {
      setHandlingOrderIds(ids => ids.filter(id => id !== order.id));
      loadTables();
    }
  };

  const finalCalculatedTotal = tableBill ? Math.max(0, tableBill.total - (parseFloat(discount) || 0)) : 0;

  const statusCounts = tables.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});
  const closeBill = () => { setSelectedTable(null); setTableBill(null); };
  const billRequests = tables.filter(t => t.status === 'bill_requested');
  // Every table with an unpaid tab stays here until the cashier settles it
  const unpaidTables = tables.filter(t => tableTabs[t.id]);
  const unpaidTotal = unpaidTables.reduce((sum, t) => sum + tableTabs[t.id].total, 0);

  if (!activeStaff.cashier) {
    return (
      <LoginScreen
        icon="💵"
        accent="blue"
        title="Counter POS"
        subtitle="Floor table grid & billing terminal"
        idLabel="Cashier ID"
        idValue={cashierIdInput}
        onIdChange={setCashierIdInput}
        pin={pinInput}
        onPinChange={setPinInput}
        error={authError}
        onSubmit={() => handleCashierLogin()}
        submitLabel="Unlock terminal"
        demoLabel="101 / 1234"
        onDemo={() => handleCashierLogin('101', '1234')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <PanelHeader
        icon="💵"
        iconClass="bg-blue-600"
        title="Counter POS & Billing"
        subtitle="Floor occupancy & rapid checkout"
      >
        <span className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 sm:inline-flex">
          👤 {activeStaff.cashier.name}
        </span>
        <Button size="sm" onClick={() => logout('cashier')}>🔒 Logout</Button>
        <Button as={Link} to="/" size="sm" variant="ghost">🏠 Hub</Button>
      </PanelHeader>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Status summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(TABLE_STATUS).map(([key, meta]) => (
            <div key={key} className="rounded-xl bg-white px-4 py-3 shadow-xs ring-1 ring-slate-200">
              <div className="text-xs font-medium text-slate-500">{meta.label}</div>
              <div className={`mt-0.5 font-display text-2xl font-bold ${STATUS_TEXT[meta.tone]}`}>{statusCounts[key] || 0}</div>
            </div>
          ))}
        </div>

        {/* Incoming orders: nothing goes to the kitchen until the counter accepts it */}
        <section className={cx(
          'mt-5 rounded-2xl p-4 ring-1',
          pendingOrders.length ? 'bg-blue-50 ring-blue-200' : 'bg-white ring-slate-200'
        )}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              {pendingOrders.length > 0 && <span className="size-2 animate-pulse rounded-full bg-blue-500" />}
              Incoming orders ({pendingOrders.length})
            </h2>
            <span className="text-xs text-slate-500">Accept to send to the kitchen</span>
          </div>

          {pendingOrders.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">No orders waiting. New guest orders will appear here first.</p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {pendingOrders.map(order => {
                const busy = handlingOrderIds.includes(order.id);
                return (
                  <article
                    key={order.id}
                    className={cx(
                      'flex flex-col rounded-xl bg-white p-4 shadow-xs ring-1 animate-pop-in',
                      order.outsideGeofence ? 'ring-2 ring-red-300' : 'ring-slate-200'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-display text-lg font-bold text-slate-900">{order.tableName}</div>
                        <div className="truncate text-xs text-slate-500">
                          {order.id} · {order.formattedTime} · 👤 {order.customerName}
                        </div>
                      </div>
                      <span className="font-display text-lg font-bold tabular-nums">{formatINR(order.subtotal)}</span>
                    </div>

                    {order.outsideGeofence && (
                      <div className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                        ⚠️ Placed from outside the restaurant (~{(order.distanceMeters / 1000).toFixed(1)} km). Check the table is seated.
                      </div>
                    )}

                    <ul className="mt-3 space-y-1 text-sm">
                      {order.items.map((it, i) => (
                        <li key={i}>
                          <span className="font-semibold text-slate-500">{it.quantity}×</span> {it.name}
                          {it.notes && <span className="block pl-6 text-xs text-amber-700 italic">“{it.notes}”</span>}
                        </li>
                      ))}
                    </ul>
                    {order.notes && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">📝 {order.notes}</p>}

                    <div className="mt-4 grid grid-cols-[auto_1fr] gap-2 pt-1">
                      <Button size="sm" variant="danger-soft" disabled={busy} onClick={() => handleIncomingOrder(order, 'reject')}>Decline</Button>
                      <Button size="sm" variant="success" disabled={busy} onClick={() => handleIncomingOrder(order, 'approve')}>
                        {busy ? 'Sending…' : 'Accept → kitchen'}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Guests waiting for their bill */}
        {billRequests.length > 0 && (
          <div className="mt-5 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-red-800">
              <span className="size-2 animate-pulse rounded-full bg-red-500" />
              Waiting for the bill ({billRequests.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {billRequests.map(t => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl bg-white py-2 pr-2 pl-4 shadow-xs ring-1 ring-red-200">
                  <span className="font-semibold text-slate-900">{t.name}</span>
                  {tableTabs[t.id] && <span className="text-sm text-slate-500 tabular-nums">{formatINR(tableTabs[t.id].total)}</span>}
                  {tableTabs[t.id]?.addedAfterBill > 0 && <Badge tone="amber">+{tableTabs[t.id].addedAfterBill} after request</Badge>}
                  <Button size="sm" variant="success" onClick={() => openTableBill(t)}>Settle</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Floor plan</h2>
            <p className="text-sm text-slate-500">Tap a table to review its round or settle the bill</p>
          </div>
          <div className="rounded-xl bg-white px-4 py-2 text-right shadow-xs ring-1 ring-slate-200">
            <div className="text-xs font-medium text-slate-500">
              Unpaid · {unpaidTables.length} {unpaidTables.length === 1 ? 'table' : 'tables'}
            </div>
            <div className="font-display text-lg font-bold text-slate-900 tabular-nums">{formatINR(unpaidTotal)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map(table => {
            const isOccupied = table.status !== 'available';
            const tab = tableTabs[table.id];
            const pendingCount = pendingOrders.filter(o => o.tableId === table.id).length;
            const tone = (TABLE_STATUS[table.status] || {}).tone || 'slate';
            return (
              <button
                key={table.id}
                type="button"
                onClick={() => openTableBill(table)}
                className={cx(
                  'group relative flex min-h-40 flex-col overflow-hidden rounded-2xl bg-white p-5 text-left shadow-xs ring-1 transition',
                  'hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-blue-500',
                  STATUS_RING[tone],
                  table.status === 'bill_requested' && 'animate-pulse-slow'
                )}
              >
                <span className={cx('absolute inset-x-0 top-0 h-1', STATUS_BAR[tone])} />
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-xl font-bold text-slate-900">{table.name}</span>
                  <TableStatusBadge status={table.status} />
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {table.section || 'Main Dining'} · {table.capacity} guests
                </div>
                {pendingCount > 0 && (
                  <div className="mt-2"><Badge tone="blue" dot>{pendingCount} awaiting confirmation</Badge></div>
                )}
                <div className="mt-auto flex items-end justify-between gap-2 pt-5">
                  {isOccupied ? (
                    <>
                      <div>
                        <div className="font-display text-xl font-bold text-slate-900 tabular-nums">{formatINR(tab?.total)}</div>
                        <div className="text-xs text-slate-500">
                          {tab ? `${tab.rounds} ${tab.rounds === 1 ? 'order' : 'orders'} · running tab` : 'No accepted orders'}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-blue-600 group-hover:underline">Settle →</span>
                    </>
                  ) : (
                    <span className="text-sm font-semibold text-emerald-600">Ready for guests</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </main>

      {/* Billing checkout */}
      <Modal
        open={Boolean(selectedTable && tableBill)}
        onClose={closeBill}
        title={selectedTable ? `${selectedTable.name} · Settle bill` : ''}
        subtitle={selectedTable && <TableStatusBadge status={selectedTable.status} />}
        footer={
          <>
            <Button onClick={closeBill}>Cancel</Button>
            {tableBill?.items.length > 0 ? (
              <Button variant="success" onClick={handleSettleBill}>💵 Settle {formatINR(finalCalculatedTotal)} &amp; clear table</Button>
            ) : selectedTable?.status !== 'available' && (
              <Button variant="dark" onClick={handleSettleBill}>Clear table</Button>
            )}
          </>
        }
      >
        {tableBill && (tableBill.items.length === 0 ? (
          <EmptyState icon="🍽️" title="Nothing to bill">
            {selectedTable?.status !== 'available'
              ? 'No accepted orders on this table. Clear it to make it available for the next guests.'
              : 'This table has no active orders.'}
          </EmptyState>
        ) : (
          <div className="space-y-5">
            {tableBill.billRequestedAt ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-200">
                🧾 Bill requested at {formatTime(tableBill.billRequestedAt)}.
                {tableBill.ordersAfterBillRequest?.length > 0 && (
                  <strong> {tableBill.ordersAfterBillRequest.length} {tableBill.ordersAfterBillRequest.length === 1 ? 'order was' : 'orders were'} added after that ({tableBill.ordersAfterBillRequest.join(', ')}) — included below.</strong>
                )}
              </p>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                The guest hasn’t requested the bill — you can still settle now. This clears the table and closes their ordering session.
              </p>
            )}
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Items · {(tableBill.guests || []).length} {(tableBill.guests || []).length === 1 ? 'guest' : 'guests'}
                </span>
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
                  {[['guest', 'By guest'], ['item', 'By item']].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setBillView(id)}
                      className={cx('rounded-md px-2.5 py-1', billView === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {billView === 'guest' && tableBill.guests ? (
                <div className="space-y-2">
                  {tableBill.guests.map(g => (
                    <div key={g.name} className="overflow-hidden rounded-xl ring-1 ring-slate-200">
                      <div className="flex justify-between gap-3 bg-slate-50 px-4 py-2 text-sm font-semibold">
                        <span>👤 {g.name}</span>
                        <span className="tabular-nums">{formatINR(g.subtotal)}</span>
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {g.items.map((it, idx) => (
                          <li key={idx} className="flex justify-between gap-3 px-4 py-2 text-sm">
                            <span><span className="font-semibold text-slate-500">{it.quantity}×</span> {it.name}</span>
                            <span className="tabular-nums text-slate-600">{formatINR(it.itemTotal)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                  {tableBill.items.map((it, idx) => (
                    <li key={idx} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                      <span><span className="font-semibold text-slate-500">{it.quantity}×</span> {it.name}</span>
                      <span className="font-semibold tabular-nums">{formatINR(it.itemTotal)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>Subtotal</dt><dd className="tabular-nums">{formatINR(tableBill.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>GST (5%)</dt><dd className="tabular-nums">{formatINR(tableBill.tax)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-medium text-slate-700">Discount (₹)</dt>
                <dd>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-28 text-right font-semibold"
                  />
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold">
                <dt>Total due</dt><dd className="text-emerald-600 tabular-nums">{formatINR(finalCalculatedTotal)}</dd>
              </div>
            </dl>

            <div>
              <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Payment method</div>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={cx(
                      'flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-sm font-semibold ring-1 transition',
                      paymentMethod === m.id
                        ? 'bg-blue-50 text-blue-700 ring-2 ring-blue-500'
                        : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                    )}
                  >
                    <span className="text-xl">{m.icon}</span>{m.id}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </Modal>

      {/* Settled receipt */}
      <Modal
        open={Boolean(settledInvoice)}
        onClose={() => setSettledInvoice(null)}
        title="🧾 Receipt generated"
        size="sm"
        footer={
          <>
            <Button onClick={() => setSettledInvoice(null)}>Close</Button>
            <Button variant="blue" onClick={() => window.print()}>🖨️ Print receipt</Button>
          </>
        }
      >
        {settledInvoice && (
          <div className="print-receipt rounded-lg border border-dashed border-slate-300 bg-white p-5 font-mono text-sm text-slate-800">
            <div className="mb-3 text-center">
              <div className="text-base font-bold"><BrandName upper /></div>
              {restaurantAddress && <div className="text-xs text-slate-500">{restaurantAddress}</div>}
              <div className="mt-1 text-xs">Invoice: {settledInvoice.invoiceId}</div>
              <div className="text-xs">{settledInvoice.formattedDate}</div>
            </div>
            <div className="space-y-1 border-y border-dashed border-slate-300 py-2">
              {(settledInvoice.items || []).map((it, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span>{it.quantity}x {it.name}</span>
                  <span>{formatINR(it.total)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between font-bold">
              <span>PAID ({settledInvoice.paymentMethod})</span>
              <span>{formatINR(settledInvoice.finalTotal)}</span>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">Thank you for dining with us!</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

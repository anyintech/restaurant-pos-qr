import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../components/LoginScreen';
import { Button, Badge, Modal, Field, Input, Select, Textarea, Toggle, EmptyState, TableStatusBadge, formatINR, cx } from '../components/ui';
import BrandName from '../components/BrandName';
import { useRestaurant } from '../context/RestaurantContext';

const imagePresets = {
  'burger': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
  'pizza': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
  'wings': 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=600&q=80',
  'fries': 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80',
  'drink': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
  'dessert': 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80'
};

const IMAGE_PRESET_LABELS = [
  { id: 'burger', label: '🍔 Burger' },
  { id: 'pizza', label: '🍕 Pizza' },
  { id: 'wings', label: '🍗 Wings' },
  { id: 'fries', label: '🍟 Fries' },
  { id: 'drink', label: '🍹 Drink' },
  { id: 'dessert', label: '🍰 Dessert' }
];

const CATEGORY_OPTIONS = [
  { id: 'starters', label: 'Appetizers & Starters' },
  { id: 'mains', label: 'Signature Mains' },
  { id: 'pizzas', label: 'Artisanal Pizzas' },
  { id: 'beverages', label: 'Drinks & Cocktails' },
  { id: 'desserts', label: 'Decadent Desserts' }
];

const PERIODS = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: 'Month' }
];

const NAV_SECTIONS = [
  {
    title: 'Analytics & reports',
    items: [
      { id: 'overview', icon: '📊', label: 'Executive overview' },
      { id: 'table-sales', icon: '🪑', label: 'Sales by table' },
      { id: 'menu-sales', icon: '🍲', label: 'Sales by dish' },
      { id: 'order-times', icon: '⏱️', label: 'Order turnaround' }
    ]
  },
  {
    title: 'Management',
    items: [
      { id: 'menu-catalog', icon: '📋', label: 'Menu & stock' },
      { id: 'qr-stands', icon: '📱', label: 'Table QR stands' },
      { id: 'profile', icon: '🏷️', label: 'Restaurant profile' }
    ]
  }
];

export default function AdminPage() {
  const { socket, playAlertChime, showToast } = useSocket();
  const { activeStaff, login, logout } = useAuth();

  // Auth form state
  const [adminIdInput, setAdminIdInput] = useState('admin');
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');

  // UI state
  const [activeTab, setActiveTab] = useState('overview');
  const [activePeriod, setActivePeriod] = useState('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Notification Drawer state
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifSound, setNotifSound] = useState(true);
  const [notifsFilter, setNotifsFilter] = useState('all');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Reports data state
  const [overviewData, setOverviewData] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [tableSalesData, setTableSalesData] = useState([]);
  const [menuSalesData, setMenuSalesData] = useState([]);
  const [orderTimesData, setOrderTimesData] = useState(null);
  const [menuCatalog, setMenuCatalog] = useState([]);
  const [qrStands, setQrStands] = useState([]);

  // Search & Filter queries
  const [tableSearch, setTableSearch] = useState('');
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCatFilter, setMenuCatFilter] = useState('all');
  const [orderSearch, setOrderSearch] = useState('');

  // Modals state
  const [selectedTableInvoices, setSelectedTableInvoices] = useState(null);
  const [isDishModalOpen, setIsDishModalOpen] = useState(false);
  const [dishFormData, setDishFormData] = useState({
    id: '',
    name: '',
    price: '',
    category: 'mains',
    badge: '',
    description: '',
    image: imagePresets['burger'],
    isVeg: false,
    isSpicy: false,
    available: true
  });

  // Login handler
  const handleAdminLogin = async (id, pin) => {
    const aid = id || adminIdInput;
    const p = pin || pinInput;
    if (!p) {
      setAuthError('Please enter 4-digit PIN');
      return;
    }

    const res = await login('admin', aid, p);
    if (res.success) {
      setAuthError('');
      setPinInput('');
      showToast(`👤 Welcome, ${res.staff.name}!`, 'success');
      loadAllData();
    } else {
      setAuthError(res.error || 'Invalid Admin ID or PIN');
    }
  };

  // Data fetchers
  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (e) {}
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const [ovRes, statsRes] = await Promise.all([
        fetch(`/api/admin/reports/overview?period=${activePeriod}`),
        fetch('/api/stats')
      ]);
      if (ovRes.ok) setOverviewData(await ovRes.json());
      if (statsRes.ok) setStatsData(await statsRes.json());
    } catch (e) {}
  }, [activePeriod]);

  const loadTableSales = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reports/by-table?period=${activePeriod}`);
      if (res.ok) {
        const data = await res.json();
        setTableSalesData(data.tables || []);
      }
    } catch (e) {}
  }, [activePeriod]);

  const loadMenuSales = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reports/by-menu?period=${activePeriod}`);
      if (res.ok) {
        const data = await res.json();
        setMenuSalesData(data.items || []);
      }
    } catch (e) {}
  }, [activePeriod]);

  const loadOrderTimes = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reports/order-times?period=${activePeriod}`);
      if (res.ok) {
        const data = await res.json();
        setOrderTimesData(data);
      }
    } catch (e) {}
  }, [activePeriod]);

  const loadMenuCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/menu');
      if (res.ok) {
        const data = await res.json();
        setMenuCatalog(data.items || []);
      }
    } catch (e) {}
  }, []);

  const loadQrStands = useCallback(async () => {
    try {
      const tablesRes = await fetch('/api/tables');
      if (!tablesRes.ok) return;
      const tables = await tablesRes.json();

      const qrs = await Promise.all(tables.map(async (t) => {
        try {
          const qrRes = await fetch(`/api/qr/${t.id}`);
          const qrData = await qrRes.json();
          return { ...t, ...qrData };
        } catch (e) {
          return t;
        }
      }));

      setQrStands(qrs);
    } catch (e) {}
  }, []);

  const loadAllData = useCallback(() => {
    loadNotifications();
    if (activeTab === 'overview') loadOverview();
    if (activeTab === 'table-sales') loadTableSales();
    if (activeTab === 'menu-sales') loadMenuSales();
    if (activeTab === 'order-times') loadOrderTimes();
    if (activeTab === 'menu-catalog') loadMenuCatalog();
    if (activeTab === 'qr-stands') loadQrStands();
  }, [activeTab, loadNotifications, loadOverview, loadTableSales, loadMenuSales, loadOrderTimes, loadMenuCatalog, loadQrStands]);

  useEffect(() => {
    if (activeStaff.admin) {
      loadAllData();
    }
  }, [activeStaff.admin, loadAllData]);

  // Socket Events
  useEffect(() => {
    if (!socket || !activeStaff.admin) return;

    const onAdminNotification = (notif) => {
      setNotifications(prev => [notif, ...prev]);
      if (!isNotifOpen) setUnreadCount(c => c + 1);
      if (notifSound) playAlertChime(notif.category === 'kitchen' ? 'ticket' : 'bill');
      showToast(`${notif.title}: ${notif.message}`, 'info');
      loadAllData();
    };

    socket.on('admin:notification', onAdminNotification);
    socket.on('counter:table_updated', loadAllData);
    socket.on('kitchen:new_order', loadAllData);
    socket.on('order:status_updated', loadAllData);
    socket.on('menu:updated', loadMenuCatalog);

    return () => {
      socket.off('admin:notification', onAdminNotification);
      socket.off('counter:table_updated', loadAllData);
      socket.off('kitchen:new_order', loadAllData);
      socket.off('order:status_updated', loadAllData);
      socket.off('menu:updated', loadMenuCatalog);
    };
  }, [socket, activeStaff.admin, isNotifOpen, notifSound, playAlertChime, showToast, loadAllData, loadMenuCatalog]);

  // Menu Catalog CRUD
  const toggleStock = async (itemId, currentVal) => {
    try {
      const res = await fetch(`/api/menu/item/${itemId}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: !currentVal })
      });
      if (res.ok) {
        showToast(`Item availability updated`, 'info');
        loadMenuCatalog();
      }
    } catch (e) {}
  };

  const handleSaveDish = async (e) => {
    e.preventDefault();
    const id = dishFormData.id;
    const url = id ? `/api/menu/item/${id}` : '/api/menu/item';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dishFormData.name.trim(),
          price: parseFloat(dishFormData.price) || 0,
          category: dishFormData.category,
          badge: dishFormData.badge.trim(),
          description: dishFormData.description.trim(),
          image: dishFormData.image.trim() || imagePresets['burger'],
          isVeg: dishFormData.isVeg,
          isSpicy: dishFormData.isSpicy,
          available: dishFormData.available
        })
      });

      if (res.ok) {
        showToast(`Dish ${id ? 'updated' : 'added'} successfully!`, 'success');
        setIsDishModalOpen(false);
        loadMenuCatalog();
      } else {
        const d = await res.json();
        alert(d.error || 'Failed to save dish');
      }
    } catch (e) {}
  };

  const handleDeleteDish = async (itemId) => {
    if (!confirm('Are you sure you want to remove this dish from the menu?')) return;
    try {
      const res = await fetch(`/api/menu/item/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Dish removed from catalog', 'info');
        loadMenuCatalog();
      }
    } catch (e) {}
  };

  const openAddDishModal = () => {
    setDishFormData({
      id: '',
      name: '',
      price: '',
      category: 'mains',
      badge: '',
      description: '',
      image: imagePresets['burger'],
      isVeg: false,
      isSpicy: false,
      available: true
    });
    setIsDishModalOpen(true);
  };

  const openEditDishModal = (item) => {
    setDishFormData({
      id: item.id,
      name: item.name,
      price: item.price,
      category: item.category || 'mains',
      badge: item.badge || '',
      description: item.description || '',
      image: item.image || imagePresets['burger'],
      isVeg: Boolean(item.isVeg),
      isSpicy: Boolean(item.isSpicy),
      available: item.available !== false
    });
    setIsDishModalOpen(true);
  };

  // CSV Export Engine
  const exportCurrentReportCsv = () => {
    let csv = '';
    let filename = `report_${activeTab}_${activePeriod}_${Date.now()}.csv`;

    if (activeTab === 'table-sales') {
      csv = 'Table Name,Section,Capacity,Current State,Invoices Settled,Gross Revenue (INR),AOV (INR),Top Items\n';
      tableSalesData.forEach(t => {
        csv += `"${t.tableName}","${t.section}",${t.capacity},"${t.currentStatus}",${t.invoiceCount},${t.revenue.toFixed(2)},${t.aov.toFixed(2)},"${(t.topItems || '').replace(/"/g, '""')}"\n`;
      });
    } else if (activeTab === 'menu-sales') {
      csv = 'Dish Name,Category,Dietary,Price (INR),Units Sold,Gross Revenue (INR),Revenue Share (%),Menu Matrix\n';
      menuSalesData.forEach(i => {
        csv += `"${i.name}","${i.category}","${i.isVeg ? 'Veg' : 'Non-Veg'}",${i.price.toFixed(2)},${i.unitsSold},${i.grossRevenue.toFixed(2)},${i.revenueShare}%,"${i.matrixClass}"\n`;
      });
    } else if (activeTab === 'order-times' && orderTimesData) {
      csv = 'Order ID,Table,Items,Order Taken,Cooking Started,Plated Ready,Served Time,Prep Duration (Mins),Total Turnaround (Mins),SLA Performance\n';
      (orderTimesData.orders || []).forEach(o => {
        csv += `"${o.id}","${o.tableName}","${(o.itemsSummary || '').replace(/"/g, '""')}","${o.orderTakenTime}","${o.cookingAt || ''}","${o.readyAt || ''}","${o.servedAt || ''}",${o.prepMinutes || ''},${o.turnaroundMinutes || ''},"${o.slaStatus}"\n`;
      });
    }

    if (!csv) {
      showToast('No tabular data to export on this tab', 'warning');
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filename}`, 'success');
  };

  // Clear Notifications
  const clearAllNotifications = async () => {
    try {
      await fetch('/api/admin/notifications', { method: 'DELETE' });
      setNotifications([]);
      setUnreadCount(0);
    } catch (e) {}
  };

  // Filtered Notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (notifsFilter === 'all') return true;
      return n.category === notifsFilter;
    });
  }, [notifications, notifsFilter]);

  // Tab Titles mapping
  const tabMetadata = {
    'overview': { title: 'Executive Overview', sub: 'Real-time revenue, guest covers, and operational velocity.' },
    'table-sales': { title: 'Sales Report by Table', sub: 'Table-by-table revenue, turnover velocity, and invoice records.' },
    'menu-sales': { title: 'Sales Report by Menu Item', sub: 'Dish volume, revenue share, and menu engineering classification.' },
    'order-times': { title: 'Order Turnaround & Processing Times', sub: 'KDS kitchen prep milestones, order lifecycle, and SLA compliance.' },
    'menu-catalog': { title: 'Menu Catalog & Stock Management', sub: 'Create and edit dishes, adjust pricing, and toggle instant 86\'d stock.' },
    'qr-stands': { title: 'Printable Table QR Stand Cards', sub: 'High-resolution acrylic tent stand cards for seamless phone scanning.' },
    'profile': { title: 'Restaurant Profile', sub: 'Name, tagline and address shown to guests, on tickets and on receipts.' }
  };

  if (!activeStaff.admin) {
    return (
      <LoginScreen
        icon="⚙️"
        accent="brand"
        title="Manager sign-in"
        subtitle="Operations & intelligence hub"
        idLabel="Admin ID"
        idValue={adminIdInput}
        onIdChange={setAdminIdInput}
        pin={pinInput}
        onPinChange={setPinInput}
        error={authError}
        onSubmit={() => handleAdminLogin()}
        submitLabel="Unlock operations hub"
        demoLabel="admin / 9999"
        onDemo={() => handleAdminLogin('admin', '9999')}
      />
    );
  }

  const isReportTab = ['table-sales', 'menu-sales', 'order-times'].includes(activeTab);
  const selectTab = (id) => { setActiveTab(id); setIsSidebarOpen(false); };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/50 animate-fade-in lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={cx(
        'no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-950 text-slate-400 transition-transform duration-300 lg:translate-x-0',
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div className="grid size-10 place-items-center rounded-xl bg-linear-to-br from-amber-400 to-brand-600 text-xl">⚜️</div>
          <div>
            <BrandName upper className="block truncate font-display text-sm font-extrabold tracking-wide text-white" />
            <div className="text-[11px] tracking-wider text-slate-500 uppercase">Operations hub</div>
          </div>
        </div>

        <div className="mx-3 mt-4 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
          <div className="grid size-9 place-items-center rounded-full bg-slate-800 text-base">👤</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{activeStaff.admin.name}</div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> System live
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {NAV_SECTIONS.map(section => (
            <div key={section.title}>
              <div className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{section.title}</div>
              <div className="space-y-0.5">
                {section.items.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition',
                      activeTab === item.id ? 'bg-brand-400 text-ink shadow-sm shadow-brand-500/30' : 'hover:bg-white/5 hover:text-white'
                    )}
                  >
                    <span className="w-5 text-center">{item.icon}</span>{item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t border-white/10 p-3">
          <Link to="/counter" target="_blank" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white">
            <span className="w-5 text-center">💵</span> Counter POS <span className="ml-auto text-xs">↗</span>
          </Link>
          <Link to="/kds" target="_blank" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white">
            <span className="w-5 text-center">🍳</span> Kitchen KDS <span className="ml-auto text-xs">↗</span>
          </Link>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button type="button" onClick={() => logout('admin')} className="rounded-lg bg-white/5 py-2 text-sm font-semibold text-slate-300 hover:bg-red-500/15 hover:text-red-300">
              🔒 Logout
            </button>
            <Link to="/" className="rounded-lg bg-white/5 py-2 text-center text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white">
              🏠 Hub
            </Link>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="lg:pl-64 print:pl-0">
        <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open menu"
              className="grid size-9 place-items-center rounded-lg text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 lg:hidden"
            >
              ☰
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold text-slate-900">{tabMetadata[activeTab]?.title}</h1>
              <p className="hidden truncate text-sm text-slate-500 sm:block">{tabMetadata[activeTab]?.sub}</p>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="flex flex-1 rounded-lg bg-slate-100 p-1 sm:flex-none">
                {PERIODS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePeriod(p.id)}
                    className={cx(
                      'flex-1 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition sm:flex-none',
                      activePeriod === p.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {isReportTab && (
                <Button size="sm" onClick={exportCurrentReportCsv} title="Download CSV report">
                  📥 <span className="hidden md:inline">Export CSV</span>
                </Button>
              )}
              <Button size="sm" onClick={loadAllData} title="Refresh data" aria-label="Refresh data">🔄</Button>
              <button
                type="button"
                onClick={() => {
                  setIsNotifOpen(!isNotifOpen);
                  if (!isNotifOpen) setUnreadCount(0);
                }}
                title="Live operational alerts"
                aria-label="Live operational alerts"
                className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-white ring-1 ring-slate-200 hover:bg-slate-50"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 grid min-w-5 animate-bounce place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        <main className="space-y-6 p-4 sm:p-6">
          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <Kpi label="Gross revenue" value={formatINR(overviewData?.grossRevenue)} tone="text-emerald-600" meta="Incl. 5% GST" />
                <Kpi label="Avg order value" value={formatINR(overviewData?.avgOrderValue)} meta="Per settled invoice" />
                <Kpi label="Settled invoices" value={overviewData ? overviewData.totalInvoices : 0} meta="Completed checks" />
                <Kpi label="Avg prep time" value={`${overviewData ? overviewData.avgPrepDurationMinutes.toFixed(1) : '0.0'}m`} tone="text-violet-600" meta="Order → plated" />
                <Kpi label="Occupancy" value={overviewData ? `${overviewData.activeTablesCount} / ${overviewData.totalTables}` : '0 / 8'} meta="Active tables" />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="💳 Payment methods" sub="Receipts by channel">
                  {!overviewData || Object.keys(overviewData.paymentBreakdown).length === 0 ? (
                    <p className="text-sm text-slate-500">No settled receipts yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {Object.keys(overviewData.paymentBreakdown).map(method => {
                        const it = overviewData.paymentBreakdown[method];
                        const totalRev = Object.values(overviewData.paymentBreakdown).reduce((acc, c) => acc + c.revenue, 0) || 1;
                        const pct = Math.round((it.revenue / totalRev) * 100);
                        const color = method.includes('UPI') ? 'bg-emerald-500' : method.includes('Cash') ? 'bg-amber-500' : 'bg-blue-500';
                        return (
                          <div key={method}>
                            <div className="mb-1.5 flex justify-between gap-2 text-sm">
                              <span className="font-medium text-slate-700">{method} <span className="text-slate-400">· {it.count} bills</span></span>
                              <span className="font-semibold tabular-nums">{formatINR(it.revenue)} <span className="font-normal text-slate-400">({pct}%)</span></span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className={cx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Panel>

                <Panel title="⏰ Hourly velocity" sub="Revenue by hour of day">
                  {!overviewData || !overviewData.hourlyDistribution ? (
                    <p className="text-sm text-slate-500">Loading…</p>
                  ) : (
                    <div className="flex h-44 items-end gap-1">
                      {overviewData.hourlyDistribution.map(h => {
                        const maxRev = Math.max(...overviewData.hourlyDistribution.map(x => x.revenue), 10);
                        const barH = Math.max(3, Math.round((h.revenue / maxRev) * 100));
                        return (
                          <div key={h.hour} className="group flex h-full min-w-0 flex-1 flex-col items-center gap-1.5" title={`${h.label}: ${formatINR(h.revenue)} (${h.count} bills)`}>
                            <div className="flex w-full flex-1 items-end">
                              <div className="w-full rounded-t bg-brand-200 transition group-hover:bg-brand-500" style={{ height: `${barH}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400">{h.label.replace(' ', '')}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Panel>

                <Panel title="🔥 Top dishes" sub="Most ordered">
                  {!statsData || !statsData.topItems || statsData.topItems.length === 0 ? (
                    <p className="text-sm text-slate-500">No items sold yet.</p>
                  ) : (
                    <ol className="divide-y divide-slate-100">
                      {statsData.topItems.map((it, idx) => (
                        <li key={it.name} className="flex items-center justify-between gap-3 py-2.5">
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{idx + 1}</span>
                            <span className="truncate text-sm font-medium">{it.name}</span>
                          </span>
                          <Badge tone="blue">{it.count} sold</Badge>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>

                <Panel title="🧾 Recent invoices" sub="Latest settled checks">
                  {!statsData || !statsData.recentSales || statsData.recentSales.length === 0 ? (
                    <p className="text-sm text-slate-500">No invoices settled yet.</p>
                  ) : (
                    <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                      {statsData.recentSales.map(s => (
                        <li key={s.invoiceId} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{s.invoiceId} · {s.tableName}</div>
                            <div className="truncate text-xs text-slate-500">{s.formattedDate} · {s.paymentMethod}</div>
                          </div>
                          <span className="font-semibold text-emerald-600 tabular-nums">{formatINR(s.finalTotal)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </>
          )}

          {/* TAB: SALES BY TABLE */}
          {activeTab === 'table-sales' && (
            <Panel
              title="Revenue & turnover by table"
              sub="Spending, turnover and invoice history per table"
              action={<Input type="search" placeholder="🔍 Search table…" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} className="w-full sm:w-56" />}
              flush
            >
              <DataTable head={[
                'Table', 'Section', 'Status',
                { label: 'Invoices', align: 'center' }, { label: 'Gross sales', align: 'right' },
                { label: 'AOV', align: 'right' }, 'Favourite dishes', ''
              ]}>
                {tableSalesData
                  .filter(t => t.tableName.toLowerCase().includes(tableSearch.toLowerCase()) || t.section.toLowerCase().includes(tableSearch.toLowerCase()))
                  .map(t => (
                    <tr key={t.tableId} className="hover:bg-slate-50">
                      <td className={TD}><span className="font-semibold text-slate-900">{t.tableName}</span></td>
                      <td className={TD}>
                        <div>{t.section}</div>
                        <div className="text-xs text-slate-400">{t.capacity} guests</div>
                      </td>
                      <td className={TD}><TableStatusBadge status={t.currentStatus} /></td>
                      <td className={cx(TD, 'text-center font-semibold')}>{t.invoiceCount}</td>
                      <td className={cx(TD, 'text-right font-semibold text-emerald-600 tabular-nums')}>{formatINR(t.revenue)}</td>
                      <td className={cx(TD, 'text-right tabular-nums')}>{formatINR(t.aov)}</td>
                      <td className={cx(TD, 'max-w-52 truncate text-xs')}>{t.topItems}</td>
                      <td className={cx(TD, 'text-right')}>
                        <Button size="xs" onClick={() => setSelectedTableInvoices(t)}>View ({t.invoiceCount})</Button>
                      </td>
                    </tr>
                  ))}
              </DataTable>
            </Panel>
          )}

          {/* TAB: SALES BY MENU ITEM */}
          {activeTab === 'menu-sales' && (
            <Panel
              title="Menu engineering matrix"
              sub="Dish popularity, revenue share and classification"
              action={
                <div className="flex w-full gap-2 sm:w-auto">
                  <Select value={menuCatFilter} onChange={(e) => setMenuCatFilter(e.target.value)} className="sm:w-44">
                    <option value="all">All categories</option>
                    {CATEGORY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </Select>
                  <Input type="search" placeholder="🔍 Search dish…" value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className="sm:w-48" />
                </div>
              }
              flush
            >
              <DataTable head={[
                'Dish', 'Category', 'Dietary', { label: 'Price', align: 'right' }, { label: 'Units', align: 'center' },
                { label: 'Revenue', align: 'right' }, 'Share', 'Matrix', 'Stock'
              ]}>
                {menuSalesData
                  .filter(item => {
                    const matchQ = item.name.toLowerCase().includes(menuSearch.toLowerCase());
                    const matchCat = menuCatFilter === 'all' || (item.category && item.category.toLowerCase() === menuCatFilter.toLowerCase());
                    return matchQ && matchCat;
                  })
                  .map(item => {
                    let matrixTone = 'slate';
                    if (item.matrixClass.includes('Star')) matrixTone = 'amber';
                    else if (item.matrixClass.includes('Workhorse')) matrixTone = 'blue';
                    else if (item.matrixClass.includes('Puzzle')) matrixTone = 'violet';

                    return (
                      <tr key={item.name} className="hover:bg-slate-50">
                        <td className={TD}><span className="font-semibold text-slate-900">{item.name}</span></td>
                        <td className={cx(TD, 'capitalize')}>{item.category}</td>
                        <td className={TD}>{item.isVeg ? <Badge tone="green">Veg</Badge> : <Badge tone="red">Non-veg</Badge>}</td>
                        <td className={cx(TD, 'text-right tabular-nums')}>{formatINR(item.price)}</td>
                        <td className={cx(TD, 'text-center font-semibold')}>{item.unitsSold}</td>
                        <td className={cx(TD, 'text-right font-semibold text-emerald-600 tabular-nums')}>{formatINR(item.grossRevenue)}</td>
                        <td className={TD}>
                          <div className="flex w-32 items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, item.revenueShare * 3)}%` }} />
                            </div>
                            <span className="w-10 text-right text-xs font-semibold tabular-nums">{item.revenueShare}%</span>
                          </div>
                        </td>
                        <td className={TD}><Badge tone={matrixTone}>{item.matrixClass}</Badge></td>
                        <td className={TD}>{item.available !== false ? <Badge tone="green" dot>In stock</Badge> : <Badge tone="red" dot>Sold out</Badge>}</td>
                      </tr>
                    );
                  })}
              </DataTable>
            </Panel>
          )}

          {/* TAB: ORDER TURNAROUND */}
          {activeTab === 'order-times' && orderTimesData && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Kpi label="Avg kitchen prep" value={`${orderTimesData.avgPrepMinutes.toFixed(1)}m`} tone="text-violet-600" meta="Cooking → plated" />
                <Kpi label="Avg turnaround" value={`${orderTimesData.avgTurnaroundMinutes.toFixed(1)}m`} tone="text-blue-600" meta="Placed → served" />
                <Kpi label="SLA compliance" value={`${orderTimesData.slaCompliancePct.toFixed(1)}%`} tone="text-emerald-600" meta="Served within 20 min" />
                <div className="rounded-2xl bg-white p-4 shadow-xs ring-1 ring-slate-200">
                  <div className="text-xs font-medium text-slate-500">Speed distribution</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="green">⚡ {orderTimesData.fastCount}</Badge>
                    <Badge tone="amber">⏱️ {orderTimesData.normalCount}</Badge>
                    <Badge tone="red">⚠️ {orderTimesData.delayedCount}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">Target under 15 min</div>
                </div>
              </div>

              <Panel
                title="Order lifecycle audit"
                sub="Taken → cooking → ready → served"
                action={<Input type="search" placeholder="🔍 Order or table…" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} className="w-full sm:w-56" />}
                flush
              >
                <DataTable head={[
                  'Order', 'Table', 'Items', 'Taken', 'Cooking', 'Ready', 'Served',
                  { label: 'Prep', align: 'right' }, { label: 'Turnaround', align: 'right' }, 'SLA'
                ]}>
                  {(orderTimesData.orders || [])
                    .filter(o => o.id.toLowerCase().includes(orderSearch.toLowerCase()) || o.tableName.toLowerCase().includes(orderSearch.toLowerCase()) || o.itemsSummary.toLowerCase().includes(orderSearch.toLowerCase()))
                    .map(o => {
                      const prepStr = o.prepMinutes ? `${o.prepMinutes}m` : 'Cooking…';
                      const turnaroundStr = o.turnaroundMinutes ? `${o.turnaroundMinutes}m` : (o.status === 'served' ? '—' : 'In progress');
                      return (
                        <tr key={o.id} className="hover:bg-slate-50">
                          <td className={TD}><span className="font-semibold text-blue-600">{o.id}</span></td>
                          <td className={cx(TD, 'font-medium text-slate-900')}>{o.tableName}</td>
                          <td className={cx(TD, 'max-w-56 truncate text-xs')}>{o.itemsSummary}</td>
                          <td className={TD}>{o.orderTakenTime}</td>
                          <td className={TD}>{formatClock(o.cookingAt)}</td>
                          <td className={TD}>{formatClock(o.readyAt)}</td>
                          <td className={TD}>{formatClock(o.servedAt)}</td>
                          <td className={cx(TD, 'text-right font-semibold text-violet-600')}>{prepStr}</td>
                          <td className={cx(TD, 'text-right font-semibold text-slate-900')}>{turnaroundStr}</td>
                          <td className={TD}>
                            {o.slaStatus === 'fast' && <Badge tone="green">⚡ Fast</Badge>}
                            {o.slaStatus === 'normal' && <Badge tone="amber">Normal</Badge>}
                            {o.slaStatus === 'delayed' && <Badge tone="red">Delayed</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                </DataTable>
              </Panel>
            </>
          )}

          {/* TAB: MENU CATALOG */}
          {activeTab === 'menu-catalog' && (
            <Panel
              title="Menu catalog & live stock"
              sub="Add or edit dishes and mark items sold out across every guest menu instantly"
              action={<Button variant="primary" onClick={openAddDishModal}>+ Add dish</Button>}
              flush
            >
              <DataTable head={['Dish', 'Category', 'Price', 'Tags', 'Stock', { label: '', align: 'right' }]}>
                {menuCatalog.map(item => {
                  const isAvailable = item.available !== false;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className={TD}>
                        <div className="flex items-center gap-3">
                          <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-lg ring-1 ring-slate-200">
                            🍽️
                            <img src={item.image} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="absolute inset-0 size-full object-cover" />
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900">{item.name}</div>
                            <div className="max-w-72 truncate text-xs text-slate-500">{item.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className={cx(TD, 'capitalize')}>{item.category}</td>
                      <td className={cx(TD, 'font-semibold text-slate-900 tabular-nums')}>{formatINR(item.price)}</td>
                      <td className={TD}>
                        <div className="flex flex-wrap gap-1">
                          {item.isVeg ? <Badge tone="green">Veg</Badge> : <Badge tone="red">Non-veg</Badge>}
                          {item.isSpicy && <Badge tone="orange">🌶️ Spicy</Badge>}
                          {item.badge && <Badge tone="violet">⭐ {item.badge}</Badge>}
                        </div>
                      </td>
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          <Toggle checked={isAvailable} onChange={() => toggleStock(item.id, isAvailable)} label={`${item.name} in stock`} />
                          <span className={cx('text-xs font-semibold', isAvailable ? 'text-emerald-600' : 'text-red-600')}>
                            {isAvailable ? 'In stock' : 'Sold out'}
                          </span>
                        </div>
                      </td>
                      <td className={cx(TD, 'text-right')}>
                        <div className="flex justify-end gap-1.5">
                          <Button size="xs" onClick={() => openEditDishModal(item)}>✏️ Edit</Button>
                          <Button size="xs" variant="danger-soft" onClick={() => handleDeleteDish(item.id)} aria-label={`Delete ${item.name}`}>🗑️</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            </Panel>
          )}

          {/* TAB: RESTAURANT PROFILE */}
          {activeTab === 'profile' && <RestaurantProfileForm showToast={showToast} />}

          {/* TAB: QR STANDS */}
          {activeTab === 'qr-stands' && (
            <>
              <div className="no-print flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-xl text-sm text-slate-500">QR codes link straight to each table's menu. Sized for standard 4″×6″ acrylic table stands.</p>
                <Button variant="dark" onClick={() => window.print()}>🖨️ Print all stands</Button>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-2">
                {qrStands.map(t => (
                  <div key={t.id} className="flex break-inside-avoid flex-col items-center rounded-2xl bg-white p-6 text-center shadow-xs ring-1 ring-slate-200 print:shadow-none">
                    <BrandName upper className="block font-display text-lg font-extrabold tracking-wide text-slate-900" />
                    <div className="text-xs tracking-wider text-slate-500 uppercase">Dine-in digital ordering</div>
                    <div className="mt-4 rounded-full bg-accent-700 px-4 py-1 font-display text-sm font-bold tracking-wider text-white">
                      {t.name.toUpperCase()}
                    </div>
                    <div className="mt-1.5 text-xs text-slate-500">{t.section || 'Main Dining'} · {t.capacity} guests</div>
                    <div className="mt-4 rounded-2xl bg-white p-3 ring-2 ring-slate-900">
                      {t.qrImage ? <img src={t.qrImage} alt={`QR code for ${t.name}`} className="size-40" /> : <div className="size-40 animate-pulse rounded-lg bg-slate-100" />}
                    </div>
                    <div className="mt-4 text-sm font-bold text-slate-900">📱 Scan with your phone camera</div>
                    <div className="text-xs text-slate-500">No app needed · order instantly</div>
                    <div className="no-print mt-4 flex gap-2">
                      <Button as="a" href={t.url} target="_blank" rel="noreferrer" size="xs" variant="primary">Test link ↗</Button>
                      <Button size="xs" onClick={() => window.print()}>🖨️ Print</Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {/* NOTIFICATIONS DRAWER */}
      {isNotifOpen && (
        <div className="no-print fixed inset-0 z-40 bg-slate-950/30 animate-fade-in" onClick={() => setIsNotifOpen(false)} />
      )}
      <aside className={cx(
        'no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white transition-transform duration-300',
        isNotifOpen ? 'translate-x-0 shadow-2xl' : 'invisible translate-x-full'
      )}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-900">Live alerts</h2>
            <p className="text-xs text-slate-500">Kitchen &amp; cashier feed</p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setNotifSound(!notifSound)}
              title="Toggle sound alerts"
              className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"
            >
              {notifSound ? '🔊' : '🔇'}
            </button>
            <button type="button" onClick={() => setIsNotifOpen(false)} aria-label="Close alerts" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-5 py-2.5">
          {[
            { id: 'all', label: 'All', count: notifications.length },
            { id: 'kitchen', label: '🍳 Kitchen', count: notifications.filter(n => n.category === 'kitchen').length },
            { id: 'cashier', label: '💵 Cashier', count: notifications.filter(n => n.category === 'cashier').length }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setNotifsFilter(tab.id)}
              className={cx(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                notifsFilter === tab.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {tab.label} <span className="opacity-60">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto bg-slate-50 p-4">
          {filteredNotifications.length === 0 ? (
            <EmptyState icon="🔕" title="No alerts">Nothing recorded for this filter.</EmptyState>
          ) : (
            filteredNotifications.map(n => (
              <div
                key={n.id}
                className={cx(
                  'rounded-xl border-l-4 bg-white p-3 shadow-xs ring-1 ring-slate-200 animate-slide-in-right',
                  n.category === 'kitchen' ? 'border-l-violet-500' : 'border-l-blue-500'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{n.title}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{n.formattedTime}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{n.message}</p>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-slate-100 p-4">
          <Button block variant="danger-soft" onClick={clearAllNotifications}>Clear all alerts</Button>
        </div>
      </aside>

      {/* MODAL: ADD / EDIT DISH */}
      <Modal
        open={isDishModalOpen}
        onClose={() => setIsDishModalOpen(false)}
        title={dishFormData.id ? 'Edit dish' : 'Add new dish'}
        size="lg"
      >
        <form onSubmit={handleSaveDish} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Dish name *" className="sm:col-span-2">
              <Input
                required
                placeholder="e.g. Saffron butter chicken"
                value={dishFormData.name}
                onChange={(e) => setDishFormData({ ...dishFormData, name: e.target.value })}
              />
            </Field>
            <Field label="Price (₹) *">
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="18.50"
                value={dishFormData.price}
                onChange={(e) => setDishFormData({ ...dishFormData, price: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category *">
              <Select value={dishFormData.category} onChange={(e) => setDishFormData({ ...dishFormData, category: e.target.value })}>
                {CATEGORY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Badge (optional)">
              <Input
                placeholder="e.g. Chef's pick"
                value={dishFormData.badge}
                onChange={(e) => setDishFormData({ ...dishFormData, badge: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              rows={2}
              placeholder="Flavours, preparation, key ingredients…"
              value={dishFormData.description}
              onChange={(e) => setDishFormData({ ...dishFormData, description: e.target.value })}
            />
          </Field>

          <div>
            <Field label="Photo URL">
              <div className="flex gap-3">
                {dishFormData.image && <img src={dishFormData.image} alt="" className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />}
                <Input
                  type="url"
                  placeholder="https://images.unsplash.com/…"
                  value={dishFormData.image}
                  onChange={(e) => setDishFormData({ ...dishFormData, image: e.target.value })}
                />
              </div>
            </Field>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">Presets:</span>
              {IMAGE_PRESET_LABELS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDishFormData({ ...dishFormData, image: imagePresets[p.id] })}
                  className={cx(
                    'rounded-md px-2 py-1 text-xs font-medium ring-1 transition',
                    dishFormData.image === imagePresets[p.id] ? 'bg-brand-50 text-brand-800 ring-brand-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            {[
              { key: 'isVeg', label: '🟢 Vegetarian' },
              { key: 'isSpicy', label: '🌶️ Spicy' },
              { key: 'available', label: '✅ In stock' }
            ].map(opt => (
              <label key={opt.key} className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={dishFormData[opt.key]}
                  onChange={(e) => setDishFormData({ ...dishFormData, [opt.key]: e.target.checked })}
                  className="size-4 rounded accent-accent-600"
                />
                {opt.label}
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button onClick={() => setIsDishModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Save dish</Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: TABLE INVOICES */}
      <Modal
        open={Boolean(selectedTableInvoices)}
        onClose={() => setSelectedTableInvoices(null)}
        title={selectedTableInvoices ? `${selectedTableInvoices.tableName} · Settled bills` : ''}
        subtitle={selectedTableInvoices && `${selectedTableInvoices.invoiceCount} invoices · ${formatINR(selectedTableInvoices.revenue)} revenue`}
        size="lg"
      >
        {selectedTableInvoices && (!selectedTableInvoices.invoices || selectedTableInvoices.invoices.length === 0 ? (
          <EmptyState icon="🧾" title="No invoices yet">Nothing has been settled for this table.</EmptyState>
        ) : (
          <div className="space-y-3">
            {selectedTableInvoices.invoices.map(inv => (
              <div key={inv.invoiceId} className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-blue-600">{inv.invoiceId}</div>
                    <div className="text-xs text-slate-500">{inv.formattedDate} · {inv.cashier || 'Cashier #101'} · {inv.paymentMethod}</div>
                  </div>
                  <div className="font-display text-lg font-bold text-emerald-600 tabular-nums">{formatINR(inv.finalTotal)}</div>
                </div>
                <ul className="mt-3 space-y-1 border-t border-dashed border-slate-300 pt-3 text-sm">
                  {(inv.items || []).map((it, idx) => (
                    <li key={idx} className="flex justify-between gap-2 text-slate-600">
                      <span>{it.quantity}× {it.name}{it.orderedBy && <span className="text-slate-400"> · {it.orderedBy}</span>}</span>
                      <span className="tabular-nums">{formatINR(it.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </Modal>
    </div>
  );
}

const TD = 'px-4 py-3 align-middle text-slate-600 whitespace-nowrap';

function DataTable({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-y border-slate-200 bg-slate-50/80">
            {head.map((h, i) => {
              const col = typeof h === 'string' ? { label: h } : h;
              return (
                <th
                  key={i}
                  className={cx(
                    'px-4 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  )}
                >
                  {col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

function Panel({ title, sub, action, flush, children }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>
          {sub && <p className="text-sm text-slate-500">{sub}</p>}
        </div>
        {action}
      </div>
      <div className={flush ? '' : 'px-5 pb-5'}>{children}</div>
    </section>
  );
}

function RestaurantProfileForm({ showToast }) {
  const restaurant = useRestaurant();
  const [form, setForm] = useState({ name: restaurant.name, tagline: restaurant.tagline, address: restaurant.address });
  const [saving, setSaving] = useState(false);
  const dirty = form.name !== restaurant.name || form.tagline !== restaurant.tagline || form.address !== restaurant.address;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await restaurant.save(form);
      showToast('Restaurant profile saved — every screen is updated', 'success');
    } catch (err) {
      showToast(err.message, 'warning');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Panel title="Details" sub="Changes appear instantly on every open screen">
        <form onSubmit={handleSave} className="space-y-4">
          <Field label="Restaurant name *" hint="Shown in the guest menu header, staff screens, QR stands and receipts.">
            <Input required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. The Curry Leaf" />
          </Field>
          <Field label="Tagline">
            <Input maxLength={80} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="e.g. Coastal kitchen & bar" />
          </Field>
          <Field label="Address (printed on receipts)">
            <Input maxLength={120} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, area, city" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button disabled={!dirty || saving} onClick={() => setForm({ name: restaurant.name, tagline: restaurant.tagline, address: restaurant.address })}>Reset</Button>
            <Button type="submit" variant="primary" disabled={!dirty || saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </form>
      </Panel>

      <Panel title="Guest menu preview" sub="How the header reads on a phone">
        <div className="rounded-2xl bg-cream-50 p-4 ring-1 ring-cream-200">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-accent-600 uppercase">Good evening · Table 4</p>
          <p className="mt-0.5 font-serif text-2xl leading-tight font-semibold tracking-tight text-stone-900">
            {form.name.includes('&')
              ? <>{form.name.split('&')[0]}<span className="text-brand-700 italic">&amp;</span>{form.name.split('&').slice(1).join('&')}</>
              : (form.name || 'Restaurant name')}
          </p>
          {form.tagline && <p className="mt-1 text-sm text-stone-500">{form.tagline}</p>}
        </div>
      </Panel>
    </div>
  );
}

function Kpi({ label, value, meta, tone = 'text-slate-900' }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-xs ring-1 ring-slate-200">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cx('mt-1 truncate font-display text-2xl font-bold tabular-nums', tone)}>{value}</div>
      {meta && <div className="mt-1 text-xs text-slate-400">{meta}</div>}
    </div>
  );
}

function formatClock(iso) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

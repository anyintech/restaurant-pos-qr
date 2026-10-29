// ==========================================================================
// SAFFRON & SILK - EXECUTIVE ADMIN & OPERATIONS INTELLIGENCE CONTROLLER
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let activeAdmin = null;
  let activeTab = 'overview';
  let activePeriod = 'all';
  let notifications = [];
  let unreadNotifCount = 0;
  let soundEnabled = true;
  let currentTableSalesData = [];
  let currentMenuSalesData = [];
  let currentOrderTimesData = [];

  // DOM Elements - Auth
  const adminAuthOverlay = document.getElementById('admin-auth-overlay');
  const adminMainLayout = document.getElementById('admin-main-layout');
  const adminLoginIdInput = document.getElementById('admin-login-id');
  const adminPinInput = document.getElementById('admin-pin-input');
  const btnAdminSubmit = document.getElementById('btn-admin-submit');
  const adminAuthError = document.getElementById('admin-auth-error');
  const adminStaffName = document.getElementById('admin-staff-name');
  const btnAdminLogout = document.getElementById('btn-admin-logout');

  // DOM Elements - Navigation & Header
  const sidebarNavButtons = document.querySelectorAll('.sidebar-nav .nav-item');
  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  const adminSidebar = document.getElementById('admin-sidebar');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const periodButtons = document.querySelectorAll('.period-btn');
  const btnRefreshData = document.getElementById('btn-refresh-data');
  const btnExportCsv = document.getElementById('btn-export-csv');

  // DOM Elements - Notifications Center
  const adminNotifSidebar = document.getElementById('admin-notif-sidebar');
  const btnToggleNotifs = document.getElementById('btn-toggle-notifs');
  const btnCloseNotifs = document.getElementById('btn-close-notifs');
  const btnNotifSound = document.getElementById('btn-notif-sound');
  const notifBadge = document.getElementById('notif-badge');
  const notifFeedList = document.getElementById('notif-feed-list');
  const btnClearNotifs = document.getElementById('btn-clear-notifs');
  const notifFilterTabs = document.querySelectorAll('.notif-tab');
  const countNotifsAll = document.getElementById('count-notifs-all');
  const countNotifsKitchen = document.getElementById('count-notifs-kitchen');
  const countNotifsCashier = document.getElementById('count-notifs-cashier');

  // Panes Map
  const panes = {
    'overview': document.getElementById('pane-overview'),
    'table-sales': document.getElementById('pane-table-sales'),
    'menu-sales': document.getElementById('pane-menu-sales'),
    'order-times': document.getElementById('pane-order-times'),
    'menu-catalog': document.getElementById('pane-menu-catalog'),
    'qr-stands': document.getElementById('pane-qr-stands')
  };

  const titles = {
    'overview': { title: 'Executive Overview', sub: 'Real-time revenue, guest covers, and operational velocity.' },
    'table-sales': { title: 'Sales Report by Table', sub: 'Table-by-table revenue, turnover velocity, and invoice records.' },
    'menu-sales': { title: 'Sales Report by Menu Item', sub: 'Dish volume, revenue share, and menu engineering classification.' },
    'order-times': { title: 'Order Turnaround & Processing Times', sub: 'KDS kitchen prep milestones, order lifecycle, and SLA compliance.' },
    'menu-catalog': { title: 'Menu Catalog & Stock Management', sub: 'Create and edit dishes, adjust pricing, and toggle instant 86\'d stock.' },
    'qr-stands': { title: 'Printable Table QR Stand Cards', sub: 'High-resolution acrylic tent stand cards for seamless phone scanning.' }
  };

  // Image Presets for Add/Edit Menu Dish
  const imagePresets = {
    'burger': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
    'pizza': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
    'wings': 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=600&q=80',
    'fries': 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80',
    'drink': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
    'dessert': 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80'
  };

  // =========================================================================
  // 1. AUTHENTICATION CONTROLLER
  // =========================================================================
  async function submitAdminLogin(loginId, pin) {
    const id = loginId || (adminLoginIdInput ? adminLoginIdInput.value.trim() : 'admin');
    const p = pin || (adminPinInput ? adminPinInput.value.trim() : '');

    if (!p) {
      showAuthError('Please enter your 4-digit PIN');
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin', loginId: id, pin: p })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem('admin_auth_token', data.token);
        sessionStorage.setItem('admin_staff_info', JSON.stringify(data.staff));
        activeAdmin = data.staff;
        unlockAdmin();
      } else {
        showAuthError(data.error || 'Invalid Admin ID or PIN');
      }
    } catch (e) {
      showAuthError('Server communication error. Please try again.');
    }
  }

  function showAuthError(msg) {
    if (adminAuthError) {
      adminAuthError.textContent = msg;
      adminAuthError.style.display = 'block';
      setTimeout(() => {
        if (adminAuthError) adminAuthError.style.display = 'none';
      }, 3000);
    }
  }

  function unlockAdmin() {
    if (adminAuthOverlay) adminAuthOverlay.style.display = 'none';
    if (adminMainLayout) adminMainLayout.style.display = 'flex';
    if (adminStaffName && activeAdmin) adminStaffName.textContent = activeAdmin.name;

    window.AppSync.showToast(`👤 Welcome, ${activeAdmin ? activeAdmin.name : 'Manager'}!`, 'success');
    
    // Initial data fetch
    loadActiveTabData();
    loadNotifications();
  }

  function lockAdmin() {
    sessionStorage.removeItem('admin_auth_token');
    sessionStorage.removeItem('admin_staff_info');
    activeAdmin = null;
    if (adminPinInput) adminPinInput.value = '';
    if (adminMainLayout) adminMainLayout.style.display = 'none';
    if (adminAuthOverlay) adminAuthOverlay.style.display = 'flex';
  }

  function quickLogin(loginId, pin) {
    if (adminLoginIdInput) adminLoginIdInput.value = loginId;
    if (adminPinInput) adminPinInput.value = pin;
    submitAdminLogin(loginId, pin);
  }

  async function checkExistingAuth() {
    const savedToken = sessionStorage.getItem('admin_auth_token');
    if (savedToken) {
      try {
        const res = await fetch(`/api/auth/verify?token=${savedToken}`);
        if (res.ok) {
          const data = await res.json();
          if (data.valid && data.staff && data.staff.role === 'admin') {
            activeAdmin = data.staff;
            unlockAdmin();
            return;
          }
        }
      } catch (e) {}
    }
    if (adminAuthOverlay) adminAuthOverlay.style.display = 'flex';
  }

  if (btnAdminSubmit) {
    btnAdminSubmit.addEventListener('click', () => submitAdminLogin());
  }
  if (adminPinInput) {
    adminPinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitAdminLogin();
    });
  }
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', lockAdmin);
  }

  // Mobile sidebar toggle
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', () => {
      if (adminSidebar) adminSidebar.classList.toggle('open');
    });
  }

  // =========================================================================
  // 2. TAB NAVIGATION & PERIOD SELECTOR
  // =========================================================================
  sidebarNavButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      switchTab(target);
      if (window.innerWidth <= 1024 && adminSidebar) {
        adminSidebar.classList.remove('open');
      }
    });
  });

  function switchTab(tabId) {
    if (!panes[tabId]) return;
    activeTab = tabId;

    // Update active nav button
    sidebarNavButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update panes
    Object.keys(panes).forEach(k => {
      if (panes[k]) {
        panes[k].style.display = k === tabId ? 'block' : 'none';
      }
    });

    // Update titles
    if (titles[tabId]) {
      pageTitle.textContent = titles[tabId].title;
      pageSubtitle.textContent = titles[tabId].sub;
    }

    // Toggle CSV export button visibility (only for data report tabs)
    if (btnExportCsv) {
      const canExport = ['table-sales', 'menu-sales', 'order-times'].includes(tabId);
      btnExportCsv.style.display = canExport ? 'inline-flex' : 'none';
    }

    loadActiveTabData();
  }

  periodButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      periodButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activePeriod = btn.dataset.period;
      loadActiveTabData();
    });
  });

  if (btnRefreshData) {
    btnRefreshData.addEventListener('click', () => {
      btnRefreshData.style.transform = 'rotate(180deg)';
      setTimeout(() => btnRefreshData.style.transform = 'none', 300);
      loadActiveTabData();
      loadNotifications();
    });
  }

  function loadActiveTabData() {
    switch (activeTab) {
      case 'overview': loadOverview(); break;
      case 'table-sales': loadTableSales(); break;
      case 'menu-sales': loadMenuSales(); break;
      case 'order-times': loadOrderTimes(); break;
      case 'menu-catalog': loadMenuCatalog(); break;
      case 'qr-stands': loadQrStands(); break;
    }
  }

  // =========================================================================
  // 3. TAB 1: EXECUTIVE OVERVIEW
  // =========================================================================
  async function loadOverview() {
    try {
      const res = await fetch(`/api/admin/reports/overview?period=${activePeriod}`);
      if (!res.ok) return;
      const data = await res.json();

      document.getElementById('ov-revenue').textContent = `₹${data.grossRevenue.toFixed(2)}`;
      document.getElementById('ov-aov').textContent = `₹${data.avgOrderValue.toFixed(2)}`;
      document.getElementById('ov-invoices').textContent = data.totalInvoices;
      document.getElementById('ov-prep-time').textContent = `${data.avgPrepDurationMinutes.toFixed(1)}m`;
      document.getElementById('ov-tables').textContent = `${data.activeTablesCount} / ${data.totalTables}`;

      // Payment Breakdown
      const pmContainer = document.getElementById('ov-payment-methods');
      const pmKeys = Object.keys(data.paymentBreakdown);
      if (pmKeys.length === 0) {
        pmContainer.innerHTML = `<div style="color:var(--text-muted); padding:10px;">No settled payments in this period.</div>`;
      } else {
        const totalPmRev = pmKeys.reduce((acc, k) => acc + data.paymentBreakdown[k].revenue, 0) || 1;
        const colorMap = {
          'UPI / QR': '#10b981',
          'Cash': '#f59e0b',
          'Credit Card': '#3b82f6'
        };

        pmContainer.innerHTML = pmKeys.map(method => {
          const item = data.paymentBreakdown[method];
          const pct = Math.round((item.revenue / totalPmRev) * 100);
          const color = colorMap[method] || '#6366f1';
          return `
            <div class="pm-row">
              <div class="pm-meta">
                <span>${method} (${item.count} bills)</span>
                <span>₹${item.revenue.toFixed(2)} (${pct}%)</span>
              </div>
              <div class="pm-bar-track">
                <div class="pm-bar-fill" style="width: ${pct}%; background: ${color};"></div>
              </div>
            </div>
          `;
        }).join('');
      }

      // Hourly Dining Velocity Bar Chart
      const hourlyContainer = document.getElementById('ov-hourly-bars');
      if (data.hourlyDistribution && data.hourlyDistribution.length > 0) {
        const maxRev = Math.max(...data.hourlyDistribution.map(h => h.revenue), 10);
        hourlyContainer.innerHTML = data.hourlyDistribution.map(h => {
          const barHeight = Math.max(4, Math.round((h.revenue / maxRev) * 100));
          return `
            <div class="hour-col" title="${h.label}: ₹${h.revenue.toFixed(2)} (${h.count} bills)">
              <div class="hour-bar-wrap">
                <div class="hour-bar" style="height: ${barHeight}%;"></div>
              </div>
              <div class="hour-label">${h.label.replace(' ', '')}</div>
            </div>
          `;
        }).join('');
      }

      // Top Items & Recent Sales
      const statsRes = await fetch('/api/stats');
      if (statsRes.ok) {
        const stats = await statsRes.json();
        const topContainer = document.getElementById('ov-top-items');
        if (stats.topItems && stats.topItems.length > 0) {
          topContainer.innerHTML = stats.topItems.map((item, i) => `
            <div class="top-item-row">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 800; color: #2563eb; width: 18px;">#${i + 1}</span>
                <span style="font-weight: 700; font-size: 0.9rem;">${item.name}</span>
              </div>
              <span class="badge" style="background:#eff6ff; color:#2563eb; font-weight:800;">${item.count} sold</span>
            </div>
          `).join('');
        }

        const recentContainer = document.getElementById('ov-recent-sales');
        if (stats.recentSales && stats.recentSales.length > 0) {
          recentContainer.innerHTML = stats.recentSales.map(s => `
            <div class="sale-entry">
              <div>
                <div style="font-weight: 800; font-size: 0.88rem;">${s.invoiceId} • ${s.tableName}</div>
                <div style="font-size: 0.72rem; color: var(--text-secondary);">${s.formattedDate} • ${s.paymentMethod}</div>
              </div>
              <div style="font-weight: 800; color: #059669; font-size: 1rem;">
                ₹${s.finalTotal.toFixed(2)}
              </div>
            </div>
          `).join('');
        }
      }
    } catch (err) {
      console.error('Failed to load overview:', err);
    }
  }

  // =========================================================================
  // 4. TAB 2: SALES REPORT BY TABLE
  // =========================================================================
  async function loadTableSales() {
    try {
      const res = await fetch(`/api/admin/reports/by-table?period=${activePeriod}`);
      if (!res.ok) return;
      const data = await res.json();
      currentTableSalesData = data.tables || [];
      renderTableSales();
    } catch (err) {
      console.error('Failed to load table sales:', err);
    }
  }

  function renderTableSales() {
    const tbody = document.getElementById('table-sales-tbody');
    const query = (document.getElementById('table-search-input')?.value || '').toLowerCase();

    const filtered = currentTableSalesData.filter(t => 
      t.tableName.toLowerCase().includes(query) ||
      t.section.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">No table sales recorded for this period.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const statusColor = t.currentStatus === 'available' ? '#059669' : '#ea580c';
      const statusBg = t.currentStatus === 'available' ? '#ecfdf5' : '#fff7ed';
      return `
        <tr>
          <td>
            <div style="font-weight: 800; font-size: 0.95rem; color: #0f172a;">${t.tableName}</div>
          </td>
          <td>
            <div style="font-size: 0.82rem; color: #475569;">${t.section}</div>
            <div style="font-size: 0.72rem; color: #94a3b8;">Capacity: ${t.capacity} Guests</div>
          </td>
          <td>
            <span class="badge" style="background:${statusBg}; color:${statusColor}; text-transform:capitalize;">
              ● ${t.currentStatus.replace('_', ' ')}
            </span>
          </td>
          <td style="text-align: center; font-weight: 800;">${t.invoiceCount}</td>
          <td style="text-align: right; font-weight: 800; color: #059669; font-size: 0.95rem;">₹${t.revenue.toFixed(2)}</td>
          <td style="text-align: right; font-weight: 700;">₹${t.aov.toFixed(2)}</td>
          <td style="font-size: 0.8rem; color: #475569; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${t.topItems}
          </td>
          <td style="text-align: right;">
            <button class="btn btn-secondary" style="font-size:0.75rem; padding:5px 10px;" onclick="window.AdminApp.showTableInvoices(${t.tableId}, '${t.tableName}')">
              🔍 View (${t.invoiceCount})
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('table-search-input')?.addEventListener('input', renderTableSales);

  // Table Invoices Modal
  function showTableInvoices(tableId, tableName) {
    const tableObj = currentTableSalesData.find(t => t.tableId === tableId);
    if (!tableObj) return;

    const modal = document.getElementById('modal-table-invoices');
    document.getElementById('modal-table-title').textContent = `${tableName} - Settled Bills`;
    document.getElementById('modal-table-sub').textContent = `Total Bills: ${tableObj.invoiceCount} • Total Revenue: ₹${tableObj.revenue.toFixed(2)}`;

    const body = document.getElementById('modal-table-invoices-body');
    if (!tableObj.invoices || tableObj.invoices.length === 0) {
      body.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">No invoices settled for this table.</div>`;
    } else {
      body.innerHTML = tableObj.invoices.map(inv => `
        <div style="background:#f8fafc; border:1px solid var(--border); border-radius:12px; padding:14px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div>
              <span style="font-weight:800; font-size:0.95rem; color:#2563eb;">${inv.invoiceId}</span>
              <span style="font-size:0.75rem; color:#64748b; margin-left:8px;">${inv.formattedDate}</span>
            </div>
            <div style="font-weight:800; font-size:1.05rem; color:#059669;">₹${inv.finalTotal.toFixed(2)}</div>
          </div>
          <div style="font-size:0.8rem; color:#475569; margin-bottom:6px;">
            Cashier: ${inv.cashier || 'Cashier #101'} • Payment: <strong>${inv.paymentMethod}</strong>
          </div>
          <div style="border-top:1px dashed var(--border); padding-top:8px; font-size:0.78rem;">
            ${(inv.items || []).map(it => `
              <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                <span>${it.quantity}x ${it.name}</span>
                <span>₹${it.total.toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
    }

    modal.style.display = 'flex';
  }

  // =========================================================================
  // 5. TAB 3: SALES REPORT BY MENU ITEM
  // =========================================================================
  async function loadMenuSales() {
    try {
      const res = await fetch(`/api/admin/reports/by-menu?period=${activePeriod}`);
      if (!res.ok) return;
      const data = await res.json();
      currentMenuSalesData = data.items || [];
      renderMenuSales();
    } catch (err) {
      console.error('Failed to load menu sales:', err);
    }
  }

  function renderMenuSales() {
    const tbody = document.getElementById('menu-sales-tbody');
    const query = (document.getElementById('menu-search-input')?.value || '').toLowerCase();
    const cat = document.getElementById('menu-cat-filter')?.value || 'all';

    const filtered = currentMenuSalesData.filter(item => {
      const matchQ = item.name.toLowerCase().includes(query);
      const matchCat = cat === 'all' || (item.category && item.category.toLowerCase() === cat.toLowerCase());
      return matchQ && matchCat;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No menu items match criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      // Matrix class styling
      let matrixBadgeClass = 'dog';
      if (item.matrixClass.includes('Star')) matrixBadgeClass = 'star';
      else if (item.matrixClass.includes('Workhorse')) matrixBadgeClass = 'workhorse';
      else if (item.matrixClass.includes('Puzzle')) matrixBadgeClass = 'puzzle';

      return `
        <tr>
          <td>
            <div style="font-weight: 800; font-size: 0.92rem; color: #0f172a;">${item.name}</div>
          </td>
          <td style="text-transform: capitalize; color: #475569;">${item.category}</td>
          <td>
            ${item.isVeg 
              ? `<span style="font-size:0.75rem; font-weight:700; color:#059669; background:#ecfdf5; padding:2px 8px; border-radius:4px;">🟢 Veg</span>`
              : `<span style="font-size:0.75rem; font-weight:700; color:#dc2626; background:#fef2f2; padding:2px 8px; border-radius:4px;">🔴 Non-Veg</span>`
            }
          </td>
          <td style="text-align: right; font-weight: 700;">₹${item.price.toFixed(2)}</td>
          <td style="text-align: center; font-weight: 800; font-size: 0.95rem;">${item.unitsSold}</td>
          <td style="text-align: right; font-weight: 800; color: #059669;">₹${item.grossRevenue.toFixed(2)}</td>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="flex:1; height:6px; background:#f1f5f9; border-radius:4px; overflow:hidden;">
                <div style="height:100%; width:${Math.min(100, item.revenueShare * 3)}%; background:#2563eb; border-radius:4px;"></div>
              </div>
              <span style="font-size:0.75rem; font-weight:700; color:#475569; width:36px;">${item.revenueShare}%</span>
            </div>
          </td>
          <td>
            <span class="matrix-badge ${matrixBadgeClass}">
              ${item.matrixClass}
            </span>
          </td>
          <td>
            ${item.available !== false 
              ? `<span class="badge" style="background:#ecfdf5; color:#059669;">🟢 In Stock</span>`
              : `<span class="badge" style="background:#fef2f2; color:#dc2626;">🔴 86'd Out</span>`
            }
          </td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('menu-search-input')?.addEventListener('input', renderMenuSales);
  document.getElementById('menu-cat-filter')?.addEventListener('change', renderMenuSales);

  // =========================================================================
  // 6. TAB 4: ORDER TURNAROUND & PROCESS TIMES (KDS SLA)
  // =========================================================================
  async function loadOrderTimes() {
    try {
      const res = await fetch(`/api/admin/reports/order-times?period=${activePeriod}`);
      if (!res.ok) return;
      const data = await res.json();
      currentOrderTimesData = data.orders || [];

      document.getElementById('timing-avg-prep').textContent = `${data.avgPrepMinutes.toFixed(1)}m`;
      document.getElementById('timing-avg-turnaround').textContent = `${data.avgTurnaroundMinutes.toFixed(1)}m`;
      document.getElementById('timing-sla-rate').textContent = `${data.slaCompliancePct.toFixed(1)}%`;

      document.getElementById('timing-sla-distribution').innerHTML = `
        <span class="sla-tag fast">⚡ Fast: ${data.fastCount}</span>
        <span class="sla-tag normal">⏱️ Normal: ${data.normalCount}</span>
        <span class="sla-tag delayed">⚠️ Late: ${data.delayedCount}</span>
      `;

      renderOrderTimes();
    } catch (err) {
      console.error('Failed to load order times:', err);
    }
  }

  function renderOrderTimes() {
    const tbody = document.getElementById('order-times-tbody');
    const query = (document.getElementById('order-search-input')?.value || '').toLowerCase();

    const filtered = currentOrderTimesData.filter(o => 
      o.id.toLowerCase().includes(query) ||
      o.tableName.toLowerCase().includes(query) ||
      o.itemsSummary.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-muted);">No order logs match criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(o => {
      const prepStr = o.prepMinutes ? `${o.prepMinutes}m` : 'Cooking...';
      const turnaroundStr = o.turnaroundMinutes ? `${o.turnaroundMinutes}m` : (o.status === 'served' ? '—' : 'In Progress');
      
      let slaBadge = `<span class="sla-tag fast">⚡ Fast (&lt;10m)</span>`;
      if (o.slaStatus === 'normal') slaBadge = `<span class="sla-tag normal">⏱️ Normal</span>`;
      if (o.slaStatus === 'delayed') slaBadge = `<span class="sla-tag delayed">⚠️ Delayed (&gt;20m)</span>`;

      return `
        <tr>
          <td><strong style="color:#2563eb;">${o.id}</strong></td>
          <td><strong>${o.tableName}</strong></td>
          <td style="font-size:0.8rem; color:#475569; max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${o.itemsSummary}">
            ${o.itemsSummary}
          </td>
          <td>${o.orderTakenTime}</td>
          <td>${o.cookingAt ? new Date(o.cookingAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
          <td>${o.readyAt ? new Date(o.readyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
          <td>${o.servedAt ? new Date(o.servedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
          <td style="text-align: right; font-weight: 700; color: #7c3aed;">${prepStr}</td>
          <td style="text-align: right; font-weight: 800; color: #0f172a;">${turnaroundStr}</td>
          <td>${slaBadge}</td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('order-search-input')?.addEventListener('input', renderOrderTimes);

  // =========================================================================
  // 7. TAB 5: MENU CATALOG & 86'd STOCK (CRUD)
  // =========================================================================
  let menuCatalogItems = [];

  async function loadMenuCatalog() {
    try {
      const res = await fetch('/api/menu');
      if (!res.ok) return;
      const data = await res.json();
      menuCatalogItems = data.items || [];
      renderMenuCatalog();
    } catch (err) {
      console.error('Failed to load menu catalog:', err);
    }
  }

  function renderMenuCatalog() {
    const tbody = document.getElementById('menu-catalog-tbody');
    tbody.innerHTML = menuCatalogItems.map(item => {
      const isAvailable = item.available !== false;
      return `
        <tr>
          <td style="display: flex; align-items: center; gap: 12px;">
            <img src="${item.image}" alt="${item.name}" style="width:48px; height:48px; border-radius:10px; object-fit:cover; border:1px solid var(--border);">
            <div>
              <div style="font-weight: 800; font-size: 0.92rem; color: #0f172a;">${item.name}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${item.description || ''}
              </div>
            </div>
          </td>
          <td style="text-transform: capitalize; color: #475569;">${item.category}</td>
          <td style="font-weight: 800; color: #0f172a;">₹${item.price.toFixed(2)}</td>
          <td>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              ${item.isVeg ? `<span class="badge" style="background:#ecfdf5; color:#059669;">🟢 Veg</span>` : `<span class="badge" style="background:#fef2f2; color:#dc2626;">🔴 Non-Veg</span>`}
              ${item.isSpicy ? `<span class="badge" style="background:#fff7ed; color:#ea580c;">🌶️ Spicy</span>` : ''}
              ${item.badge ? `<span class="badge" style="background:#f5f3ff; color:#7c3aed;">⭐ ${item.badge}</span>` : ''}
            </div>
          </td>
          <td>
            <label class="switch">
              <input type="checkbox" ${isAvailable ? 'checked' : ''} onchange="window.AdminApp.toggleStock('${item.id}', this.checked)">
              <span class="slider"></span>
            </label>
            <span style="font-size:0.75rem; font-weight:700; margin-left:8px; color:${isAvailable ? '#059669' : '#dc2626'};">
              ${isAvailable ? 'In Stock' : '86\'d Sold Out'}
            </span>
          </td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button class="btn btn-secondary" style="font-size:0.75rem; padding:6px 10px;" onclick="window.AdminApp.openEditDishModal('${item.id}')">
                ✏️ Edit
              </button>
              <button class="btn btn-secondary" style="font-size:0.75rem; padding:6px 10px; color:#dc2626; border-color:#fecaca;" onclick="window.AdminApp.deleteDish('${item.id}')">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function toggleStock(itemId, newStatus) {
    try {
      const res = await fetch(`/api/menu/item/${itemId}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: newStatus })
      });

      if (res.ok) {
        window.AppSync.showToast(`Item stock updated to: ${newStatus ? 'In Stock' : 'Sold Out'}`, 'info');
        loadMenuCatalog();
      }
    } catch (err) {
      console.error('Stock toggle failed:', err);
    }
  }

  // Add / Edit Modal Controls
  const modalMenuDish = document.getElementById('modal-menu-dish');
  const modalMenuTitle = document.getElementById('modal-menu-title');
  const dishIdInput = document.getElementById('dish-id');
  const dishNameInput = document.getElementById('dish-name');
  const dishPriceInput = document.getElementById('dish-price');
  const dishCategorySelect = document.getElementById('dish-category');
  const dishBadgeInput = document.getElementById('dish-badge');
  const dishDescInput = document.getElementById('dish-description');
  const dishImageInput = document.getElementById('dish-image');
  const dishVegCheckbox = document.getElementById('dish-veg');
  const dishSpicyCheckbox = document.getElementById('dish-spicy');
  const dishAvailableCheckbox = document.getElementById('dish-available');

  document.getElementById('btn-open-add-dish')?.addEventListener('click', () => {
    modalMenuTitle.textContent = 'Add New Menu Dish';
    dishIdInput.value = '';
    dishNameInput.value = '';
    dishPriceInput.value = '';
    dishCategorySelect.value = 'mains';
    dishBadgeInput.value = '';
    dishDescInput.value = '';
    dishImageInput.value = imagePresets['burger'];
    dishVegCheckbox.checked = false;
    dishSpicyCheckbox.checked = false;
    dishAvailableCheckbox.checked = true;
    modalMenuDish.style.display = 'flex';
  });

  function openEditDishModal(itemId) {
    const item = menuCatalogItems.find(i => i.id === itemId);
    if (!item) return;

    modalMenuTitle.textContent = 'Edit Menu Dish';
    dishIdInput.value = item.id;
    dishNameInput.value = item.name;
    dishPriceInput.value = item.price;
    dishCategorySelect.value = item.category || 'mains';
    dishBadgeInput.value = item.badge || '';
    dishDescInput.value = item.description || '';
    dishImageInput.value = item.image || '';
    dishVegCheckbox.checked = Boolean(item.isVeg);
    dishSpicyCheckbox.checked = Boolean(item.isSpicy);
    dishAvailableCheckbox.checked = item.available !== false;

    modalMenuDish.style.display = 'flex';
  }

  function closeMenuModal() {
    if (modalMenuDish) modalMenuDish.style.display = 'none';
  }

  function setPresetImage(presetKey) {
    if (imagePresets[presetKey] && dishImageInput) {
      dishImageInput.value = imagePresets[presetKey];
    }
  }

  async function saveDishForm() {
    const id = dishIdInput.value.trim();
    const payload = {
      name: dishNameInput.value.trim(),
      price: parseFloat(dishPriceInput.value),
      category: dishCategorySelect.value,
      badge: dishBadgeInput.value.trim(),
      description: dishDescInput.value.trim(),
      image: dishImageInput.value.trim() || imagePresets['burger'],
      isVeg: dishVegCheckbox.checked,
      isSpicy: dishSpicyCheckbox.checked,
      available: dishAvailableCheckbox.checked
    };

    try {
      const url = id ? `/api/menu/item/${id}` : '/api/menu/item';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        window.AppSync.showToast(`Dish ${id ? 'updated' : 'added'} successfully!`, 'success');
        closeMenuModal();
        loadMenuCatalog();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to save menu dish');
      }
    } catch (err) {
      console.error('Save dish failed:', err);
    }
  }

  async function deleteDish(itemId) {
    if (!confirm('Are you sure you want to remove this dish from the menu?')) return;
    try {
      const res = await fetch(`/api/menu/item/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        window.AppSync.showToast('Dish removed from catalog.', 'info');
        loadMenuCatalog();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  // =========================================================================
  // 8. TAB 6: TABLE QR STAND CARDS (PRINT STUDIO)
  // =========================================================================
  const qrStandsGrid = document.getElementById('qr-stands-grid');

  async function loadQrStands() {
    try {
      const tablesRes = await fetch('/api/tables');
      if (!tablesRes.ok) return;
      const tables = await tablesRes.json();

      const qrCards = await Promise.all(tables.map(async (table) => {
        try {
          const qrRes = await fetch(`/api/qr/${table.id}`);
          const qrData = await qrRes.json();

          return `
            <div class="table-tent-card" id="qr-stand-${table.id}">
              <div class="table-tent-header">
                <div class="tent-brand-name">SAFFRON &amp; SILK</div>
                <div class="tent-tagline">Dine-In Digital Ordering</div>
              </div>

              <div class="tent-table-pill">
                ${table.name.toUpperCase()}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 12px;">
                ${table.section || 'Dining Area'} • Capacity ${table.capacity} Guests
              </div>

              <div class="tent-qr-frame">
                <img src="${qrData.qrImage}" alt="QR code for ${table.name}">
              </div>

              <div class="tent-instructions">
                <strong>📱 Scan with Phone Camera</strong>
                <div style="font-size: 0.72rem; color: #64748b; margin-top: 3px;">No app download needed • Instant order</div>
              </div>

              <div class="no-print" style="margin-top: 14px; display: flex; gap: 8px; justify-content: center;">
                <a href="${qrData.url}" target="_blank" class="btn btn-primary" style="text-decoration: none; font-size: 0.78rem; padding: 6px 12px;">
                  Test QR Link ↗
                </a>
                <button onclick="window.AdminApp.printSingleStand('qr-stand-${table.id}')" class="btn btn-secondary" style="font-size: 0.78rem; padding: 6px 12px;">
                  🖨️ Print
                </button>
              </div>
            </div>
          `;
        } catch (e) {
          return `<div class="table-tent-card">Error generating QR for ${table.name}</div>`;
        }
      }));

      qrStandsGrid.innerHTML = qrCards.join('');
    } catch (err) {
      console.error('Failed to load QR stands:', err);
    }
  }

  function printSingleStand(cardId) {
    const cardEl = document.getElementById(cardId);
    if (!cardEl) return;

    const printWindow = window.open('', '_blank', 'width=500,height=700');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Table Stand</title>
        <style>
          body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 90vh; text-align: center; }
          .table-tent-card { border: 2px solid #000; border-radius: 16px; padding: 30px; width: 320px; }
          .no-print { display: none !important; }
        </style>
      </head>
      <body>
        ${cardEl.outerHTML}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(() => window.close(), 500);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  // =========================================================================
  // 9. REAL-TIME NOTIFICATIONS CENTER (KITCHEN & CASHIER)
  // =========================================================================
  let activeNotifFilter = 'all';

  if (btnToggleNotifs) {
    btnToggleNotifs.addEventListener('click', () => {
      adminNotifSidebar.classList.toggle('open');
      if (adminNotifSidebar.classList.contains('open')) {
        unreadNotifCount = 0;
        updateNotifBadge();
      }
    });
  }

  if (btnCloseNotifs) {
    btnCloseNotifs.addEventListener('click', () => {
      adminNotifSidebar.classList.remove('open');
    });
  }

  if (btnNotifSound) {
    btnNotifSound.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      btnNotifSound.textContent = soundEnabled ? '🔊' : '🔇';
      btnNotifSound.classList.toggle('active', soundEnabled);
      window.AppSync.showToast(`Operational alert sounds: ${soundEnabled ? 'ON' : 'MUTED'}`, 'info');
      if (soundEnabled) window.AppSync.playAlertChime('ticket');
    });
  }

  notifFilterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      notifFilterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeNotifFilter = tab.dataset.filter;
      renderNotifications();
    });
  });

  if (btnClearNotifs) {
    btnClearNotifs.addEventListener('click', async () => {
      try {
        await fetch('/api/admin/notifications', { method: 'DELETE' });
        notifications = [];
        unreadNotifCount = 0;
        renderNotifications();
        updateNotifBadge();
      } catch (e) {}
    });
  }

  async function loadNotifications() {
    try {
      const res = await fetch('/api/admin/notifications');
      if (res.ok) {
        notifications = await res.json();
        renderNotifications();
      }
    } catch (e) {}
  }

  function renderNotifications() {
    const kitchenCount = notifications.filter(n => n.category === 'kitchen').length;
    const cashierCount = notifications.filter(n => n.category === 'cashier').length;

    countNotifsAll.textContent = notifications.length;
    countNotifsKitchen.textContent = kitchenCount;
    countNotifsCashier.textContent = cashierCount;

    const filtered = notifications.filter(n => {
      if (activeNotifFilter === 'all') return true;
      return n.category === activeNotifFilter;
    });

    if (filtered.length === 0) {
      notifFeedList.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:0.85rem;">No ${activeNotifFilter === 'all' ? '' : activeNotifFilter} alerts recorded.</div>`;
      return;
    }

    notifFeedList.innerHTML = filtered.map(n => `
      <div class="notif-card ${n.category}">
        <div class="notif-card-header">
          <span class="notif-card-title">${n.title}</span>
          <span class="notif-card-time">${n.formattedTime || ''}</span>
        </div>
        <div class="notif-card-desc">${n.message}</div>
      </div>
    `).join('');
  }

  function addRealtimeNotification(notif) {
    notifications.unshift(notif);
    if (!adminNotifSidebar.classList.contains('open')) {
      unreadNotifCount++;
      updateNotifBadge();
    }
    renderNotifications();

    if (soundEnabled) {
      window.AppSync.playAlertChime(notif.category === 'kitchen' ? 'ticket' : 'bill');
    }
    window.AppSync.showToast(`${notif.title}: ${notif.message}`, 'info');
  }

  function updateNotifBadge() {
    if (unreadNotifCount > 0) {
      notifBadge.textContent = unreadNotifCount;
      notifBadge.style.display = 'flex';
    } else {
      notifBadge.style.display = 'none';
    }
  }

  // =========================================================================
  // 10. CSV EXPORT ENGINE
  // =========================================================================
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      let csvContent = '';
      let filename = `report_${activeTab}_${activePeriod}_${Date.now()}.csv`;

      if (activeTab === 'table-sales') {
        csvContent = 'Table Name,Section,Capacity,Current State,Invoices Settled,Gross Revenue (INR),AOV (INR),Top Items\n';
        currentTableSalesData.forEach(t => {
          csvContent += `"${t.tableName}","${t.section}",${t.capacity},"${t.currentStatus}",${t.invoiceCount},${t.revenue.toFixed(2)},${t.aov.toFixed(2)},"${t.topItems.replace(/"/g, '""')}"\n`;
        });
      } else if (activeTab === 'menu-sales') {
        csvContent = 'Dish Name,Category,Dietary,Price (INR),Units Sold,Gross Revenue (INR),Revenue Share (%),Menu Matrix\n';
        currentMenuSalesData.forEach(i => {
          csvContent += `"${i.name}","${i.category}","${i.isVeg ? 'Veg' : 'Non-Veg'}",${i.price.toFixed(2)},${i.unitsSold},${i.grossRevenue.toFixed(2)},${i.revenueShare}%,"${i.matrixClass}"\n`;
        });
      } else if (activeTab === 'order-times') {
        csvContent = 'Order ID,Table,Items,Order Taken,Cooking Started,Plated Ready,Served Time,Prep Duration (Mins),Total Turnaround (Mins),SLA Performance\n';
        currentOrderTimesData.forEach(o => {
          csvContent += `"${o.id}","${o.tableName}","${o.itemsSummary.replace(/"/g, '""')}","${o.orderTakenTime}","${o.cookingAt || ''}","${o.readyAt || ''}","${o.servedAt || ''}",${o.prepMinutes || ''},${o.turnaroundMinutes || ''},"${o.slaStatus}"\n`;
        });
      }

      if (!csvContent) {
        window.AppSync.showToast('Nothing to export on this tab', 'warning');
        return;
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.AppSync.showToast(`Exported ${filename}`, 'success');
    });
  }

  // =========================================================================
  // 11. SOCKET.IO REALTIME EVENTS
  // =========================================================================
  const socket = window.AppSync.getSocket();
  if (socket) {
    // Operational notification broadcast
    socket.on('admin:notification', (notif) => {
      addRealtimeNotification(notif);
      if (activeTab === 'overview' || activeTab === 'order-times') {
        loadActiveTabData();
      }
    });

    // Kitchen orders update
    socket.on('kitchen:new_order', () => {
      if (activeTab === 'overview' || activeTab === 'order-times') loadActiveTabData();
    });

    socket.on('order:status_updated', () => {
      if (activeTab === 'overview' || activeTab === 'order-times') loadActiveTabData();
    });

    // Counter settlement update
    socket.on('counter:table_updated', () => {
      if (activeTab === 'overview' || activeTab === 'table-sales' || activeTab === 'menu-sales') {
        loadActiveTabData();
      }
    });

    // Menu catalog update
    socket.on('menu:updated', () => {
      if (activeTab === 'menu-catalog' || activeTab === 'menu-sales') {
        loadActiveTabData();
      }
    });
  }

  // Global exports for inline HTML handlers
  window.AdminApp = {
    toggleStock,
    showTableInvoices,
    openEditDishModal,
    closeMenuModal,
    setPresetImage,
    saveDishForm,
    deleteDish,
    printSingleStand
  };

  window.AdminAuth = {
    quickLogin,
    lockAdmin
  };

  // Boot Application Auth check
  checkExistingAuth();
});

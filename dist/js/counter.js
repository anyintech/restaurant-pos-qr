// Counter / Cashier POS & Floor Management Logic
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const tablesGrid = document.getElementById('tables-grid');
  const clockEl = document.getElementById('pos-clock');
  const statRevenue = document.getElementById('stat-revenue');
  const statOccupied = document.getElementById('stat-occupied');
  const statOrders = document.getElementById('stat-orders');

  // Outside Geofence Approvals Elements
  const outsideApprovalsContainer = document.getElementById('outside-approvals-container');
  const approvalsCardsList = document.getElementById('approvals-cards-list');
  const pendingApprovalsPill = document.getElementById('pending-approvals-pill');
  const approvalsCountBadge = document.getElementById('approvals-count-badge');

  // Modal Elements
  const modalBackdrop = document.getElementById('billing-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const modalTableTitle = document.getElementById('modal-table-title');
  const billItemsTbody = document.getElementById('bill-items-tbody');
  const inputDiscount = document.getElementById('input-discount');
  const payMethodBtns = document.querySelectorAll('.pay-method-btn');
  const btnPrintReceipt = document.getElementById('btn-print-receipt');
  const btnCollectReset = document.getElementById('btn-collect-reset');

  // Receipt Elements
  const receiptInvoiceId = document.getElementById('receipt-invoice-id');
  const receiptDateTime = document.getElementById('receipt-date-time');
  const receiptTableNo = document.getElementById('receipt-table-no');
  const receiptItemsContainer = document.getElementById('receipt-items-container');
  const receiptSubtotal = document.getElementById('receipt-subtotal');
  const receiptCgst = document.getElementById('receipt-cgst');
  const receiptSgst = document.getElementById('receipt-sgst');
  const receiptDiscountRow = document.getElementById('receipt-discount-row');
  const receiptDiscount = document.getElementById('receipt-discount');
  const receiptGrandTotal = document.getElementById('receipt-grand-total');
  const receiptPayMethod = document.getElementById('receipt-pay-method');

  // Cashier Auth Elements
  const cashierAuthOverlay = document.getElementById('cashier-auth-overlay');
  const cashierIdSelect = document.getElementById('cashier-id-select');
  const cashierAuthError = document.getElementById('cashier-auth-error');
  const cashierActiveBadge = document.getElementById('cashier-active-badge');
  const activeCashierName = document.getElementById('active-cashier-name');
  const btnLockCashier = document.getElementById('btn-lock-cashier');

  // State
  let tables = [];
  let pendingApprovals = [];
  let currentActiveBill = null;
  let selectedPaymentMethod = 'Cash';
  let activeCashier = null;
  let enteredCashierPin = '';

  // --- CASHIER PIN KEYPAD & AUTH LOGIC ---
  function updateCashierPinDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`pos-dot-${i}`);
      if (dot) {
        if (i < enteredCashierPin.length) {
          dot.style.background = '#2563eb';
          dot.style.borderColor = '#2563eb';
          dot.style.boxShadow = '0 0 8px #2563eb';
        } else {
          dot.style.background = 'transparent';
          dot.style.borderColor = '#cbd5e1';
          dot.style.boxShadow = 'none';
        }
      }
    }
  }

  async function submitCashierAuth() {
    if (enteredCashierPin.length !== 4) return;

    const loginId = cashierIdSelect ? cashierIdSelect.value : '101';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'cashier', loginId, pin: enteredCashierPin })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem('pos_cashier_token', data.token);
        sessionStorage.setItem('pos_cashier_info', JSON.stringify(data.staff));
        activeCashier = data.staff;
        unlockCashier();
      } else {
        showCashierAuthError(data.error || 'Invalid Cashier PIN');
      }
    } catch (e) {
      showCashierAuthError('Connection error. Please try again.');
    }
  }

  function showCashierAuthError(msg) {
    if (cashierAuthError) {
      cashierAuthError.textContent = msg;
      cashierAuthError.style.display = 'block';
    }
    setTimeout(() => {
      clearCashierPin();
      if (cashierAuthError) cashierAuthError.style.display = 'none';
    }, 1200);
  }

  function tapCashierKey(digit) {
    if (enteredCashierPin.length < 4) {
      enteredCashierPin += digit;
      updateCashierPinDots();
      if (enteredCashierPin.length === 4) {
        submitCashierAuth();
      }
    }
  }

  function backspaceCashier() {
    if (enteredCashierPin.length > 0) {
      enteredCashierPin = enteredCashierPin.slice(0, -1);
      updateCashierPinDots();
    }
  }

  function clearCashierPin() {
    enteredCashierPin = '';
    updateCashierPinDots();
  }

  function quickLogin(loginId, pin) {
    if (cashierIdSelect) cashierIdSelect.value = loginId;
    enteredCashierPin = pin;
    updateCashierPinDots();
    submitCashierAuth();
  }

  function unlockCashier() {
    if (cashierAuthOverlay) cashierAuthOverlay.style.display = 'none';
    if (cashierActiveBadge) cashierActiveBadge.style.display = 'flex';
    if (btnLockCashier) btnLockCashier.style.display = 'flex';
    if (activeCashierName && activeCashier) {
      activeCashierName.textContent = activeCashier.name;
    }
    window.AppSync.showToast(`💼 Cashier Register unlocked by ${activeCashier ? activeCashier.name : 'Cashier'}!`, 'success');
    loadData();
  }

  function lockCashier() {
    sessionStorage.removeItem('pos_cashier_token');
    sessionStorage.removeItem('pos_cashier_info');
    activeCashier = null;
    clearCashierPin();
    if (cashierActiveBadge) cashierActiveBadge.style.display = 'none';
    if (btnLockCashier) btnLockCashier.style.display = 'none';
    if (cashierAuthOverlay) cashierAuthOverlay.style.display = 'flex';
  }

  if (btnLockCashier) {
    btnLockCashier.addEventListener('click', lockCashier);
  }

  async function checkExistingCashierAuth() {
    const savedToken = sessionStorage.getItem('pos_cashier_token');
    if (savedToken) {
      try {
        const res = await fetch(`/api/auth/verify?token=${savedToken}`);
        if (res.ok) {
          const data = await res.json();
          if (data.valid && data.staff && data.staff.role === 'cashier') {
            activeCashier = data.staff;
            unlockCashier();
            return;
          }
        }
      } catch (e) {}
    }
    // Show lock
    if (cashierAuthOverlay) cashierAuthOverlay.style.display = 'flex';
  }

  window.PosAuth = {
    tapKey: tapCashierKey,
    backspace: backspaceCashier,
    clearPin: clearCashierPin,
    quickLogin,
    lockCashier
  };

  // 1. Clock
  function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // 2. Fetch Data
  async function loadData() {
    try {
      const [tablesRes, statsRes, ordersRes] = await Promise.all([
        fetch('/api/tables'),
        fetch('/api/stats'),
        fetch('/api/orders')
      ]);

      if (tablesRes.ok) {
        tables = await tablesRes.json();
        renderTables();
      }

      if (statsRes.ok) {
        const stats = await statsRes.json();
        statRevenue.textContent = `₹${stats.totalRevenue.toFixed(2)}`;
        statOrders.textContent = stats.totalOrders;
        statOccupied.textContent = `${stats.activeTablesCount} / ${stats.totalTables}`;
      }

      if (ordersRes.ok) {
        const allOrders = await ordersRes.json();
        pendingApprovals = allOrders.filter(o => o.status === 'pending_approval');
        renderApprovals();
      }
    } catch (err) {
      console.error('Failed to load POS data:', err);
    }
  }

  // Render Outside Geofence Approvals
  function renderApprovals() {
    if (!outsideApprovalsContainer || !approvalsCardsList) return;

    if (pendingApprovals.length === 0) {
      outsideApprovalsContainer.style.display = 'none';
      if (pendingApprovalsPill) pendingApprovalsPill.style.display = 'none';
      return;
    }

    outsideApprovalsContainer.style.display = 'block';
    if (pendingApprovalsPill) {
      pendingApprovalsPill.style.display = 'inline-flex';
      pendingApprovalsPill.textContent = `🚨 ${pendingApprovals.length} Outside Order(s) Need Approval`;
    }
    if (approvalsCountBadge) {
      approvalsCountBadge.textContent = `${pendingApprovals.length} Pending`;
    }

    approvalsCardsList.innerHTML = pendingApprovals.map(order => {
      const distStr = order.distanceMeters ? `~${(order.distanceMeters / 1000).toFixed(1)} km away` : 'Outside Venue';
      const itemsSummary = order.items.map(i => `${i.quantity}× ${i.name}`).join(', ');

      return `
        <div style="background: #fff; border: 1px solid #fecaca; border-radius: var(--radius-md); padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; box-shadow: var(--shadow-sm);">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 1.1rem; color: #991b1b;">${order.tableName}</strong>
              <span class="badge" style="background: #fee2e2; color: #b91c1c; font-weight: 700; font-size: 0.75rem;">
                📍 ${distStr}
              </span>
              <span style="font-size: 0.8rem; color: var(--text-muted);">${order.id} • ${order.formattedTime}</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-primary); margin-top: 4px;">
              ${itemsSummary}
            </div>
            <div style="font-size: 0.9rem; font-weight: 800; color: #059669; margin-top: 2px;">
              Total: ₹${order.subtotal.toFixed(2)}
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <button onclick="window.PosApp.approveOrder('${order.id}')" style="background: #10b981; color: #fff; border: none; padding: 10px 18px; border-radius: var(--radius-md); font-weight: 800; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.25);">
              <span>✅ Approve &amp; Send to Kitchen</span>
            </button>
            <button onclick="window.PosApp.rejectOrder('${order.id}')" style="background: #f1f5f9; color: #dc2626; border: 1px solid #fecaca; padding: 10px 14px; border-radius: var(--radius-md); font-weight: 700; font-size: 0.85rem; cursor: pointer;">
              <span>❌ Decline</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  async function approveOrder(orderId) {
    try {
      const res = await fetch(`/api/orders/${orderId}/approve`, { method: 'POST' });
      if (res.ok) {
        window.AppSync.playAlertChime('success');
        window.AppSync.showToast(`✅ Order ${orderId} approved and fired to the Kitchen!`, 'success');
        loadData();
      }
    } catch (e) {
      console.error('Failed to approve order:', e);
    }
  }

  async function rejectOrder(orderId) {
    try {
      const res = await fetch(`/api/orders/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Unverified table occupancy' })
      });
      if (res.ok) {
        window.AppSync.showToast(`Order ${orderId} was declined.`, 'warning');
        loadData();
      }
    } catch (e) {
      console.error('Failed to reject order:', e);
    }
  }

  // 3. Render Tables Grid
  async function renderTables() {
    // For each table, let's fetch its active bill total if not available
    const tableCardsHTML = await Promise.all(tables.map(async (t) => {
      let activeTotal = 0;
      let orderCount = 0;

      if (t.status !== 'available') {
        try {
          const bRes = await fetch(`/api/tables/${t.id}/bill`);
          if (bRes.ok) {
            const bill = await bRes.json();
            activeTotal = bill.total;
            orderCount = bill.orderCount;
          }
        } catch (e) {}
      }

      const statusLabels = {
        available: '🟢 Available',
        cooking: '🔥 Cooking in Kitchen',
        ready: '🍲 Food Ready',
        served: '✨ Dishes Served',
        bill_requested: '🚨 Bill Requested'
      };

      const statusClass = `table-${t.status || 'available'}`;
      const isOccupied = t.status !== 'available';

      return `
        <div class="table-pos-card ${statusClass}" onclick="window.PosApp.openBillModal(${t.id})">
          <div class="table-card-top">
            <div>
              <div class="table-title">${t.name}</div>
              <div class="table-meta">${t.capacity} Seats • ${t.section || 'Main Dining'}</div>
            </div>
            <span class="badge" style="font-size:0.75rem; font-weight:700;">
              ${statusLabels[t.status] || t.status}
            </span>
          </div>

          <div class="table-card-center">
            <div class="tab-amount-display">
              ${isOccupied ? `₹${activeTotal.toFixed(2)}` : '₹0.00'}
            </div>
            <div class="tab-orders-count">
              ${isOccupied ? `${orderCount} order round(s) active` : 'Table is clean & ready for guests'}
            </div>
          </div>

          <div class="table-card-actions">
            ${isOccupied 
              ? `
                <button class="btn-card-action btn-prepare-bill" onclick="event.stopPropagation(); window.PosApp.openBillModal(${t.id})">
                  💳 Bill &amp; Settlement ➔
                </button>
              `
              : `
                <button class="btn-card-action btn-view-tab" style="opacity:0.7;" onclick="event.stopPropagation(); window.PosApp.openBillModal(${t.id})">
                  Quick Settle / Reset
                </button>
              `
            }
          </div>
        </div>
      `;
    }));

    tablesGrid.innerHTML = tableCardsHTML.join('');
  }

  // 4. Open Bill & Settlement Modal
  async function openBillModal(tableId) {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    modalTableTitle.textContent = `${table.name} • Running Tab & Settlement`;

    try {
      const res = await fetch(`/api/tables/${tableId}/bill`);
      if (!res.ok) throw new Error('Could not fetch bill');
      currentActiveBill = await res.json();
    } catch (e) {
      currentActiveBill = {
        tableId,
        tableName: table.name,
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0
      };
    }

    // Reset inputs
    inputDiscount.value = 0;
    selectedPaymentMethod = 'Cash';
    payMethodBtns.forEach(b => {
      if (b.dataset.method === 'Cash') b.classList.add('selected');
      else b.classList.remove('selected');
    });

    renderBillBreakdown();

    modalBackdrop.classList.add('active');
  }

  function closeModal() {
    modalBackdrop.classList.remove('active');
  }

  closeModalBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  // 5. Render Bill & Receipt Details
  function renderBillBreakdown() {
    if (!currentActiveBill) return;

    const discount = parseFloat(inputDiscount.value || 0);
    const subtotal = currentActiveBill.subtotal || 0;
    const cgst = parseFloat((subtotal * 0.025).toFixed(2));
    const sgst = parseFloat((subtotal * 0.025).toFixed(2));
    const totalTax = cgst + sgst;
    const finalTotal = Math.max(0, parseFloat((subtotal + totalTax - discount).toFixed(2)));

    // Table view on the left
    if (currentActiveBill.items.length === 0) {
      billItemsTbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:24px; color:var(--text-muted);">
            No active food orders on this table.
          </td>
        </tr>
      `;
    } else {
      billItemsTbody.innerHTML = currentActiveBill.items.map(item => `
        <tr>
          <td><strong>${item.name}</strong></td>
          <td>${item.quantity}</td>
          <td>₹${item.price.toFixed(2)}</td>
          <td style="text-align:right; font-weight:700;">₹${item.itemTotal.toFixed(2)}</td>
        </tr>
      `).join('');
    }

    // Thermal Receipt Preview on the right
    receiptInvoiceId.textContent = `INV-${Date.now().toString().slice(-6)}`;
    receiptDateTime.textContent = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    receiptTableNo.textContent = currentActiveBill.tableName;

    if (currentActiveBill.items.length === 0) {
      receiptItemsContainer.innerHTML = `<div style="text-align:center; padding:10px; color:#94a3b8;">-- Empty Tab --</div>`;
    } else {
      receiptItemsContainer.innerHTML = currentActiveBill.items.map(item => `
        <div class="receipt-row">
          <span>${item.quantity}× ${item.name}</span>
          <span>₹${item.itemTotal.toFixed(2)}</span>
        </div>
      `).join('');
    }

    receiptSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
    receiptCgst.textContent = `₹${cgst.toFixed(2)}`;
    receiptSgst.textContent = `₹${sgst.toFixed(2)}`;

    if (discount > 0) {
      receiptDiscountRow.style.display = 'flex';
      receiptDiscount.textContent = `-₹${discount.toFixed(2)}`;
    } else {
      receiptDiscountRow.style.display = 'none';
    }

    receiptGrandTotal.textContent = `₹${finalTotal.toFixed(2)}`;
    receiptPayMethod.textContent = selectedPaymentMethod;
  }

  // Discount input change listener
  inputDiscount.addEventListener('input', renderBillBreakdown);

  // Payment Method Selection
  payMethodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      payMethodBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedPaymentMethod = btn.dataset.method;
      receiptPayMethod.textContent = selectedPaymentMethod;
    });
  });

  // 6. Print Thermal Receipt
  btnPrintReceipt.addEventListener('click', () => {
    const receiptContent = document.getElementById('receipt-print-area').innerHTML;
    const printWindow = window.open('', '_blank', 'width=380,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt Print</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 76mm;
            margin: 0 auto;
            padding: 10px;
            color: #000;
            font-size: 12px;
          }
          .receipt-header { text-align: center; margin-bottom: 12px; }
          .receipt-restaurant-name { font-size: 16px; font-weight: bold; }
          .receipt-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .receipt-divider { border-top: 1px dashed #000; margin: 8px 0; }
          .receipt-total { font-weight: bold; font-size: 15px; }
        </style>
      </head>
      <body>
        ${receiptContent}
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
  });

  // 7. Collect Payment & Reset Table
  btnCollectReset.addEventListener('click', async () => {
    if (!currentActiveBill) return;

    btnCollectReset.disabled = true;
    btnCollectReset.textContent = 'Processing Payment...';

    const discount = parseFloat(inputDiscount.value || 0);

    try {
      const res = await fetch(`/api/tables/${currentActiveBill.tableId}/pay-and-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: selectedPaymentMethod,
          discount,
          cashierName: activeCashier ? activeCashier.name : 'Priya Sharma (Cashier #101)',
          cashierId: activeCashier ? activeCashier.loginId : '101'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        window.AppSync.playAlertChime('success');
        window.AppSync.showToast(`✅ Payment recorded via ${selectedPaymentMethod}! ${currentActiveBill.tableName} has been reset to Available.`, 'success', 5000);
        closeModal();
        loadData();
      } else {
        window.AppSync.showToast(data.error || 'Failed to settle bill.', 'error');
      }
    } catch (err) {
      console.error('Payment error:', err);
      window.AppSync.showToast('Payment processing error.', 'error');
    } finally {
      btnCollectReset.disabled = false;
      btnCollectReset.innerHTML = '<span>💰 Confirm Payment &amp; Clear Table</span>';
    }
  });

  // 8. Socket.IO Real-time Events
  const socket = window.AppSync.getSocket();
  if (socket) {
    socket.emit('join:role', 'cashier');

    // Table updated (status, order added, reset)
    socket.on('counter:table_updated', () => {
      loadData();
    });

    // Alert: waiter called or bill requested
    socket.on('counter:alert', (alert) => {
      window.AppSync.playAlertChime('call');
      if (alert.type === 'waiter_called') {
        window.AppSync.showToast(`🔔 ASSISTANCE NEEDED: ${alert.tableName} called for a waiter!`, 'warning', 6000);
      } else if (alert.type === 'bill_requested') {
        window.AppSync.showToast(`🧾 BILL REQUESTED: ${alert.tableName} wants to pay at counter!`, 'info', 6000);
      }
      loadData();
    });

    // Outside Geofence Order Approval Needed
    socket.on('counter:approval_required', (data) => {
      window.AppSync.playAlertChime('call');
      window.AppSync.showToast(`⚠️ OUTSIDE GEOFENCE ORDER: ${data.order.tableName} placed an order (${data.order.id}) from outside venue! Please review.`, 'warning', 8000);
      loadData();
    });
  }

  window.PosApp = {
    openBillModal,
    approveOrder,
    rejectOrder
  };

  // Check cashier login first
  checkExistingCashierAuth();
});

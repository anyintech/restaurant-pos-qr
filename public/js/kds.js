// Kitchen Display System (KDS) Logic
document.addEventListener('DOMContentLoaded', () => {
  const kdsGrid = document.getElementById('kds-grid');
  const activeCountEl = document.getElementById('active-tickets-count');
  const clockEl = document.getElementById('kds-clock');
  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  const soundToggleIcon = document.getElementById('sound-toggle-icon');
  const soundToggleLabel = document.getElementById('sound-toggle-label');

  let orders = [];
  let soundEnabled = true;

  // 1. Clock
  function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // 2. Sound Toggle
  soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
      soundToggleBtn.classList.add('active');
      soundToggleIcon.textContent = '🔊';
      soundToggleLabel.textContent = 'Alerts: ON';
      window.AppSync.playAlertChime('ticket');
    } else {
      soundToggleBtn.classList.remove('active');
      soundToggleIcon.textContent = '🔇';
      soundToggleLabel.textContent = 'Alerts: OFF';
    }
  });

  // 3. Elapsed Time Helper
  function getElapsedSeconds(createdAt) {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((now - created) / 1000));
  }

  function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function getUrgencyClass(totalSeconds) {
    if (totalSeconds < 300) return 'urgency-fresh'; // < 5 mins
    if (totalSeconds < 900) return 'urgency-medium'; // 5 - 15 mins
    return 'urgency-late'; // > 15 mins
  }

  // 4. Fetch Active Orders
  async function loadOrders() {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        orders = await res.json();
        // Sort: newest first or oldest first (in kitchen, oldest first helps FIFO queue)
        orders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        renderGrid();
      }
    } catch (err) {
      console.error('Failed to load kitchen orders:', err);
    }
  }

  // 5. Render Ticket Grid
  function renderGrid() {
    // Only show orders that are not served or show served briefly
    const visibleOrders = orders.filter(o => o.status !== 'archived');
    activeCountEl.textContent = visibleOrders.filter(o => o.status !== 'served').length;

    if (visibleOrders.length === 0) {
      kdsGrid.innerHTML = `
        <div class="empty-kds">
          <div class="empty-kds-icon">✨</div>
          <h2>All Caught Up!</h2>
          <p style="margin-top: 6px;">No pending kitchen orders. Incoming tickets will appear here with live chime alerts.</p>
        </div>
      `;
      return;
    }

    kdsGrid.innerHTML = visibleOrders.map(order => {
      const elapsedSec = getElapsedSeconds(order.createdAt);
      const urgencyClass = getUrgencyClass(elapsedSec);

      let actionBtn = '';
      if (order.status === 'new') {
        actionBtn = `
          <button class="btn-kds-action btn-cooking" onclick="window.KdsApp.updateStatus('${order.id}', 'cooking')">
            🔥 Start Cooking
          </button>
        `;
      } else if (order.status === 'cooking') {
        actionBtn = `
          <button class="btn-kds-action btn-ready" onclick="window.KdsApp.updateStatus('${order.id}', 'ready')">
            ✅ Ready for Pickup
          </button>
        `;
      } else if (order.status === 'ready') {
        actionBtn = `
          <button class="btn-kds-action btn-served" onclick="window.KdsApp.updateStatus('${order.id}', 'served')">
            🍽️ Mark as Served
          </button>
        `;
      } else if (order.status === 'served') {
        actionBtn = `
          <div style="text-align:center; width:100%; color:#a78bfa; font-weight:700; font-size:0.85rem; padding: 6px;">
            ✨ Served to Table
          </div>
        `;
      }

      return `
        <div class="ticket-card ${urgencyClass}" id="ticket-${order.id}" data-created="${order.createdAt}">
          <div class="ticket-header">
            <div>
              <div class="ticket-table-name">
                <span>🍽️</span>
                <span>${order.tableName}</span>
              </div>
              <div class="ticket-order-id">${order.id} • ${order.formattedTime || ''}</div>
            </div>
            <div class="ticket-timer" id="timer-${order.id}">
              ⏱️ ${formatTime(elapsedSec)}
            </div>
          </div>

          <div class="ticket-body">
            ${order.notes ? `
              <div class="ticket-general-notes">
                <strong>Table Note:</strong> ${order.notes}
              </div>
            ` : ''}

            <div style="display:flex; flex-direction:column; gap:8px;">
              ${order.items.map(item => `
                <div class="ticket-item-row ${item.cooked ? 'done' : ''}" onclick="window.KdsApp.toggleItemCooked('${order.id}', '${item.id}')">
                  <div class="item-check">✓</div>
                  <div class="item-qty">${item.quantity}×</div>
                  <div class="item-details">
                    <div class="item-name">${item.name}</div>
                    ${item.notes ? `<div class="item-notes">Note: "${item.notes}"</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="ticket-footer">
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');
  }

  // 6. Live Timer Ticking
  setInterval(() => {
    const cards = kdsGrid.querySelectorAll('.ticket-card');
    cards.forEach(card => {
      const created = card.getAttribute('data-created');
      const orderId = card.id.replace('ticket-', '');
      const timerEl = document.getElementById(`timer-${orderId}`);

      if (created && timerEl) {
        const sec = getElapsedSeconds(created);
        timerEl.innerHTML = `⏱️ ${formatTime(sec)}`;

        // Update card urgency styling
        card.classList.remove('urgency-fresh', 'urgency-medium', 'urgency-late');
        card.classList.add(getUrgencyClass(sec));
      }
    });
  }, 1000);

  // 7. Actions: Update Status & Toggle Item Done
  async function updateStatus(orderId, nextStatus) {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });

      if (res.ok) {
        const data = await res.json();
        const ord = orders.find(o => o.id === orderId);
        if (ord) ord.status = nextStatus;
        renderGrid();
        window.AppSync.showToast(`Order ${orderId} marked as ${nextStatus.toUpperCase()}`, 'info');
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }

  async function toggleItemCooked(orderId, itemId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const item = order.items.find(i => i.id === itemId);
    if (!item) return;

    const newDone = !item.cooked;
    item.cooked = newDone;

    // Optimistic UI update
    renderGrid();

    try {
      await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, itemCooked: newDone })
      });
    } catch (err) {
      console.error('Failed to sync cooked item:', err);
    }
  }

  // 8. Socket.IO Real-time Events
  const socket = window.AppSync.getSocket();
  if (socket) {
    socket.emit('join:role', 'kitchen');

    // New ticket incoming
    socket.on('kitchen:new_order', (newOrder) => {
      // Add order
      orders.push(newOrder);
      renderGrid();

      // Audio Alert
      if (soundEnabled) {
        window.AppSync.playAlertChime('ticket');
      }

      window.AppSync.showToast(`🔔 New Order received for ${newOrder.tableName} (${newOrder.id})!`, 'warning', 5000);
    });

    // Order status changed
    socket.on('order:status_updated', (updatedOrder) => {
      const idx = orders.findIndex(o => o.id === updatedOrder.id);
      if (idx !== -1) {
        orders[idx] = updatedOrder;
      } else {
        orders.push(updatedOrder);
      }
      renderGrid();
    });

    // Table reset / paid at counter
    socket.on('kitchen:table_cleared', ({ tableId }) => {
      orders = orders.filter(o => o.tableId !== tableId);
      renderGrid();
    });
  }

  // --- KDS TOUCHSCREEN 4-DIGIT PIN AUTHENTICATION ---
  const authOverlay = document.getElementById('kds-auth-overlay');
  const staffNameEl = document.getElementById('kds-staff-name');
  const btnLockKds = document.getElementById('btn-lock-kds');
  const authErrorEl = document.getElementById('kds-auth-error');

  let enteredPin = '';
  let activeStaff = null;

  function updatePinDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`kds-dot-${i}`);
      if (dot) {
        if (i < enteredPin.length) {
          dot.style.background = '#f97316';
          dot.style.borderColor = '#f97316';
          dot.style.boxShadow = '0 0 8px #f97316';
        } else {
          dot.style.background = 'transparent';
          dot.style.borderColor = '#475569';
          dot.style.boxShadow = 'none';
        }
      }
    }
  }

  async function submitPin() {
    if (enteredPin.length !== 4) return;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'kitchen', pin: enteredPin })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem('kds_auth_token', data.token);
        sessionStorage.setItem('kds_staff_info', JSON.stringify(data.staff));
        activeStaff = data.staff;
        unlockKds();
      } else {
        showAuthError(data.error || 'Invalid 4-Digit Cook PIN');
      }
    } catch (e) {
      showAuthError('Connection error. Please try again.');
    }
  }

  function showAuthError(msg) {
    if (authErrorEl) {
      authErrorEl.textContent = msg;
      authErrorEl.style.display = 'block';
    }
    setTimeout(() => {
      clearPin();
      if (authErrorEl) authErrorEl.style.display = 'none';
    }, 1200);
  }

  function tapKey(digit) {
    if (enteredPin.length < 4) {
      enteredPin += digit;
      updatePinDots();
      if (enteredPin.length === 4) {
        submitPin();
      }
    }
  }

  function backspace() {
    if (enteredPin.length > 0) {
      enteredPin = enteredPin.slice(0, -1);
      updatePinDots();
    }
  }

  function clearPin() {
    enteredPin = '';
    updatePinDots();
  }

  function autoFillPin(pin) {
    enteredPin = pin;
    updatePinDots();
    submitPin();
  }

  function unlockKds() {
    if (authOverlay) authOverlay.style.display = 'none';
    if (staffNameEl && activeStaff) staffNameEl.textContent = activeStaff.name;
    window.AppSync.showToast(`👨‍🍳 Kitchen unlocked by ${activeStaff ? activeStaff.name : 'Chef'}!`, 'success');
    loadOrders();
  }

  function lockKds() {
    sessionStorage.removeItem('kds_auth_token');
    sessionStorage.removeItem('kds_staff_info');
    activeStaff = null;
    clearPin();
    if (authOverlay) authOverlay.style.display = 'flex';
  }

  if (btnLockKds) {
    btnLockKds.addEventListener('click', lockKds);
  }

  async function checkExistingAuth() {
    const savedToken = sessionStorage.getItem('kds_auth_token');
    if (savedToken) {
      try {
        const res = await fetch(`/api/auth/verify?token=${savedToken}`);
        if (res.ok) {
          const data = await res.json();
          if (data.valid && data.staff && data.staff.role === 'kitchen') {
            activeStaff = data.staff;
            unlockKds();
            return;
          }
        }
      } catch (e) {}
    }
    // Show keypad lock
    if (authOverlay) authOverlay.style.display = 'flex';
  }

  window.KdsAuth = {
    tapKey,
    backspace,
    clearPin,
    autoFillPin,
    lockKds
  };

  window.KdsApp = {
    updateStatus,
    toggleItemCooked
  };

  // Initial Boot: Check Authentication First
  checkExistingAuth();
});

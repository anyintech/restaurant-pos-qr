// Customer Mobile QR Ordering Logic
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Determine Current Table and Session from URL query parameter or selector
  const urlParams = new URLSearchParams(window.location.search);
  let currentTableId = parseInt(urlParams.get('table'), 10) || 1;
  let currentSessionToken = urlParams.get('session') || null;

  // DOM Elements
  const tableBadge = document.getElementById('badge-table-text');
  const tableSelect = document.getElementById('table-switcher-select');
  const drawerTableName = document.getElementById('drawer-table-name');
  const categoryNav = document.getElementById('category-nav');
  const menuFeed = document.getElementById('menu-feed');
  const searchInput = document.getElementById('menu-search-input');
  const filterPills = document.querySelectorAll('.pill-btn');

  // Security & Geofence Elements
  const geofenceBadge = document.getElementById('geofence-badge');
  const gpsSimSelect = document.getElementById('gps-sim-select');
  const outsideWarningBanner = document.getElementById('outside-warning-banner');
  const sessionExpiredOverlay = document.getElementById('session-expired-overlay');
  const btnRejoinSession = document.getElementById('btn-rejoin-session');

  // Cart & Modals
  const cartFloatingBar = document.getElementById('cart-floating-bar');
  const cartTotalCount = document.getElementById('cart-total-count');
  const cartTotalPrice = document.getElementById('cart-total-price');
  const cartOverlay = document.getElementById('cart-modal-overlay');
  const cartDrawer = document.getElementById('cart-drawer');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const cartItemsList = document.getElementById('cart-items-list');
  const billSubtotal = document.getElementById('bill-subtotal');
  const billTax = document.getElementById('bill-tax');
  const billGrandTotal = document.getElementById('bill-grand-total');
  const btnSubmitOrder = document.getElementById('btn-submit-order');
  const btnSubmitTotal = document.getElementById('btn-submit-total');
  const orderSpecialNotes = document.getElementById('order-special-notes');

  // Note Modal
  const noteOverlay = document.getElementById('note-modal-overlay');
  const noteDrawer = document.getElementById('note-drawer');
  const noteItemName = document.getElementById('note-item-name');
  const noteItemInput = document.getElementById('note-item-input');
  const btnSaveNote = document.getElementById('btn-save-note');
  const closeNoteBtn = document.getElementById('close-note-btn');

  // Live Tracker
  const liveTrackerContainer = document.getElementById('live-tracker-container');
  const trackerOrderId = document.getElementById('tracker-order-id');
  const trackerStatusMessage = document.getElementById('tracker-status-message');
  const stepReceived = document.getElementById('step-received');
  const stepCooking = document.getElementById('step-cooking');
  const stepReady = document.getElementById('step-ready');
  const stepServed = document.getElementById('step-served');
  const btnCallWaiter = document.getElementById('btn-call-waiter');
  const btnRequestBill = document.getElementById('btn-request-bill');
  const billRequestedBanner = document.getElementById('bill-requested-banner');

  // State
  let menuData = { categories: [], items: [] };
  let cart = new Map(); // itemId -> { item, quantity, notes }
  let activeFilter = 'all';
  let activeCategory = 'all';
  let noteTargetItemId = null;
  let activeOrders = [];
  let restaurantGeoConfig = null;
  let realDeviceCoords = null;

  // --- GEOFENCE SIMULATION HANDLER ---
  function updateGeofenceUI() {
    const sim = gpsSimSelect ? gpsSimSelect.value : 'inside';
    if (sim === 'inside') {
      geofenceBadge.className = 'badge';
      geofenceBadge.style.cssText = 'background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;';
      geofenceBadge.textContent = '🟢 Inside Venue (<50m)';
      if (outsideWarningBanner) outsideWarningBanner.style.display = 'none';
    } else if (sim === 'outside') {
      geofenceBadge.className = 'badge';
      geofenceBadge.style.cssText = 'background: #fffbeb; color: #b45309; border: 1px solid #fde68a;';
      geofenceBadge.textContent = '🚗 Outside Venue (1.4 km)';
      if (outsideWarningBanner) outsideWarningBanner.style.display = 'block';
    } else if (sim === 'real') {
      if (navigator.geolocation) {
        geofenceBadge.textContent = '🛰️ Querying GPS...';
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            realDeviceCoords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude
            };
            geofenceBadge.textContent = '🛰️ Device GPS Active';
          },
          (err) => {
            geofenceBadge.textContent = '⚠️ GPS Blocked';
            window.AppSync.showToast('Location permission denied. Switching to simulation mode.', 'warning');
            gpsSimSelect.value = 'outside';
            updateGeofenceUI();
          }
        );
      } else {
        geofenceBadge.textContent = '⚠️ GPS Unsupported';
      }
    }
  }

  if (gpsSimSelect) {
    gpsSimSelect.addEventListener('change', updateGeofenceUI);
  }

  // --- SESSION EXPIRY LOGIC ---
  async function validateTableSession() {
    try {
      const res = await fetch(`/api/tables/${currentTableId}/session`);
      if (res.ok) {
        const sessionData = await res.json();
        const activeServerToken = sessionData.sessionToken;

        // If URL provided an explicit session token that doesn't match the active server token:
        if (currentSessionToken && currentSessionToken !== activeServerToken) {
          showSessionExpiredModal();
          return false;
        }

        // Bind active token
        currentSessionToken = activeServerToken;
        return true;
      }
    } catch (e) {
      console.warn('Session check failed:', e);
    }
    return true;
  }

  function showSessionExpiredModal() {
    if (sessionExpiredOverlay) {
      sessionExpiredOverlay.style.display = 'flex';
    }
  }

  if (btnRejoinSession) {
    btnRejoinSession.addEventListener('click', () => {
      // Clear expired session param and refresh to active table QR
      const newUrl = new URL(window.location);
      newUrl.searchParams.delete('session');
      window.location.href = newUrl.toString();
    });
  }

  // Update UI for Table
  function setTable(id) {
    currentTableId = id;
    tableBadge.textContent = `Table ${currentTableId}`;
    if (tableSelect) tableSelect.value = String(currentTableId);
    if (drawerTableName) drawerTableName.textContent = `Table ${currentTableId}`;
    
    // Join socket room
    const socket = window.AppSync.getSocket();
    if (socket) {
      socket.emit('join:table', currentTableId);
    }

    // Refresh active table orders
    fetchTableState();
  }

  if (tableSelect) {
    tableSelect.value = String(currentTableId);
    tableSelect.addEventListener('change', (e) => {
      const newTable = parseInt(e.target.value, 10);
      const newUrl = new URL(window.location);
      newUrl.searchParams.set('table', newTable);
      window.history.pushState({}, '', newUrl);
      setTable(newTable);
    });
  }

  // 2. Fetch Data
  async function loadMenu() {
    try {
      const res = await fetch('/api/menu');
      menuData = await res.json();
      renderCategoryNav();
      renderMenu();
    } catch (err) {
      console.error('Failed to load menu:', err);
      menuFeed.innerHTML = `<div style="text-align:center; padding:40px; color:var(--danger);">Error loading menu. Please check your internet connection.</div>`;
    }
  }

  async function fetchTableState() {
    try {
      const res = await fetch(`/api/tables/${currentTableId}`);
      if (res.ok) {
        const table = await res.json();
        activeOrders = table.activeOrders || [];
        updateLiveTracker(activeOrders, table.status);
      }
    } catch (err) {
      console.error('Failed to fetch table state:', err);
    }
  }

  // 3. Render Categories
  function renderCategoryNav() {
    categoryNav.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = `cat-tab ${activeCategory === 'all' ? 'active' : ''}`;
    allBtn.textContent = '🌟 Full Menu';
    allBtn.addEventListener('click', () => {
      activeCategory = 'all';
      updateCategoryTabs();
      renderMenu();
    });
    categoryNav.appendChild(allBtn);

    menuData.categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `cat-tab ${activeCategory === cat.id ? 'active' : ''}`;
      btn.textContent = `${cat.icon || ''} ${cat.name}`;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        updateCategoryTabs();
        renderMenu();
      });
      categoryNav.appendChild(btn);
    });
  }

  function updateCategoryTabs() {
    const tabs = categoryNav.querySelectorAll('.cat-tab');
    tabs.forEach(tab => {
      const text = tab.textContent;
      if (activeCategory === 'all' && text.includes('Full Menu')) {
        tab.classList.add('active');
      } else {
        const cat = menuData.categories.find(c => text.includes(c.name));
        if (cat && cat.id === activeCategory) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      }
    });
  }

  // 4. Render Menu Items
  function renderMenu() {
    const query = (searchInput.value || '').trim().toLowerCase();
    
    let filtered = menuData.items.filter(item => {
      // Category filter
      if (activeCategory !== 'all' && item.category !== activeCategory) {
        return false;
      }
      // Dietary filter
      if (activeFilter === 'veg' && !item.isVeg) return false;
      if (activeFilter === 'non-veg' && item.isVeg) return false;
      if (activeFilter === 'spicy' && !item.isSpicy) return false;
      if (activeFilter === 'bestseller' && !item.isBestseller) return false;

      // Text search
      if (query) {
        const matchName = item.name.toLowerCase().includes(query);
        const matchDesc = (item.description || '').toLowerCase().includes(query);
        return matchName || matchDesc;
      }
      return true;
    });

    if (filtered.length === 0) {
      menuFeed.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">🍽️</div>
          <p>No dishes match your selection.</p>
        </div>
      `;
      return;
    }

    menuFeed.innerHTML = filtered.map(item => {
      const cartEntry = cart.get(item.id);
      const qty = cartEntry ? cartEntry.quantity : 0;
      const isAvailable = item.available !== false;

      const vegBadge = item.isVeg 
        ? `<span class="badge" style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;">🟢 Veg</span>`
        : `<span class="badge" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca;">🔴 Non-Veg</span>`;

      const spicyBadge = item.isSpicy 
        ? `<span class="badge" style="background:#fff7ed; color:#ea580c; border:1px solid #fed7aa;">🌶️ Spicy</span>`
        : '';

      const bestBadge = item.isBestseller
        ? `<span class="badge" style="background:#fefce8; color:#ca8a04; border:1px solid #fef08a;">⭐ Chef Choice</span>`
        : '';

      return `
        <div class="menu-card ${!isAvailable ? 'unavailable' : ''}" id="dish-card-${item.id}">
          <div class="dish-content">
            <div class="dish-header">
              <div class="dish-tags">
                ${vegBadge}
                ${spicyBadge}
                ${bestBadge}
              </div>
              <h3 class="dish-title">${item.name}</h3>
              <p class="dish-desc">${item.description || ''}</p>
            </div>

            <div class="dish-bottom">
              <span class="dish-price">₹${item.price.toFixed(2)}</span>
              ${!isAvailable 
                ? `<span style="font-size:0.8rem; font-weight:700; color:var(--danger);">Sold Out</span>` 
                : qty > 0 
                  ? `
                    <div class="qty-stepper">
                      <button class="qty-btn" onclick="window.CustomerApp.updateItemQty('${item.id}', -1)" aria-label="Decrease quantity">−</button>
                      <span class="qty-val">${qty}</span>
                      <button class="qty-btn" onclick="window.CustomerApp.updateItemQty('${item.id}', 1)" aria-label="Increase quantity">+</button>
                    </div>
                  `
                  : `
                    <button class="add-btn" onclick="window.CustomerApp.addItem('${item.id}')">
                      <span>+ Add</span>
                    </button>
                  `
              }
            </div>
          </div>
          <div class="dish-img-wrapper">
            <img src="${item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'}" alt="${item.name}" class="dish-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'">
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Cart Management
  function addItem(itemId) {
    const item = menuData.items.find(i => i.id === itemId);
    if (!item) return;

    if (cart.has(itemId)) {
      cart.get(itemId).quantity += 1;
    } else {
      cart.set(itemId, { item, quantity: 1, notes: '' });
    }

    updateCartUI();
    renderMenu();
  }

  function updateItemQty(itemId, delta) {
    if (!cart.has(itemId)) return;

    const entry = cart.get(itemId);
    entry.quantity += delta;

    if (entry.quantity <= 0) {
      cart.delete(itemId);
    }

    updateCartUI();
    renderMenu();
  }

  function updateCartUI() {
    let totalCount = 0;
    let subtotal = 0;

    cart.forEach(entry => {
      totalCount += entry.quantity;
      subtotal += entry.item.price * entry.quantity;
    });

    const tax = subtotal * 0.05;
    const grandTotal = subtotal + tax;

    // Floating bar
    if (totalCount > 0) {
      cartFloatingBar.style.display = 'flex';
      cartTotalCount.textContent = totalCount;
      cartTotalPrice.textContent = `₹${subtotal.toFixed(2)}`;
    } else {
      cartFloatingBar.style.display = 'none';
    }

    // Drawer Totals
    billSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
    billTax.textContent = `₹${tax.toFixed(2)}`;
    billGrandTotal.textContent = `₹${grandTotal.toFixed(2)}`;
    btnSubmitTotal.textContent = `₹${grandTotal.toFixed(2)}`;

    // Drawer Item List
    if (cart.size === 0) {
      cartItemsList.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">Your tray is empty. Add delicious items above!</div>`;
      btnSubmitOrder.disabled = true;
      btnSubmitOrder.style.opacity = '0.5';
    } else {
      btnSubmitOrder.disabled = false;
      btnSubmitOrder.style.opacity = '1';
      cartItemsList.innerHTML = Array.from(cart.values()).map(entry => {
        const item = entry.item;
        return `
          <div class="cart-item-row">
            <div class="cart-item-info">
              <div class="cart-item-name">${item.name}</div>
              <div class="cart-item-unit">₹${item.price.toFixed(2)} each</div>
              ${entry.notes ? `<div style="font-size:0.75rem; color:#ea580c; font-style:italic;">Note: ${entry.notes}</div>` : ''}
              <button onclick="window.CustomerApp.openNoteModal('${item.id}')" style="background:none; border:none; color:var(--primary); font-size:0.75rem; font-weight:700; cursor:pointer; padding:2px 0;">
                ${entry.notes ? '✏️ Edit Note' : '+ Add Special Note'}
              </button>
            </div>
            <div style="display:flex; align-items:center; gap: 14px;">
              <div class="qty-stepper">
                <button class="qty-btn" onclick="window.CustomerApp.updateItemQty('${item.id}', -1)">−</button>
                <span class="qty-val">${entry.quantity}</span>
                <button class="qty-btn" onclick="window.CustomerApp.updateItemQty('${item.id}', 1)">+</button>
              </div>
              <span style="font-weight:800; font-size:0.95rem; min-width: 60px; text-align:right;">
                ₹${(item.price * entry.quantity).toFixed(2)}
              </span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 6. Note Modal
  function openNoteModal(itemId) {
    noteTargetItemId = itemId;
    const entry = cart.get(itemId);
    if (!entry) return;

    noteItemName.textContent = `Notes for ${entry.item.name}`;
    noteItemInput.value = entry.notes || '';
    noteOverlay.classList.add('active');
    noteDrawer.classList.add('active');
    setTimeout(() => noteItemInput.focus(), 100);
  }

  function closeNoteModal() {
    noteOverlay.classList.remove('active');
    noteDrawer.classList.remove('active');
  }

  btnSaveNote.addEventListener('click', () => {
    if (noteTargetItemId && cart.has(noteTargetItemId)) {
      cart.get(noteTargetItemId).notes = noteItemInput.value.trim();
      updateCartUI();
    }
    closeNoteModal();
  });

  closeNoteBtn.addEventListener('click', closeNoteModal);
  noteOverlay.addEventListener('click', closeNoteModal);

  // 7. Drawer Open / Close
  function openCartDrawer() {
    cartOverlay.classList.add('active');
    cartDrawer.classList.add('active');
  }

  function closeCartDrawer() {
    cartOverlay.classList.remove('active');
    cartDrawer.classList.remove('active');
  }

  cartFloatingBar.addEventListener('click', openCartDrawer);
  closeDrawerBtn.addEventListener('click', closeCartDrawer);
  cartOverlay.addEventListener('click', closeCartDrawer);

  // 8. Place Order to Kitchen
  btnSubmitOrder.addEventListener('click', async () => {
    if (cart.size === 0) return;

    btnSubmitOrder.disabled = true;
    btnSubmitOrder.textContent = 'Sending to Kitchen...';

    const items = Array.from(cart.values()).map(entry => ({
      id: entry.item.id,
      name: entry.item.name,
      price: entry.item.price,
      quantity: entry.quantity,
      notes: entry.notes
    }));

    const generalNotes = orderSpecialNotes.value.trim();
    const simMode = gpsSimSelect ? gpsSimSelect.value : 'inside';

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: currentTableId,
          items,
          notes: generalNotes,
          sessionToken: currentSessionToken,
          simulation: simMode,
          coords: realDeviceCoords
        })
      });

      const data = await res.json();

      if (res.status === 403 && data.error === 'session_expired') {
        showSessionExpiredModal();
        return;
      }

      if (res.ok && data.success) {
        if (data.requiresApproval) {
          window.AppSync.playAlertChime('call');
          window.AppSync.showToast('⚠️ Outside geofence: Order is held for Cashier Verification before cooking starts.', 'warning', 6000);
        } else {
          window.AppSync.playAlertChime('success');
          window.AppSync.showToast('🎉 Order placed successfully! Cooking has started.', 'success');
        }

        // Clear cart
        cart.clear();
        orderSpecialNotes.value = '';
        closeCartDrawer();
        updateCartUI();
        renderMenu();

        // Refresh live tracker
        fetchTableState();
      } else {
        window.AppSync.showToast(data.error || data.message || 'Failed to place order.', 'error');
      }
    } catch (err) {
      console.error('Order placement failed:', err);
      window.AppSync.showToast('Network error while placing order.', 'error');
    } finally {
      btnSubmitOrder.disabled = false;
      btnSubmitOrder.innerHTML = `<span>🚀 Place Order to Kitchen</span> <span id="btn-submit-total">${billGrandTotal.textContent}</span>`;
    }
  });

  // 9. Call Waiter & Request Bill Actions
  btnCallWaiter.addEventListener('click', async () => {
    try {
      btnCallWaiter.disabled = true;
      btnCallWaiter.textContent = 'Pinging staff...';
      const res = await fetch(`/api/tables/${currentTableId}/call-waiter`, { method: 'POST' });
      if (res.ok) {
        window.AppSync.showToast('🔔 Waiter has been notified and is coming to your table!', 'success');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => {
        btnCallWaiter.disabled = false;
        btnCallWaiter.innerHTML = '🔔 Call Waiter';
      }, 4000);
    }
  });

  btnRequestBill.addEventListener('click', async () => {
    try {
      btnRequestBill.disabled = true;
      btnRequestBill.textContent = 'Requesting bill...';
      const res = await fetch(`/api/tables/${currentTableId}/request-bill`, { method: 'POST' });
      if (res.ok) {
        window.AppSync.showToast('🧾 Bill request sent to counter. Please proceed to pay.', 'warning');
        billRequestedBanner.style.display = 'flex';
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => {
        btnRequestBill.disabled = false;
        btnRequestBill.innerHTML = '🧾 Request Bill';
      }, 3000);
    }
  });

  // 10. Live Tracker Updater
  function updateLiveTracker(orders, tableStatus) {
    if (!orders || orders.length === 0) {
      liveTrackerContainer.style.display = 'none';
      billRequestedBanner.style.display = 'none';
      return;
    }

    liveTrackerContainer.style.display = 'block';

    // Get the latest active order
    const latestOrder = orders[orders.length - 1];
    trackerOrderId.textContent = typeof latestOrder === 'object' ? latestOrder.id : latestOrder;

    // Reset steps
    [stepReceived, stepCooking, stepReady, stepServed].forEach(step => {
      step.classList.remove('active', 'completed');
    });

    const status = (typeof latestOrder === 'object' ? latestOrder.status : tableStatus) || 'new';

    if (tableStatus === 'bill_requested') {
      billRequestedBanner.style.display = 'flex';
    } else {
      billRequestedBanner.style.display = 'none';
    }

    if (status === 'pending_approval') {
      stepReceived.classList.add('active');
      trackerStatusMessage.innerHTML = '⏳ <strong>Awaiting Cashier Approval</strong> (Outside Venue order held for table verification).';
    } else if (status === 'new') {
      stepReceived.classList.add('active');
      trackerStatusMessage.textContent = 'Ticket received by kitchen order queue.';
    } else if (status === 'cooking') {
      stepReceived.classList.add('completed');
      stepCooking.classList.add('active');
      trackerStatusMessage.textContent = '👨‍🍳 The chef is preparing your dishes fresh right now!';
    } else if (status === 'ready') {
      stepReceived.classList.add('completed');
      stepCooking.classList.add('completed');
      stepReady.classList.add('active');
      trackerStatusMessage.textContent = '🍲 Food is ready! Service staff is bringing it to your table.';
    } else if (status === 'served') {
      stepReceived.classList.add('completed');
      stepCooking.classList.add('completed');
      stepReady.classList.add('completed');
      stepServed.classList.add('completed');
      trackerStatusMessage.textContent = '✨ All dishes served. Bon Appétit! Enjoy your meal.';
    }
  }

  // 11. Search & Filter Handlers
  searchInput.addEventListener('input', renderMenu);

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.getAttribute('data-filter');
      renderMenu();
    });
  });

  // 12. Real-Time Socket.IO Synchronization
  const socket = window.AppSync.getSocket();
  if (socket) {
    socket.emit('join:table', currentTableId);

    // Order acknowledged
    socket.on('customer:order_acknowledged', (order) => {
      if (order.tableId === currentTableId) {
        fetchTableState();
      }
    });

    // Order pending approval
    socket.on('customer:order_pending_approval', (order) => {
      if (order.tableId === currentTableId) {
        fetchTableState();
      }
    });

    // Order approved by cashier
    socket.on('customer:order_approved', (order) => {
      if (order.tableId === currentTableId) {
        window.AppSync.playAlertChime('success');
        window.AppSync.showToast('🎉 Cashier approved your order! Cooking has started.', 'success', 5000);
        fetchTableState();
      }
    });

    // Order rejected by cashier
    socket.on('customer:order_rejected', ({ reason }) => {
      window.AppSync.playAlertChime('call');
      window.AppSync.showToast(`❌ Order declined: ${reason}`, 'error', 6000);
      fetchTableState();
    });

    // Kitchen status changed
    socket.on('customer:status_updated', (order) => {
      if (order.tableId === currentTableId) {
        fetchTableState();
        window.AppSync.playAlertChime('ticket');
        window.AppSync.showToast(`Update: Your order is now marked as "${order.status}"!`, 'info');
      }
    });

    // Bill requested
    socket.on('customer:bill_requested', () => {
      billRequestedBanner.style.display = 'flex';
    });

    // Table reset / paid at counter -> Old session token is dead!
    socket.on('customer:session_reset', (payload) => {
      liveTrackerContainer.style.display = 'none';
      billRequestedBanner.style.display = 'none';
      cart.clear();
      updateCartUI();
      renderMenu();

      // Show Session Expired overlay so old customer cannot order on the next guest's tab!
      showSessionExpiredModal();
    });

    // Menu updated
    socket.on('menu:updated', (newMenu) => {
      menuData = newMenu;
      renderMenu();
    });
  }

  // Expose global methods for inline HTML onclicks
  window.CustomerApp = {
    addItem,
    updateItemQty,
    openNoteModal
  };

  // Initial Boot
  setTable(currentTableId);
  updateGeofenceUI();
  await validateTableSession();
  await loadMenu();
});

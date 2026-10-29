const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  }
});

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}
app.use(express.static(path.join(__dirname, 'public')));

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const TABLES_FILE = path.join(DATA_DIR, 'tables.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SALES_FILE = path.join(DATA_DIR, 'sales.json');
const STAFF_FILE = path.join(DATA_DIR, 'staff.json');

// Helper to safely load JSON
function loadJSON(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultValue;
}

// Helper to save JSON
function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

// Restaurant profile (name, tagline, address) — editable from Admin, shown on every screen and receipt
const RESTAURANT_FILE = path.join(DATA_DIR, 'restaurant.json');
const DEFAULT_RESTAURANT = {
  name: 'Saffron & Silk',
  tagline: 'Bistro & Artisanal Dining',
  address: 'Connaught Place, New Delhi'
};
let restaurantProfile = { ...DEFAULT_RESTAURANT, ...loadJSON(RESTAURANT_FILE, {}) };
if (!fs.existsSync(RESTAURANT_FILE)) saveJSON(RESTAURANT_FILE, restaurantProfile);

// Restaurant Reference GPS Coordinates (Connaught Place, New Delhi demo location)
const RESTAURANT_GEO = {
  get name() { return restaurantProfile.name; },
  latitude: 28.6328,
  longitude: 77.2197,
  radiusMeters: 100 // 100 meters geofence radius
};

// Haversine distance calculator
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// In-Memory State initialized from disk
let menuData = loadJSON(MENU_FILE, { categories: [], items: [] });
let tablesData = loadJSON(TABLES_FILE, []);
let ordersData = loadJSON(ORDERS_FILE, []);
let salesData = loadJSON(SALES_FILE, []);
let staffData = loadJSON(STAFF_FILE, []);

// In-Memory active auth tokens map (token -> staffObj)
const activeStaffSessions = new Map();

// Operational Notifications stream (Kitchen & Cashier) for Admin Panel
let adminNotifications = [
  {
    id: 'notif_init_1',
    category: 'cashier',
    title: '💵 Table 8 Settle Completed',
    message: 'Table 8 settled invoice INV-985120 (₹42.53) via UPI / QR',
    meta: { tableId: 8, invoiceId: 'INV-985120', amount: 42.53 },
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    formattedTime: new Date(Date.now() - 5 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  },
  {
    id: 'notif_init_2',
    category: 'kitchen',
    title: '✅ Ticket Ready for Pickup',
    message: 'ORD-107 for Table 8 cooked and plated ready in 13.0m',
    meta: { tableId: 8, orderId: 'ORD-107' },
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    formattedTime: new Date(Date.now() - 25 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  },
  {
    id: 'notif_init_3',
    category: 'cashier',
    title: '🙋‍♂️ Waiter Service Call',
    message: 'Table 4 requested water & beverage refill',
    meta: { tableId: 4 },
    timestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    formattedTime: new Date(Date.now() - 40 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
];

function addAdminNotification(category, title, message, meta = {}) {
  const notif = {
    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    category, // 'kitchen' or 'cashier'
    title,
    message,
    meta,
    timestamp: new Date().toISOString(),
    formattedTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
  adminNotifications.unshift(notif);
  if (adminNotifications.length > 60) adminNotifications.pop();
  io.emit('admin:notification', notif);
}

// Ensure every table has a unique active sessionToken
let sessionsInitialized = false;
tablesData.forEach(t => {
  if (!t.sessionToken) {
    t.sessionToken = 'ses_' + Math.random().toString(36).substring(2, 9);
    sessionsInitialized = true;
  }
  // Tables saved before billRequestedAt existed: keep their pending bill request
  if (t.status === 'bill_requested' && !t.billRequestedAt) {
    t.billRequestedAt = new Date().toISOString();
    sessionsInitialized = true;
  }
});
if (sessionsInitialized) saveJSON(TABLES_FILE, tablesData);

let orderCounter = ordersData.length + 101;

// Orders that count toward a table's bill: accepted by the restaurant and not yet settled.
// Rejected and still-pending (awaiting cashier approval) orders are never charged.
const NON_BILLABLE_STATUSES = ['archived', 'rejected', 'pending_approval'];
const billableOrdersForTable = (tableId) =>
  ordersData.filter(o => o.tableId === tableId && !NON_BILLABLE_STATUSES.includes(o.status));

// Kitchen lifecycle: forward one step, or back one step (recall)
const KITCHEN_ORDER = ['new', 'cooking', 'ready', 'served'];
const KITCHEN_TRANSITIONS = {
  new: ['cooking'],
  cooking: ['ready', 'new'],
  ready: ['served', 'cooking'],
  served: ['ready']
};

// Table status follows its orders' kitchen progress — except a bill request, which sticks
// (billRequestedAt) until the cashier settles, so the counter never loses track of it.
function refreshTableStatus(table) {
  if (table.billRequestedAt) {
    table.status = 'bill_requested';
    return;
  }
  const orders = billableOrdersForTable(table.id);
  if (orders.length === 0) return;
  if (orders.every(o => o.status === 'served')) table.status = 'served';
  else if (orders.some(o => o.status === 'ready')) table.status = 'ready';
  else table.status = 'cooking';
}

// Name shown for an order. Browsers can't reveal a phone's own name, so when the guest leaves it
// blank each phone at the table gets a numbered label (plus its device type) that it keeps all visit.
const DEVICE_TYPES = ['iPhone', 'iPad', 'Android', 'Mac', 'Windows PC', 'Phone', 'Tablet', 'Computer'];
function resolveGuestName(tableId, deviceId, typedName, deviceType) {
  const name = String(typedName || '').trim().slice(0, 40);
  if (name) return name;

  const visitOrders = ordersData.filter(o => o.tableId === tableId && o.status !== 'archived');
  if (deviceId) {
    const previous = visitOrders.find(o => o.deviceId === deviceId);
    if (previous) return previous.customerName;
  }
  const otherDevices = new Set(visitOrders.map(o => o.deviceId || o.id));
  const type = DEVICE_TYPES.includes(deviceType) ? ` · ${deviceType}` : '';
  return `Guest ${otherDevices.size + 1}${type}`;
}

// Guests at a table who already asked for the bill and then order more: keep the request, tell the counter
function alertIfOrderedAfterBill(table, order) {
  if (!table.billRequestedAt) return;
  const alert = {
    type: 'ordered_after_bill',
    tableId: table.id,
    tableName: table.name,
    orderId: order.id,
    customerName: order.customerName,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  io.emit('counter:alert', alert);
  addAdminNotification('cashier', '🧾 Ordered After Bill Request', `${order.customerName} at ${table.name} added ${order.id} after the bill was requested`, { tableId: table.id, orderId: order.id });
}

// --- REST API ENDPOINTS ---

// -1. Staff Authentication API (Fast 4-Digit PIN & Role Logins)
app.post('/api/auth/login', (req, res) => {
  const { role, loginId, pin } = req.body;
  if (!role || !pin) {
    return res.status(400).json({ error: 'Role and PIN are required' });
  }

  // Reload staff data to pick up any changes
  staffData = loadJSON(STAFF_FILE, staffData);

  const cleanPin = String(pin).trim();
  const cleanId = String(loginId || '').trim().toLowerCase();

  let staff = null;
  if (role === 'kitchen') {
    // KDS: ultra-fast 4-digit PIN access (default PIN: 2024)
    staff = staffData.find(s => s.role === 'kitchen' && String(s.pin) === cleanPin);
  } else if (role === 'cashier') {
    // Cashier: Login ID (e.g. 101) + 4-digit PIN (e.g. 1234)
    staff = staffData.find(s => s.role === 'cashier' && String(s.loginId).toLowerCase() === cleanId && String(s.pin) === cleanPin);
  } else if (role === 'admin') {
    // Admin: Login ID ('admin') + PIN (e.g. 9999)
    staff = staffData.find(s => s.role === 'admin' && String(s.loginId).toLowerCase() === cleanId && String(s.pin) === cleanPin);
  }

  if (!staff) {
    return res.status(401).json({ error: 'Invalid Login ID or PIN' });
  }

  const token = 'tok_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
  const sessionInfo = {
    token,
    role: staff.role,
    loginId: staff.loginId,
    name: staff.name,
    createdAt: new Date().toISOString()
  };
  activeStaffSessions.set(token, sessionInfo);

  res.json({
    success: true,
    token,
    staff: {
      role: staff.role,
      loginId: staff.loginId,
      name: staff.name
    }
  });
});

app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers['authorization'] || req.query.token;
  const token = authHeader ? authHeader.replace('Bearer ', '').trim() : null;
  if (token && activeStaffSessions.has(token)) {
    return res.json({ valid: true, staff: activeStaffSessions.get(token) });
  }
  res.status(401).json({ valid: false, error: 'Session invalid or expired' });
});

// 0. Geofence & Location Config API
app.get('/api/config/restaurant', (req, res) => {
  res.json(restaurantProfile);
});

app.put('/api/config/restaurant', (req, res) => {
  const clean = (v, max) => String(v ?? '').trim().slice(0, max);
  const next = {
    name: clean(req.body.name, 60),
    tagline: clean(req.body.tagline, 80),
    address: clean(req.body.address, 120)
  };
  if (!next.name) return res.status(400).json({ error: 'name_required', message: 'Restaurant name is required' });

  restaurantProfile = next;
  saveJSON(RESTAURANT_FILE, restaurantProfile);
  io.emit('restaurant:updated', restaurantProfile);
  res.json(restaurantProfile);
});

app.get('/api/config/location', (req, res) => {
  res.json({ ...RESTAURANT_GEO, name: restaurantProfile.name });
});

// 1. Menu API
app.get('/api/menu', (req, res) => {
  res.json(menuData);
});

// Toggle item availability (In-Stock / 86'd Sold Out)
app.patch('/api/menu/item/:id/availability', (req, res) => {
  const { id } = req.params;
  const { available } = req.body;
  const item = menuData.items.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  item.available = available !== undefined ? available : !item.available;
  saveJSON(MENU_FILE, menuData);

  // Broadcast menu change to all connected clients
  io.emit('menu:updated', menuData);
  res.json({ success: true, item });
});

// Add new menu item
app.post('/api/menu/item', (req, res) => {
  const { name, category, price, description, isVeg, isSpicy, badge, image } = req.body;
  if (!name || price === undefined || !category) {
    return res.status(400).json({ error: 'Name, category, and price are required' });
  }

  const newItem = {
    id: 'item_' + Date.now(),
    name: name.trim(),
    category: category.trim(),
    price: parseFloat(price) || 0,
    description: (description || '').trim(),
    image: image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
    isVeg: Boolean(isVeg),
    isSpicy: Boolean(isSpicy),
    badge: badge ? badge.trim() : '',
    available: true
  };

  menuData.items.push(newItem);
  saveJSON(MENU_FILE, menuData);
  io.emit('menu:updated', menuData);
  res.status(201).json({ success: true, item: newItem });
});

// Update menu item
app.put('/api/menu/item/:id', (req, res) => {
  const { id } = req.params;
  const item = menuData.items.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const { name, category, price, description, isVeg, isSpicy, badge, image, available } = req.body;
  if (name !== undefined) item.name = name.trim();
  if (category !== undefined) item.category = category.trim();
  if (price !== undefined) item.price = parseFloat(price) || 0;
  if (description !== undefined) item.description = description.trim();
  if (image !== undefined) item.image = image.trim();
  if (isVeg !== undefined) item.isVeg = Boolean(isVeg);
  if (isSpicy !== undefined) item.isSpicy = Boolean(isSpicy);
  if (badge !== undefined) item.badge = badge.trim();
  if (available !== undefined) item.available = Boolean(available);

  saveJSON(MENU_FILE, menuData);
  io.emit('menu:updated', menuData);
  res.json({ success: true, item });
});

// Delete menu item
app.delete('/api/menu/item/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = menuData.items.length;
  menuData.items = menuData.items.filter(i => i.id !== id);
  if (menuData.items.length === initialLength) {
    return res.status(404).json({ error: 'Item not found' });
  }

  saveJSON(MENU_FILE, menuData);
  io.emit('menu:updated', menuData);
  res.json({ success: true, message: 'Item removed successfully' });
});

// Admin Notifications API
app.get('/api/admin/notifications', (req, res) => {
  res.json(adminNotifications);
});

app.delete('/api/admin/notifications', (req, res) => {
  adminNotifications = [];
  res.json({ success: true, message: 'Notifications cleared' });
});

// 2. Tables API
app.get('/api/tables', (req, res) => {
  res.json(tablesData);
});

app.get('/api/tables/:id', (req, res) => {
  const tableId = parseInt(req.params.id, 10);
  const table = tablesData.find(t => t.id === tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  // Attach full order details
  const activeOrders = ordersData.filter(o => o.tableId === tableId && o.status !== 'archived');
  res.json({ ...table, activeOrders });
});

// Table Session Validation & Fetch
app.get('/api/tables/:id/session', (req, res) => {
  const tableId = parseInt(req.params.id, 10);
  const table = tablesData.find(t => t.id === tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  res.json({
    tableId: table.id,
    tableName: table.name,
    status: table.status,
    sessionToken: table.sessionToken
  });
});

// 3. Orders API
app.get('/api/orders', (req, res) => {
  // Returns all non-archived orders for Kitchen and Counter
  const activeOrders = ordersData.filter(o => o.status !== 'archived');
  res.json(activeOrders);
});

// Place new order from Customer Table
app.post('/api/orders', (req, res) => {
  const { tableId, items, customerName, deviceId, deviceType, notes, sessionToken, coords, simulation } = req.body;

  if (!tableId || !items || !items.length) {
    return res.status(400).json({ error: 'Table ID and items are required' });
  }

  const table = tablesData.find(t => t.id === parseInt(tableId, 10));
  if (!table) {
    return res.status(404).json({ error: 'Table not found' });
  }

  // --- SECURITY CHECK 1: Session Token Validation ---
  // If the customer provides a sessionToken and it doesn't match the table's current token,
  // the table has been settled/cleared and this is an expired session.
  if (sessionToken && table.sessionToken && sessionToken !== table.sessionToken) {
    return res.status(403).json({
      error: 'session_expired',
      message: 'This dining session has ended and was settled at the counter. Please scan the current table QR code.'
    });
  }

  // --- SECURITY CHECK 2: GPS Geofencing & Conditional Cashier Approval ---
  let isInsideGeofence = true;
  let distanceMeters = 30; // default local demo distance

  if (simulation === 'outside') {
    isInsideGeofence = false;
    distanceMeters = 1450; // 1.45 km away
  } else if (simulation === 'inside') {
    isInsideGeofence = true;
    distanceMeters = 35; // inside dining room
  } else if (coords && coords.latitude && coords.longitude) {
    distanceMeters = calculateDistanceMeters(
      RESTAURANT_GEO.latitude,
      RESTAURANT_GEO.longitude,
      coords.latitude,
      coords.longitude
    );
    isInsideGeofence = distanceMeters <= RESTAURANT_GEO.radiusMeters;
  }

  // Every order goes to the cashier first; only orders the counter accepts reach the kitchen.
  // The geofence result is kept as a warning for the cashier.
  const outsideGeofence = !isInsideGeofence;

  const orderId = `ORD-${orderCounter++}`;
  const now = new Date();

  // Validate items and calculate subtotal
  let subtotal = 0;
  const detailedItems = items.map(cartItem => {
    const menuItem = menuData.items.find(m => m.id === cartItem.id);
    const price = menuItem ? menuItem.price : cartItem.price || 0;
    const name = menuItem ? menuItem.name : cartItem.name;
    const itemTotal = price * cartItem.quantity;
    subtotal += itemTotal;

    return {
      id: cartItem.id,
      name,
      price,
      quantity: cartItem.quantity,
      notes: cartItem.notes || '',
      itemTotal,
      cooked: false
    };
  });

  const newOrder = {
    id: orderId,
    tableId: parseInt(tableId, 10),
    tableName: table.name,
    // Who at the table placed it — the guest's name if given, else a stable "Guest N · iPhone" label
    customerName: resolveGuestName(table.id, String(deviceId || '').slice(0, 64), customerName, deviceType),
    deviceId: String(deviceId || '').slice(0, 64),
    items: detailedItems,
    subtotal: parseFloat(subtotal.toFixed(2)),
    notes: notes || '',
    status: 'pending_approval', // becomes 'new' (kitchen) once the cashier accepts it
    requiresApproval: true,
    outsideGeofence,
    distanceMeters,
    sessionToken: table.sessionToken,
    createdAt: now.toISOString(),
    formattedTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  ordersData.push(newOrder);
  saveJSON(ORDERS_FILE, ordersData);

  io.emit('counter:approval_required', {
    order: newOrder,
    distanceMeters,
    message: outsideGeofence
      ? `${table.name}: new order from OUTSIDE the restaurant (~${(distanceMeters / 1000).toFixed(1)} km away) — check before accepting.`
      : `${table.name}: new order from ${newOrder.customerName} — accept to send it to the kitchen.`
  });
  io.emit('counter:table_updated', { tableId: table.id, status: table.status, order: newOrder });
  io.to(`table_${table.id}`).emit('customer:order_pending_approval', newOrder);

  addAdminNotification(
    'cashier',
    outsideGeofence ? '⚠️ Outside Geofence Order' : '🧾 New Order Awaiting Counter',
    `${table.name} submitted ${orderId} (${detailedItems.length} items)${outsideGeofence ? ` from ~${distanceMeters}m away` : ''}`,
    { tableId: table.id, orderId }
  );

  res.status(201).json({
    success: true,
    order: newOrder,
    requiresApproval: true,
    message: 'Order sent to the counter. It goes to the kitchen as soon as staff confirm it.'
  });
});

// Update order status (Kitchen or Floor staff)
app.patch('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, itemId, itemCooked } = req.body;

  const order = ordersData.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // The kitchen can only move accepted orders one step forward — or one step back to recall a
  // ticket bumped by mistake. Orders still waiting for the counter can't be cooked from here.
  if (!KITCHEN_TRANSITIONS[order.status]) {
    return res.status(409).json({ error: 'not_in_kitchen', message: `Order ${id} is ${order.status}` });
  }
  if (status && status !== order.status && !KITCHEN_TRANSITIONS[order.status].includes(status)) {
    return res.status(409).json({ error: 'invalid_transition', message: `Can't move ${id} from ${order.status} to ${status}` });
  }
  const isRecall = Boolean(status) && KITCHEN_ORDER.indexOf(status) < KITCHEN_ORDER.indexOf(order.status);

  // If toggling specific dish completion
  if (itemId !== undefined && itemCooked !== undefined) {
    const item = order.items.find(i => i.id === itemId);
    if (item) item.cooked = itemCooked;
  }

  if (status && isRecall) {
    // Recall: undo the last bump and clear that stage's timestamp so timings stay honest
    if (order.status === 'served') { order.servedAt = null; order.totalProcessSec = null; order.deliveryDurationSec = null; }
    if (order.status === 'ready') { order.readyAt = null; order.prepDurationSec = null; }
    order.status = status;
    order.recalledAt = new Date().toISOString();
    order.updatedAt = order.recalledAt;
    const table = tablesData.find(t => t.id === order.tableId);
    if (table) {
      refreshTableStatus(table);
      saveJSON(TABLES_FILE, tablesData);
    }
  } else if (status) {
    order.status = status;
    order.updatedAt = new Date().toISOString();

    if (status === 'cooking' && !order.cookingAt) {
      order.cookingAt = new Date().toISOString();
      addAdminNotification('kitchen', '🔥 Cooking Started', `Chef started preparing order ${order.id} for ${order.tableName}`, { tableId: order.tableId, orderId: order.id });
    }
    if (status === 'ready') {
      if (!order.readyAt) order.readyAt = new Date().toISOString();
      const start = order.cookingAt || order.createdAt;
      order.prepDurationSec = Math.max(0, Math.round((new Date(order.readyAt) - new Date(start)) / 1000));
      const mins = (order.prepDurationSec / 60).toFixed(1);
      addAdminNotification('kitchen', '✅ Ticket Ready for Pickup', `${order.id} for ${order.tableName} is ready in ${mins}m`, { tableId: order.tableId, orderId: order.id });
    }
    if (status === 'served') {
      if (!order.servedAt) order.servedAt = new Date().toISOString();
      if (!order.readyAt) order.readyAt = order.servedAt;
      order.totalProcessSec = Math.max(0, Math.round((new Date(order.servedAt) - new Date(order.createdAt)) / 1000));
      order.deliveryDurationSec = Math.max(0, Math.round((new Date(order.servedAt) - new Date(order.readyAt)) / 1000));
      const mins = (order.totalProcessSec / 60).toFixed(1);
      addAdminNotification('kitchen', '🍽️ Order Served to Table', `${order.id} served at ${order.tableName} (Turnaround: ${mins}m)`, { tableId: order.tableId, orderId: order.id });
    }

    // Re-evaluate table status based on all active orders of that table
    const table = tablesData.find(t => t.id === order.tableId);
    if (table) {
      refreshTableStatus(table);
      saveJSON(TABLES_FILE, tablesData);
    }
  }

  saveJSON(ORDERS_FILE, ordersData);

  // Emit status changes to all relevant interfaces
  io.emit('order:status_updated', order);
  io.emit('counter:table_updated', { tableId: order.tableId });
  io.to(`table_${order.tableId}`).emit('customer:status_updated', order);

  res.json({ success: true, order });
});

// 4. Assistance & Bill Requests from Customer
app.post('/api/tables/:id/call-waiter', (req, res) => {
  const tableId = parseInt(req.params.id, 10);
  const table = tablesData.find(t => t.id === tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const alert = {
    type: 'waiter_called',
    tableId,
    tableName: table.name,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  io.emit('counter:alert', alert);
  addAdminNotification('cashier', '🙋‍♂️ Waiter Service Call', `Table ${table.name} requested floor waiter assistance`, { tableId });
  res.json({ success: true, message: 'Waiter notified' });
});

app.post('/api/tables/:id/request-bill', (req, res) => {
  const tableId = parseInt(req.params.id, 10);
  const table = tablesData.find(t => t.id === tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  if (billableOrdersForTable(tableId).length === 0) {
    return res.status(400).json({ error: 'nothing_to_bill', message: 'There is nothing on your bill yet.' });
  }

  // A second tap (or another guest at the table) keeps the original request time
  table.billRequestedAt = table.billRequestedAt || new Date().toISOString();
  refreshTableStatus(table);
  saveJSON(TABLES_FILE, tablesData);

  const alert = {
    type: 'bill_requested',
    tableId,
    tableName: table.name,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  io.emit('counter:alert', alert);
  io.emit('counter:table_updated', { tableId, status: 'bill_requested' });
  io.to(`table_${tableId}`).emit('customer:bill_requested');

  addAdminNotification('cashier', '🧾 Bill Requested', `Table ${table.name} requested the final check/invoice`, { tableId });

  res.json({ success: true, message: 'Bill requested' });
});

// 5. Consolidated Bill for Table
app.get('/api/tables/:id/bill', (req, res) => {
  const tableId = parseInt(req.params.id, 10);
  const table = tablesData.find(t => t.id === tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const activeOrders = billableOrdersForTable(tableId);

  // Aggregate items from all rounds
  const itemMap = new Map();
  let subtotal = 0;

  activeOrders.forEach(order => {
    order.items.forEach(item => {
      if (itemMap.has(item.name)) {
        const existing = itemMap.get(item.name);
        existing.quantity += item.quantity;
        existing.itemTotal += item.itemTotal;
      } else {
        itemMap.set(item.name, {
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          itemTotal: item.itemTotal
        });
      }
      subtotal += item.itemTotal;
    });
  });

  const items = Array.from(itemMap.values());
  const taxRate = 0.05; // 5% GST / VAT
  const tax = parseFloat((subtotal * taxRate).toFixed(2));
  const total = parseFloat((subtotal + tax).toFixed(2));

  // Same bill split by who ordered (one entry per guest name)
  const guestMap = new Map();
  activeOrders.forEach(order => {
    const guest = guestMap.get(order.customerName) || { name: order.customerName, orderIds: [], items: [], subtotal: 0 };
    guest.orderIds.push(order.id);
    order.items.forEach(item => {
      guest.items.push({ name: item.name, quantity: item.quantity, itemTotal: item.itemTotal });
      guest.subtotal += item.itemTotal;
    });
    guestMap.set(order.customerName, guest);
  });

  const billRequestedAt = table.billRequestedAt || null;
  const ordersAfterBillRequest = billRequestedAt
    ? activeOrders.filter(o => new Date(o.createdAt) > new Date(billRequestedAt)).map(o => o.id)
    : [];

  res.json({
    tableId,
    tableName: table.name,
    orderCount: activeOrders.length,
    items,
    guests: Array.from(guestMap.values()).map(g => ({ ...g, subtotal: parseFloat(g.subtotal.toFixed(2)) })),
    subtotal: parseFloat(subtotal.toFixed(2)),
    taxRate: '5%',
    tax,
    total,
    status: table.status,
    billRequestedAt,
    ordersAfterBillRequest
  });
});

// 6. Pay at Counter & Reset Table
app.post('/api/tables/:id/pay-and-reset', (req, res) => {
  const tableId = parseInt(req.params.id, 10);
  const { paymentMethod = 'Cash', discount = 0, cashierName = 'Priya Sharma (Cashier #101)', cashierId = '101' } = req.body;
  const table = tablesData.find(t => t.id === tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const activeOrders = billableOrdersForTable(tableId);

  // Declined / never-approved orders aren't charged, but must not carry over to the next guests
  ordersData
    .filter(o => o.tableId === tableId && o.status !== 'archived' && !activeOrders.includes(o))
    .forEach(o => {
      o.status = 'archived';
      o.settledAt = new Date().toISOString();
    });

  if (activeOrders.length === 0) {
    // Just reset if empty
    table.status = 'available';
    table.billRequestedAt = null;
    table.activeOrders = [];
    saveJSON(TABLES_FILE, tablesData);
    saveJSON(ORDERS_FILE, ordersData);
    io.emit('counter:table_updated', { tableId, status: 'available' });
    io.to(`table_${tableId}`).emit('customer:session_reset');
    return res.json({ success: true, message: 'Table was empty, reset to available.' });
  }

  // Calculate bill for record
  let subtotal = 0;
  const aggregatedItems = [];
  activeOrders.forEach(order => {
    order.items.forEach(i => {
      subtotal += i.itemTotal;
      aggregatedItems.push({ name: i.name, quantity: i.quantity, price: i.price, total: i.itemTotal, orderedBy: order.customerName });
    });
    order.status = 'archived'; // Archive order
    order.settledAt = new Date().toISOString();
  });

  const tax = parseFloat((subtotal * 0.05).toFixed(2));
  const finalTotal = parseFloat(Math.max(0, subtotal + tax - parseFloat(discount || 0)).toFixed(2));

  const invoice = {
    invoiceId: `INV-${Date.now().toString().slice(-6)}`,
    tableId,
    tableName: table.name,
    items: aggregatedItems,
    subtotal: parseFloat(subtotal.toFixed(2)),
    tax,
    discount: parseFloat(discount || 0),
    finalTotal,
    paymentMethod,
    cashier: `${cashierName}`,
    cashierId: `${cashierId}`,
    paidAt: new Date().toISOString(),
    formattedDate: new Date().toLocaleString()
  };

  salesData.push(invoice);
  saveJSON(SALES_FILE, salesData);
  saveJSON(ORDERS_FILE, ordersData);

  addAdminNotification('cashier', '💵 Payment Settled', `Table ${table.name} settled invoice ${invoice.invoiceId} for ₹${finalTotal.toFixed(2)} via ${paymentMethod}`, { tableId, invoiceId: invoice.invoiceId, amount: finalTotal });

  // RESET TABLE & ROTATE SESSION TOKEN (Prevents old links from working later)
  const oldSessionToken = table.sessionToken;
  table.sessionToken = 'ses_' + Math.random().toString(36).substring(2, 9);
  table.status = 'available';
  table.billRequestedAt = null;
  table.activeOrders = [];
  saveJSON(TABLES_FILE, tablesData);

  // Broadcast reset events
  io.emit('counter:table_updated', { tableId, status: 'available', invoice });
  io.emit('kitchen:table_cleared', { tableId });
  // Notify any devices currently viewing that table that this session has expired/settled
  io.to(`table_${tableId}`).emit('customer:session_reset', { invoice, oldSessionToken, newSessionToken: table.sessionToken });

  res.json({ success: true, invoice, newSessionToken: table.sessionToken });
});

// 6b. Cashier Approval Endpoints for Outside-Geofence Orders
app.post('/api/orders/:id/approve', (req, res) => {
  const { id } = req.params;
  const order = ordersData.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  // Only a waiting order can be accepted (guards against a double tap / two cashiers)
  if (order.status !== 'pending_approval') {
    return res.status(409).json({ error: 'already_handled', message: `Order ${id} is already ${order.status}` });
  }

  order.status = 'new';
  order.requiresApproval = false;
  order.approvedAt = new Date().toISOString();
  order.approvedBy = String(req.body?.cashierName || '').slice(0, 60);

  const table = tablesData.find(t => t.id === order.tableId);
  if (table) {
    refreshTableStatus(table);
    if (!table.activeOrders) table.activeOrders = [];
    if (!table.activeOrders.includes(order.id)) table.activeOrders.push(order.id);
    table.lastOrderAt = new Date().toISOString();
    saveJSON(TABLES_FILE, tablesData);
    alertIfOrderedAfterBill(table, order);
  }

  saveJSON(ORDERS_FILE, ordersData);

  // NOW RELEASE TO KITCHEN KDS!
  io.emit('kitchen:new_order', order);
  io.emit('counter:table_updated', { tableId: order.tableId, status: table ? table.status : 'cooking', order });
  io.to(`table_${order.tableId}`).emit('customer:order_approved', order);
  io.to(`table_${order.tableId}`).emit('customer:order_acknowledged', order);

  addAdminNotification('kitchen', '🍳 New Kitchen Ticket', `${order.id} accepted by the counter for ${order.tableName} (${order.items.length} items)`, { tableId: order.tableId, orderId: order.id });

  res.json({ success: true, order });
});

app.post('/api/orders/:id/reject', (req, res) => {
  const { id } = req.params;
  const { reason = 'Declined by the counter.' } = req.body;
  const order = ordersData.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'pending_approval') {
    return res.status(409).json({ error: 'already_handled', message: `Order ${id} is already ${order.status}` });
  }

  order.status = 'rejected';
  order.requiresApproval = false;
  order.rejectedAt = new Date().toISOString();
  order.rejectionReason = reason;

  saveJSON(ORDERS_FILE, ordersData);

  // Notify customer and cashier
  io.to(`table_${order.tableId}`).emit('customer:order_rejected', { orderId: order.id, reason });
  io.emit('counter:table_updated', { tableId: order.tableId });

  res.json({ success: true, order });
});

// 7. QR Code Generator for Table (permanent per-table link)
app.get('/api/qr/:tableId', async (req, res) => {
  try {
    const tableId = parseInt(req.params.tableId, 10);
    const table = tablesData.find(t => t.id === tableId);
    // Printed stands are permanent, so the QR must not embed the (rotating) session token.
    // Each phone picks up the current session when it opens the menu.
    const host = req.get('host');
    const protocol = req.protocol;
    const targetUrl = `${protocol}://${host}/customer?table=${tableId}`;

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#1e1b4b',
        light: '#ffffff'
      }
    });

    res.json({
      tableId,
      sessionToken: table ? table.sessionToken : null,
      url: targetUrl,
      qrImage: qrDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Helper to filter datasets by period
function filterByPeriod(items, dateField, period = 'all') {
  if (!period || period === 'all') return items;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'today') {
    return items.filter(it => it[dateField] && new Date(it[dateField]) >= startOfToday);
  }
  if (period === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return items.filter(it => it[dateField] && new Date(it[dateField]) >= weekAgo);
  }
  if (period === 'month') {
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return items.filter(it => it[dateField] && new Date(it[dateField]) >= monthAgo);
  }
  return items;
}

// 8. Daily Sales & Analytics Stats (Quick endpoint)
app.get('/api/stats', (req, res) => {
  const totalRevenue = salesData.reduce((acc, curr) => acc + (curr.finalTotal || 0), 0);
  const totalOrders = salesData.length;
  const activeTablesCount = tablesData.filter(t => t.status !== 'available').length;

  // Item popularity
  const itemCounts = {};
  salesData.forEach(sale => {
    (sale.items || []).forEach(it => {
      itemCounts[it.name] = (itemCounts[it.name] || 0) + it.quantity;
    });
  });

  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  res.json({
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    totalOrders,
    activeTablesCount,
    totalTables: tablesData.length,
    topItems,
    recentSales: salesData.slice(-10).reverse()
  });
});

// --- ADVANCED EXECUTIVE REPORTS SUITE ---

// 8a. Executive Overview Report
app.get('/api/admin/reports/overview', (req, res) => {
  const { period = 'all' } = req.query;
  const filteredSales = filterByPeriod(salesData, 'paidAt', period);
  const filteredOrders = filterByPeriod(ordersData, 'createdAt', period);

  const grossRevenue = filteredSales.reduce((sum, s) => sum + (s.finalTotal || 0), 0);
  const netSales = filteredSales.reduce((sum, s) => sum + (s.subtotal || 0), 0);
  const totalTax = filteredSales.reduce((sum, s) => sum + (s.tax || 0), 0);
  const totalDiscount = filteredSales.reduce((sum, s) => sum + (s.discount || 0), 0);
  const totalInvoices = filteredSales.length;
  const avgOrderValue = totalInvoices > 0 ? grossRevenue / totalInvoices : 0;

  const activeTablesCount = tablesData.filter(t => t.status !== 'available').length;

  // Payment Breakdown
  const paymentBreakdown = {};
  filteredSales.forEach(sale => {
    const pm = sale.paymentMethod || 'Cash';
    if (!paymentBreakdown[pm]) paymentBreakdown[pm] = { count: 0, revenue: 0 };
    paymentBreakdown[pm].count += 1;
    paymentBreakdown[pm].revenue += (sale.finalTotal || 0);
  });

  // Calculate Average Kitchen Prep Duration
  const ordersWithPrep = filteredOrders.filter(o => o.prepDurationSec && o.prepDurationSec > 0);
  const avgPrepSec = ordersWithPrep.length > 0
    ? Math.round(ordersWithPrep.reduce((acc, o) => acc + o.prepDurationSec, 0) / ordersWithPrep.length)
    : 13 * 60; // 13 min baseline

  // Hourly Peak Heatmap
  const hourlyMap = {};
  for (let h = 9; h <= 23; h++) {
    const label = h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`;
    hourlyMap[h] = { hour: h, label, count: 0, revenue: 0 };
  }
  filteredSales.forEach(sale => {
    if (sale.paidAt) {
      const h = new Date(sale.paidAt).getHours();
      if (hourlyMap[h]) {
        hourlyMap[h].count += 1;
        hourlyMap[h].revenue += (sale.finalTotal || 0);
      }
    }
  });

  res.json({
    period,
    grossRevenue: parseFloat(grossRevenue.toFixed(2)),
    netSales: parseFloat(netSales.toFixed(2)),
    totalTax: parseFloat(totalTax.toFixed(2)),
    totalDiscount: parseFloat(totalDiscount.toFixed(2)),
    totalInvoices,
    avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
    activeTablesCount,
    totalTables: tablesData.length,
    avgPrepDurationMinutes: parseFloat((avgPrepSec / 60).toFixed(1)),
    paymentBreakdown,
    hourlyDistribution: Object.values(hourlyMap)
  });
});

// 8b. Sales Report by Table
app.get('/api/admin/reports/by-table', (req, res) => {
  const { period = 'all' } = req.query;
  const filteredSales = filterByPeriod(salesData, 'paidAt', period);

  const tableReport = tablesData.map(table => {
    const tableSales = filteredSales.filter(s => s.tableId === table.id);
    const revenue = tableSales.reduce((acc, s) => acc + (s.finalTotal || 0), 0);
    const invoiceCount = tableSales.length;
    const aov = invoiceCount > 0 ? revenue / invoiceCount : 0;

    // Item popularity for table
    const itemMap = {};
    tableSales.forEach(s => {
      (s.items || []).forEach(it => {
        itemMap[it.name] = (itemMap[it.name] || 0) + (it.quantity || 1);
      });
    });
    const topItems = Object.entries(itemMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, qty]) => `${name} (${qty})`)
      .join(', ');

    return {
      tableId: table.id,
      tableName: table.name,
      section: table.section || 'Main Dining',
      capacity: table.capacity || 4,
      currentStatus: table.status,
      invoiceCount,
      revenue: parseFloat(revenue.toFixed(2)),
      aov: parseFloat(aov.toFixed(2)),
      topItems: topItems || '—',
      invoices: tableSales
    };
  });

  tableReport.sort((a, b) => b.revenue - a.revenue);
  res.json({ period, tables: tableReport });
});

// 8c. Sales Report by Menu
app.get('/api/admin/reports/by-menu', (req, res) => {
  const { period = 'all' } = req.query;
  const filteredSales = filterByPeriod(salesData, 'paidAt', period);

  const itemStats = {};
  let totalRestaurantRevenue = 0;

  filteredSales.forEach(sale => {
    (sale.items || []).forEach(it => {
      const name = it.name;
      const qty = it.quantity || 1;
      const price = it.price || 0;
      const lineTotal = it.total || (price * qty);

      totalRestaurantRevenue += lineTotal;

      if (!itemStats[name]) {
        const menuItem = menuData.items.find(m => m.name.toLowerCase() === name.toLowerCase());
        itemStats[name] = {
          id: menuItem ? menuItem.id : null,
          name,
          category: menuItem ? menuItem.category : 'General',
          isVeg: menuItem ? menuItem.isVeg : false,
          price: price || (menuItem ? menuItem.price : 0),
          unitsSold: 0,
          grossRevenue: 0,
          available: menuItem ? menuItem.available !== false : true
        };
      }

      itemStats[name].unitsSold += qty;
      itemStats[name].grossRevenue += lineTotal;
    });
  });

  // Ensure all menu catalog items are present
  menuData.items.forEach(mItem => {
    if (!itemStats[mItem.name]) {
      itemStats[mItem.name] = {
        id: mItem.id,
        name: mItem.name,
        category: mItem.category,
        isVeg: mItem.isVeg,
        price: mItem.price,
        unitsSold: 0,
        grossRevenue: 0,
        available: mItem.available !== false
      };
    }
  });

  const itemsList = Object.values(itemStats);
  const avgUnits = itemsList.length > 0
    ? itemsList.reduce((acc, it) => acc + it.unitsSold, 0) / itemsList.length
    : 0;
  const avgRev = itemsList.length > 0
    ? itemsList.reduce((acc, it) => acc + it.grossRevenue, 0) / itemsList.length
    : 0;

  const enrichedList = itemsList.map(item => {
    const revenueShare = totalRestaurantRevenue > 0
      ? parseFloat(((item.grossRevenue / totalRestaurantRevenue) * 100).toFixed(1))
      : 0;

    let matrixClass = 'Dog';
    if (item.unitsSold >= avgUnits && item.grossRevenue >= avgRev) {
      matrixClass = 'Star ⭐';
    } else if (item.unitsSold >= avgUnits && item.grossRevenue < avgRev) {
      matrixClass = 'Workhorse 🐎';
    } else if (item.unitsSold < avgUnits && item.grossRevenue >= avgRev) {
      matrixClass = 'Puzzle 🧩';
    } else {
      matrixClass = 'Dog 🐕';
    }

    return {
      ...item,
      grossRevenue: parseFloat(item.grossRevenue.toFixed(2)),
      revenueShare,
      matrixClass
    };
  });

  enrichedList.sort((a, b) => b.grossRevenue - a.grossRevenue);

  res.json({
    period,
    totalRestaurantRevenue: parseFloat(totalRestaurantRevenue.toFixed(2)),
    items: enrichedList
  });
});

// 8d. Order Time to Process & Turnaround Report
app.get('/api/admin/reports/order-times', (req, res) => {
  const { period = 'all' } = req.query;
  const filteredOrders = filterByPeriod(ordersData, 'createdAt', period);

  let totalPrepSec = 0;
  let prepCount = 0;
  let totalTurnaroundSec = 0;
  let turnaroundCount = 0;

  let fastCount = 0;    // < 10m
  let normalCount = 0;  // 10m - 20m
  let delayedCount = 0; // > 20m

  const itemDelayOccurrences = {};

  const orderLogs = filteredOrders.map(order => {
    const createdDate = order.createdAt ? new Date(order.createdAt) : null;
    const cookingDate = order.cookingAt ? new Date(order.cookingAt) : createdDate;
    const readyDate = order.readyAt ? new Date(order.readyAt) : null;
    const servedDate = order.servedAt ? new Date(order.servedAt) : null;

    let prepSec = order.prepDurationSec;
    if (!prepSec && readyDate && cookingDate) {
      prepSec = Math.max(0, Math.round((readyDate - cookingDate) / 1000));
    }

    let totalSec = order.totalProcessSec;
    if (!totalSec && servedDate && createdDate) {
      totalSec = Math.max(0, Math.round((servedDate - createdDate) / 1000));
    }

    if (prepSec) {
      totalPrepSec += prepSec;
      prepCount += 1;
    }
    if (totalSec) {
      totalTurnaroundSec += totalSec;
      turnaroundCount += 1;
    }

    const metricSec = totalSec || prepSec || (createdDate ? Math.round((Date.now() - createdDate.getTime()) / 1000) : 0);
    let sla = 'fast';
    if (metricSec > 20 * 60) {
      sla = 'delayed';
      delayedCount += 1;
      (order.items || []).forEach(it => {
        itemDelayOccurrences[it.name] = (itemDelayOccurrences[it.name] || 0) + 1;
      });
    } else if (metricSec >= 10 * 60) {
      sla = 'normal';
      normalCount += 1;
    } else {
      sla = 'fast';
      fastCount += 1;
    }

    return {
      id: order.id,
      tableId: order.tableId,
      tableName: order.tableName,
      customerName: order.customerName,
      itemsSummary: (order.items || []).map(i => `${i.quantity}x ${i.name}`).join(', '),
      itemsCount: (order.items || []).reduce((acc, i) => acc + (i.quantity || 1), 0),
      status: order.status,
      createdAt: order.createdAt,
      orderTakenTime: order.formattedTime || (createdDate ? createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'),
      cookingAt: order.cookingAt || null,
      readyAt: order.readyAt || null,
      servedAt: order.servedAt || null,
      prepMinutes: prepSec ? parseFloat((prepSec / 60).toFixed(1)) : null,
      turnaroundMinutes: totalSec ? parseFloat((totalSec / 60).toFixed(1)) : null,
      slaStatus: sla
    };
  });

  const totalEvaluated = fastCount + normalCount + delayedCount;
  const slaCompliancePct = totalEvaluated > 0
    ? parseFloat((((fastCount + normalCount) / totalEvaluated) * 100).toFixed(1))
    : 100;

  const avgPrepMinutes = prepCount > 0 ? parseFloat(((totalPrepSec / prepCount) / 60).toFixed(1)) : 13.2;
  const avgTurnaroundMinutes = turnaroundCount > 0 ? parseFloat(((totalTurnaroundSec / turnaroundCount) / 60).toFixed(1)) : 18.5;

  const slowestDishes = Object.entries(itemDelayOccurrences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, delays]) => ({ name, delays }));

  orderLogs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  res.json({
    period,
    avgPrepMinutes,
    avgTurnaroundMinutes,
    slaCompliancePct,
    fastCount,
    normalCount,
    delayedCount,
    slowestDishes,
    orders: orderLogs
  });
});

// --- SOCKET.IO REALTIME EVENTS ---
io.on('connection', (socket) => {
  // Join table room when customer opens QR link
  socket.on('join:table', (tableId) => {
    socket.join(`table_${tableId}`);
  });

  socket.on('disconnect', () => {
    // Clean disconnection
  });
});

// SPA client-side routing fallback for React Router
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }
  next();
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🍽️  Restaurant QR Ordering & Counter POS Engine running`);
  console.log(`📍  URL: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import { AuthProvider } from './context/AuthContext';
import { RestaurantProvider } from './context/RestaurantContext';

// Import Pages
import HubPage from './pages/HubPage';
import CustomerPage from './pages/CustomerPage';
import CounterPage from './pages/CounterPage';
import KdsPage from './pages/KdsPage';
import AdminPage from './pages/AdminPage';

// Import Global Styles
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <RestaurantProvider>
            <Routes>
              <Route path="/" element={<HubPage />} />
              <Route path="/customer" element={<CustomerPage />} />
              <Route path="/counter" element={<CounterPage />} />
              <Route path="/kds" element={<KdsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </RestaurantProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

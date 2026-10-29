import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';

const RestaurantContext = createContext(null);
const CACHE_KEY = 'pos_restaurant_profile';

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; } catch { return null; }
}

/** Restaurant name / tagline / address, loaded once and kept live when Admin edits it. */
export function RestaurantProvider({ children }) {
  const { socket } = useSocket();
  // Last known profile from this device avoids a blank name while loading
  const [profile, setProfile] = useState(() => readCache() || { name: '', tagline: '', address: '' });

  const apply = useCallback((next) => {
    setProfile(next);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  useEffect(() => {
    fetch('/api/config/restaurant')
      .then(res => (res.ok ? res.json() : null))
      .then(data => data && apply(data))
      .catch(() => {});
  }, [apply]);

  useEffect(() => {
    if (!socket) return;
    socket.on('restaurant:updated', apply);
    return () => socket.off('restaurant:updated', apply);
  }, [socket, apply]);

  useEffect(() => {
    if (profile.name) document.title = `${profile.name} · QR Dining & POS`;
  }, [profile.name]);

  const save = useCallback(async (next) => {
    const res = await fetch('/api/config/restaurant', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Could not save');
    apply(data);
    return data;
  }, [apply]);

  return (
    <RestaurantContext.Provider value={{ ...profile, save }}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error('useRestaurant must be used within a RestaurantProvider');
  return ctx;
}

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

const TOAST_ACCENT = {
  success: 'border-emerald-400',
  warning: 'border-amber-400',
  danger: 'border-red-500',
  info: 'border-blue-400'
};
const TOAST_ICON = { success: '✅', warning: '⚠️', danger: '❌', info: 'ℹ️' };

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [toasts, setToasts] = useState([]);
  const audioCtxRef = useRef(null);

  // Initialize Web Audio API context on demand
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Synthesized chime tones (zero external audio asset dependencies!)
  const playAlertChime = useCallback((type = 'ticket') => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'ticket') {
        // High double-beep for new kitchen ticket
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174.66, now + 0.12);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'bill' || type === 'settle') {
        // Cash register triple chord (Major triad)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.start(now);
        osc.stop(now + 0.55);
      } else if (type === 'waiter' || type === 'warning') {
        // Attention double chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(523.25, now + 0.18);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      }
    } catch (e) {
      console.warn('Audio chime playback blocked or unavailable:', e);
    }
  }, [getAudioContext]);

  // Toast Notification System
  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random();
    // Keep at most 3 on screen so bursts of events don't bury the page on phones
    setToasts(prev => [...prev, { id, message, type }].slice(-3));

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Initialize Socket.IO connection
  useEffect(() => {
    const s = io('/', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    s.on('connect', () => {
      setIsConnected(true);
    });

    s.on('disconnect', () => {
      setIsConnected(false);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        playAlertChime,
        showToast
      }}
    >
      {children}

      {/* Render Global Toasts */}
      <div className="no-print pointer-events-none fixed inset-x-4 top-4 z-100 flex flex-col items-end gap-2 sm:inset-x-auto sm:top-auto sm:right-5 sm:bottom-5">
        {toasts.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => removeToast(t.id)}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border-l-4 bg-slate-900 px-4 py-3 text-left text-sm font-medium text-white shadow-xl shadow-slate-900/20 animate-slide-in-right sm:w-auto sm:min-w-72 ${TOAST_ACCENT[t.type] || TOAST_ACCENT.info}`}
          >
            <span className="shrink-0">{TOAST_ICON[t.type] || TOAST_ICON.info}</span>
            <span className="leading-snug">{t.message}</span>
          </button>
        ))}
      </div>
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
  return ctx;
}

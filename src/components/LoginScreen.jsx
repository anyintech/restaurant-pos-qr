import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field, Input, cx } from './ui';

const ACCENTS = {
  brand: { icon: 'bg-brand-50 text-brand-700 ring-brand-200', button: 'primary', glow: 'from-brand-400/25' },
  blue: { icon: 'bg-blue-50 text-blue-600 ring-blue-100', button: 'blue', glow: 'from-blue-500/25' },
  violet: { icon: 'bg-violet-50 text-violet-600 ring-violet-100', button: 'violet', glow: 'from-violet-500/25' }
};

/**
 * Full-screen staff sign-in used by Admin, Counter and KDS.
 * Pass `idValue`/`onIdChange` to show the Login ID field; omit for PIN-only.
 */
export default function LoginScreen({
  icon, title, subtitle, accent = 'brand',
  idLabel = 'Login ID', idValue, onIdChange,
  pin, onPinChange, error, onSubmit, submitLabel = 'Sign in',
  demoLabel, onDemo
}) {
  const a = ACCENTS[accent];
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-950">
      <div className={cx('pointer-events-none absolute inset-x-0 top-0 h-96 bg-linear-to-b to-transparent', a.glow)} />
      <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl animate-pop-in sm:p-8">
          <div className={cx('mx-auto mb-4 grid size-14 place-items-center rounded-2xl text-3xl ring-1', a.icon)}>
            {icon}
          </div>
          <h2 className="text-center text-xl font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-center text-sm text-slate-500">{subtitle}</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => { e.preventDefault(); run(onSubmit); }}
          >
            {onIdChange && (
              <Field label={idLabel}>
                <Input value={idValue} onChange={(e) => onIdChange(e.target.value)} autoComplete="username" />
              </Field>
            )}

            <Field label="4-digit PIN">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                autoFocus
                autoComplete="current-password"
                value={pin}
                onChange={(e) => onPinChange(e.target.value.replace(/\D/g, ''))}
                className="text-center font-display text-2xl font-bold tracking-[0.5em]"
              />
            </Field>

            {error && (
              <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200">
                {error}
              </div>
            )}

            <Button type="submit" variant={a.button} size="lg" block disabled={busy}>
              {busy ? 'Signing in…' : submitLabel}
            </Button>
          </form>

          {onDemo && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(onDemo)}
              className="mt-3 w-full rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              ⚡ Demo login <span className="text-slate-400">({demoLabel})</span>
            </button>
          )}
        </div>

        <Link to="/" className="mt-6 text-sm font-medium text-slate-400 hover:text-white">
          ← Back to hub
        </Link>
      </div>
    </div>
  );
}

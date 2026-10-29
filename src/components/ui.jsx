import React, { useEffect } from 'react';

export const cx = (...classes) => classes.filter(Boolean).join(' ');

// ---------- Button ----------
const BUTTON_VARIANTS = {
  primary: 'bg-brand-400 text-ink shadow-sm shadow-brand-500/30 hover:bg-brand-300',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  dark: 'bg-slate-900 text-white hover:bg-slate-800',
  blue: 'bg-blue-600 text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700',
  violet: 'bg-violet-600 text-white shadow-sm shadow-violet-600/30 hover:bg-violet-700',
  success: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 hover:bg-emerald-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  'danger-soft': 'bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50'
};

const BUTTON_SIZES = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-md',
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl'
};

export function Button({ as: Comp = 'button', variant = 'secondary', size = 'md', block, className, ...props }) {
  const extra = Comp === 'button' && !props.type ? { type: 'button' } : {};
  return (
    <Comp
      {...extra}
      {...props}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
        'disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        block && 'w-full',
        className
      )}
    />
  );
}

// ---------- Badge ----------
const BADGE_TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  orange: 'bg-brand-50 text-brand-800 ring-brand-200'
};

export function Badge({ tone = 'slate', dot, className, children }) {
  return (
    <span className={cx(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset',
      BADGE_TONES[tone],
      className
    )}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// Table lifecycle status → label + tone (shared by Counter & Admin)
export const TABLE_STATUS = {
  available: { label: 'Available', tone: 'green' },
  cooking: { label: 'Cooking', tone: 'amber' },
  ready: { label: 'Ready', tone: 'blue' },
  served: { label: 'Served', tone: 'violet' },
  bill_requested: { label: 'Bill Requested', tone: 'red' }
};

export function TableStatusBadge({ status }) {
  const meta = TABLE_STATUS[status] || { label: String(status || '').replace('_', ' '), tone: 'slate' };
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

// ---------- Form controls ----------
export const inputClass = cx(
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs',
  'ring-1 ring-inset ring-slate-200 placeholder:text-slate-400',
  'focus:ring-2 focus:ring-accent-500 focus:outline-none transition-shadow'
);

export function Field({ label, hint, className, children }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const Input = ({ className, ...props }) => <input {...props} className={cx(inputClass, className)} />;
export const Select = ({ className, ...props }) => <select {...props} className={cx(inputClass, 'pr-8', className)} />;
export const Textarea = ({ className, ...props }) => <textarea {...props} className={cx(inputClass, 'resize-none', className)} />;

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      )}
    >
      <span className={cx(
        'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform',
        checked && 'translate-x-5'
      )} />
    </button>
  );
}

// ---------- Modal ----------
const MODAL_SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Modal({ open = true, onClose, title, subtitle, size = 'md', footer, accent, children }) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cx(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl animate-pop-in sm:rounded-2xl',
          MODAL_SIZES[size],
          accent
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Misc ----------
export function EmptyState({ icon = '✨', title, children, dark }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 text-4xl">{icon}</div>
      <p className={cx('font-display text-lg font-bold', dark ? 'text-slate-100' : 'text-slate-900')}>{title}</p>
      {children && <p className={cx('mt-1 max-w-sm text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>{children}</p>}
    </div>
  );
}

export function Card({ className, children }) {
  return <div className={cx('rounded-2xl border border-slate-200/80 bg-white shadow-xs', className)}>{children}</div>;
}

export const formatINR = (n) => `₹${(Number(n) || 0).toFixed(2)}`;

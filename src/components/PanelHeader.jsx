import React from 'react';
import { cx } from './ui';

/** Sticky top bar shared by the Counter and KDS panels. */
export default function PanelHeader({ icon, iconClass, title, subtitle, dark, children }) {
  return (
    <header className={cx(
      'sticky top-0 z-30 border-b backdrop-blur',
      dark ? 'border-white/10 bg-slate-950/85' : 'border-slate-200 bg-white/85'
    )}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cx('grid size-10 shrink-0 place-items-center rounded-xl text-xl text-white', iconClass)}>
            {icon}
          </div>
          <div className="min-w-0">
            <h1 className={cx('truncate text-base font-bold sm:text-lg', dark ? 'text-white' : 'text-slate-900')}>{title}</h1>
            <p className={cx('truncate text-xs', dark ? 'text-slate-400' : 'text-slate-500')}>{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </header>
  );
}

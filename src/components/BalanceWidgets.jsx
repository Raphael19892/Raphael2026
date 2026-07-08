import React from 'react';
import { Wallet, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { formatMinutes, CATEGORIES } from '../lib/constants.js';

// The screen-time "wallet" — earned credit minus spent time.
export function WalletCard({ ledger }) {
  const { balance, earnedCredit, spentMinutes, pendingEarnMinutes, overdrawn } =
    ledger;

  return (
    <div
      className={`rounded-2xl p-5 text-white shadow-sm ${
        overdrawn
          ? 'bg-gradient-to-br from-rose-500 to-rose-600'
          : 'bg-gradient-to-br from-violet-500 to-indigo-600'
      }`}
    >
      <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
        <Wallet size={16} />
        🎮 Screen time you can use
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-5xl font-extrabold tracking-tight">
          {formatMinutes(Math.max(0, balance))}
        </span>
        <span className="text-white/70 text-sm mb-1.5">
          {overdrawn ? 'all used up' : 'ready to use'}
        </span>
      </div>
      <p className="mt-1 text-sm text-white/85">
        {overdrawn
          ? 'Do a chore or play outside to earn more!'
          : balance === 0
          ? 'Earn some by doing chores or playing outside!'
          : 'Great job earning this! 🎉'}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="bg-white/15 rounded-xl px-3 py-2">
          <div className="flex items-center gap-1 text-white/70 text-xs">
            <TrendingUp size={13} /> Earned
          </div>
          <div className="font-semibold">{formatMinutes(earnedCredit)}</div>
        </div>
        <div className="bg-white/15 rounded-xl px-3 py-2">
          <div className="flex items-center gap-1 text-white/70 text-xs">
            <TrendingDown size={13} /> Used
          </div>
          <div className="font-semibold">{formatMinutes(spentMinutes)}</div>
        </div>
      </div>

      {pendingEarnMinutes > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-white/80 bg-white/10 rounded-lg px-2.5 py-1.5">
          <Clock size={13} />
          {formatMinutes(pendingEarnMinutes)} waiting for a grown-up to say OK
        </div>
      )}
    </div>
  );
}

// A single goal progress bar.
export function GoalBar({ label, categoryId, value, target, kind }) {
  const cat = CATEGORIES[categoryId];
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;

  // For a "max" goal (screen), exceeding the target is bad -> turn red.
  const over = kind === 'max' && target && value > target;
  const met = kind === 'min' && target && value >= target;

  const barColor = over
    ? 'bg-rose-500'
    : met
    ? 'bg-emerald-500'
    : cat?.classes.dot ?? 'bg-slate-400';

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="flex items-center gap-1.5 font-medium text-slate-700">
          <span className={`w-2 h-2 rounded-full ${cat?.classes.dot}`} />
          {label}
        </span>
        <span className={`tabular-nums ${over ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
          {formatMinutes(value)}
          {target ? (
            <span className="text-slate-400">
              {' '}
              / {kind === 'max' ? 'max ' : ''}
              {formatMinutes(target)}
            </span>
          ) : null}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${target ? Math.min(100, (value / target) * 100) : 0}%` }}
        />
      </div>
    </div>
  );
}

// Small stat tile used on the dashboard header row.
export function StatTile({ icon: Icon, label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-700 bg-slate-100',
    emerald: 'text-emerald-700 bg-emerald-100',
    violet: 'text-violet-700 bg-violet-100',
    amber: 'text-amber-700 bg-amber-100',
    rose: 'text-rose-700 bg-rose-100',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-lg grid place-items-center ${tones[tone]}`}>
          <Icon size={16} />
        </span>
        <span className="text-sm text-slate-500">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums">
        {value}
      </div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

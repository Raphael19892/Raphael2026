import React from 'react';
import { useStore } from '../state/store.jsx';
import { computeBalance } from '../lib/balanceEngine.js';
import { formatMinutes } from '../lib/constants.js';

const AVATAR_COLORS = {
  rose: 'bg-rose-500',
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-500',
};

export default function ProfileSwitcher() {
  const { state, dispatch } = useStore();
  const kids = state.profiles.filter((p) => p.role === 'kid');

  if (kids.length === 0) return null;

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 overflow-x-auto thin-scroll">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 mr-1 shrink-0">
          Viewing
        </span>
        {kids.map((kid) => {
          const active = state.activeProfileId === kid.id;
          const blocks = state.blocks.filter((b) => b.profileId === kid.id);
          const { balance } = computeBalance(blocks, state.settings.earnRate);
          return (
            <button
              key={kid.id}
              onClick={() =>
                dispatch({ type: 'SET_ACTIVE_PROFILE', profileId: kid.id })
              }
              className={`shrink-0 flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full border transition ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <span
                className={`w-7 h-7 rounded-full grid place-items-center text-white text-xs font-bold ${
                  AVATAR_COLORS[kid.color] ?? 'bg-slate-500'
                }`}
              >
                {kid.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-sm font-semibold">{kid.name}</span>
              <span
                className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                  active ? 'bg-white/15' : 'bg-slate-100'
                } ${balance < 0 ? 'text-rose-400' : ''}`}
              >
                {formatMinutes(balance)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { AVATAR_COLORS };

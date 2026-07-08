import React, { useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  ListChecks,
  TrendingUp,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../state/store.jsx';
import {
  computeBalance,
  computeGoalProgress,
  completionRate,
} from '../lib/balanceEngine.js';
import { CATEGORIES, DAYS, formatMinutes } from '../lib/constants.js';
import { WalletCard, GoalBar, StatTile } from './BalanceWidgets.jsx';
import { AVATAR_COLORS } from './ProfileSwitcher.jsx';

export default function Dashboard() {
  const { state, dispatch } = useStore();
  const kids = state.profiles.filter((p) => p.role === 'kid');
  const active = state.profiles.find((p) => p.id === state.activeProfileId);

  const activeBlocks = useMemo(
    () => state.blocks.filter((b) => b.profileId === state.activeProfileId),
    [state.blocks, state.activeProfileId]
  );

  // Items completed by a kid but not yet approved by a parent (earn categories only).
  const pendingApprovals = useMemo(
    () =>
      state.blocks
        .filter((b) => {
          const effect = CATEGORIES[b.category].effect;
          return effect === 'earn' && b.completed && !b.approved;
        })
        .map((b) => ({
          ...b,
          profile: state.profiles.find((p) => p.id === b.profileId),
        })),
    [state.blocks, state.profiles]
  );

  if (!active) {
    return (
      <div className="text-center text-slate-500 py-20">
        Add a family member in the Family tab to get started.
      </div>
    );
  }

  const ledger = computeBalance(activeBlocks, state.settings.earnRate);
  const goals = computeGoalProgress(activeBlocks, active.goals);
  const rate = completionRate(activeBlocks);
  const doneCount = activeBlocks.filter((b) => b.completed).length;

  return (
    <div className="space-y-6">
      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          icon={ListChecks}
          label="Tasks done"
          value={`${rate}%`}
          sub={`${doneCount} of ${activeBlocks.length} finished`}
          tone="emerald"
        />
        <StatTile
          icon={TrendingUp}
          label="Screen time earned"
          value={formatMinutes(ledger.earnedCredit)}
          sub="from chores & play"
          tone="amber"
        />
        <StatTile
          icon={Clock}
          label="Screen time used"
          value={formatMinutes(ledger.spentMinutes)}
          sub="so far"
          tone="violet"
        />
        <StatTile
          icon={CheckCircle2}
          label="Pending approvals"
          value={pendingApprovals.length}
          sub="across all kids"
          tone={pendingApprovals.length ? 'rose' : 'slate'}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: wallet + goals for the active kid */}
        <div className="space-y-4">
          <WalletCard ledger={ledger} />

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500" />
              {active.name}'s daily goals
            </h3>
            <div className="space-y-4">
              <GoalBar
                label="⚽ Active play"
                categoryId="activity"
                value={goals.activity.minutes}
                target={goals.activity.min}
                kind="min"
              />
              <GoalBar
                label="🧹 Chores"
                categoryId="chore"
                value={goals.chores.minutes}
                target={goals.chores.min}
                kind="min"
              />
              <GoalBar
                label="🎮 Screen time"
                categoryId="screen"
                value={goals.screen.minutes}
                target={goals.screen.max}
                kind="max"
              />
            </div>
            {goals.screen.overLimit && (
              <p className="mt-3 text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
                Over the daily screen-time cap.
              </p>
            )}
          </div>
        </div>

        {/* Middle: approvals queue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900">Finished tasks to say OK to</h3>
            {pendingApprovals.length > 0 && (
              <span className="text-xs font-semibold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                {pendingApprovals.length} waiting
              </span>
            )}
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <CheckCircle2 className="mx-auto mb-2 text-emerald-400" size={28} />
              <p className="text-sm">All caught up — nothing to approve.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pendingApprovals.map((item) => {
                const cat = CATEGORIES[item.category];
                const Icon = cat.icon;
                const day = DAYS.find((d) => d.key === item.day)?.label;
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 hover:border-slate-200"
                  >
                    <span
                      className={`w-8 h-8 rounded-lg grid place-items-center ${cat.classes.chip}`}
                    >
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800 truncate">
                        {item.title}
                      </div>
                      <div className="text-xs text-slate-400">
                        {item.profile?.name} · {day} · {formatMinutes(item.duration)}{' '}
                        · +{formatMinutes(Math.round(item.duration * state.settings.earnRate))} credit
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        dispatch({ type: 'SET_APPROVAL', id: item.id, approved: true })
                      }
                      className="w-8 h-8 rounded-lg grid place-items-center bg-emerald-500 text-white hover:bg-emerald-600"
                      title="Approve"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() =>
                        dispatch({ type: 'TOGGLE_COMPLETE', id: item.id })
                      }
                      className="w-8 h-8 rounded-lg grid place-items-center bg-slate-100 text-slate-500 hover:bg-slate-200"
                      title="Reject (mark not done)"
                    >
                      <X size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right: family balance overview */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-900 mb-4">Family balances</h3>
          <ul className="space-y-3">
            {kids.map((kid) => {
              const kb = state.blocks.filter((b) => b.profileId === kid.id);
              const l = computeBalance(kb, state.settings.earnRate);
              const r = completionRate(kb);
              return (
                <li
                  key={kid.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50"
                >
                  <span
                    className={`w-9 h-9 rounded-full grid place-items-center text-white text-sm font-bold ${
                      AVATAR_COLORS[kid.color] ?? 'bg-slate-500'
                    }`}
                  >
                    {kid.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">
                      {kid.name}
                    </div>
                    <div className="text-xs text-slate-400">{r}% complete</div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-sm font-bold tabular-nums ${
                        l.balance < 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {formatMinutes(l.balance)}
                    </div>
                    <div className="text-[11px] text-slate-400">screen credit</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { CalendarDays, LayoutDashboard, Users, Scale } from 'lucide-react';
import { useStore } from './state/store.jsx';
import ScheduleView from './components/ScheduleView.jsx';
import Dashboard from './components/Dashboard.jsx';
import ProfilesView from './components/ProfilesView.jsx';
import ProfileSwitcher from './components/ProfileSwitcher.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'profiles', label: 'Family', icon: Users },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const { state } = useStore();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <div className="flex items-center gap-2 mr-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-emerald-500 grid place-items-center text-white shadow-sm">
              <Scale size={20} />
            </div>
            <div className="leading-tight">
              <div className="font-extrabold text-slate-900 tracking-tight">
                BalanceBoard
              </div>
              <div className="text-[11px] text-slate-400 -mt-0.5 hidden sm:block">
                Screen time, earned & balanced
              </div>
            </div>
          </div>

          <nav className="ml-auto flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon size={16} />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* The profile switcher is shown on kid-scoped views only */}
      {tab !== 'profiles' && <ProfileSwitcher />}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'schedule' && <ScheduleView />}
        {tab === 'profiles' && <ProfilesView />}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            Local-first · your data stays in this browser ({state.profiles.length}{' '}
            profiles, {state.blocks.length} scheduled tasks)
          </span>
          <span>1 min activity/chore = {state.settings.earnRate}× screen credit</span>
        </div>
      </footer>
    </div>
  );
}

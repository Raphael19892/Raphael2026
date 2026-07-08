import React, { useState } from 'react';
import { UserPlus, Trash2, Save, Settings2, RotateCcw } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { AVATAR_COLORS } from './ProfileSwitcher.jsx';

const COLOR_CHOICES = ['rose', 'indigo', 'emerald', 'amber', 'sky', 'violet'];

export default function ProfilesView() {
  const { state, dispatch } = useStore();
  const kids = state.profiles.filter((p) => p.role === 'kid');
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Family</h1>
          <p className="text-sm text-slate-500">
            Set each kid's daily goals. Screen time is earned from activity & chores.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 shadow-sm"
        >
          <UserPlus size={16} /> Add kid
        </button>
      </div>

      <EarnRateCard />

      <div className="grid md:grid-cols-2 gap-4">
        {adding && (
          <NewKidCard onCancel={() => setAdding(false)} onDone={() => setAdding(false)} />
        )}
        {kids.map((kid) => (
          <KidCard key={kid.id} kid={kid} canDelete={kids.length > 1} />
        ))}
      </div>

      {kids.length === 0 && !adding && (
        <div className="text-center text-slate-400 py-16 bg-white rounded-2xl border border-slate-200">
          No kids yet. Add one to start scheduling.
        </div>
      )}
    </div>
  );
}

function EarnRateCard() {
  const { state, dispatch } = useStore();
  const rate = state.settings.earnRate;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h3 className="font-bold text-slate-900 flex items-center gap-2">
        <Settings2 size={16} className="text-slate-500" /> Balance rule
      </h3>
      <p className="text-sm text-slate-500 mt-1">
        Each minute of completed activity or chores earns{' '}
        <span className="font-semibold text-slate-800">{rate}×</span> that many
        minutes of screen time.
      </p>
      <div className="mt-4 flex items-center gap-4">
        <input
          type="range"
          min="0.25"
          max="2"
          step="0.25"
          value={rate}
          onChange={(e) =>
            dispatch({
              type: 'UPDATE_SETTINGS',
              settings: { earnRate: Number(e.target.value) },
            })
          }
          className="flex-1 accent-violet-600"
        />
        <span className="w-24 text-sm text-slate-600">
          30m earns{' '}
          <span className="font-semibold text-slate-900">
            {Math.round(30 * rate)}m
          </span>
        </span>
      </div>

      <button
        onClick={() => {
          if (confirm('Reset all data back to the demo family?')) {
            dispatch({ type: 'RESET' });
          }
        }}
        className="mt-4 flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-rose-600"
      >
        <RotateCcw size={13} /> Reset app to demo data
      </button>
    </div>
  );
}

function NewKidCard({ onCancel, onDone }) {
  const { dispatch } = useStore();
  const [form, setForm] = useState({
    name: '',
    age: '',
    color: 'sky',
    goals: { screenMax: 120, activityMin: 60, choresMin: 30 },
  });

  function create() {
    if (!form.name.trim()) return;
    dispatch({
      type: 'ADD_PROFILE',
      profile: {
        name: form.name.trim(),
        age: form.age ? Number(form.age) : undefined,
        role: 'kid',
        color: form.color,
        goals: form.goals,
      },
    });
    onDone();
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-dashed border-violet-300 p-5">
      <h3 className="font-bold text-slate-900 mb-3">New kid</h3>
      <div className="space-y-3">
        <div className="flex gap-3">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <input
            value={form.age}
            onChange={(e) => setForm({ ...form, age: e.target.value })}
            placeholder="Age"
            type="number"
            className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>
        <ColorPicker
          value={form.color}
          onChange={(color) => setForm({ ...form, color })}
        />
        <GoalInputs
          goals={form.goals}
          onChange={(goals) => setForm({ ...form, goals })}
        />
      </div>
      <div className="mt-4 flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          onClick={create}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800"
        >
          Create
        </button>
      </div>
    </div>
  );
}

function KidCard({ kid, canDelete }) {
  const { dispatch } = useStore();
  const [draft, setDraft] = useState({
    name: kid.name,
    age: kid.age ?? '',
    color: kid.color,
    goals: { ...kid.goals },
  });
  const [dirty, setDirty] = useState(false);

  function update(patch) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }

  function save() {
    dispatch({
      type: 'UPDATE_PROFILE',
      profile: {
        id: kid.id,
        name: draft.name.trim() || kid.name,
        age: draft.age ? Number(draft.age) : undefined,
        color: draft.color,
        goals: draft.goals,
      },
    });
    setDirty(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-4">
        <span
          className={`w-11 h-11 rounded-full grid place-items-center text-white text-lg font-bold ${
            AVATAR_COLORS[draft.color] ?? 'bg-slate-500'
          }`}
        >
          {(draft.name || '?').slice(0, 1).toUpperCase()}
        </span>
        <div className="flex-1">
          <input
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            className="w-full font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-violet-400 focus:outline-none"
          />
          <div className="flex items-center gap-1 text-xs text-slate-400">
            age
            <input
              value={draft.age}
              onChange={(e) => update({ age: e.target.value })}
              type="number"
              className="w-10 bg-transparent focus:outline-none"
            />
          </div>
        </div>
        {canDelete && (
          <button
            onClick={() => {
              if (confirm(`Remove ${kid.name} and their schedule?`)) {
                dispatch({ type: 'DELETE_PROFILE', profileId: kid.id });
              }
            }}
            className="text-slate-300 hover:text-rose-500"
            title="Remove"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      <ColorPicker value={draft.color} onChange={(color) => update({ color })} />
      <div className="mt-3">
        <GoalInputs goals={draft.goals} onChange={(goals) => update({ goals })} />
      </div>

      {dirty && (
        <button
          onClick={save}
          className="mt-4 w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 animate-pop-in"
        >
          <Save size={15} /> Save changes
        </button>
      )}
    </div>
  );
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      {COLOR_CHOICES.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full ${AVATAR_COLORS[c]} transition ${
            value === c ? 'ring-2 ring-offset-2 ring-slate-400' : 'opacity-60 hover:opacity-100'
          }`}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function GoalInputs({ goals, onChange }) {
  const rows = [
    { key: 'activityMin', label: 'Activity (min/day)', color: 'text-emerald-600' },
    { key: 'choresMin', label: 'Chores (min/day)', color: 'text-amber-600' },
    { key: 'screenMax', label: 'Screen cap (max/day)', color: 'text-violet-600' },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2">
          <span className={`text-xs font-medium flex-1 ${r.color}`}>{r.label}</span>
          <input
            type="number"
            min="0"
            step="15"
            value={goals[r.key] ?? 0}
            onChange={(e) =>
              onChange({ ...goals, [r.key]: Number(e.target.value) })
            }
            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <span className="text-xs text-slate-400 w-6">min</span>
        </div>
      ))}
    </div>
  );
}

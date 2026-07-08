import React, { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import {
  CATEGORY_LIST,
  CATEGORIES,
  DAYS,
  HOURS,
  DURATION_OPTIONS,
  formatHour,
} from '../lib/constants.js';

// Modal for creating or editing a scheduled task block.
// Pass `block` to edit; pass `defaults` (e.g. {day, startHour}) to prefill a new one.
export default function TaskModal({ open, onClose, block, defaults }) {
  const { state, dispatch } = useStore();
  const editing = Boolean(block);

  const [form, setForm] = useState(blankForm());

  function blankForm() {
    return {
      title: '',
      category: 'chore',
      day: 'mon',
      startHour: 16,
      duration: 30,
    };
  }

  useEffect(() => {
    if (!open) return;
    if (block) {
      setForm({
        title: block.title,
        category: block.category,
        day: block.day,
        startHour: block.startHour,
        duration: block.duration,
      });
    } else {
      setForm({ ...blankForm(), ...defaults });
    }
  }, [open, block, defaults]);

  if (!open) return null;

  const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId);

  function submit(e) {
    e.preventDefault();
    const title = form.title.trim() || CATEGORIES[form.category].label;
    if (editing) {
      dispatch({ type: 'UPDATE_BLOCK', block: { id: block.id, ...form, title } });
    } else {
      dispatch({
        type: 'ADD_BLOCK',
        block: { ...form, title, profileId: state.activeProfileId },
      });
    }
    onClose();
  }

  function remove() {
    dispatch({ type: 'DELETE_BLOCK', id: block.id });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl animate-pop-in overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">
            {editing ? 'Edit task' : 'Add task'}
            {activeProfile && (
              <span className="text-slate-400 font-medium">
                {' '}
                · {activeProfile.name}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Category
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CATEGORY_LIST.map((c) => {
                const Icon = c.icon;
                const selected = form.category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: c.id }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition ${
                      selected
                        ? `${c.classes.chip} ring-2 ${c.classes.ring}`
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Icon size={16} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Title
            </label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={CATEGORIES[form.category].label}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Day">
              <select
                value={form.day}
                onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm bg-white"
              >
                {DAYS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start">
              <select
                value={form.startHour}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startHour: Number(e.target.value) }))
                }
                className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm bg-white"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Length">
              <select
                value={form.duration}
                onChange={(e) =>
                  setForm((f) => ({ ...f, duration: Number(e.target.value) }))
                }
                className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm bg-white"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          {editing && (
            <button
              type="button"
              onClick={remove}
              className="flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700 mr-auto"
            >
              <Trash2 size={16} /> Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 ${
              editing ? '' : 'ml-auto'
            }`}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800"
          >
            {editing ? 'Save' : 'Add task'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

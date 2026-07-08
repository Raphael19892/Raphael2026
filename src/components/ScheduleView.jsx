import React, { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  closestCenter,
} from '@dnd-kit/core';
import { Plus, Check, Clock, AlertTriangle } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import {
  DAYS,
  HOURS,
  START_HOUR,
  CATEGORIES,
  formatHour,
  formatMinutes,
} from '../lib/constants.js';
import { computeBalance, canAffordScreen } from '../lib/balanceEngine.js';
import TaskModal from './TaskModal.jsx';

const ROW_H = 60; // px per hour row

export default function ScheduleView() {
  const { state, dispatch } = useStore();
  const activeId = state.activeProfileId;
  const profile = state.profiles.find((p) => p.id === activeId);

  const blocks = useMemo(
    () => state.blocks.filter((b) => b.profileId === activeId),
    [state.blocks, activeId]
  );

  const [modal, setModal] = useState({ open: false, block: null, defaults: null });
  const [dragging, setDragging] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function onDragStart(e) {
    setDragging(blocks.find((b) => b.id === e.active.id) ?? null);
  }

  function onDragEnd(e) {
    setDragging(null);
    const { active, over } = e;
    if (!over) return;
    const [day, hourStr] = String(over.id).split(':');
    const startHour = Number(hourStr);
    const block = blocks.find((b) => b.id === active.id);
    if (!block) return;
    if (block.day === day && block.startHour === startHour) return;
    dispatch({ type: 'MOVE_BLOCK', id: block.id, day, startHour });
  }

  if (!profile) {
    return (
      <div className="text-center text-slate-500 py-20">
        No kid profiles yet — add one in the Family tab.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">
            {profile.name}'s week
          </h1>
          <p className="text-sm text-slate-500">
            Drag tasks to reschedule · click to edit · tap the circle to complete
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, block: null, defaults: null })}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 shadow-sm"
        >
          <Plus size={16} /> Add task
        </button>
      </div>

      <Legend />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto thin-scroll">
          <div className="min-w-[760px]">
            {/* Header row */}
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>
              <div className="border-b border-slate-100" />
              {DAYS.map((d) => (
                <div
                  key={d.key}
                  className="border-b border-l border-slate-100 px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-500"
                >
                  {d.label}
                </div>
              ))}
            </div>

            {/* Grid body */}
            <div
              className="grid relative"
              style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}
            >
              {/* Hour labels column */}
              <div>
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{ height: ROW_H }}
                    className="text-[11px] text-slate-400 text-right pr-2 pt-1 border-b border-slate-50"
                  >
                    {formatHour(h)}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {DAYS.map((d) => (
                <DayColumn
                  key={d.key}
                  day={d.key}
                  blocks={blocks.filter((b) => b.day === d.key)}
                  allBlocks={blocks}
                  earnRate={state.settings.earnRate}
                  onEdit={(block) => setModal({ open: true, block, defaults: null })}
                  onAdd={(defaults) => setModal({ open: true, block: null, defaults })}
                  dispatch={dispatch}
                />
              ))}
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging ? <BlockCard block={dragging} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <TaskModal
        open={modal.open}
        block={modal.block}
        defaults={modal.defaults}
        onClose={() => setModal({ open: false, block: null, defaults: null })}
      />
    </div>
  );
}

function DayColumn({ day, blocks, allBlocks, earnRate, onEdit, onAdd, dispatch }) {
  return (
    <div className="relative border-l border-slate-100">
      {/* Droppable hour cells (background layer) */}
      {HOURS.map((h) => (
        <HourCell key={h} day={day} hour={h} onAdd={onAdd} />
      ))}

      {/* Block layer (absolute overlay) */}
      {blocks.map((block) => (
        <PositionedBlock
          key={block.id}
          block={block}
          allBlocks={allBlocks}
          earnRate={earnRate}
          onEdit={onEdit}
          dispatch={dispatch}
        />
      ))}
    </div>
  );
}

function HourCell({ day, hour, onAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${day}:${hour}` });
  return (
    <div
      ref={setNodeRef}
      style={{ height: ROW_H }}
      onDoubleClick={() => onAdd({ day, startHour: hour })}
      className={`border-b border-slate-50 transition-colors group ${
        isOver ? 'bg-violet-50' : ''
      }`}
    >
      <button
        onClick={() => onAdd({ day, startHour: hour })}
        className="w-full h-full opacity-0 group-hover:opacity-100 transition grid place-items-center text-slate-300 hover:text-violet-500"
        tabIndex={-1}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function PositionedBlock({ block, allBlocks, earnRate, onEdit, dispatch }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: block.id });

  const top = (block.startHour - START_HOUR) * ROW_H;
  const height = Math.max(28, (block.duration / 60) * ROW_H - 4);

  const style = {
    top: top + 2,
    height,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="absolute left-1 right-1 z-10 touch-none cursor-grab active:cursor-grabbing"
    >
      <BlockCard
        block={block}
        allBlocks={allBlocks}
        earnRate={earnRate}
        onEdit={onEdit}
        dispatch={dispatch}
      />
    </div>
  );
}

// The visual card for a task block. Used both in the grid and the drag overlay.
function BlockCard({ block, allBlocks, earnRate, onEdit, dispatch, overlay }) {
  const cat = CATEGORIES[block.category];
  const Icon = cat.icon;

  const isScreen = cat.effect === 'spend';
  const affordable =
    !isScreen || !allBlocks
      ? true
      : canAffordScreen(allBlocks, block, earnRate);
  const warn = isScreen && block.completed === false && !affordable;

  function toggle(e) {
    e.stopPropagation();
    dispatch?.({ type: 'TOGGLE_COMPLETE', id: block.id });
  }

  return (
    <div
      onClick={() => onEdit?.(block)}
      className={`h-full w-full rounded-lg border px-2 py-1.5 flex flex-col justify-between overflow-hidden shadow-sm ${
        cat.classes.chip
      } ${block.completed ? 'opacity-95 ring-1 ' + cat.classes.ring : ''} ${
        overlay ? 'shadow-lg scale-[1.02]' : ''
      }`}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        <button
          onClick={toggle}
          className={`shrink-0 mt-0.5 w-4 h-4 rounded-full border grid place-items-center transition ${
            block.completed
              ? `${cat.classes.solid} border-transparent`
              : 'border-current hover:bg-white/40'
          }`}
          title={block.completed ? 'Mark not done' : 'Mark done'}
        >
          {block.completed && <Check size={11} strokeWidth={3} />}
        </button>
        <div className="min-w-0">
          <div
            className={`text-xs font-semibold leading-tight truncate ${
              block.completed ? 'line-through' : ''
            }`}
          >
            {block.title}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 text-[10px] font-medium opacity-80">
        <Icon size={11} />
        <span>{formatMinutes(block.duration)}</span>
        {block.completed && !block.approved && cat.effect === 'earn' && (
          <span className="ml-auto flex items-center gap-0.5" title="Awaiting approval">
            <Clock size={10} />
          </span>
        )}
        {warn && (
          <span className="ml-auto flex items-center gap-0.5 text-rose-600" title="Not enough earned screen credit">
            <AlertTriangle size={10} />
          </span>
        )}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 mb-3 text-xs text-slate-500 flex-wrap">
      {Object.values(CATEGORIES).map((c) => (
        <span key={c.id} className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${c.classes.dot}`} />
          {c.label}
          <span className="text-slate-300">
            {c.effect === 'earn' ? '(+credit)' : c.effect === 'spend' ? '(−credit)' : ''}
          </span>
        </span>
      ))}
    </div>
  );
}

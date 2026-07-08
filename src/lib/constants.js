// Central catalog of task categories used across the app.
// Each category declares whether it EARNS screen-time credit, SPENDS it, or is neutral.
import { Gamepad2, Dumbbell, SprayCan, BookOpen } from 'lucide-react';

export const CATEGORIES = {
  screen: {
    id: 'screen',
    label: 'Screen Time',
    // Screen time spends the earned balance.
    effect: 'spend',
    // Kid-friendly one-liner explaining what this does to screen time.
    kidNote: 'Uses screen time',
    emoji: '🎮',
    icon: Gamepad2,
    color: 'violet',
    // tailwind class groups (kept explicit so the JIT compiler keeps them)
    classes: {
      chip: 'bg-violet-100 text-violet-700 border-violet-200',
      solid: 'bg-violet-500 text-white',
      dot: 'bg-violet-500',
      ring: 'ring-violet-300',
    },
  },
  activity: {
    id: 'activity',
    label: 'Active Play',
    effect: 'earn',
    kidNote: 'Earns screen time',
    emoji: '⚽',
    icon: Dumbbell,
    color: 'emerald',
    classes: {
      chip: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      solid: 'bg-emerald-500 text-white',
      dot: 'bg-emerald-500',
      ring: 'ring-emerald-300',
    },
  },
  chore: {
    id: 'chore',
    label: 'Chore',
    effect: 'earn',
    kidNote: 'Earns screen time',
    emoji: '🧹',
    icon: SprayCan,
    color: 'amber',
    classes: {
      chip: 'bg-amber-100 text-amber-700 border-amber-200',
      solid: 'bg-amber-500 text-white',
      dot: 'bg-amber-500',
      ring: 'ring-amber-300',
    },
  },
  homework: {
    id: 'homework',
    label: 'Homework',
    // Homework is neutral by default but still tracked for completion rate.
    effect: 'neutral',
    kidNote: '',
    emoji: '📚',
    icon: BookOpen,
    color: 'sky',
    classes: {
      chip: 'bg-sky-100 text-sky-700 border-sky-200',
      solid: 'bg-sky-500 text-white',
      dot: 'bg-sky-500',
      ring: 'ring-sky-300',
    },
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

export const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

// Schedule grid runs from 6:00 to 22:00 in one-hour rows.
export const START_HOUR = 6;
export const END_HOUR = 22;
export const HOURS = Array.from(
  { length: END_HOUR - START_HOUR },
  (_, i) => START_HOUR + i
);

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

// How many minutes of earning activity unlock one minute of screen time.
// 1.0 => 30 min activity unlocks 30 min screen. Tunable per household in settings.
export const DEFAULT_EARN_RATE = 1.0;

export function formatHour(h) {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

export function formatMinutes(mins) {
  const sign = mins < 0 ? '-' : '';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h && m) return `${sign}${h}h ${m}m`;
  if (h) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

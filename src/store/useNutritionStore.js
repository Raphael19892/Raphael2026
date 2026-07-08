// =============================================================================
// useNutritionStore.js
// -----------------------------------------------------------------------------
// Global app state: the meal log, persisted to device storage.
// Uses Zustand for a tiny, hook-based store and AsyncStorage for persistence.
// =============================================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeMeal } from '../services/aiAnalysis';

const STORAGE_KEY = '@fibertrack/meals';

// Local YYYY-MM-DD key for grouping meals by day.
export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

async function persist(meals) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(meals));
  } catch (e) {
    // Non-fatal: state stays in memory even if disk write fails.
    console.warn('Failed to persist meals', e);
  }
}

export const useNutritionStore = create((set, get) => ({
  meals: [],
  status: 'idle', // 'idle' | 'analyzing' | 'error'
  error: null,
  hydrated: false,

  // Load persisted meals on app start.
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const meals = raw ? JSON.parse(raw) : [];
      set({ meals, hydrated: true });
    } catch (e) {
      set({ hydrated: true });
    }
  },

  // Analyze free text and add the resulting meal to the log.
  addMeal: async (freeText) => {
    set({ status: 'analyzing', error: null });
    try {
      const meal = await analyzeMeal(freeText);
      const meals = [meal, ...get().meals];
      set({ meals, status: 'idle' });
      persist(meals);
      return meal;
    } catch (e) {
      set({ status: 'error', error: e.message || 'Analysis failed' });
      throw e;
    }
  },

  removeMeal: (id) => {
    const meals = get().meals.filter((m) => m.id !== id);
    set({ meals });
    persist(meals);
  },

  clearError: () => set({ error: null, status: 'idle' }),

  // Meals logged on a given day (defaults to today).
  mealsForDay: (key = dayKey()) =>
    get().meals.filter((m) => dayKey(m.createdAt) === key),
}));

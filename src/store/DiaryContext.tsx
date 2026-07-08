/**
 * ניהול מצב היומן: רשומות ארוחות של היום הנוכחי, עם התמדה ב-AsyncStorage.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyTotals, HealthAssessment, MealEntry } from '../types/nutrition';
import { analyzeMealText } from '../services/aiAnalysis';
import {
  aggregateDailyTotals,
  assessDailyHealth,
} from '../services/healthAssessment';

const todayKey = () => `fibertrack:meals:${new Date().toISOString().slice(0, 10)}`;

interface DiaryContextValue {
  meals: MealEntry[];
  totals: DailyTotals;
  assessment: HealthAssessment;
  isAnalyzing: boolean;
  error: string | null;
  logMeal: (rawText: string) => Promise<void>;
  removeMeal: (id: string) => void;
  clearError: () => void;
}

const DiaryContext = createContext<DiaryContextValue | null>(null);

export function DiaryProvider({ children }: { children: React.ReactNode }) {
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // טעינת ארוחות היום מהאחסון המקומי בהפעלה.
  useEffect(() => {
    AsyncStorage.getItem(todayKey())
      .then((json) => {
        if (json) setMeals(JSON.parse(json));
      })
      .catch(() => {
        /* אחסון פגום — מתחילים יום נקי */
      });
  }, []);

  const persist = useCallback((next: MealEntry[]) => {
    setMeals(next);
    AsyncStorage.setItem(todayKey(), JSON.stringify(next)).catch(() => {});
  }, []);

  const logMeal = useCallback(
    async (rawText: string) => {
      setIsAnalyzing(true);
      setError(null);
      try {
        const analysis = await analyzeMealText(rawText);
        if (analysis.clarificationNeeded) {
          setError(analysis.clarificationNeeded);
          return;
        }
        const entry: MealEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          rawText,
          loggedAt: new Date().toISOString(),
          analysis,
        };
        persist([entry, ...meals]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאה בניתוח הארוחה.');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [meals, persist]
  );

  const removeMeal = useCallback(
    (id: string) => persist(meals.filter((m) => m.id !== id)),
    [meals, persist]
  );

  const totals = useMemo(() => aggregateDailyTotals(meals), [meals]);
  const assessment = useMemo(() => assessDailyHealth(totals), [totals]);

  const value = useMemo(
    () => ({
      meals,
      totals,
      assessment,
      isAnalyzing,
      error,
      logMeal,
      removeMeal,
      clearError: () => setError(null),
    }),
    [meals, totals, assessment, isAnalyzing, error, logMeal, removeMeal]
  );

  return <DiaryContext.Provider value={value}>{children}</DiaryContext.Provider>;
}

export function useDiary(): DiaryContextValue {
  const ctx = useContext(DiaryContext);
  if (!ctx) throw new Error('useDiary חייב לרוץ בתוך DiaryProvider');
  return ctx;
}

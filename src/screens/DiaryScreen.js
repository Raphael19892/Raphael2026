// =============================================================================
// DiaryScreen.js — the "Smart Nutrition Diary".
// -----------------------------------------------------------------------------
// Free-text meal entry. The user types what they ate in natural language and
// the AI (aiAnalysis.analyzeMeal) parses it into a typed fiber breakdown that
// gets logged and instantly reflected in the dashboard.
// =============================================================================

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MealCard from '../components/MealCard';
import { useNutritionStore, dayKey } from '../store/useNutritionStore';
import { colors, radius, spacing, typography, shadow } from '../theme';

const EXAMPLES = [
  'קערת שיבולת שועל עם תפוח וכף צ׳יה',
  'מרק עדשים עם לחם מלא',
  'סלט ירוק עם אבוקדו ושקדים',
];

export default function DiaryScreen() {
  const [text, setText] = useState('');
  const meals = useNutritionStore((s) => s.meals);
  const status = useNutritionStore((s) => s.status);
  const error = useNutritionStore((s) => s.error);
  const addMeal = useNutritionStore((s) => s.addMeal);
  const removeMeal = useNutritionStore((s) => s.removeMeal);
  const clearError = useNutritionStore((s) => s.clearError);
  const hydrate = useNutritionStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const analyzing = status === 'analyzing';
  const todayMeals = meals.filter((m) => dayKey(m.createdAt) === dayKey());

  async function handleAnalyze() {
    const value = text.trim();
    if (!value || analyzing) return;
    try {
      await addMeal(value);
      setText('');
    } catch (_) {
      // error surfaced via store.error
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>יומן תזונה חכם</Text>
          <Text style={styles.subtitle}>
            כתוב במילים שלך מה אכלת — ה‑AI יפרק את המנה ויעריך את סוגי הסיבים.
          </Text>

          {/* Free-text input */}
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="למשל: אכלתי קערת שיבולת שועל עם תפוח וכף צ׳יה"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlign="right"
              editable={!analyzing}
            />
            <Pressable
              style={[styles.button, (analyzing || !text.trim()) && styles.buttonDisabled]}
              onPress={handleAnalyze}
              disabled={analyzing || !text.trim()}
            >
              {analyzing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>נתח את הארוחה ✨</Text>
              )}
            </Pressable>
          </View>

          {/* Example chips */}
          <View style={styles.examples}>
            {EXAMPLES.map((ex) => (
              <Pressable key={ex} style={styles.exampleChip} onPress={() => setText(ex)}>
                <Text style={styles.exampleText}>{ex}</Text>
              </Pressable>
            ))}
          </View>

          {error ? (
            <Pressable style={styles.errorBox} onPress={clearError}>
              <Text style={styles.errorText}>⚠️ {error} (הקש לסגירה)</Text>
            </Pressable>
          ) : null}

          {/* Today's meals */}
          <Text style={styles.sectionTitle}>
            ארוחות היום {todayMeals.length ? `(${todayMeals.length})` : ''}
          </Text>
          {todayMeals.length === 0 ? (
            <Text style={styles.emptyText}>עדיין אין ארוחות. התחל בהזנת הארוחה הראשונה שלך למעלה.</Text>
          ) : (
            <View style={{ gap: spacing(3) }}>
              {todayMeals.map((meal) => (
                <MealCard key={meal.id} meal={meal} onRemove={removeMeal} />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(4), paddingBottom: spacing(10), gap: spacing(3) },
  title: { ...typography.h1, marginTop: spacing(2), writingDirection: 'rtl' },
  subtitle: { ...typography.small, lineHeight: 19, writingDirection: 'rtl' },
  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(4),
    gap: spacing(3),
    ...shadow,
  },
  input: {
    minHeight: 80,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
    lineHeight: 22,
    writingDirection: 'rtl',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing(3.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { backgroundColor: colors.primarySoft, opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  exampleChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  exampleText: { fontSize: 12, color: colors.primary, fontWeight: '600', writingDirection: 'rtl' },
  errorBox: {
    backgroundColor: '#FBE9E8',
    borderRadius: radius.md,
    padding: spacing(3),
  },
  errorText: { color: colors.danger, fontSize: 13, writingDirection: 'rtl' },
  sectionTitle: { ...typography.h2, marginTop: spacing(3), writingDirection: 'rtl' },
  emptyText: { ...typography.small, textAlign: 'center', paddingVertical: spacing(4), writingDirection: 'rtl' },
});

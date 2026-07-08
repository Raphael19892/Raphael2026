/**
 * שורת ארוחה ביומן: הטקסט המקורי, סך הסיבים ותובנת ה-LLM לארוחה.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MealEntry } from '../types/nutrition';
import { colors, radii, spacing } from '../theme';

interface Props {
  meal: MealEntry;
  onRemove: (id: string) => void;
}

export function MealListItem({ meal, onRemove }: Props) {
  const fiber = meal.analysis.items.reduce((s, it) => s + it.totalFiberG, 0);
  const time = new Date(meal.loggedAt).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.time}>{time}</Text>
        <Text style={styles.fiber}>{Math.round(fiber * 10) / 10} גרם סיבים</Text>
      </View>
      <Text style={styles.rawText}>“{meal.rawText}”</Text>
      <Text style={styles.items}>
        {meal.analysis.items.map((it) => it.name).join(' · ')}
      </Text>
      {meal.analysis.scienceInsight ? (
        <Text style={styles.insight}>🔬 {meal.analysis.scienceInsight}</Text>
      ) : null}
      <Pressable onPress={() => onRemove(meal.id)} hitSlop={8}>
        <Text style={styles.remove}>הסרה</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.m,
    marginBottom: spacing.s,
  },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  time: { fontSize: 12, color: colors.textSecondary },
  fiber: { fontSize: 13, fontWeight: '700', color: colors.primary },
  rawText: {
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  items: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  insight: {
    fontSize: 13,
    color: colors.accent,
    textAlign: 'right',
    marginTop: spacing.s,
    lineHeight: 19,
  },
  remove: {
    fontSize: 12,
    color: colors.danger,
    textAlign: 'left',
    marginTop: spacing.s,
  },
});

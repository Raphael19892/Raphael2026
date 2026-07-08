/**
 * כרטיס פירוק סוגי הסיבים: מסיסים / בלתי-מסיסים / עמילן עמיד.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DailyTotals } from '../types/nutrition';
import { colors, radii, spacing } from '../theme';

interface RowProps {
  label: string;
  grams: number;
  maxGrams: number;
  color: string;
  hint: string;
}

function FiberRow({ label, grams, maxGrams, color, hint }: RowProps) {
  const pct = maxGrams > 0 ? Math.min(grams / maxGrams, 1) : 0;
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowGrams, { color }]}>{grams} גרם</Text>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[styles.barFill, { backgroundColor: color, width: `${pct * 100}%` }]}
        />
      </View>
      <Text style={styles.rowHint}>{hint}</Text>
    </View>
  );
}

export function FiberBreakdownCard({ totals }: { totals: DailyTotals }) {
  const max = Math.max(totals.solubleFiberG, totals.insolubleFiberG, 10);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>פירוק סוגי הסיבים</Text>
      <FiberRow
        label="סיבים מסיסים"
        grams={totals.solubleFiberG}
        maxGrams={max}
        color={colors.soluble}
        hint="יוצרים ג'ל, מאזנים סוכר וכולסטרול"
      />
      <FiberRow
        label="סיבים בלתי-מסיסים"
        grams={totals.insolubleFiberG}
        maxGrams={max}
        color={colors.insoluble}
        hint="מוסיפים נפח ותומכים בתנועתיות המעי"
      />
      <FiberRow
        label="עמילן עמיד"
        grams={totals.resistantStarchG}
        maxGrams={Math.max(totals.resistantStarchG, 6)}
        color={colors.resistantStarch}
        hint="מותסס לבוטיראט שמזין את תאי המעי הגס"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.m,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.m,
    textAlign: 'right',
  },
  row: { marginBottom: spacing.m },
  rowHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  rowGrams: { fontSize: 14, fontWeight: '700' },
  barTrack: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    marginTop: spacing.xs,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
  },
  barFill: { height: '100%', borderRadius: radii.pill },
  rowHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
});

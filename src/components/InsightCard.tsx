/**
 * כרטיס תובנה מדעית — "תצוגת תובנות מדעיות" (Science UI).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HealthInsight } from '../types/nutrition';
import { colors, radii, spacing } from '../theme';

const LEVEL_COLOR: Record<HealthInsight['level'], string> = {
  positive: colors.positive,
  info: colors.info,
  warning: colors.warning,
};

export function InsightCard({ insight }: { insight: HealthInsight }) {
  const accent = LEVEL_COLOR[insight.level];
  return (
    <View style={[styles.card, { borderRightColor: accent }]}>
      <Text style={[styles.title, { color: accent }]}>{insight.title}</Text>
      <Text style={styles.body}>{insight.body}</Text>
      <Text style={styles.reference}>📚 {insight.reference}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRightWidth: 4,
    padding: spacing.m,
    marginBottom: spacing.s,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  reference: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: spacing.s,
    textAlign: 'right',
    fontStyle: 'italic',
  },
});

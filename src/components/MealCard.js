// A logged meal row in the diary: dish, fiber chips, AI science note.
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme';

const CONFIDENCE = {
  high: { label: 'ודאות גבוהה', color: colors.accent },
  medium: { label: 'ודאות בינונית', color: colors.amber },
  low: { label: 'הערכה', color: colors.textMuted },
};

export default function MealCard({ meal, onRemove }) {
  const conf = CONFIDENCE[meal.confidence] || CONFIDENCE.medium;
  const time = new Date(meal.createdAt).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dish}>{meal.dishSummary}</Text>
          <Text style={styles.meta}>
            {time} · {meal.totalFiber} גר׳ סיבים ·{' '}
            <Text style={{ color: conf.color, fontWeight: '600' }}>{conf.label}</Text>
          </Text>
        </View>
        {onRemove ? (
          <Pressable hitSlop={10} onPress={() => onRemove(meal.id)}>
            <Text style={styles.remove}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chips}>
        <Chip label="מסיס" value={meal.soluble} color={colors.soluble} />
        <Chip label="בלתי‑מסיס" value={meal.insoluble} color={colors.insoluble} />
        <Chip label="עמילן עמיד" value={meal.resistant} color={colors.resistant} />
      </View>

      {meal.scienceNote ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>🔬 {meal.scienceNote}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Chip({ label, value, color }) {
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <View style={[styles.chipDot, { backgroundColor: color }]} />
      <Text style={styles.chipText}>
        {label} {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(4),
    gap: spacing(3),
    ...shadow,
    shadowOpacity: 0.05,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2) },
  dish: { ...typography.h3, writingDirection: 'rtl' },
  meta: { ...typography.small, marginTop: 2 },
  remove: { fontSize: 16, color: colors.textMuted, paddingHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text },
  note: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing(3),
  },
  noteText: { ...typography.small, color: colors.text, lineHeight: 19, writingDirection: 'rtl' },
});

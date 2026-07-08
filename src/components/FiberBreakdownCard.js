// Stacked breakdown of the three fiber fractions + total vs target.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme';
import { TARGETS } from '../services/fiberEngine';

const TYPES = [
  { key: 'soluble', label: 'מסיס', color: colors.soluble, note: 'ג׳ל, מאזן סוכר' },
  { key: 'insoluble', label: 'בלתי‑מסיס', color: colors.insoluble, note: 'נפח ותנועתיות' },
  { key: 'resistant', label: 'עמילן עמיד', color: colors.resistant, note: 'פרֵביוטיקה' },
];

export default function FiberBreakdownCard({ assessment }) {
  const { soluble = 0, insoluble = 0, resistant = 0, totalFiber = 0 } = assessment || {};
  const max = Math.max(totalFiber, TARGETS.totalFiberG);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={typography.h3}>פילוח סוגי הסיבים</Text>
        <Text style={styles.total}>
          {totalFiber}
          <Text style={styles.totalUnit}> / {TARGETS.totalFiberG} גר׳</Text>
        </Text>
      </View>

      {/* Stacked bar showing total vs 30g target. */}
      <View style={styles.track}>
        <Bar value={soluble} max={max} color={colors.soluble} />
        <Bar value={insoluble} max={max} color={colors.insoluble} />
        <Bar value={resistant} max={max} color={colors.resistant} />
      </View>
      <View style={styles.targetRow}>
        <View style={styles.targetTick} />
        <Text style={styles.targetLabel}>יעד WHO · 30 גר׳</Text>
      </View>

      <View style={styles.legend}>
        {TYPES.map((t) => (
          <View key={t.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: t.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.legendLabel}>
                {t.label} · {assessment?.[t.key] ?? 0} גר׳
              </Text>
              <Text style={styles.legendNote}>{t.note}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Bar({ value, max, color }) {
  const flex = max > 0 ? value / max : 0;
  if (flex <= 0) return null;
  return <View style={{ flex, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(5),
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing(4),
  },
  total: { fontSize: 24, fontWeight: '800', color: colors.primary },
  totalUnit: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  track: {
    flexDirection: 'row',
    height: 22,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  targetRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing(2) },
  targetTick: { width: 2, height: 10, backgroundColor: colors.textMuted, marginRight: 6 },
  targetLabel: { ...typography.small },
  legend: { marginTop: spacing(4), gap: spacing(3) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  dot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { ...typography.body, fontWeight: '600' },
  legendNote: { ...typography.small },
});

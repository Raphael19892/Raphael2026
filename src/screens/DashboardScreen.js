// =============================================================================
// DashboardScreen.js — the "Science UI".
// -----------------------------------------------------------------------------
// The main dashboard: today's health score, fiber breakdown vs the WHO target,
// microbiome-balance readout, and plain-language science insights explaining
// WHY the day scored the way it did.
// =============================================================================

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import HealthScoreRing from '../components/HealthScoreRing';
import FiberBreakdownCard from '../components/FiberBreakdownCard';
import InsightCard from '../components/InsightCard';
import { useNutritionStore, dayKey } from '../store/useNutritionStore';
import { assessDay } from '../services/fiberEngine';
import { colors, radius, spacing, typography, shadow } from '../theme';

export default function DashboardScreen() {
  const meals = useNutritionStore((s) => s.meals);
  const hydrate = useNutritionStore((s) => s.hydrate);

  // Today's meals + deterministic assessment (recomputed when meals change).
  const todayMeals = useMemo(
    () => meals.filter((m) => dayKey(m.createdAt) === dayKey()),
    [meals]
  );
  const assessment = useMemo(() => assessDay(todayMeals), [todayMeals]);

  const today = new Date().toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={hydrate} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>FiberTrack <Text style={{ color: colors.accent }}>AI</Text></Text>
          <Text style={styles.date}>{today}</Text>
        </View>

        {/* Score hero */}
        <View style={styles.hero}>
          <HealthScoreRing score={assessment.score} grade={assessment.grade} />
          <Text style={styles.heroCaption}>
            הציון הבריאותי היומי שלך מבוסס על כמות הסיבים, איזון סוגי הסיבים למען
            המיקרוביום, ומגוון המקורות הצמחיים.
          </Text>
        </View>

        {/* Quick stats */}
        <View style={styles.statRow}>
          <Stat
            value={`${assessment.totalFiber}`}
            unit="גר׳ סיבים"
            sub={
              assessment.remainingToTarget > 0
                ? `עוד ${assessment.remainingToTarget} ליעד`
                : 'מעל היעד ✓'
            }
          />
          <Stat value={`${assessment.plantCount}`} unit="מקורות צמחיים" sub="שאיפה: 6 ביום" />
          <Stat
            value={`${Math.round(assessment.fermentableShare * 100)}%`}
            unit="פרֵביוטי"
            sub="מסיס + עמילן עמיד"
          />
        </View>

        {/* Sub-score breakdown */}
        <View style={styles.subScoreCard}>
          <SubScore label="כמות" value={assessment.subScores.quantity} />
          <SubScore label="איזון מיקרוביום" value={assessment.subScores.balance} />
          <SubScore label="מגוון" value={assessment.subScores.diversity} />
        </View>

        {/* Fiber breakdown */}
        <FiberBreakdownCard assessment={assessment} />

        {/* Insights */}
        <Text style={styles.sectionTitle}>תובנות מדעיות</Text>
        {assessment.insights.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              עדיין לא תיעדת ארוחות היום. עבור ליומן והזן מה אכלת כדי לקבל ניתוח
              וציון בריאותי.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing(3) }}>
            {assessment.insights.map((ins, i) => (
              <InsightCard key={i} insight={ins} />
            ))}
          </View>
        )}

        <Text style={styles.disclaimer}>
          המידע מבוסס על הנחיות WHO/EFSA ומחקרים קליניים ואינו מהווה ייעוץ רפואי.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, unit, sub }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

function SubScore({ label, value }) {
  return (
    <View style={styles.subScore}>
      <Text style={styles.subScoreLabel}>{label}</Text>
      <View style={styles.subScoreTrack}>
        <View style={[styles.subScoreFill, { width: `${value}%` }]} />
      </View>
      <Text style={styles.subScoreValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(4), paddingBottom: spacing(10), gap: spacing(4) },
  header: { alignItems: 'center', marginTop: spacing(2) },
  brand: { fontSize: 22, fontWeight: '800', color: colors.primary },
  date: { ...typography.small, marginTop: 2 },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(5),
    alignItems: 'center',
    gap: spacing(4),
    ...shadow,
  },
  heroCaption: {
    ...typography.small,
    textAlign: 'center',
    lineHeight: 19,
    writingDirection: 'rtl',
  },
  statRow: { flexDirection: 'row', gap: spacing(3) },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(3),
    alignItems: 'center',
    ...shadow,
    shadowOpacity: 0.05,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.primary },
  statUnit: { fontSize: 11, fontWeight: '600', color: colors.text, marginTop: 2 },
  statSub: { fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  subScoreCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(4),
    gap: spacing(3),
    ...shadow,
    shadowOpacity: 0.05,
  },
  subScore: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  subScoreLabel: { ...typography.small, width: 110, writingDirection: 'rtl' },
  subScoreTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  subScoreFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  subScoreValue: { ...typography.small, width: 28, textAlign: 'right', fontWeight: '700' },
  sectionTitle: { ...typography.h2, marginTop: spacing(2), writingDirection: 'rtl' },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(5),
    ...shadow,
    shadowOpacity: 0.05,
  },
  emptyText: { ...typography.body, textAlign: 'center', color: colors.textMuted, writingDirection: 'rtl' },
  disclaimer: {
    ...typography.small,
    textAlign: 'center',
    marginTop: spacing(4),
    fontSize: 11,
    writingDirection: 'rtl',
  },
});

/**
 * הדשבורד הראשי של FiberTrack.
 *
 * מלמעלה למטה:
 *   1. טבעת הציון הבריאותי היומי (מנוע "האם זה בריא לי?")
 *   2. יומן התזונה החכם (קלט טקסט חופשי → ניתוח LLM)
 *   3. פירוק סוגי הסיבים
 *   4. תובנות מדעיות (Science UI)
 *   5. ארוחות היום
 */

import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useDiary } from '../store/DiaryContext';
import { FiberScoreRing } from '../components/FiberScoreRing';
import { MealLogInput } from '../components/MealLogInput';
import { FiberBreakdownCard } from '../components/FiberBreakdownCard';
import { InsightCard } from '../components/InsightCard';
import { MealListItem } from '../components/MealListItem';
import { colors, spacing } from '../theme';

export function DashboardScreen() {
  const { meals, totals, assessment, removeMeal } = useDiary();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.appTitle}>FiberTrack 🌾</Text>
        <Text style={styles.appSubtitle}>
          {new Date().toLocaleDateString('he-IL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>

        <FiberScoreRing
          score={assessment.score}
          label={assessment.label}
          whoTargetPct={assessment.whoTargetPct}
          totalFiberG={totals.totalFiberG}
        />

        <View style={styles.section}>
          <MealLogInput />
        </View>

        <View style={styles.section}>
          <FiberBreakdownCard totals={totals} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>מה המדע אומר על היום שלך 🔬</Text>
          {assessment.insights.map((insight, i) => (
            <InsightCard key={`${insight.title}-${i}`} insight={insight} />
          ))}
        </View>

        {meals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>הארוחות של היום</Text>
            {meals.map((meal) => (
              <MealListItem key={meal.id} meal={meal} onRemove={removeMeal} />
            ))}
          </View>
        )}

        <Text style={styles.disclaimer}>
          המידע באפליקציה הוא כללי-חינוכי ואינו תחליף לייעוץ רפואי או תזונתי
          אישי.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.m, paddingBottom: spacing.xl },
  appTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.s,
  },
  appSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  section: { marginTop: spacing.l },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'right',
    marginBottom: spacing.s,
  },
  disclaimer: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 16,
  },
});

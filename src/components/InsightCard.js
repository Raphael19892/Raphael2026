// A single science insight (the "explain it simply" layer of the Science UI).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme';

const TONES = {
  good: { bg: '#E7F6EE', bar: colors.accent, icon: '✅' },
  warn: { bg: '#FBF1E1', bar: colors.amber, icon: '⚠️' },
  bad: { bg: '#FBE9E8', bar: colors.danger, icon: '🔻' },
  info: { bg: '#E9F1FB', bar: colors.soluble, icon: '🔬' },
};

export default function InsightCard({ insight }) {
  const tone = TONES[insight.tone] || TONES.info;
  return (
    <View style={[styles.card, { backgroundColor: tone.bg }]}>
      <View style={[styles.bar, { backgroundColor: tone.bar }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          {tone.icon}  {insight.title}
        </Text>
        <Text style={styles.body}>{insight.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: spacing(4),
    gap: spacing(3),
    ...shadow,
    shadowOpacity: 0.04,
  },
  bar: { width: 4, borderRadius: 2 },
  title: { ...typography.h3, marginBottom: 4, writingDirection: 'rtl' },
  body: { ...typography.body, lineHeight: 21, writingDirection: 'rtl' },
});

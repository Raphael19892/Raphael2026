/**
 * טבעת הציון הבריאותי היומי — הרכיב המרכזי של הדשבורד.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing } from '../theme';

interface Props {
  score: number; // 0–100
  label: string;
  whoTargetPct: number;
  totalFiberG: number;
}

const SIZE = 190;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

function ringColor(score: number): string {
  if (score >= 65) return colors.positive;
  if (score >= 40) return '#F9A825';
  return colors.warning;
}

export function FiberScoreRing({ score, label, whoTargetPct, totalFiberG }: Props) {
  const progress = Math.min(Math.max(score, 0), 100) / 100;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <View style={styles.container}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={colors.border}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={ringColor(score)}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.center}>
          <Text style={styles.score}>{score}</Text>
          <Text style={styles.scoreCaption}>ציון יומי</Text>
        </View>
      </View>

      <Text style={styles.label}>{label}</Text>
      <Text style={styles.whoLine}>
        {totalFiberG} גרם סיבים · {whoTargetPct}% מיעד ה-WHO (30 גרם)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.m },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: { fontSize: 52, fontWeight: '800', color: colors.textPrimary },
  scoreCaption: { fontSize: 14, color: colors.textSecondary },
  label: {
    marginTop: spacing.s,
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  whoLine: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

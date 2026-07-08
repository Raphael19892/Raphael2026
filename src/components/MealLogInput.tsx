/**
 * יומן התזונה החכם — קלט טקסט חופשי שנשלח לניתוח LLM.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDiary } from '../store/DiaryContext';
import { colors, radii, spacing } from '../theme';

const PLACEHOLDER =
  "מה אכלת? למשל: קערת שיבולת שועל עם תפוח וכף צ'יה";

export function MealLogInput() {
  const { logMeal, isAnalyzing, error, clearError } = useDiary();
  const [text, setText] = useState('');

  const submit = async () => {
    const value = text.trim();
    if (!value || isAnalyzing) return;
    await logMeal(value);
    setText('');
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>יומן תזונה חכם 🥣</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(t) => {
          setText(t);
          if (error) clearError();
        }}
        placeholder={PLACEHOLDER}
        placeholderTextColor={colors.textSecondary}
        multiline
        textAlign="right"
        editable={!isAnalyzing}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={({ pressed }) => [
          styles.button,
          (pressed || isAnalyzing || !text.trim()) && styles.buttonDim,
        ]}
        onPress={submit}
        disabled={isAnalyzing || !text.trim()}
      >
        {isAnalyzing ? (
          <View style={styles.buttonRow}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.buttonText}>  ה-AI מנתח את הארוחה…</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>נתח את הארוחה</Text>
        )}
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
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'right',
    marginBottom: spacing.s,
  },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.m,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    textAlignVertical: 'top',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginTop: spacing.s,
    textAlign: 'right',
  },
  button: {
    marginTop: spacing.m,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDim: { opacity: 0.6 },
  buttonRow: { flexDirection: 'row-reverse', alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

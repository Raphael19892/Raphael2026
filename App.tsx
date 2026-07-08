import React from 'react';
import { I18nManager, SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DiaryProvider } from './src/store/DiaryContext';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { colors } from './src/theme';

// האפליקציה בעברית — הפעלת פריסת ימין-לשמאל.
I18nManager.allowRTL(true);

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <DiaryProvider>
        <DashboardScreen />
      </DiaryProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});

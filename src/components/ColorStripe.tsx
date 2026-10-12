import React from 'react';
import { StyleSheet, View } from 'react-native';
import { THEME_OPTIONS } from '../lib/theme';

// The strip across the very top of every screen: one segment per theme a
// store can pick in Settings, in the picker's order. It stays the same
// whichever theme is active, like a row of paint swatches.
export default function ColorStripe() {
  return (
    <View style={styles.stripe}>
      {THEME_OPTIONS.map((option) => (
        <View key={option.name} style={[styles.segment, { backgroundColor: option.swatch }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stripe: { flexDirection: 'row', height: 6 },
  segment: { flex: 1 },
});

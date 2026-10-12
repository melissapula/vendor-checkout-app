import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';

// Shown only inside the shared public demo store (see src/lib/demo.ts), so
// a visitor knows it's sample data they can browse but not change, and has
// an obvious way back out to create a real account.
export default function DemoBanner() {
  const { isDemo, signOut } = useAuth();
  if (!isDemo) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        Demo store — sample data. Look around freely; changes aren't saved.
      </Text>
      <Pressable onPress={signOut} hitSlop={8}>
        <Text style={styles.link}>Exit demo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#1f4b43',
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 12,
    rowGap: 2,
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  link: { color: '#fff', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
});

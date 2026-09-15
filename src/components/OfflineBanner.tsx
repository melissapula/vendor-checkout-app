import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useConnectivity } from '../context/ConnectivityContext';

export default function OfflineBanner() {
  const { isOnline } = useConnectivity();
  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        No internet connection — checkout and inventory changes won't save until you're back online.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#b36b00',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});

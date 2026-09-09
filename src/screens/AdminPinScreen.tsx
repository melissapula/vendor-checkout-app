import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppMode } from '../context/AppModeContext';
import { useAuth } from '../context/AuthContext';
import { useBreakpoint } from '../lib/responsive';

export default function AdminPinScreen() {
  const { unlockAdmin, cancelPinEntry } = useAppMode();
  const { store } = useAuth();
  const { isTabletUp } = useBreakpoint();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  function handleSubmit() {
    if (pin === store?.admin_pin) {
      setPin('');
      setError(false);
      unlockAdmin();
    } else {
      setError(true);
      setPin('');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Staff Access</Text>
      <TextInput
        style={[styles.input, isTabletUp && styles.inputTabletUp]}
        value={pin}
        onChangeText={(t) => {
          setPin(t);
          setError(false);
        }}
        placeholder="Enter PIN"
        keyboardType="number-pad"
        secureTextEntry
        autoFocus
        onSubmitEditing={handleSubmit}
      />
      {error && <Text style={styles.error}>Incorrect PIN</Text>}
      <Pressable style={[styles.unlockButton, isTabletUp && styles.unlockButtonTabletUp]} onPress={handleSubmit}>
        <Text style={styles.unlockButtonText}>Unlock</Text>
      </Pressable>
      <Pressable onPress={cancelPinEntry}>
        <Text style={styles.cancel}>Back to Customer View</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 20,
    width: 200,
    textAlign: 'center',
    letterSpacing: 4,
  },
  inputTabletUp: { width: 240, fontSize: 22, paddingVertical: 14 },
  error: { color: '#b00020' },
  unlockButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  unlockButtonTabletUp: { paddingVertical: 18, paddingHorizontal: 48 },
  unlockButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancel: { color: '#666', marginTop: 8 },
});

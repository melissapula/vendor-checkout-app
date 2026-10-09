import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { appAlert } from '../../lib/alert';
import AppModal from '../../components/AppModal';
import TermsScreen from '../TermsScreen';

// One line to update if the beta's point of contact changes — surfaced to
// every new vendor on this screen.
const BETA_CONTACT = 'mfpstudioart@gmail.com';

export default function CreateStoreScreen() {
  const { createStore, signOut } = useAuth();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      appAlert('Missing name', 'Give your store a name — customers will see this.');
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      appAlert('Invalid PIN', 'Pick a 4–6 digit staff PIN.');
      return;
    }
    if (!termsAccepted) {
      appAlert('Terms required', 'Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    setSubmitting(true);
    try {
      await createStore(name.trim(), pin);
    } catch (err) {
      appAlert('Could not create store', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Name your store</Text>
      <Text style={styles.subheading}>
        This shows up on your checkout screen. You can change it later in Settings.
      </Text>

      <Text style={styles.betaNotice}>
        This app is currently in beta. Expect occasional bugs, and please keep your own
        backup of anything important. Questions or something broken? {BETA_CONTACT}
      </Text>

      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Four Seasons Studio"
        onSubmitEditing={handleCreate}
      />

      <Text style={styles.label}>Staff PIN</Text>
      <Text style={styles.subheading}>
        A quick deterrent so customers can't wander into your inventory — not real security. You can change it anytime.
      </Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        placeholder="4–6 digit PIN"
        keyboardType="number-pad"
        secureTextEntry
        onSubmitEditing={handleCreate}
      />

      <Pressable style={styles.termsRow} onPress={() => setTermsAccepted((v) => !v)}>
        <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
          {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.termsText}>
          I agree to the{' '}
          <Text style={styles.termsLink} onPress={() => setTermsOpen(true)}>
            Terms of Service and Privacy Policy
          </Text>
        </Text>
      </Pressable>

      <Pressable style={[styles.submitButton, submitting && styles.disabled]} disabled={submitting} onPress={handleCreate}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Create store</Text>}
      </Pressable>

      <Pressable disabled={submitting} onPress={signOut}>
        <Text style={styles.signOut}>Sign out</Text>
      </Pressable>

      <AppModal visible={termsOpen} onRequestClose={() => setTermsOpen(false)}>
        <TermsScreen onClose={() => setTermsOpen(false)} />
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  heading: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subheading: { fontSize: 13, color: '#666', textAlign: 'center', maxWidth: 280, marginBottom: 4 },
  betaNotice: {
    fontSize: 12,
    color: '#8a6300',
    textAlign: 'center',
    maxWidth: 300,
    marginTop: 8,
    marginBottom: 4,
  },
  label: { fontSize: 15, fontWeight: '600', marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    width: '100%',
    maxWidth: 280,
    textAlign: 'center',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    maxWidth: 280,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  termsText: { fontSize: 13, color: '#333', flexShrink: 1 },
  termsLink: { textDecorationLine: 'underline', fontWeight: '600' },
  submitButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 8,
    marginTop: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  signOut: { color: '#666', marginTop: 8 },
});

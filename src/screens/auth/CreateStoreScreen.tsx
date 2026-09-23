import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { appAlert } from '../../lib/alert';
import { redeemBetaCode } from '../../lib/betaInvite';

// One line to update if the beta's point of contact changes — surfaced to
// every new vendor on this screen.
const BETA_CONTACT = 'mfpstudioart@gmail.com';

export default function CreateStoreScreen() {
  const { createStore, signOut } = useAuth();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (!inviteCode.trim()) {
      appAlert('Missing invite code', "This app is invite-only during beta — enter the code you were given.");
      return;
    }
    if (!name.trim()) {
      appAlert('Missing name', 'Give your store a name — customers will see this.');
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      appAlert('Invalid PIN', 'Pick a 4–6 digit staff PIN.');
      return;
    }
    setSubmitting(true);
    try {
      const valid = await redeemBetaCode(inviteCode.trim());
      if (!valid) {
        appAlert('Invalid invite code', "That code isn't valid or has already been used — check it and try again.");
        return;
      }
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
        This app is currently in beta and invite-only. Expect occasional bugs, and please keep your own
        backup of anything important. Questions or something broken? {BETA_CONTACT}
      </Text>

      <Text style={styles.label}>Invite code</Text>
      <TextInput
        style={styles.input}
        value={inviteCode}
        onChangeText={setInviteCode}
        placeholder="Enter the code you were given"
        autoCapitalize="characters"
        onSubmitEditing={handleCreate}
      />

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

      <Pressable style={[styles.submitButton, submitting && styles.disabled]} disabled={submitting} onPress={handleCreate}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Create store</Text>}
      </Pressable>

      <Pressable disabled={submitting} onPress={signOut}>
        <Text style={styles.signOut}>Sign out</Text>
      </Pressable>
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

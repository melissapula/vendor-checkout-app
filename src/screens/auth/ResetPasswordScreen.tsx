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

export default function ResetPasswordScreen({ onCancel }: { onCancel: () => void }) {
  const { requestPasswordReset, confirmPasswordReset } = useAuth();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleRequestCode() {
    if (!email.trim()) {
      appAlert('Missing email', 'Enter the email you signed up with.');
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setStep('confirm');
    } catch (err) {
      appAlert('Could not send code', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!code.trim()) {
      appAlert('Missing code', 'Enter the code from your email.');
      return;
    }
    if (!password || password !== confirmPassword) {
      appAlert("Passwords don't match", 'Re-enter your new password to confirm it.');
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(email.trim(), code.trim(), password);
      // On success, the auth session updates and the app navigates away from
      // this screen on its own (see App.tsx) — nothing else to do here.
    } catch (err) {
      appAlert('Could not reset password', err instanceof Error ? err.message : 'Check the code and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'request') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.heading}>Reset your password</Text>
        <Text style={styles.subheading}>
          Enter the email you signed up with — we'll send a code to reset your password.
        </Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleRequestCode}
        />

        <Pressable style={[styles.submitButton, submitting && styles.disabled]} disabled={submitting} onPress={handleRequestCode}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Send code</Text>}
        </Pressable>

        <Pressable disabled={submitting} onPress={onCancel}>
          <Text style={styles.toggle}>Back to sign in</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Enter your code</Text>
      <Text style={styles.subheading}>Check {email} for a 6-digit code, then set a new password.</Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder="6-digit code"
        keyboardType="number-pad"
        onSubmitEditing={handleConfirm}
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="New password"
        secureTextEntry
        autoCapitalize="none"
        onSubmitEditing={handleConfirm}
      />
      <TextInput
        style={styles.input}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm new password"
        secureTextEntry
        autoCapitalize="none"
        onSubmitEditing={handleConfirm}
      />

      <Pressable style={[styles.submitButton, submitting && styles.disabled]} disabled={submitting} onPress={handleConfirm}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Reset password</Text>}
      </Pressable>

      <Pressable disabled={submitting} onPress={() => setStep('request')}>
        <Text style={styles.toggle}>Didn't get a code? Try again</Text>
      </Pressable>
      <Pressable disabled={submitting} onPress={onCancel}>
        <Text style={styles.toggle}>Back to sign in</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  heading: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subheading: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 8, maxWidth: 280 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    width: '100%',
    maxWidth: 280,
  },
  submitButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 8,
    marginTop: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  toggle: { color: '#666', marginTop: 8 },
});

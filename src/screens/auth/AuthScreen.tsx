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

export default function AuthScreen({ onForgotPassword }: { onForgotPassword: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      appAlert('Missing info', 'Enter an email and password.');
      return;
    }
    if (mode === 'sign-up' && password !== confirmPassword) {
      appAlert("Passwords don't match", 'Re-enter your password to confirm it.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'sign-up') {
        await signUp(email.trim(), password);
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      appAlert(
        mode === 'sign-up' ? 'Sign up failed' : 'Sign in failed',
        err instanceof Error ? err.message : 'Something went wrong — check your connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>{mode === 'sign-up' ? 'Set up your store' : 'Welcome back'}</Text>
      <Text style={styles.subheading}>
        {mode === 'sign-up'
          ? 'Create an account to start tracking your inventory and sales.'
          : 'Sign in to your store.'}
      </Text>

      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        autoCapitalize="none"
      />
      {mode === 'sign-up' && (
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm password"
          secureTextEntry
          autoCapitalize="none"
        />
      )}

      <Pressable style={[styles.submitButton, submitting && styles.disabled]} disabled={submitting} onPress={handleSubmit}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>{mode === 'sign-up' ? 'Create account' : 'Sign in'}</Text>
        )}
      </Pressable>

      <Pressable
        disabled={submitting}
        onPress={() => {
          setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up');
          setConfirmPassword('');
        }}
      >
        <Text style={styles.toggle}>
          {mode === 'sign-up' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
        </Text>
      </Pressable>

      {mode === 'sign-in' && (
        <Pressable disabled={submitting} onPress={onForgotPassword}>
          <Text style={styles.toggle}>Forgot password?</Text>
        </Pressable>
      )}
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

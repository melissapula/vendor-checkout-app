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
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../lib/demo';

// Shown to new users so they know what to look for in their inbox — must
// match the sender address in the Supabase project's custom SMTP settings.
const CONFIRMATION_SENDER = 'mfpstudioart@gmail.com';

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
        const { needsEmailConfirmation } = await signUp(email.trim(), password);
        if (needsEmailConfirmation) {
          // The confirmation link lands back on this screen signed out (see
          // detectSessionInUrl in src/lib/supabase.ts), so leave it on
          // sign-in with the email still filled in.
          setMode('sign-in');
          setPassword('');
          setConfirmPassword('');
          appAlert(
            "You're almost in!",
            `We just sent a confirmation email to ${email.trim()}. It will come from ${CONFIRMATION_SENDER} and can take a few minutes to arrive. Don't see it? Please check your spam or junk folder, since it sometimes lands there. Click the button in that email, then come back here and sign in.`
          );
        }
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

  async function handleExploreDemo() {
    setSubmitting(true);
    try {
      await signIn(DEMO_EMAIL, DEMO_PASSWORD);
    } catch (err) {
      appAlert(
        'Could not open the demo',
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
        onSubmitEditing={handleSubmit}
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        autoCapitalize="none"
        onSubmitEditing={handleSubmit}
      />
      {mode === 'sign-up' && (
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm password"
          secureTextEntry
          autoCapitalize="none"
          onSubmitEditing={handleSubmit}
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

      <View style={styles.demoBox}>
        <Text style={styles.demoHeading}>Just looking?</Text>
        <Text style={styles.demoText}>
          Explore a sample art booth with inventory, past art fairs and sales reports already filled in. No sign-up
          needed.
        </Text>
        <Pressable
          style={[styles.demoButton, submitting && styles.disabled]}
          disabled={submitting}
          onPress={handleExploreDemo}
        >
          <Text style={styles.demoButtonText}>Explore the demo store</Text>
        </Pressable>
        <Text style={styles.demoCredentials}>
          Or sign in with {DEMO_EMAIL} and the password {DEMO_PASSWORD}
        </Text>
      </View>
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
  demoBox: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f6f4ef',
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    gap: 8,
  },
  demoHeading: { fontSize: 16, fontWeight: '700' },
  demoText: { fontSize: 13, color: '#555', textAlign: 'center' },
  demoButton: {
    borderWidth: 1,
    borderColor: '#1a1a1a',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 4,
  },
  demoButtonText: { color: '#1a1a1a', fontWeight: '700', fontSize: 15 },
  demoCredentials: { fontSize: 12, color: '#777', textAlign: 'center' },
});

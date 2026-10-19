import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { appAlert } from '../../lib/alert';
import { PLATFORM_FEE_TEXT } from '../../lib/terms';
import AppModal from '../../components/AppModal';
import TermsScreen from '../TermsScreen';
import { colors } from '../../lib/theme';

// Shown by App.tsx in place of the app whenever the store hasn't accepted
// the current Terms version (see src/lib/terms.ts). Card and Cash App
// checkout is refused server-side until this is accepted too, so this
// screen is the one place a vendor can get past it.
export default function AcceptTermsScreen() {
  const { acceptTerms, signOut } = useAuth();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleAccept() {
    if (!termsAccepted) {
      appAlert('Terms required', 'Please agree to the updated Terms of Service and Privacy Policy to continue.');
      return;
    }
    setSubmitting(true);
    try {
      await acceptTerms();
    } catch (err) {
      appAlert('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Our Terms have changed</Text>
      <Text style={styles.subheading}>
        MFP Apps now charges a platform fee of {PLATFORM_FEE_TEXT} of the subtotal on card and Cash App
        sales, starting with sales made after you accept. It comes out of your payout, never your
        customer's total. Tips, Venmo, PayPal, and cash have no fee.
      </Text>

      <Pressable style={styles.termsRow} onPress={() => setTermsAccepted((v) => !v)}>
        {/* testID: tests/lib/harness.js ticks this square, not the text, whose link opens the Terms. */}
        <View testID="accept-terms-checkbox" style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
          {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.termsText}>
          I agree to the updated{' '}
          <Text style={styles.termsLink} onPress={() => setTermsOpen(true)}>
            Terms of Service and Privacy Policy
          </Text>
        </Text>
      </Pressable>

      <Pressable style={[styles.submitButton, submitting && styles.disabled]} disabled={submitting} onPress={handleAccept}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Accept</Text>}
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
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  heading: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subheading: { fontSize: 13, color: '#666', textAlign: 'center', maxWidth: 320, marginBottom: 4 },
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
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  termsText: { fontSize: 13, color: '#333', flexShrink: 1 },
  termsLink: { textDecorationLine: 'underline', fontWeight: '600' },
  submitButton: {
    backgroundColor: colors.primary,
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

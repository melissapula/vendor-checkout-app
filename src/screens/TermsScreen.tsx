import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';

// One line to update if the operator name, point of contact, or "as of"
// date changes.
const SERVICE_NAME = 'MFP Apps';
const CONTACT_EMAIL = 'mfpstudioart@gmail.com';
const LAST_UPDATED = 'October 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

export default function TermsScreen({ onClose }: { onClose: () => void }) {
  const { isTabletUp } = useBreakpoint();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Terms of Service & Privacy Policy</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
        <View style={styles.draftNotice}>
          <Text style={styles.draftNoticeText}>
            This app is currently in beta. This document is a good-faith working draft, not
            something an attorney has reviewed. Last updated {LAST_UPDATED}.
          </Text>
        </View>

        <Text style={styles.bigHeading}>Terms of Service</Text>

        <Section title="1. What this is">
          <P>
            {SERVICE_NAME} ("we," "us") operates this inventory and checkout app (the "Service") for
            independent art and craft vendors ("you," "your store") to track inventory, record sales, and
            accept payments from your own customers at in-person shows and online.
          </P>
        </Section>

        <Section title="2. Your account">
          <P>
            You're responsible for keeping your account credentials and staff PIN reasonably secure, and
            for the accuracy of the inventory, pricing, and sales information you enter. The staff PIN is a
            deterrent to keep casual customers out of your admin view — it is not meant to be strong
            security.
          </P>
        </Section>

        <Section title="3. Payments">
          <P>
            Card and Cash App payments from your customers are processed directly by Stripe through your
            own connected Stripe account — funds go straight to you, and we never receive or hold your
            customers' payment information. Venmo, PayPal, and cash are self-reported by you at checkout;
            we don't verify or process those payments in any way. We do not currently charge any fee for
            using this Service.
          </P>
        </Section>

        <Section title="4. Beta status">
          <P>
            The Service is under active development. Features may change, and we don't guarantee
            uninterrupted uptime. Please keep your own backup of anything important (Settings → Export
            Data lets you download your inventory and sales as a spreadsheet at any time).
          </P>
        </Section>

        <Section title="5. Your responsibilities">
          <P>
            You're responsible for the products you list and sell through the Service, including that they
            comply with applicable laws and with the policies of any payment processor you connect (e.g.
            Stripe's Restricted Businesses policy). You're also responsible for any taxes owed on your own
            sales.
          </P>
        </Section>

        <Section title="6. Ending your use of the Service">
          <P>
            You can stop using the Service at any time. We may suspend or end access to the Service,
            including during the beta period, if we discontinue it or if your use violates these terms;
            we'll make a reasonable effort to give you notice and a chance to export your data first.
          </P>
        </Section>

        <Section title="7. No warranty, limitation of liability">
          <P>
            The Service is provided "as is," especially during this beta period, without warranties of any
            kind. To the fullest extent permitted by law, we aren't liable for indirect, incidental, or
            consequential damages arising from your use of the Service.
          </P>
        </Section>

        <Section title="8. Changes to these terms">
          <P>
            We may update these terms as the Service develops. We'll make a reasonable effort to let you
            know about significant changes.
          </P>
        </Section>

        <Text style={styles.bigHeading}>Privacy Policy</Text>

        <Section title="1. What we collect">
          <P>
            Your account email and password (handled by our authentication provider, Supabase — we never
            see your raw password). The store name, staff PIN, and inventory/sales/deal data you enter into
            the app. Basic technical data needed to run the app (e.g. your session).
          </P>
        </Section>

        <Section title="2. What we don't collect">
          <P>
            We never see or store your customers' card numbers or other payment details — those go
            directly to Stripe. We don't collect your customers' personal information beyond what a normal
            sale record needs (item, price, payment method, and date).
          </P>
        </Section>

        <Section title="3. How your data is used">
          <P>
            Solely to provide the Service to you — tracking your inventory, recording your sales, and
            running the checkout flow you configure. We don't sell your data or your customers' data to
            third parties.
          </P>
        </Section>

        <Section title="4. Where your data lives">
          <P>
            Your data is stored with Supabase, our database provider, and payments run through Stripe.
            Both are established infrastructure providers with their own security practices.
          </P>
        </Section>

        <Section title="5. Your data, your control">
          <P>
            Export your inventory and sales data at any time from Settings → Export Data. To delete your
            account and data entirely, contact us at {CONTACT_EMAIL}.
          </P>
        </Section>

        <Section title="Questions?">
          <P>Reach out any time at {CONTACT_EMAIL}.</P>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 12 },
  closeText: { fontSize: 18, color: '#666', paddingHorizontal: 4 },
  scroll: { padding: 16, paddingBottom: 40 },
  draftNotice: {
    backgroundColor: '#fff8e6',
    borderWidth: 1,
    borderColor: '#f0d98c',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  draftNoticeText: { fontSize: 12, color: '#8a6300', lineHeight: 18 },
  bigHeading: { fontSize: 20, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  paragraph: { fontSize: 14, color: '#333', lineHeight: 21 },
});

import { LEGAL_URLS } from '@/constants/legalLinks';
import { theme } from '@/constants/theme';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SUPPORT_EMAIL = 'support@halforder.app';
const LAST_UPDATED = 'March 31, 2026';

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.meta}>HalfOrder · Last updated: {LAST_UPDATED}</Text>

        <Text style={styles.sectionHeading}>Summary</Text>
        <Text style={styles.bullet}>
          • The app connects users to share food orders.
        </Text>
        <Text style={styles.bullet}>
          • Payments for meals are handled outside the app between users.
        </Text>
        <Text style={styles.bullet}>
          • WhatsApp or other tools you choose may be used to coordinate pickup.
        </Text>
        <Text style={styles.bullet}>
          • We do not store unrelated sensitive data beyond what is needed to run matching,
          chat, and safety features described below.
        </Text>

        <Text style={styles.paragraph}>
          HalfOrder is a food sharing application that helps users split meals and costs with
          others. This Privacy Policy explains how we collect, use, store, and share information
          when you use our apps and related services. The Terms of Service ({LEGAL_URLS.terms})
          also apply.
        </Text>

        <Text style={styles.sectionHeading}>1. User responsibilities</Text>
        <Text style={styles.paragraph}>
          You are responsible for the accuracy of information you provide (such as your name,
          contact information, and profile details). You should not upload others&apos; personal
          data without permission. If you share messages or media that include personal information
          about someone else, you represent that you have a lawful basis to do so. You must not use
          HalfOrder to collect or scrape data in violation of our Terms or applicable law.
        </Text>

        <Text style={styles.sectionHeading}>2. Payments and refunds</Text>
        <Text style={styles.paragraph}>
          When you purchase a subscription or other paid feature through the App Store or Google
          Play, those platforms process payment data in accordance with their own privacy
          policies. HalfOrder does not receive your full card number from those transactions. If
          you use optional wallet or peer-to-peer features, we may process limited transactional
          metadata needed to operate those features.
        </Text>
        <Text style={styles.paragraph}>
          Refund rights, if any, are determined by the applicable app store and local consumer
          law—not by this Policy alone.
        </Text>

        <Text style={styles.sectionHeading}>3. Privacy and data usage</Text>
        <Text style={styles.paragraph}>We may collect and use categories of information such as:</Text>
        <Text style={styles.bullet}>
          • Account data: email address, display name, authentication identifiers.
        </Text>
        <Text style={styles.bullet}>
          • Profile and content: photo, phone or messaging handles you choose to add, order
          descriptions, chats, and reports.
        </Text>
        <Text style={styles.bullet}>
          • Device and usage data: app version, diagnostics, coarse or precise location when you
          grant permission, and interaction events used to operate maps, proximity, and safety
          features.
        </Text>
        <Text style={styles.paragraph}>We use this information to:</Text>
        <Text style={styles.bullet}>• Provide, secure, and improve HalfOrder.</Text>
        <Text style={styles.bullet}>• Match you with nearby orders and enable messaging.</Text>
        <Text style={styles.bullet}>
          • Send service announcements, safety notices, and (where permitted) marketing.
        </Text>
        <Text style={styles.bullet}>
          • Detect abuse, enforce our policies, and comply with legal obligations.
        </Text>
        <Text style={styles.paragraph}>
          We use service providers (for example, cloud hosting and analytics) who process data on
          our behalf under contractual safeguards. We do not sell your personal information for
          money. We may share information if required by law, to protect safety, or as part of a
          merger or asset sale subject to confidentiality commitments.
        </Text>
        <Text style={styles.paragraph}>
          Depending on where you live, you may have rights to access, correct, delete, or export
          personal data, or to object to certain processing. Contact us using the email below to
          exercise applicable rights.
        </Text>

        <Text style={styles.sectionHeading}>4. Liability disclaimer</Text>
        <Text style={styles.paragraph}>
          We implement reasonable administrative, technical, and organizational measures to
          protect personal information. However, no online service can be guaranteed completely
          secure. TO THE MAXIMUM EXTENT PERMITTED BY LAW, HALFORDER IS NOT LIABLE FOR INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM UNAUTHORIZED ACCESS
          TO OR ALTERATION OF YOUR DATA, EXCEPT WHERE LIABILITY CANNOT BE EXCLUDED UNDER
          APPLICABLE LAW.
        </Text>

        <Text style={styles.sectionHeading}>5. Retention and children</Text>
        <Text style={styles.paragraph}>
          We retain information only as long as necessary to provide the Service, comply with law,
          resolve disputes, and enforce agreements. HalfOrder is not directed at children under 13
          (or the minimum age required in your region). We do not knowingly collect personal
          information from children.
        </Text>

        <Text style={styles.sectionHeading}>6. International transfers</Text>
        <Text style={styles.paragraph}>
          Our service providers may process data in countries other than your own. Where required,
          we rely on appropriate safeguards such as standard contractual clauses.
        </Text>

        <Text style={styles.sectionHeading}>7. Changes</Text>
        <Text style={styles.paragraph}>
          We may update this Policy from time to time. We will revise the &quot;Last updated&quot;
          date and, where appropriate, provide notice through the app.
        </Text>

        <Text style={styles.sectionHeading}>8. Contact</Text>
        <Text style={styles.paragraph}>Privacy questions and requests: </Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        >
          <Text style={styles.link}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: { marginRight: 12 },
  backText: { fontSize: 16, color: theme.colors.accentBlue, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  meta: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 8,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.text,
    marginBottom: 12,
  },
  bullet: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.text,
    marginBottom: 6,
    paddingLeft: 4,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.accentBlue,
    textDecorationLine: 'underline',
    marginBottom: 12,
  },
});

import { theme } from '@/constants/theme';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SUPPORT_EMAIL = 'support@halforder.app';
const LAST_UPDATED = 'March 26, 2026';

export default function TermsScreen() {
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
        <Text style={styles.title}>Terms of Use – HalfOrder</Text>
        <Text style={styles.meta}>Last updated: {LAST_UPDATED}</Text>

        <Text style={styles.paragraph}>
          Welcome to HalfOrder. By using our application, you agree to the
          following terms and conditions.
        </Text>

        <Text style={styles.sectionHeading}>1. Description of Service</Text>
        <Text style={styles.paragraph}>
          HalfOrder is a platform that allows users to split meal costs and
          share food orders with others. We do not prepare, sell, or deliver
          food. We only facilitate connections between users.
        </Text>

        <Text style={styles.sectionHeading}>2. User Accounts</Text>
        <Text style={styles.paragraph}>
          You are responsible for maintaining the confidentiality of your account
          credentials. You agree to provide accurate and complete information.
        </Text>

        <Text style={styles.sectionHeading}>3. Payments</Text>
        <Text style={styles.paragraph}>
          All payments between users are handled externally or through
          third-party services. HalfOrder is not responsible for disputes,
          refunds, or failed transactions between users.
        </Text>

        <Text style={styles.sectionHeading}>4. User Conduct</Text>
        <Text style={styles.paragraph}>
          You agree not to misuse the platform, including:
        </Text>
        <Text style={styles.bullet}>• Providing false information</Text>
        <Text style={styles.bullet}>• Engaging in fraud or abuse</Text>
        <Text style={styles.bullet}>• Violating any applicable laws</Text>
        <Text style={styles.paragraph}>
          You may submit content such as messages and profile information. You
          must not post unlawful, threatening, harassing, defamatory, obscene,
          or otherwise objectionable material. We provide tools to report
          content and block users. Reported content may be reviewed and
          actioned at our discretion, including removal or account restriction.
        </Text>

        <Text style={styles.sectionHeading}>5. Limitation of Liability</Text>
        <Text style={styles.paragraph}>
          HalfOrder is provided &quot;as is&quot; without warranties of any
          kind. We are not responsible for any losses, damages, or disputes
          arising from user interactions.
        </Text>

        <Text style={styles.sectionHeading}>6. Termination</Text>
        <Text style={styles.paragraph}>
          We reserve the right to suspend or terminate accounts that violate
          these terms.
        </Text>

        <Text style={styles.sectionHeading}>7. Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We may update these terms at any time. Continued use of the app means
          you accept the updated terms.
        </Text>

        <Text style={styles.sectionHeading}>8. Contact</Text>
        <Text style={styles.paragraph}>
          For questions, contact:{' '}
        </Text>
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

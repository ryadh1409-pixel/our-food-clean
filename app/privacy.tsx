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
const LAST_UPDATED = 'March 26, 2026';

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
        <Text style={styles.title}>Privacy Policy – HalfOrder</Text>
        <Text style={styles.meta}>Last updated: {LAST_UPDATED}</Text>

        <Text style={styles.paragraph}>
          HalfOrder respects your privacy and is committed to protecting your
          personal data.
        </Text>

        <Text style={styles.sectionHeading}>1. Information We Collect</Text>
        <Text style={styles.paragraph}>We may collect:</Text>
        <Text style={styles.bullet}>• Name</Text>
        <Text style={styles.bullet}>• Email address</Text>
        <Text style={styles.bullet}>• Usage data in the app</Text>

        <Text style={styles.sectionHeading}>2. How We Use Information</Text>
        <Text style={styles.paragraph}>We use your data to:</Text>
        <Text style={styles.bullet}>• Create and manage your account</Text>
        <Text style={styles.bullet}>• Improve the app experience</Text>
        <Text style={styles.bullet}>• Communicate with you</Text>

        <Text style={styles.sectionHeading}>3. Data Sharing</Text>
        <Text style={styles.paragraph}>
          We do NOT sell your personal data.
        </Text>
        <Text style={styles.paragraph}>
          We may share data with trusted third-party services (e.g., Firebase)
          for app functionality.
        </Text>

        <Text style={styles.sectionHeading}>4. Data Security</Text>
        <Text style={styles.paragraph}>
          We use reasonable security measures to protect your information, but
          no system is 100% secure.
        </Text>

        <Text style={styles.sectionHeading}>5. User Rights</Text>
        <Text style={styles.paragraph}>You can:</Text>
        <Text style={styles.bullet}>• Update your information</Text>
        <Text style={styles.bullet}>• Request deletion of your account</Text>

        <Text style={styles.sectionHeading}>6. Data Retention</Text>
        <Text style={styles.paragraph}>
          We keep your data only as long as necessary to provide the service.
        </Text>

        <Text style={styles.sectionHeading}>7. Changes to Policy</Text>
        <Text style={styles.paragraph}>
          We may update this policy. Continued use means acceptance.
        </Text>

        <Text style={styles.sectionHeading}>8. Contact</Text>
        <Text style={styles.paragraph}>For privacy questions: </Text>
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

import { useRouter } from 'expo-router';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { shadows, theme } from '@/constants/theme';

const c = theme.colors;

export default function SafetyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safety</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Community guidelines</Text>
          <Text style={styles.cardText}>
            • Be respectful to your order partners.{'\n'}• Don’t share personal
            contact or payment details in chat.{'\n'}• Complete orders as agreed
            (pick up, split, pay).{'\n'}• Report anyone who doesn’t follow these
            guidelines.
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reporting users</Text>
          <Text style={styles.cardText}>
            If someone behaves inappropriately, violates our guidelines, or you
            feel unsafe:
          </Text>
          <Text style={styles.cardText}>
            1. Open the order or conversation where the issue happened.{'\n'}
            2. Use “Report” or contact support with the order ID and a short
            description.{'\n'}
            3. We’ll review and take action, which may include warnings or
            account restrictions.
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Blocking users</Text>
          <Text style={styles.cardText}>
            You can block a user so they can’t message you or be matched with
            you in future orders. Blocked users won’t see that they’re blocked.
            Use the block option in the order or chat screen, or contact support
            to block someone.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backText: {
    fontSize: 16,
    color: c.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginLeft: 16,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.section,
    marginBottom: theme.spacing.md,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginBottom: 12,
  },
  cardText: {
    fontSize: 15,
    color: c.textMuted,
    lineHeight: 22,
    marginBottom: 8,
  },
});

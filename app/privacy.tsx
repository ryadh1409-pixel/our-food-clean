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
        <Text style={styles.paragraph}>HalfOrder respects your privacy.</Text>
        <Text style={styles.paragraph}>
          We may collect basic information such as:
        </Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• display name</Text>
          <Text style={styles.bulletItem}>• email address</Text>
          <Text style={styles.bulletItem}>• profile photo</Text>
          <Text style={styles.bulletItem}>• messages between users</Text>
          <Text style={styles.bulletItem}>• basic usage data</Text>
        </View>
        <Text style={styles.paragraph}>
          This information is used only to provide the HalfOrder service and
          improve the app.
        </Text>
        <Text style={styles.paragraph}>HalfOrder does not sell user data.</Text>
        <Text style={styles.paragraph}>Contact: </Text>
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
    marginBottom: 20,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.text,
    marginBottom: 12,
  },
  bulletList: { marginBottom: 12, paddingLeft: 8 },
  bulletItem: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.text,
    marginBottom: 4,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.accentBlue,
    textDecorationLine: 'underline',
  },
});

import { WHATSAPP_MATCH_DEFAULT_MESSAGE } from '@/lib/whatsapp';
import * as Linking from 'expo-linking';
import { theme } from '@/constants/theme';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const c = theme.colors;

type ContactButtonsProps = {
  onChatInApp: () => void;
  whatsappNumber: string | null;
};

export default function ContactButtons({
  onChatInApp,
  whatsappNumber,
}: ContactButtonsProps) {
  const handleWhatsApp = () => {
    if (!whatsappNumber) return;
    const num = whatsappNumber.replace(/\D/g, '');
    if (!num) return;
    const url = `https://wa.me/${num}?text=${encodeURIComponent(WHATSAPP_MATCH_DEFAULT_MESSAGE)}`;
    if (Platform.OS === 'web') {
      (window as unknown as { open: (u: string) => void }).open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.button}
        onPress={onChatInApp}
        activeOpacity={0.8}
      >
        <Text style={styles.icon}>💬</Text>
        <Text style={styles.label}>Chat in App</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.whatsapp]}
        onPress={handleWhatsApp}
        disabled={!whatsappNumber?.trim()}
        activeOpacity={0.8}
      >
        <Text style={styles.icon}>📱</Text>
        <Text style={styles.label}>Open WhatsApp</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    backgroundColor: c.surfaceDarkElevated,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsapp: {
    backgroundColor: c.whatsapp,
  },
  icon: {
    fontSize: 20,
    marginBottom: 4,
  },
  label: {
    color: c.white,
    fontSize: 14,
    fontWeight: '600',
  },
});

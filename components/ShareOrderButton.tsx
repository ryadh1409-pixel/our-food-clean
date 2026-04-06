import { getOrderLink, getShareMessage } from '@/utils/generateLink';
import * as Linking from 'expo-linking';
import React from 'react';
import {
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '@/constants/theme';
import { showError, showNotice, showSuccess } from '@/utils/toast';

const c = theme.colors;

type ShareOrderButtonProps = {
  orderId: string;
  restaurantName: string;
  variant?: 'single' | 'buttons';
};

/**
 * Share Order: React Native Share API + WhatsApp, iMessage, Instagram, Copy Link.
 * Uses message template: "I'm ordering from {restaurant}. Want to split? Join here: {link}"
 */
export default function ShareOrderButton({
  orderId,
  restaurantName,
  variant = 'buttons',
}: ShareOrderButtonProps) {
  const orderLink = getOrderLink(orderId);
  const message = getShareMessage(restaurantName, orderLink);

  const handleShare = async () => {
    try {
      await Share.share({
        message,
        title: 'Split this order',
        url: Platform.OS === 'ios' ? orderLink : undefined,
      });
    } catch {
      showError('Sharing is not available.');
    }
  };

  const handleWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    if (Platform.OS === 'web') {
      (window as unknown as { open: (u: string) => void }).open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() =>
        showError('Could not open WhatsApp.'),
      );
    }
  };

  const handleiMessage = () => {
    if (Platform.OS === 'web') {
      const url = `sms:?body=${encodeURIComponent(message)}`;
      (window as unknown as { open: (u: string) => void }).open(url, '_self');
    } else {
      Share.share({ message, title: 'Split this order' }).catch(() => {
        Linking.openURL(`sms:?body=${encodeURIComponent(message)}`).catch(() =>
          showError('Could not open Messages.'),
        );
      });
    }
  };

  const handleInstagram = () => {
    Share.share({ message, title: 'Split this order' }).catch(() =>
      showNotice('Tip', 'Copy the link and paste it in Instagram.'),
    );
  };

  const handleCopyLink = () => {
    if (
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText
    ) {
      navigator.clipboard
        .writeText(orderLink)
        .then(() => showSuccess('Link copied to clipboard.'));
      return;
    }
    Share.share({ message: orderLink, title: 'Order link' })
      .then(() => {})
      .catch(() => showNotice('Link', orderLink));
  };

  if (variant === 'single') {
    return (
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleShare}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryButtonText}>Share Order</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Share Order</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, styles.whatsapp]}
          onPress={handleWhatsApp}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.imessage]}
          onPress={handleiMessage}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>iMessage</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, styles.instagram]}
          onPress={handleInstagram}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Instagram</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.copy]}
          onPress={handleCopyLink}
          activeOpacity={0.85}
        >
          <Text style={styles.copyBtnText}>Copy Link</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: 8 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: c.textOnPrimary, fontWeight: '600', fontSize: 14 },
  copyBtnText: { color: c.textOnPrimary, fontWeight: '600', fontSize: 14 },
  whatsapp: { backgroundColor: c.whatsapp },
  imessage: { backgroundColor: c.imessageGreen },
  instagram: { backgroundColor: c.instagramBrand },
  copy: { backgroundColor: c.primary },
  primaryButton: {
    backgroundColor: c.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: c.textOnPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
});

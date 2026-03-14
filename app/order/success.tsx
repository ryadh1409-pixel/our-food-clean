import AppLogo from '@/components/AppLogo';
import { theme } from '@/constants/theme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';

const CARD_WIDTH = 320;
const CARD_HEIGHT = 200;

export default function OrderSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    totalPrice?: string;
    saved?: string;
    restaurant?: string;
    taxGiftApplied?: string;
  }>();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const totalPrice = Number(params.totalPrice) || 0;
  const saved = Number(params.saved) || 0;
  const restaurantName = params.restaurant ?? 'Order';
  const taxGiftApplied = params.taxGiftApplied === '1';
  const totalLabel = totalPrice > 0 ? `$${totalPrice.toFixed(2)}` : '—';
  const savedLabel = saved > 0 ? `$${saved.toFixed(2)}` : '$0.00';

  const shareMessage = `I saved ${savedLabel} with HalfOrder! 🍔 Split meals. Pay half. Try it: https://halforder.app`;

  const handleShare = async () => {
    setSharing(true);
    try {
      if (Platform.OS === 'web' || !cardRef.current) {
        await Share.share({ message: shareMessage, title: 'HalfOrder' });
        return;
      }
      const uri = await captureRef(cardRef.current, {
        format: 'png',
        quality: 1,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        result: 'tmpfile',
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your HalfOrder success',
        });
      } else {
        await Share.share({
          message: shareMessage,
          title: 'HalfOrder',
          url: Platform.OS === 'ios' ? uri : undefined,
        });
      }
    } catch (e) {
      await Share.share({ message: shareMessage, title: 'HalfOrder' }).catch(
        () => {
          Alert.alert('Share', 'Sharing failed. You can copy the message.');
        },
      );
    } finally {
      setSharing(false);
    }
  };

  const openShareSheet = () => {
    Share.share({
      message: shareMessage,
      title: 'I saved with HalfOrder!',
      url: undefined,
    }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Order completed</Text>
        <Text style={styles.message}>
          You saved {savedLabel} with HalfOrder
        </Text>
        <Text
          style={[styles.subMessage, { fontWeight: '600', marginBottom: 16 }]}
        >
          You saved money by splitting your meal.
        </Text>
        {taxGiftApplied ? (
          <View style={styles.taxGiftBanner}>
            <Text style={styles.taxGiftBannerTitle}>🎉 Congratulations</Text>
            <Text style={styles.taxGiftBannerText}>
              HalfOrder paid your tax on this order.
            </Text>
          </View>
        ) : null}

        <View ref={cardRef} style={styles.card} collapsable={false}>
          <View style={styles.cardInner}>
            <View style={styles.logoWrap}>
              <AppLogo />
            </View>
            <Text style={styles.cardRestaurant}>{restaurantName}</Text>
            <Text style={styles.cardTotal}>Meal total: {totalLabel}</Text>
            <Text style={styles.cardSaved}>Amount saved: {savedLabel}</Text>
          </View>
        </View>

        <Text style={styles.hint}>Share your success with friends</Text>

        <View style={styles.socialRow}>
          <TouchableOpacity
            style={styles.socialButton}
            onPress={() => {
              const msg = encodeURIComponent(shareMessage);
              const url = `https://wa.me/?text=${msg}`;
              Linking.openURL(url).catch(() => openShareSheet());
            }}
          >
            <Text style={styles.socialLabel}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.socialButton}
            onPress={openShareSheet}
          >
            <Text style={styles.socialLabel}>Instagram</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.socialButton}
            onPress={() => {
              if (Platform.OS === 'ios' || Platform.OS === 'android') {
                Linking.openURL(
                  `sms:?body=${encodeURIComponent(shareMessage)}`,
                ).catch(() => openShareSheet());
              } else {
                openShareSheet();
              }
            }}
          >
            <Text style={styles.socialLabel}>SMS</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.shareButton, sharing && styles.shareButtonDisabled]}
          onPress={handleShare}
          disabled={sharing}
        >
          {sharing ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.textOnPrimary}
            />
          ) : (
            <Text style={styles.shareButtonText}>Share card (image)</Text>
          )}
        </TouchableOpacity>

        <View style={styles.socialRow}>
          <TouchableOpacity
            style={styles.socialButton}
            onPress={openShareSheet}
          >
            <Text style={styles.socialLabel}>TikTok</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.socialButton}
            onPress={openShareSheet}
          >
            <Text style={styles.socialLabel}>Snapchat</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.socialHint}>
          Tap any button to open the share menu and pick an app
        </Text>

        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.screen,
    paddingTop: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 8,
  },
  subMessage: {
    fontSize: 16,
    color: theme.colors.textMuted,
    marginBottom: 24,
  },
  taxGiftBanner: {
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#D4EDDA',
    borderWidth: 1,
    borderColor: '#FFD700',
    alignSelf: 'stretch',
  },
  taxGiftBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#155724',
    textAlign: 'center',
  },
  taxGiftBannerText: {
    fontSize: 14,
    color: '#155724',
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    width: CARD_WIDTH,
    minHeight: CARD_HEIGHT,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInner: {
    alignItems: 'center',
  },
  logoWrap: {
    marginBottom: 12,
    transform: [{ scale: 0.85 }],
  },
  cardRestaurant: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  cardTotal: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  cardSaved: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  hint: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 16,
  },
  shareButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: theme.radius.button,
    minWidth: 200,
    alignItems: 'center',
    marginBottom: 20,
  },
  shareButtonDisabled: { opacity: 0.7 },
  shareButtonText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
  },
  socialButton: {
    backgroundColor: theme.colors.backgroundDark,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: theme.radius.button,
  },
  socialLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  socialHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 28,
    textAlign: 'center',
  },
  doneButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
});

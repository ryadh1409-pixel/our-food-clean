import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { shadows } from '@/constants/theme';
import {
  buildSpotLeftLabel,
  formatSplitPrice,
  type SwipeOrder,
} from '@/types/swipeOrder';

type Props = {
  order: SwipeOrder;
  dimmed?: boolean;
  onReport?: () => void;
};

export function SwipeOrderCard({ order, dimmed = false, onReport }: Props) {
  return (
    <View style={[styles.card, dimmed && styles.cardDimmed]}>
      <ImageBackground
        source={{ uri: order.imageUrl }}
        style={styles.cardImage}
        imageStyle={styles.cardImageStyle}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.92)']}
          style={styles.cardOverlay}
        >
          <View style={styles.badges}>
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsBadgeText}>Save {order.savingsPercent}%</Text>
            </View>
            <View style={styles.rightBadges}>
              {onReport ? (
                <TouchableOpacity
                  style={styles.reportBadge}
                  onPress={onReport}
                  activeOpacity={0.8}
                >
                  <Text style={styles.reportBadgeText}>Report</Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.urgencyBadge}>
                <Text style={styles.urgencyBadgeText}>
                  Closing in {order.closingInMin} min
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.dishName}>{order.dishName}</Text>
            <Text style={styles.splitPrice}>{formatSplitPrice(order.splitPriceCents)}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Arrives in {order.etaMin} min</Text>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaText}>{order.distanceKm.toFixed(1)} km away</Text>
            </View>

            <View style={styles.socialRow}>
              <View style={styles.avatarStack}>
                {order.joinedAvatarUrls.slice(0, 3).map((avatar, idx) => (
                  <Image
                    key={`${avatar}-${idx}`}
                    source={{ uri: avatar }}
                    style={[styles.avatar, { marginLeft: idx === 0 ? 0 : -10 }]}
                  />
                ))}
              </View>
              <View>
                <Text style={styles.socialText}>
                  {order.joinedCount}/{order.maxPeople} joined
                </Text>
                <Text style={styles.socialSubText}>{buildSpotLeftLabel(order)}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#141922',
    ...shadows.card,
  },
  cardDimmed: {
    opacity: 0.65,
  },
  cardImage: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cardImageStyle: {
    borderRadius: 26,
  },
  cardOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 16,
  },
  badges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rightBadges: {
    alignItems: 'flex-end',
    gap: 6,
  },
  savingsBadge: {
    backgroundColor: 'rgba(16,185,129,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  savingsBadgeText: {
    color: '#052E1A',
    fontSize: 12,
    fontWeight: '800',
  },
  urgencyBadge: {
    backgroundColor: 'rgba(251,146,60,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  urgencyBadgeText: {
    color: '#3B1A00',
    fontSize: 12,
    fontWeight: '800',
  },
  reportBadge: {
    backgroundColor: 'rgba(29, 35, 44, 0.88)',
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  reportBadgeText: {
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: '800',
  },
  cardFooter: {
    gap: 8,
  },
  dishName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
  },
  splitPrice: {
    color: '#6EE7B7',
    fontSize: 20,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '600',
  },
  metaDot: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  socialRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#0B0D10',
  },
  socialText: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '700',
  },
  socialSubText: {
    color: '#FDBA74',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
});

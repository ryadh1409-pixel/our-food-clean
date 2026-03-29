import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Image,
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
      {/* Hero image — food delivery style, large top */}
      <View style={styles.heroWrap}>
        <Image
          source={{ uri: order.imageUrl }}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.9)']}
          style={styles.heroScrim}
        />
        <View style={styles.heroTopRow}>
          {order.savingsPercent > 0 ? (
            <View style={styles.pillGreen}>
              <Text style={styles.pillGreenText}>Save {order.savingsPercent}%</Text>
            </View>
          ) : (
            <View />
          )}
          <View style={styles.heroRight}>
            {onReport ? (
              <TouchableOpacity
                style={styles.reportPill}
                onPress={onReport}
                activeOpacity={0.85}
              >
                <Text style={styles.reportPillText}>Report</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <View style={styles.heroCaption}>
          <Text style={styles.heroDishName} numberOfLines={2}>
            {order.dishName}
          </Text>
        </View>
      </View>

      {/* Details panel */}
      <View style={styles.panel}>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Price per person</Text>
          <Text style={styles.priceValue}>{formatSplitPrice(order.splitPriceCents)}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <MaterialIcons name="schedule" size={20} color="#34D399" />
            <View>
              <Text style={styles.statLabel}>Arrives in</Text>
              <Text style={styles.statValue}>{order.etaMin} min</Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <MaterialIcons name="near-me" size={20} color="#60A5FA" />
            <View>
              <Text style={styles.statLabel}>Distance</Text>
              <Text style={styles.statValue}>{order.distanceKm.toFixed(1)} km</Text>
            </View>
          </View>
        </View>

        <View style={styles.joinedCard}>
          <View style={styles.avatarRow}>
            {order.joinedAvatarUrls.slice(0, 4).map((uri, idx) => (
              <Image
                key={`${uri}-${idx}`}
                source={{ uri }}
                style={[styles.avatar, { marginLeft: idx === 0 ? 0 : -8 }]}
              />
            ))}
          </View>
          <View style={styles.joinedTextCol}>
            <Text style={styles.joinedTitle}>
              {order.joinedCount} of {order.maxPeople} joined
            </Text>
            <Text style={styles.joinedSub}>{buildSpotLeftLabel(order)}</Text>
          </View>
        </View>

        <View style={styles.urgencyFoot}>
          <MaterialIcons name="local-fire-department" size={16} color="#FB923C" />
          <Text style={styles.urgencyFootText}>
            Closing in ~{order.closingInMin} min · join while spots last
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#12171F',
    ...shadows.card,
  },
  cardDimmed: {
    opacity: 0.72,
  },
  heroWrap: {
    flex: 3.1,
    width: '100%',
    position: 'relative',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTopRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  pillGreen: {
    backgroundColor: 'rgba(52, 211, 153, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  pillGreenText: {
    color: '#052E1A',
    fontSize: 13,
    fontWeight: '800',
  },
  reportPill: {
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  reportPillText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
  },
  heroCaption: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },
  heroDishName: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  panel: {
    flex: 2,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#0E131B',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 12,
    justifyContent: 'space-between',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  priceLabel: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  priceValue: {
    color: '#6EE7B7',
    fontSize: 22,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151B26',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    marginHorizontal: 6,
  },
  statLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  joinedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#0E131B',
  },
  joinedTextCol: {
    flex: 1,
  },
  joinedTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  joinedSub: {
    color: '#FDBA74',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  urgencyFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  urgencyFootText: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
});

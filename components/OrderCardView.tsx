import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type OrderCardParticipant = {
  userId: string;
  name: string;
  avatar: string | null;
};

type Props = {
  participants: OrderCardParticipant[];
  maxUsers?: number;
  status?: string;
  /** Highlights “You” on the matching avatar. */
  viewerUserId?: string | null;
  style?: StyleProp<ViewStyle>;
};

const AVATAR = 76;

function AvatarFace({
  participant,
  empty,
  isViewer,
}: {
  participant?: OrderCardParticipant;
  empty?: boolean;
  isViewer?: boolean;
}) {
  if (empty || !participant) {
    return (
      <View style={[styles.avatarWrap, styles.avatarWrapEmpty]}>
        <View
          style={[
            styles.avatar,
            styles.avatarEmpty,
            Platform.OS === 'ios' ? styles.avatarEmptyIos : null,
          ]}
        >
          <MaterialIcons name="person-add-alt-1" size={28} color="rgba(148,163,184,0.9)" />
        </View>
        <Text style={styles.emptyLabel}>Open</Text>
      </View>
    );
  }

  const initial =
    participant.name?.trim()?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <View style={styles.avatarWrap}>
      <View style={styles.avatarRing}>
        {participant.avatar ? (
          <Image source={{ uri: participant.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPh]}>
            <Text style={styles.avatarPhText}>{initial}</Text>
          </View>
        )}
      </View>
      {isViewer ? (
        <View style={styles.youBadge}>
          <Text style={styles.youBadgeText}>You</Text>
        </View>
      ) : null}
      <Text style={styles.name} numberOfLines={1}>
        {participant.name?.trim() || 'Member'}
      </Text>
    </View>
  );
}

export function OrderCardView({
  participants,
  maxUsers = 2,
  status,
  viewerUserId,
  style,
}: Props) {
  const cap = Math.min(Math.max(maxUsers, 1), 2);
  const isMatched =
    participants.length >= cap ||
    status === 'matched' ||
    status === 'active';
  const waiting =
    !isMatched &&
    (status === 'waiting' || status === 'active' || !status);

  const ordered = useMemo(() => {
    const list = [...participants];
    if (viewerUserId) {
      list.sort((a, b) => {
        const aMe = a.userId === viewerUserId ? 0 : 1;
        const bMe = b.userId === viewerUserId ? 0 : 1;
        return aMe - bMe;
      });
    }
    return list;
  }, [participants, viewerUserId]);

  const first = ordered[0];
  const second = ordered[1];

  return (
    <View style={[styles.shadowWrap, style]}>
      <LinearGradient
        colors={
          isMatched
            ? ['rgba(52,211,153,0.25)', 'rgba(15,23,42,0.95)']
            : ['rgba(251,191,36,0.12)', 'rgba(15,23,42,0.96)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBorder}
      >
        <View style={styles.inner}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                isMatched ? styles.statusDotOn : styles.statusDotPending,
              ]}
            />
            <Text style={styles.statusLabel}>
              {isMatched ? 'Matched' : 'Forming pair'}
            </Text>
          </View>

          <View style={styles.avatarRow}>
            <View style={styles.avatarCol}>
              <AvatarFace
                participant={first}
                empty={!first}
                isViewer={
                  !!first && viewerUserId != null && first.userId === viewerUserId
                }
              />
            </View>
            <View style={styles.heartCol}>
              {isMatched ? (
                <LinearGradient
                  colors={['#34D399', '#10B981']}
                  style={styles.heartBubble}
                >
                  <MaterialIcons name="favorite" size={22} color="#052E1A" />
                </LinearGradient>
              ) : (
                <View style={styles.heartBubbleMuted}>
                  <MaterialIcons
                    name="hourglass-empty"
                    size={20}
                    color="rgba(251,191,36,0.95)"
                  />
                </View>
              )}
            </View>
            <View style={styles.avatarCol}>
              <AvatarFace
                participant={second}
                empty={cap >= 2 && !second}
                isViewer={
                  !!second &&
                  viewerUserId != null &&
                  second.userId === viewerUserId
                }
              />
            </View>
          </View>

          <Text style={styles.headline}>
            {isMatched
              ? "You're paired — say hi and split the bill."
              : 'Waiting for someone to join this share.'}
          </Text>
          <Text style={styles.hint}>
            {waiting
              ? `${participants.length}/${cap} · Invite a friend or wait for another foodie nearby.`
              : `${participants.length}/${cap} · Plan pickup and pay at the restaurant.`}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: 20,
    marginTop: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  gradientBorder: {
    borderRadius: 20,
    padding: 1,
  },
  inner: {
    backgroundColor: '#0f1419',
    borderRadius: 19,
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    marginBottom: 18,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOn: {
    backgroundColor: '#34D399',
  },
  statusDotPending: {
    backgroundColor: '#FBBF24',
  },
  statusLabel: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  avatarCol: {
    width: AVATAR + 28,
    alignItems: 'center',
  },
  heartCol: {
    width: 52,
    alignItems: 'center',
    paddingTop: AVATAR / 2 - 20,
  },
  avatarWrap: {
    alignItems: 'center',
    width: AVATAR + 16,
  },
  avatarWrapEmpty: {
    opacity: 0.95,
  },
  avatarRing: {
    borderRadius: AVATAR / 2 + 4,
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: 'rgba(30,41,59,0.9)',
  },
  avatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(148,163,184,0.35)',
    borderStyle: 'dashed',
  },
  avatarPh: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  avatarPhText: {
    color: 'rgba(248,250,252,0.85)',
    fontSize: 28,
    fontWeight: '800',
  },
  youBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(52,211,153,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
  },
  youBadgeText: {
    color: '#6EE7B7',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  emptyLabel: {
    marginTop: 6,
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  name: {
    marginTop: 6,
    color: 'rgba(248,250,252,0.95)',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: AVATAR + 24,
  },
  heartBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#0f1419',
  },
  heartBubbleMuted: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  headline: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 8,
  },
  hint: {
    textAlign: 'center',
    color: 'rgba(148,163,184,0.95)',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
});

import { auth, db } from '@/services/firebase';
import { theme } from '@/constants/theme';
import { doc, getDoc } from 'firebase/firestore';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const c = theme.colors;

type UserMini = { uid: string; displayName: string; photoURL: string | null };

export default function FoodMatchScreen() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const id = typeof matchId === 'string' ? matchId : '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [foodName, setFoodName] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [users, setUsers] = useState<UserMini[]>([]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Missing match.');
      return;
    }

    let cancelled = false;

    (async () => {
      console.log('[FoodMatchScreen] load', id);
      try {
        const matchRef = doc(db, 'matches', id);
        const matchSnap = await getDoc(matchRef);
        if (!matchSnap.exists() || cancelled) {
          setError('Match not found.');
          return;
        }
        const m = matchSnap.data();
        const orderId = typeof m?.orderId === 'string' ? m.orderId : '';
        const pair = Array.isArray(m?.users) ? (m.users as string[]) : [];
        if (!orderId || pair.length < 2) {
          setError('Invalid match data.');
          return;
        }

        const orderSnap = await getDoc(doc(db, 'orders', orderId));
        if (!orderSnap.exists() || cancelled) {
          setError('Order not found.');
          return;
        }
        const o = orderSnap.data();
        setFoodName(typeof o?.foodName === 'string' ? o.foodName : 'Shared food');
        setImageUrl(typeof o?.image === 'string' ? o.image : null);

        const metas: UserMini[] = [];
        for (const uid of pair) {
          const uSnap = await getDoc(doc(db, 'users', uid));
          if (uSnap.exists()) {
            const d = uSnap.data();
            metas.push({
              uid,
              displayName:
                typeof d?.displayName === 'string' && d.displayName.trim()
                  ? d.displayName
                  : typeof d?.email === 'string'
                    ? d.email.split('@')[0] ?? 'User'
                    : 'User',
              photoURL: typeof d?.photoURL === 'string' ? d.photoURL : null,
            });
          } else {
            metas.push({ uid, displayName: 'User', photoURL: null });
          }
        }
        if (!cancelled) setUsers(metas);
      } catch (e) {
        console.error('[FoodMatchScreen]', e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.sheetDark }]}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={styles.hint}>Loading match…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.pad}>
          <Text style={styles.title}>Match</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
            <Text style={styles.btnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        <Text style={styles.celebrate}>🎉 Match found!</Text>
        <Text style={styles.title}>You both want the same food</Text>

        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.hero} contentFit="cover" />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]} />
        )}

        <Text style={styles.foodName}>{foodName}</Text>

        <Text style={styles.sectionLabel}>People</Text>
        {users.map((u) => (
          <View key={u.uid} style={styles.userRow}>
            {u.photoURL ? (
              <Image source={{ uri: u.photoURL }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPh]}>
                <Text style={styles.avatarLetter}>{u.displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{u.displayName}</Text>
              {auth.currentUser?.uid === u.uid ? (
                <Text style={styles.you}>You</Text>
              ) : null}
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.replace('/(tabs)' as never)}
          activeOpacity={0.9}
        >
          <Text style={styles.secondaryBtnText}>Keep swiping</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.sheetDark },
  pad: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  hint: { color: c.textSecondary, fontSize: 14 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: c.white,
    marginBottom: 8,
  },
  celebrate: { fontSize: 36, marginBottom: 8 },
  hero: {
    width: '100%',
    height: 220,
    borderRadius: 20,
    marginTop: 12,
    marginBottom: 16,
    backgroundColor: c.surfaceDarkElevated,
  },
  heroPlaceholder: { opacity: 0.6 },
  foodName: {
    fontSize: 20,
    fontWeight: '700',
    color: c.white,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: c.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2C3646',
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPh: {
    backgroundColor: c.surfaceDarkElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { color: c.white, fontWeight: '800', fontSize: 20 },
  userName: { color: c.white, fontSize: 17, fontWeight: '600' },
  you: { color: c.primary, fontSize: 13, fontWeight: '600', marginTop: 2 },
  btn: {
    marginTop: 20,
    backgroundColor: c.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: { color: c.textOnPrimary, fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    marginTop: 28,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.primary,
    alignItems: 'center',
  },
  secondaryBtnText: { color: c.primary, fontWeight: '700', fontSize: 16 },
  errorText: { color: '#FB7185', fontSize: 15, marginVertical: 12 },
});

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/services/firebase';
import { theme } from '@/constants/theme';

const c = theme.colors;

type Props = {
  orderId: string;
  visible: boolean;
  onDismiss: () => void;
};

export function OrderRatingPrompt({ orderId, visible, onDismiss }: Props) {
  const [rating, setRating] = useState(0);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  useEffect(() => {
    if (!visible || !orderId) return;
    const uid = auth.currentUser?.uid ?? '';
    if (!uid) return;
    getDoc(doc(db, 'orders', orderId, 'ratings', uid)).then((snap) => {
      if (snap.exists()) {
        setAlreadyRated(true);
        setRating(snap.data()?.rating ?? 0);
        onDismiss();
      }
    });
  }, [visible, orderId]);

  const handleSubmit = async () => {
    const uid = auth.currentUser?.uid ?? '';
    if (!uid || selected < 1 || selected > 5 || !orderId) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'orders', orderId, 'ratings', uid), {
        rating: selected,
        createdAt: serverTimestamp(),
      });
      setRating(selected);
      setAlreadyRated(true);
      onDismiss();
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: c.overlayScrim,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: c.background,
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 320,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: '600',
              color: c.textSlateDark,
              marginBottom: 8,
              textAlign: 'center',
            }}
          >
            Rate this order
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: c.textMuted,
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            How was your experience?
          </Text>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 24,
            }}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setSelected(star)}
                style={{ padding: 4 }}
              >
                <Text style={{ fontSize: 36 }}>
                  {star <= selected ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={selected < 1 || loading}
            style={{
              backgroundColor:
                selected >= 1 && !loading ? c.primary : c.borderStrong,
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: c.textOnPrimary, fontWeight: '600' }}>
              Submit
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

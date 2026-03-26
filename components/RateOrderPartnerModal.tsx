/**
 * Reusable "Rate Your Order Partner" modal.
 * Shows after order completes; 1–5 stars, optional comment, submit.
 * Prevents duplicate ratings via hasRatedOrder check before save.
 */
import { hasRatedOrder, saveRating } from '@/services/ratings';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '@/constants/theme';

const C = theme.colors;

export type RateOrderPartnerModalProps = {
  visible: boolean;
  orderId: string;
  fromUserId: string | null;
  toUserId: string | null;
  onSuccess: () => void;
  onDismiss: () => void;
};

export function RateOrderPartnerModal({
  visible,
  orderId,
  fromUserId,
  toUserId,
  onSuccess,
  onDismiss,
}: RateOrderPartnerModalProps) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setStars(0);
      setComment('');
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!fromUserId || !toUserId) return;
    if (stars < 1) {
      Alert.alert('Rating required', 'Please select 1 to 5 stars.');
      return;
    }
    setSubmitting(true);
    try {
      const alreadyRated = await hasRatedOrder(orderId, fromUserId);
      if (alreadyRated) {
        Alert.alert('Already rated', 'You have already rated this order.');
        onDismiss();
        setSubmitting(false);
        return;
      }
      await saveRating(orderId, fromUserId, toUserId, stars, comment);
      onSuccess();
      onDismiss();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save rating';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>Rate Your Order Partner</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setStars(n)}
                style={styles.starTouch}
                disabled={submitting}
              >
                <Text
                  style={[
                    styles.star,
                    n <= stars ? styles.starFilled : styles.starEmpty,
                  ]}
                >
                  {n <= stars ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Optional comment"
            placeholderTextColor={C.textMuted}
            style={styles.commentInput}
            multiline
            maxLength={200}
            editable={!submitting}
          />
          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting || stars < 1}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={C.textOnPrimary} />
            ) : (
              <Text style={styles.submitText}>Submit</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: C.overlayScrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: C.background,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  starTouch: {
    padding: 6,
  },
  star: {
    fontSize: 40,
  },
  starFilled: {
    color: C.warning,
  },
  starEmpty: {
    color: C.dotInactive,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: C.text,
    minHeight: 88,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: C.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitDisabled: {
    backgroundColor: C.surface,
  },
  submitText: {
    color: C.textOnPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
});

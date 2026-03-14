import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const BG_OVERLAY = 'rgba(0,0,0,0.7)';
const CARD_BG = '#1C1C1E';
const PRIMARY = '#FFD700';
const SECONDARY = '#3A3A3C';

type MatchAlertProps = {
  visible: boolean;
  restaurantName: string;
  onJoin: () => void;
  onIgnore: () => void;
  joining?: boolean;
};

export default function MatchAlert({
  visible,
  restaurantName,
  onJoin,
  onIgnore,
  joining = false,
}: MatchAlertProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onIgnore}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>🎉 Match Found!</Text>
          <Text style={styles.message}>
            Another user nearby wants the same order from {restaurantName}. Do
            you want to share the order?
          </Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.primaryBtn, joining && styles.btnDisabled]}
              onPress={onJoin}
              disabled={joining}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryBtnText}>
                {joining ? 'Joining…' : 'Join Order'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={onIgnore}
              disabled={joining}
              activeOpacity={0.9}
            >
              <Text style={styles.secondaryBtnText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: BG_OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#E5E5EA',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttons: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryBtn: {
    backgroundColor: SECONDARY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#0B0B0B',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

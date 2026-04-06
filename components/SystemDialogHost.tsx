import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '@/constants/theme';

type ConfirmPayload = {
  kind: 'confirm';
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
};

type ActionsPayload = {
  kind: 'actions';
  title?: string;
  message?: string;
  actions: { label: string; destructive?: boolean; onPress: () => void }[];
  resolve: () => void;
};

type Payload = ConfirmPayload | ActionsPayload;

let enqueue: (p: Payload) => void = () => {};

export function registerSystemDialog(enq: typeof enqueue): void {
  enqueue = enq;
}

export function systemConfirm(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    enqueue({
      kind: 'confirm',
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? 'OK',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      destructive: options.destructive,
      resolve,
    });
  });
}

/** Multi-option sheet (replaces Alert with action buttons). Cancel dismisses without running actions. */
export function systemActionSheet(options: {
  title?: string;
  message?: string;
  actions: { label: string; destructive?: boolean; onPress: () => void }[];
}): Promise<void> {
  return new Promise((resolve) => {
    enqueue({
      kind: 'actions',
      title: options.title,
      message: options.message,
      actions: options.actions,
      resolve,
    });
  });
}

export function SystemDialogHost(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<Payload[]>([]);

  const push = useCallback((p: Payload) => {
    setQueue((q) => [...q, p]);
  }, []);

  useEffect(() => {
    registerSystemDialog(push);
    return () => {
      registerSystemDialog(() => {});
    };
  }, [push]);

  const current = queue[0];

  const pop = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  if (!current) {
    return null;
  }

  if (current.kind === 'confirm') {
    const c = current;
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => {
          c.resolve(false);
          pop();
        }}
      >
        <Pressable
          style={styles.scrim}
          onPress={() => {
            c.resolve(false);
            pop();
          }}
        >
          <Pressable
            style={[styles.card, { marginBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.cardTitle}>{c.title}</Text>
            {c.message ? (
              <Text style={styles.cardMessage}>{c.message}</Text>
            ) : null}
            <View style={styles.row}>
              <Pressable
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => {
                  c.resolve(false);
                  pop();
                }}
              >
                <Text style={styles.btnSecondaryText}>{c.cancelLabel}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btn,
                  c.destructive ? styles.btnDanger : styles.btnPrimary,
                ]}
                onPress={() => {
                  c.resolve(true);
                  pop();
                }}
              >
                <Text
                  style={
                    c.destructive ? styles.btnDangerText : styles.btnPrimaryText
                  }
                >
                  {c.confirmLabel}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  const a = current;
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => {
        a.resolve();
        pop();
      }}
    >
      <Pressable
        style={styles.scrim}
        onPress={() => {
          a.resolve();
          pop();
        }}
      >
        <Pressable
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + 12,
              maxHeight: '70%',
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {a.title ? <Text style={styles.sheetTitle}>{a.title}</Text> : null}
          {a.message ? (
            <Text style={styles.sheetMessage}>{a.message}</Text>
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {a.actions.map((opt, i) => (
              <Pressable
                key={`${opt.label}-${i}`}
                style={styles.actionRow}
                onPress={() => {
                  opt.onPress();
                  a.resolve();
                  pop();
                }}
              >
                <Text
                  style={[
                    styles.actionLabel,
                    opt.destructive && styles.actionDestructive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            style={[styles.actionRow, styles.actionCancel]}
            onPress={() => {
              a.resolve();
              pop();
            }}
          >
            <Text style={styles.actionCancelLabel}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardMessage: {
    color: '#c4c4c4',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: '#2c2c2e',
  },
  btnSecondaryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  btnPrimary: {
    backgroundColor: palette.primaryOrange,
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  btnDanger: {
    backgroundColor: '#ff3b30',
  },
  btnDangerText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  sheetMessage: {
    color: '#c4c4c4',
    fontSize: 14,
    paddingHorizontal: 20,
    marginBottom: 12,
    lineHeight: 20,
  },
  actionRow: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2c2c2e',
  },
  actionLabel: {
    color: '#fff',
    fontSize: 17,
    textAlign: 'center',
    fontWeight: '500',
  },
  actionDestructive: {
    color: '#ff3b30',
    fontWeight: '600',
  },
  actionCancel: {
    marginTop: 8,
    backgroundColor: '#1c1c1e',
  },
  actionCancelLabel: {
    color: palette.primaryOrange,
    fontSize: 17,
    textAlign: 'center',
    fontWeight: '600',
  },
});

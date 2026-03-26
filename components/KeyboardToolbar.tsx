import { theme } from '@/constants/theme';
import React from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const c = theme.colors;

export const KEYBOARD_TOOLBAR_NATIVE_ID = 'keyboardToolbar';

type KeyboardToolbarProps = {
  onFocusPrevious?: () => void;
  onFocusNext?: () => void;
  focusedIndex?: number | null;
  totalInputs?: number;
};

/**
 * iOS-style keyboard accessory toolbar (like Apple payment forms).
 * Shows ⬆ Previous, ⬇ Next, ✔ Done. Renders only on iOS.
 */
export function KeyboardToolbar({
  onFocusPrevious,
  onFocusNext,
  focusedIndex = null,
  totalInputs = 0,
}: KeyboardToolbarProps) {
  if (Platform.OS !== 'ios') return null;

  const canGoPrev =
    focusedIndex !== null && totalInputs > 0 && focusedIndex > 0;
  const canGoNext =
    focusedIndex !== null &&
    totalInputs > 0 &&
    focusedIndex < totalInputs - 1;

  return (
    <InputAccessoryView nativeID={KEYBOARD_TOOLBAR_NATIVE_ID}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          onPress={onFocusPrevious}
          style={styles.button}
          disabled={!canGoPrev}
        >
          <Text style={[styles.label, !canGoPrev && styles.labelDisabled]}>
            ⬆ Previous
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onFocusNext}
          style={styles.button}
          disabled={!canGoNext}
        >
          <Text style={[styles.label, !canGoNext && styles.labelDisabled]}>
            ⬇ Next
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Keyboard.dismiss()}
          style={styles.button}
        >
          <Text style={styles.done}>✔ Done</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: c.surfaceMuted,
    borderTopWidth: 0.5,
    borderColor: c.borderStrong,
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 18,
    color: c.accentBlue,
  },
  labelDisabled: {
    opacity: 0.4,
    color: c.textSecondary,
  },
  done: {
    fontSize: 18,
    fontWeight: '600',
    color: c.accentBlue,
  },
});

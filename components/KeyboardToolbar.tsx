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
    backgroundColor: '#F2F2F7',
    borderTopWidth: 0.5,
    borderColor: '#ccc',
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 18,
    color: '#007AFF',
  },
  labelDisabled: {
    opacity: 0.4,
    color: '#8E8E93',
  },
  done: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
  },
});

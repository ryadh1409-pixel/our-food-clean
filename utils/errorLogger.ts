import { friendlyErrorMessage } from '@/lib/friendlyError';
import { Alert } from 'react-native';

type LogErrorOptions = {
  /** When true (default), show an alert. Set false when caller shows its own. */
  alert?: boolean;
};

/**
 * Logs the error (dev details) and shows a safe user message only — never raw SDK text.
 */
export function logError(error: unknown, options?: LogErrorOptions): void {
  if (__DEV__) {
    console.error('HalfOrder Error:', error);
  }

  const showAlert = options?.alert !== false;

  if (!showAlert) return;

  Alert.alert('Something went wrong', friendlyErrorMessage(error));
}
